// @req REQ-ARG-012
// @req REQ-SEC-031
/**
 * SEC-18 en base RÉELLE, sous `partners_app` — l'anti auto-parrainage, dans la forme d'A02 (PR 601).
 *
 * TÉMOINS :
 *   — la lecture : un filleul qui partage avec son parrain le téléphone, l'IBAN ou le SIREN est
 *     soupçonné, un filleul distinct ne l'est pas ; une pièce RIB remplacée et une identité close ne
 *     comptent plus ; le courriel ne se partage même pas (index unique déjà en base) ;
 *   — le geste n'écrit RIEN : la candidature et le RIB laissent `anomalies` vide jusqu'au passage ;
 *   — la tâche différée lit les naissances au journal, ouvre UNE anomalie et UN événement ;
 *   — l'index `anomalies_auto_parrainage_une_ouverte` : dix ouvertures simultanées sur dix
 *     connexions donnent UNE anomalie et UN événement, sans erreur ; une seconde anomalie ouverte est
 *     refusée sous ce nom ; après la clôture de la première, une nouvelle s'ouvre ;
 *   — aucun événement de l'agrégat anomalie ne partage une transaction (`xmin`) avec un événement de
 *     l'agrégat apporteur ; la charge de l'ouverture ne porte ni apporteur, ni attribution, ni acteur.
 * Empreintes et blocs sont tirés au hasard : aucune donnée réelle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  soupconsALaCandidature,
  soupconsAuChangementDeRib,
} from '../../src/server/parrainage/anti-auto-parrainage';
import {
  ouvrirLesAnomaliesDAutoParrainage,
  ouvrirUneAnomalie,
} from '../../src/server/taches/ouvrir-anomalies-auto-parrainage';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import { naissanceDApporteur } from '../../src/domain/evenement/charges';
import { SEUILS } from '../../src/domain/seuils/ssot';

let base: Base;
let adminId: string;

beforeAll(async () => {
  base = await demarrerBase();
  await deuxAdministrateursDuRib(base.prisma);
  const [u] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    MAINTENANT
  );
  adminId = u!.id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code = () =>
  'AX' + Array.from(randomBytes(6), (o) => CROCKFORD[o % CROCKFORD.length]).join('');

/** Un SIREN neuf, de neuf chiffres (sa clé de Luhn n'est pas jugée ici). */
const siren = () => String(100_000_000 + (randomBytes(4).readUInt32BE() % 899_999_999));

const PORTS = { maintenant: () => MAINTENANT };

interface Identite {
  emailHash?: string;
  phoneHash?: string;
  parrainCode?: string | null;
}

/** Un apporteur, avec les empreintes données ; rend son id et son code. */
async function apporteur(i: Identite = {}): Promise<{ id: string; code: string }> {
  const c = code();
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'kyc_en_cours',
      codeParrainage: c,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      parrainCodeCapture: i.parrainCode ?? null,
      creeAt: MAINTENANT,
      ...(i.emailHash === undefined
        ? {}
        : { emailHash: i.emailHash, emailChiffre: randomBytes(40) }),
      ...(i.phoneHash === undefined
        ? {}
        : { phoneHash: i.phoneHash, telephoneChiffre: randomBytes(40) }),
    },
  });
  return { id: a.id, code: c };
}

/**
 * Un RIB VALIDE, tel que la base l'exige depuis la migration 004750 : il naît `a_verifier`, SANS
 * regard, puis un administrateur le vérifie et un AUTRE le confirme ; la confirmation le passe à
 * `valide` dans la même écriture, et pose `remplacee_at` quand la fixture le demande (un regard ne se
 * pose jamais sur une pièce écartée).
 */
/** Un client qui exécute du SQL paramétré : le propriétaire, `partners_app` ou une transaction. */
type ClientSql = { $executeRawUnsafe(sql: string, ...valeurs: unknown[]): Promise<number> };
const VERIFICATEUR_DU_RIB = randomUUID();
const CONFIRMATEUR_DU_RIB = randomUUID();

/** Les deux administrateurs actifs et validés des regards, sous le propriétaire. */
async function deuxAdministrateursDuRib(proprietaire: ClientSql) {
  for (const [id, par] of [
    [VERIFICATEUR_DU_RIB, null],
    [CONFIRMATEUR_DU_RIB, VERIFICATEUR_DU_RIB],
  ] as const) {
    await proprietaire.$executeRawUnsafe(
      `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at, valide_par_id)
       VALUES ($1::uuid, 'admin'::console_role, $2, $3, clock_timestamp(), clock_timestamp(), $4::uuid)`,
      id,
      randomBytes(40),
      randomBytes(32).toString('hex'),
      par
    );
  }
}

/** Les deux regards d'un RIB inséré sans eux : vérifié, puis confirmé et passé à `valide`. */
async function confirmerLeRib(client: ClientSql, id: string, remplaceeAt: Date | null = null) {
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = clock_timestamp()
     WHERE id = $2::uuid`,
    VERIFICATEUR_DU_RIB,
    id
  );
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = clock_timestamp(),
       statut = 'valide', remplacee_at = $3 WHERE id = $2::uuid`,
    CONFIRMATEUR_DU_RIB,
    id,
    remplaceeAt
  );
}
/** Une pièce RIB, par SQL brut : le bloc et l'empreinte vont ensemble. Rend son id. */
async function rib(apporteurId: string, ibanHash: string, remplaceeAt: Date | null = null) {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, remplacee_at, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, 'rib', $3::statut_piece_kyc, $4, $5, $6)`,
    id,
    apporteurId,
    'a_verifier',
    null,
    randomBytes(40),
    ibanHash
  );
  if (remplaceeAt !== null) await confirmerLeRib(base.prisma, id, remplaceeAt);
  return id;
}

async function identite(apporteurId: string, s: string, finAt: Date | null = null) {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO identites_facturation (id, apporteur_id, siren, regime_tva, debut_at, fin_at)
     VALUES ($1::uuid, $2::uuid, $3, 'franchise_293b', $4, $5)`,
    randomUUID(),
    apporteurId,
    s,
    finAt === null ? MAINTENANT : new Date(finAt.getTime() - 86_400_000),
    finAt
  );
}

const anomalies = (apporteurId: string) =>
  base.prisma.anomalie.findMany({
    where: { apporteurId },
    select: { id: true, type: true, statut: true, score: true },
  });

const ouvertures = (anomalieId: string) =>
  base.prisma.evenement.findMany({
    where: { type: 'anomalie_statut_modifie', agregatId: anomalieId },
    select: { agregat: true, charge: true },
  });

/** Les naissances, écrites au journal comme leurs écrivains les écrivent (sous le verrou du journal). */
async function naitreCandidature(apporteurId: string) {
  await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: apporteurId,
      survenuAt: MAINTENANT,
      charge: naissanceDApporteur({ par: 'systeme' }),
    })
  );
}

async function naitreRib(pieceId: string, apporteurId: string) {
  await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'piece_kyc_statut_modifie',
      agregat: 'piece_kyc',
      agregatId: pieceId,
      survenuAt: MAINTENANT,
      charge: {
        de: null,
        vers: 'a_verifier',
        type: 'rib',
        acteur: { par: 'apporteur', id: apporteurId },
      },
    })
  );
}

/** Un passage de la tâche, comme un premier passage : depuis le début du journal. */
const passage = () =>
  ouvrirLesAnomaliesDAutoParrainage(base.prisma, { ...PORTS, precedent: async () => null });

describe('REQ-ARG-012 — la lecture et le jugement, en base réelle', () => {
  it.each(['telephone', 'siren'] as const)(
    'REQ-ARG-012 : TÉMOIN À DEUX FACES — même %s : un soupçon sur le filleul ; un filleul distinct : aucun',
    async (famille) => {
      const commun = hex(32);
      const s = siren();
      const parrain = await apporteur({ phoneHash: famille === 'telephone' ? commun : hex(32) });
      await identite(parrain.id, famille === 'siren' ? s : siren());
      const vise = await apporteur({
        parrainCode: parrain.code,
        phoneHash: famille === 'telephone' ? commun : hex(32),
      });
      await identite(vise.id, famille === 'siren' ? s : siren());
      expect(await soupconsALaCandidature(base.prisma, vise.id)).toEqual([
        { filleulId: vise.id, correspondances: [famille] },
      ]);
      const distinct = await apporteur({ parrainCode: parrain.code, phoneHash: hex(32) });
      await identite(distinct.id, siren());
      expect(await soupconsALaCandidature(base.prisma, distinct.id)).toEqual([]);
    }
  );

  it('REQ-ARG-012 : le courriel ne se partage même pas — la base refuse déjà deux apporteurs au même courriel', async () => {
    const commun = hex(32);
    await apporteur({ emailHash: commun });
    await expect(apporteur({ emailHash: commun })).rejects.toThrow(/email_hash|Unique constraint/);
  });

  it('REQ-ARG-012 : au RIB, dans les deux sens ; une pièce REMPLACÉE et une identité CLOSE ne comptent plus', async () => {
    const iban = hex(32);
    const parrain = await apporteur();
    const vise = await apporteur({ parrainCode: parrain.code });
    await rib(vise.id, iban);
    await rib(parrain.id, iban);
    expect(await soupconsAuChangementDeRib(base.prisma, parrain.id)).toEqual([
      { filleulId: vise.id, correspondances: ['iban'] },
    ]);
    expect(await soupconsAuChangementDeRib(base.prisma, vise.id)).toEqual([
      { filleulId: vise.id, correspondances: ['iban'] },
    ]);

    const s = siren();
    const ancien = await apporteur();
    await rib(ancien.id, iban, new Date('2026-09-01T00:00:00.000Z'));
    await identite(ancien.id, s, new Date('2026-09-01T00:00:00.000Z'));
    const autre = await apporteur({ parrainCode: ancien.code });
    await rib(autre.id, iban);
    await identite(autre.id, s);
    expect(await soupconsAuChangementDeRib(base.prisma, autre.id)).toEqual([]);
  });
});

describe('REQ-SEC-031 — le geste n’ouvre rien ; la tâche différée ouvre, une fois, journalisée', () => {
  it('REQ-SEC-031 : TÉMOIN DU GESTE — candidature et RIB soupçonnés laissent anomalies vide ; le passage de la tâche ouvre UNE anomalie et UN événement', async () => {
    const commun = hex(32);
    const parrain = await apporteur({ phoneHash: commun });
    const vise = await apporteur({ parrainCode: parrain.code, phoneHash: commun });
    await naitreCandidature(vise.id);
    const piece = await rib(vise.id, hex(32));
    await naitreRib(piece, vise.id);
    expect(await anomalies(vise.id)).toEqual([]);

    const compteurs = await passage();
    expect(compteurs.ouvertes).toBeGreaterThanOrEqual(1);
    const [a, ...autres] = await anomalies(vise.id);
    expect(autres).toEqual([]);
    expect(a).toMatchObject({ type: 'auto_parrainage', statut: 'ouverte', score: null });
    expect(await ouvertures(a!.id)).toEqual([
      { agregat: 'anomalie', charge: { de: null, vers: 'ouverte', acteur: { par: 'systeme' } } },
    ]);
    // Un second passage, sur le même journal : ni anomalie, ni événement de plus.
    await passage();
    expect(await anomalies(vise.id)).toHaveLength(1);
    expect(await ouvertures(a!.id)).toHaveLength(1);
  });

  it('REQ-SEC-031 : TÉMOIN DE CONCURRENCE — dix ouvertures SIMULTANÉES du même filleul, sur dix connexions : UNE anomalie, UN événement, sans erreur', async () => {
    const vise = await apporteur();
    const issues = await Promise.all(
      Array.from({ length: 10 }, () => ouvrirUneAnomalie(base.prisma, vise.id, PORTS))
    );
    expect(issues.filter(Boolean)).toHaveLength(1);
    const ouvertes = await anomalies(vise.id);
    expect(ouvertes).toHaveLength(1);
    expect(await ouvertures(ouvertes[0]!.id)).toHaveLength(1);
  });

  it('REQ-SEC-031 : une seconde anomalie auto_parrainage ouverte est refusée par la base, sous le nom de l’index ; une sincérité ne l’est pas', async () => {
    const vise = await apporteur();
    expect(await ouvrirUneAnomalie(base.prisma, vise.id, PORTS)).toBe(true);
    // Le refus d'UNICITÉ rendu comme une donnée : Prisma ne transmet pas le nom de la contrainte
    // d'une requête brute (`23505`, « Message: N/A »). Une fonction `pg_temp`, dans la MÊME
    // transaction, attrape la violation et rend le SQLSTATE et le CONSTRAINT_NAME du diagnostic.
    const erreur = await base.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION pg_temp.essai_seconde(a uuid) RETURNS text LANGUAGE plpgsql AS $f$
        DECLARE etat text; contrainte text;
        BEGIN
          INSERT INTO anomalies (id, type, apporteur_id, statut)
          VALUES (gen_random_uuid(), 'auto_parrainage', a, 'ouverte');
          RETURN 'insere';
        EXCEPTION WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS etat = RETURNED_SQLSTATE, contrainte = CONSTRAINT_NAME;
          RETURN etat || ' ' || coalesce(contrainte, '');
        END $f$`);
      const [r] = await tx.$queryRaw<{ r: string }[]>`
        SELECT pg_temp.essai_seconde(${vise.id}::uuid) AS r`;
      return r!.r;
    });
    expect(erreur).toBe('23505 anomalies_auto_parrainage_une_ouverte');
    // L'index ne vise que l'auto-parrainage : deux anomalies de sincérité restent possibles.
    for (let i = 0; i < 2; i += 1) {
      await base.prisma.$executeRawUnsafe(
        `INSERT INTO anomalies (id, type, score, apporteur_id, statut) VALUES ($1::uuid, 'sincerite', 50, $2::uuid, 'ouverte')`,
        randomUUID(),
        vise.id
      );
    }
    expect((await anomalies(vise.id)).filter((a) => a.type === 'sincerite')).toHaveLength(2);
  });

  it('REQ-SEC-031 : après la clôture de la première, une nouvelle anomalie s’ouvre et s’écrit au journal ; en conflit, aucun événement', async () => {
    const vise = await apporteur();
    expect(await ouvrirUneAnomalie(base.prisma, vise.id, PORTS)).toBe(true);
    const [premiere] = await anomalies(vise.id);
    expect(await ouvrirUneAnomalie(base.prisma, vise.id, PORTS)).toBe(false);
    expect(await ouvertures(premiere!.id)).toHaveLength(1);
    await base.prisma.$executeRawUnsafe(
      `UPDATE anomalies SET statut = 'levee', traite_at = $2, traite_par_id = $3::uuid,
         justification_chiffre = $4 WHERE id = $1::uuid`,
      premiere!.id,
      MAINTENANT,
      adminId,
      randomBytes(40)
    );
    expect(await ouvrirUneAnomalie(base.prisma, vise.id, PORTS)).toBe(true);
    const toutes = await anomalies(vise.id);
    expect(toutes.map((a) => a.statut).sort()).toEqual(['levee', 'ouverte']);
    const seconde = toutes.find((a) => a.statut === 'ouverte')!;
    expect(await ouvertures(seconde.id)).toHaveLength(1);
  });

  it('REQ-SEC-031 : TÉMOIN — après une levée par la console, sans fait nouveau, le passage suivant ne rouvre rien ; une naissance postérieure, si', async () => {
    const commun = hex(32);
    const parrain = await apporteur({ phoneHash: commun });
    const vise = await apporteur({ parrainCode: parrain.code, phoneHash: commun });
    await naitreCandidature(vise.id);
    const premier = await passage();
    const [ouverte] = await anomalies(vise.id);
    expect(ouverte).toMatchObject({ type: 'auto_parrainage', statut: 'ouverte' });
    await base.prisma.$executeRawUnsafe(
      `UPDATE anomalies SET statut = 'levee', traite_at = $2, traite_par_id = $3::uuid,
         justification_chiffre = $4 WHERE id = $1::uuid`,
      ouverte!.id,
      MAINTENANT,
      adminId,
      randomBytes(40)
    );
    // Le passage suivant repart du curseur que le premier a rendu (son battement).
    const apres = new Date(
      MAINTENANT.getTime() + SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * 60_000
    );
    const suivant = (curseur: number) =>
      ouvrirLesAnomaliesDAutoParrainage(base.prisma, {
        maintenant: () => apres,
        precedent: async () => ({ curseur, passeAtMs: MAINTENANT.getTime() }),
      });
    expect((await suivant(premier.curseur)).ouvertes).toBe(0);
    expect((await anomalies(vise.id)).map((a) => a.statut)).toEqual(['levee']);
    // Une pièce RIB née APRÈS la levée est un fait nouveau : elle se juge, et rouvre.
    const piece = await rib(vise.id, hex(32));
    await naitreRib(piece, vise.id);
    expect((await suivant(premier.curseur)).ouvertes).toBe(1);
    expect((await anomalies(vise.id)).map((a) => a.statut).sort()).toEqual(['levee', 'ouverte']);
  });

  it('REQ-SEC-031 : aucun événement de l’agrégat anomalie ne partage une transaction (xmin) avec un événement de l’agrégat apporteur ; la charge d’ouverture ne nomme personne', async () => {
    const croisees = await base.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM evenements a JOIN evenements p ON a.xmin = p.xmin
      WHERE a.agregat = 'anomalie' AND p.agregat = 'apporteur'`;
    expect(croisees[0]!.n).toBe(0n);
    const charges = await base.prisma.evenement.findMany({
      where: { type: 'anomalie_statut_modifie' },
      select: { charge: true },
    });
    expect(charges.length).toBeGreaterThan(0);
    for (const { charge } of charges) {
      expect(charge).toEqual({ de: null, vers: 'ouverte', acteur: { par: 'systeme' } });
    }
  });
});
