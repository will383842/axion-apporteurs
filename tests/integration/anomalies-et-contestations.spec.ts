// @req REQ-DM-032
// @req REQ-DM-033
// @req REQ-DM-034
// @req REQ-DM-043
/**
 * DM-12 — vérifications, alertes de libération, anomalies, rattachements manuels et contestations,
 * en base RÉELLE, dans la forme d'A02 (2026-10-03).
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures,
 * les lectures et les TRUNCATE restent sous le propriétaire (`partners_app` n'a pas ce droit : sous
 * lui, le refus prouverait le droit, pas le déclencheur). Chaque refus est attendu sur son NOM.
 *
 * Le rôle `conseiller_salarie` n'existe pas encore dans `console_role` : le refus d'un conseiller se juge par la
 * fonction partagée (son corps compare `role::text`) et par les arguments de ses déclencheurs, qui
 * nomment chacun une colonne de leur table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { forApporteur } from '../../src/server/acces/for-apporteur';
import { notifier } from '../../src/server/notifications/envoyer';
import { deciderLeRattachement } from '../../src/server/rattachement/decider';
import { dateDeLaPiece } from '../../src/domain/anomalie/regles';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, colonnesPii, decryptPii } from '../../src/server/securite/pii';
import {
  MODELE_ANOMALIE,
  MODELE_CONTESTATION,
  semerContestation,
} from '../../prisma/seed/12-console-cas';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;
let adminId: string;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 600000000;
const unSiren = () => String((sirens += 1));

const GABARIT = 'refuser_modification_sauf';
const ANOMALIES = 'anomalies_refuser_substitution';
const CONTESTATIONS = 'contestations_refuser_substitution';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-12-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});
const CONSEILLER = 'refuser_acteur_conseiller';

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: MAINTENANT,
        importeeAt: MAINTENANT,
      },
    })
  ).id;
  apporteurId = await unApporteur();
  adminId = await utilisateur('admin');
}, 180_000);

/**
 * Un apporteur signé, neuf. Depuis SEC-18, une seule anomalie `auto_parrainage` OUVERTE par
 * apporteur (index `anomalies_auto_parrainage_une_ouverte`) : chaque anomalie de ces témoins est
 * ouverte sur son propre apporteur, pour que l'unicité ne masque pas la règle jugée.
 */
async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: MAINTENANT,
      },
    })
  ).id;
}

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function utilisateur(role: string): Promise<string> {
  const [u] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, $2::console_role, '\\x01'::bytea, $3, $4) RETURNING id`,
    randomUUID(),
    role,
    hex(32),
    MAINTENANT
  );
  return u!.id;
}

/** Une attribution `provisoire` d'apporteur, par SQL brut ; rend son id et sa date de dépôt. */
async function uneAttribution(): Promise<{ id: string; deposeeAt: Date }> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
    id,
    apporteurId,
    unSiren(),
    grilleId,
    bloc(),
    bloc(),
    bloc(),
    hex(32),
    bloc(),
    hex(32),
    bloc(),
    bloc()
  );
  const [l] = await base.prisma.$queryRaw<{ d: Date }[]>`
    SELECT deposee_at AS d FROM attributions WHERE id = ${id}::uuid`;
  return { id, deposeeAt: l!.d };
}

async function unRefus(): Promise<string> {
  const [r] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO depots_refuses (id, apporteur_id, siren, motif, canal, refuse_at)
     VALUES ($1::uuid, $2::uuid, $3, 'anteriorite_client', 'espace', $4) RETURNING id`,
    randomUUID(),
    apporteurId,
    unSiren(),
    MAINTENANT
  );
  return r!.id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

/**
 * Le SQLSTATE d'une erreur de Postgres remontée par Prisma, lu sur le CODE (`meta.code`, ou la
 * mention « Code: » suivie du code du message brut), jamais sur un texte qui dépend de la langue du
 * serveur.
 */
function codeSql(e: unknown): string | null {
  const meta = (e as { meta?: { code?: string } } | null)?.meta?.code;
  if (meta) return meta;
  const m = /Code: `([0-9A-Z]{5})`/.exec(String((e as { message?: string } | null)?.message ?? ''));
  return m?.[1] ?? null;
}

/**
 * Une violation d'UNICITÉ, lue sur son SQLSTATE (23505) et sur les colonnes de la clé que le message
 * nomme : le message que rend Prisma ne porte pas le nom de l'index. Le nom, lui, se juge sur
 * `pg_indexes` (`indexUnique`).
 */
async function refusDUnicite(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    const cle = /Key \(([^)]*)\)=/.exec(String((e as Error).message))?.[1];
    return `${codeSql(e) ?? '?'} (${cle ?? '?'})`;
  }
  throw new Error('aucun refus');
}

/** La définition d'un index unique, lue par son NOM. */
async function indexUnique(nom: string): Promise<string> {
  const [l] = await base.prisma.$queryRaw<{ d: string }[]>`
    SELECT indexdef AS d FROM pg_indexes WHERE indexname = ${nom}`;
  return l?.d ?? '';
}

/** Une écriture du SERVEUR, sous `partners_app`. */
const ecrire = (sql: string, ...valeurs: unknown[]) => app.$executeRawUnsafe(sql, ...valeurs);
/** Une troncature, sous le seul rôle qui pourrait tronquer. */
const tronquer = (table: string) => base.prisma.$executeRawUnsafe(`TRUNCATE ${table} CASCADE`);

async function uneVerification(p: { ipHash?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await ecrire(
    `INSERT INTO verifications (id, apporteur_id, siren, resultat, ip_hash, verifiee_at)
     VALUES ($1::uuid, $2::uuid, $3, 'libre', $4, $5)`,
    id,
    apporteurId,
    unSiren(),
    p.ipHash === undefined ? hex(8) : p.ipHash,
    MAINTENANT
  );
  return id;
}

describe('REQ-DM-032 — verifications : un porteur, en ajout seul, l’empreinte d’IP purgeable une fois', () => {
  it('REQ-DM-032 : TÉMOIN — aucun porteur, ou les deux : refusé (verifications_porteur_unique)', async () => {
    const inserer = (
      client: Pick<PrismaClient, '$executeRawUnsafe'>,
      a: string | null,
      u: string | null
    ) =>
      client.$executeRawUnsafe(
        `INSERT INTO verifications (id, apporteur_id, utilisateur_console_id, siren, resultat,
           ip_hash, verifiee_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'libre', $5, $6)`,
        randomUUID(),
        a,
        u,
        unSiren(),
        hex(8),
        MAINTENANT
      );
    // Aucun porteur : sous `partners_app`, le déclencheur du conseiller n'a rien à juger.
    expect(await refus(inserer(app, null, null))).toContain('verifications_porteur_unique');
    // Les deux : le rôle `conseiller_salarie` n'existe pas encore dans `console_role` (SEC-31) ; le
    // déclencheur du porteur refuserait donc TOUT utilisateur console, et — déclencheur BEFORE —
    // avant le CHECK. Neutralisé le temps d'une transaction ANNULÉE (patron d'`index-partiel.spec.ts`),
    // il laisse juger le CHECK seul ; rendue, la base l'a réactivé.
    const annulee = new Error('annulee');
    let message = '';
    await base.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE verifications DISABLE TRIGGER verifications_porteur_conseiller'
        );
        message = await refus(inserer(tx, apporteurId, adminId));
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    expect(message).toContain('verifications_porteur_unique');
    // Et le déclencheur est bien rendu : hors de la transaction, il refuse de nouveau.
    expect(await refus(inserer(app, apporteurId, adminId))).toContain(
      'verifications_porteur_conseiller'
    );
  });

  it('REQ-DM-032 : TÉMOIN — un porteur console qui n’est pas conseiller est refusé (verifications_porteur_conseiller)', async () => {
    expect(
      await refus(
        ecrire(
          `INSERT INTO verifications (id, utilisateur_console_id, siren, resultat, verifiee_at)
           VALUES ($1::uuid, $2::uuid, $3, 'libre', $4)`,
          randomUUID(),
          adminId,
          unSiren(),
          MAINTENANT
        )
      )
    ).toContain('verifications_porteur_conseiller');
  });

  it('REQ-DM-032 : TÉMOIN — une vérification qui naît SANS empreinte d’adresse réseau est refusée (verifications_ip_hash_purge_liee)', async () => {
    expect(await refus(uneVerification({ ipHash: null }))).toContain(
      'verifications_ip_hash_purge_liee'
    );
  });

  it('REQ-DM-032 : TÉMOIN — la purge de l’empreinte : ensemble, acceptée ; à moitié, ou une seconde fois, refusée', async () => {
    const id = await uneVerification();
    expect(
      await refus(ecrire(`UPDATE verifications SET ip_hash = NULL WHERE id = $1::uuid`, id))
    ).toContain('verifications_ip_hash_purge_liee');
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          MAINTENANT
        )
      )
    ).toContain('verifications_ip_hash_purge_liee');
    await ecrire(
      `UPDATE verifications SET ip_hash = NULL, empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(ecrire(`UPDATE verifications SET ip_hash = $2 WHERE id = $1::uuid`, id, hex(8)))
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-DM-032 : TÉMOIN — toute autre colonne réécrite, DELETE et TRUNCATE : refusés', async () => {
    const id = await uneVerification();
    expect(
      await refus(ecrire(`UPDATE verifications SET resultat = 'fermee' WHERE id = $1::uuid`, id))
    ).toContain(GABARIT);
    expect(
      await refus(ecrire(`UPDATE verifications SET siren = $2 WHERE id = $1::uuid`, id, unSiren()))
    ).toContain(GABARIT);
    expect(await refus(ecrire(`DELETE FROM verifications WHERE id = $1::uuid`, id))).toContain(
      GABARIT
    );
    expect(await refus(tronquer('verifications'))).toContain(GABARIT);
  });
});

describe('REQ-DM-032 — alertes_liberation : une seule en attente, l’envoi posé une fois', () => {
  it('REQ-DM-032 : TÉMOIN — deux alertes en attente pour le même SIREN : refusé ; après l’envoi, une neuve passe', async () => {
    const siren = unSiren();
    const nouvelle = () =>
      ecrire(
        `INSERT INTO alertes_liberation (id, apporteur_id, siren, cree_at) VALUES ($1::uuid, $2::uuid, $3, $4)`,
        randomUUID(),
        apporteurId,
        siren,
        MAINTENANT
      );
    await nouvelle();
    expect(await refusDUnicite(nouvelle())).toBe('23505 (apporteur_id, siren)');
    expect(await indexUnique('alertes_liberation_une_en_attente')).toMatch(
      /UNIQUE INDEX alertes_liberation_une_en_attente .*\(apporteur_id, siren\) WHERE \(envoyee_at IS NULL\)/
    );
    await ecrire(
      `UPDATE alertes_liberation SET envoyee_at = $2 WHERE apporteur_id = $1::uuid AND siren = $3`,
      apporteurId,
      MAINTENANT,
      siren
    );
    await expect(nouvelle()).resolves.toBe(1);
    expect(
      await refus(
        ecrire(
          `UPDATE alertes_liberation SET envoyee_at = $3
           WHERE apporteur_id = $1::uuid AND siren = $2 AND envoyee_at IS NOT NULL`,
          apporteurId,
          siren,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
    expect(await refus(tronquer('alertes_liberation'))).toContain(GABARIT);
  });
});

describe('REQ-DM-033 — anomalies : la forme, une clôture une seule fois, sans retour', () => {
  async function uneAnomalie(
    type = 'auto_parrainage',
    score: number | null = null
  ): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO anomalies (id, type, score, apporteur_id, statut, ouverte_at)
       VALUES ($1::uuid, $2::type_anomalie, $3, $4::uuid, 'ouverte', $5)`,
      id,
      type,
      score,
      await unApporteur(),
      MAINTENANT
    );
    return id;
  }

  it('REQ-DM-033 : TÉMOIN — le score n’existe que pour la sincérité (anomalies_score_sincerite)', async () => {
    await expect(uneAnomalie('sincerite', 40)).resolves.toBeDefined();
    expect(await refus(uneAnomalie('sincerite', null))).toContain('anomalies_score_sincerite');
    expect(await refus(uneAnomalie('auto_parrainage', 40))).toContain('anomalies_score_sincerite');
    expect(await refus(uneAnomalie('sincerite', 101))).toContain('anomalies_score_sincerite');
  });

  it('REQ-DM-033 : TÉMOIN — un type de RYTHME ou d’appareil n’existe pas : la base refuse ramassage et appareil_inconnu', async () => {
    const [e] = await base.prisma.$queryRaw<{ valeurs: string[] }[]>`
      SELECT enum_range(NULL::type_anomalie)::text[] AS valeurs`;
    expect(e!.valeurs).toEqual(['sincerite', 'auto_parrainage']);
    for (const type of ['ramassage', 'appareil_inconnu']) {
      expect(await refus(uneAnomalie(type)), type).toMatch(/type_anomalie/);
    }
  });

  /** La clôture : statut, auteur, date et justification chiffrée, dans la MÊME écriture. */
  const clore = (id: string, justification: Buffer | null = randomBytes(40)) =>
    ecrire(
      `UPDATE anomalies SET statut = 'levee', traite_at = $2, traite_par_id = $3::uuid,
         justification_chiffre = $4
       WHERE id = $1::uuid`,
      id,
      MAINTENANT,
      adminId,
      justification
    );
  const purgerLaJustification = (id: string) =>
    ecrire(
      `UPDATE anomalies SET justification_chiffre = NULL, justification_purgee_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );

  it('REQ-DM-033 : TÉMOIN — la clôture pose statut, auteur, date et justification ENSEMBLE ; sans justification, refusée ; close, elle ne change plus', async () => {
    const id = await uneAnomalie();
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'levee' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(await refus(clore(id, null))).toContain(ANOMALIES);
    await clore(id);
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'confirmee' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'ouverte' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(
      await refus(
        ecrire(
          `UPDATE anomalies SET justification_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — la justification ne naît qu’à la clôture : ouverte avec une justification, ou purgée, refusée (anomalies_justification_a_la_cloture)', async () => {
    const inserer = (statut: string, justification: Buffer | null, purgeeAt: Date | null) =>
      ecrire(
        `INSERT INTO anomalies (id, type, apporteur_id, statut, ouverte_at, traite_at, traite_par_id,
           justification_chiffre, justification_purgee_at)
         VALUES ($1::uuid, 'auto_parrainage', $2::uuid, $3::statut_anomalie, $4, $5, $6::uuid, $7, $8)`,
        randomUUID(),
        apporteurId,
        statut,
        MAINTENANT,
        statut === 'ouverte' ? null : MAINTENANT,
        statut === 'ouverte' ? null : adminId,
        justification,
        purgeeAt
      );
    expect(await refus(inserer('ouverte', randomBytes(40), null))).toContain(
      'anomalies_justification_a_la_cloture'
    );
    expect(await refus(inserer('ouverte', null, MAINTENANT))).toContain(
      'anomalies_justification_a_la_cloture'
    );
    expect(await refus(inserer('levee', null, null))).toContain(
      'anomalies_justification_a_la_cloture'
    );
    expect(await refus(inserer('levee', randomBytes(40), MAINTENANT))).toContain(
      'anomalies_justification_purge_liee'
    );
    expect(await refus(inserer('levee', Buffer.alloc(0), null))).toContain(
      'anomalies_justification_non_vide'
    );
  });

  it('REQ-DM-033 : TÉMOIN — la purge de la justification : sur une anomalie ouverte, refusée ; close, admise une fois ; ensuite plus rien ne bouge', async () => {
    const ouverte = await uneAnomalie();
    expect(await refus(purgerLaJustification(ouverte))).toContain(ANOMALIES);
    const id = await uneAnomalie();
    await clore(id);
    await purgerLaJustification(id);
    expect(
      await refus(
        ecrire(
          `UPDATE anomalies SET justification_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(ANOMALIES);
    expect(
      await refus(
        ecrire(
          `UPDATE anomalies SET justification_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — la justification est chiffrée pour SA ligne : jamais le clair en base, et un bloc déplacé sur une autre anomalie ne se déchiffre pas', async () => {
    const clair = 'parrainage croisé constaté sur deux fiches';
    const id = await uneAnomalie();
    const { justificationChiffre } = colonnesPii(
      { modele: MODELE_ANOMALIE, id },
      { justification: clair },
      CLES
    );
    await clore(id, Buffer.from(justificationChiffre!));
    const [l] = await base.prisma.$queryRaw<{ j: Buffer }[]>`
      SELECT justification_chiffre AS j FROM anomalies WHERE id = ${id}::uuid`;
    expect(l!.j.toString('utf8')).not.toContain(clair);
    const ligne = { modele: MODELE_ANOMALIE, champ: 'justificationChiffre', id };
    expect(decryptPii(ligne, l!.j, CLES)).toBe(clair);
    expect(() => decryptPii({ ...ligne, id: randomUUID() }, l!.j, CLES)).toThrow();
    expect(() => decryptPii({ ...ligne, champ: 'texteChiffre' }, l!.j, CLES)).toThrow();
  });

  it('REQ-DM-033 : TÉMOIN — l’identité est figée ; DELETE et TRUNCATE refusés', async () => {
    const id = await uneAnomalie();
    expect(
      await refus(
        ecrire(`UPDATE anomalies SET type = 'sincerite', score = 10 WHERE id = $1::uuid`, id)
      )
    ).toContain(ANOMALIES);
    expect(
      await refus(
        ecrire(`UPDATE anomalies SET ouverte_at = $2 WHERE id = $1::uuid`, id, new Date())
      )
    ).toContain(ANOMALIES);
    expect(await refus(ecrire(`DELETE FROM anomalies WHERE id = $1::uuid`, id))).toContain(
      ANOMALIES
    );
    expect(await refus(tronquer('anomalies'))).toContain(ANOMALIES);
  });

  /**
   * L'anonymisation conforme (forme d'A02) : tout ce qui désigne une personne vidé, les deux dates
   * tronquées au mois en UTC, en UNE écriture. `ecart` en remplace une partie, pour les refus.
   */
  const ANONYMISATION: Readonly<Record<string, string>> = {
    apporteur_id: 'NULL',
    attribution_id: 'NULL',
    score: 'NULL',
    traite_par_id: 'NULL',
    justification_chiffre: 'NULL',
    justification_purgee_at: 'NULL',
    mesure_terminee_at: 'NULL',
    gel_litige_at: 'NULL',
    gel_litige_leve_at: 'NULL',
    gel_litige_ref: 'NULL',
    ouverte_at: "date_trunc('month', ouverte_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    traite_at: "date_trunc('month', traite_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    anonymisee_at: '$2',
  };
  /** Chaque colonne reçoit UNE expression ; `ecart` en remplace, sans double affectation. */
  const anonymiser = (id: string, ecart: Readonly<Record<string, string>> = {}) =>
    ecrire(
      `UPDATE anomalies SET ${Object.entries({ ...ANONYMISATION, ...ecart })
        .map(([c, v]) => `${c} = ${v}`)
        .join(', ')} WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );

  it('REQ-DM-033 : TÉMOIN — une anonymisation conforme passe (le déclencheur du conseiller reçoit NULL), puis plus rien ne bouge', async () => {
    const id = await uneAnomalie('sincerite', 40);
    await clore(id);
    await anonymiser(id);
    const [l] = await base.prisma.$queryRaw<
      { apporteur: string | null; ouverte: Date; traite: Date; statut: string }[]
    >`SELECT apporteur_id AS apporteur, ouverte_at AS ouverte, traite_at AS traite, statut::text AS statut
      FROM anomalies WHERE id = ${id}::uuid`;
    expect([l!.apporteur, l!.ouverte.toISOString(), l!.traite.toISOString(), l!.statut]).toEqual([
      null,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      'levee',
    ]);
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'confirmee' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(
      await refus(
        ecrire(`UPDATE anomalies SET anonymisee_at = $2 WHERE id = $1::uuid`, id, new Date())
      )
    ).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : un cas d’auto-parrainage, sans score, s’anonymise aussi', async () => {
    const id = await uneAnomalie('auto_parrainage', null);
    await clore(id);
    await expect(anonymiser(id)).resolves.toBe(1);
  });

  it('REQ-DM-033 : TÉMOIN — l’anonymisation d’une anomalie OUVERTE est refusée', async () => {
    const id = await uneAnomalie();
    expect(await refus(anonymiser(id))).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — un champ oublié est refusé (anomalies_anonymisation_liee)', async () => {
    const id = await uneAnomalie('sincerite', 40);
    await clore(id);
    expect(await refus(anonymiser(id, { score: '40' }))).toContain('anomalies_anonymisation_liee');
  });

  it('REQ-DM-033 : TÉMOIN — une date non tronquée, ou tronquée dans un autre fuseau, est refusée', async () => {
    const id = await uneAnomalie();
    await clore(id);
    expect(await refus(anonymiser(id, { ouverte_at: 'ouverte_at' }))).toContain(ANOMALIES);
    expect(
      await refus(
        anonymiser(id, {
          traite_at:
            "date_trunc('month', traite_at AT TIME ZONE 'Pacific/Kiritimati') AT TIME ZONE 'Pacific/Kiritimati'",
        })
      )
    ).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — un statut ou un type changé dans la même écriture est refusé', async () => {
    const id = await uneAnomalie();
    await clore(id);
    expect(await refus(anonymiser(id, { statut: "'confirmee'" }))).toContain(ANOMALIES);
    expect(await refus(anonymiser(id, { type: "'sincerite'" }))).toContain(ANOMALIES);
  });

  /** Une retenue : la clôture CONFIRMÉE, la fin de la mesure posée ou non dans la même écriture. */
  const confirmer = (id: string, mesureTermineeAt: Date | null = null) =>
    ecrire(
      `UPDATE anomalies SET statut = 'confirmee', traite_at = $2, traite_par_id = $3::uuid,
         justification_chiffre = $4, mesure_terminee_at = $5
       WHERE id = $1::uuid`,
      id,
      MAINTENANT,
      adminId,
      randomBytes(40),
      mesureTermineeAt
    );
  const plusTard = (ms: number) => new Date(MAINTENANT.getTime() + ms);
  const terminerLaMesure = (id: string, at: Date = plusTard(60_000)) =>
    ecrire(`UPDATE anomalies SET mesure_terminee_at = $2 WHERE id = $1::uuid`, id, at);
  const geler = (id: string, ref: string | null = 'RG-24/01234', at: Date = plusTard(1_000)) =>
    ecrire(
      `UPDATE anomalies SET gel_litige_at = $2, gel_litige_ref = $3 WHERE id = $1::uuid`,
      id,
      at,
      ref
    );
  const lever = (id: string, at: Date = plusTard(2_000)) =>
    ecrire(`UPDATE anomalies SET gel_litige_leve_at = $2 WHERE id = $1::uuid`, id, at);
  const ACTIF = 'gel pour litige actif';
  const NON_TERMINEE = 'mesure non terminée';

  it('REQ-DM-033 : TÉMOIN — la fin de la mesure : un refus clos avec sa fin à traite_at passe ; une retenue close sans fin, puis sa fin posée plus tard, passe', async () => {
    const refusClos = await uneAnomalie();
    await expect(confirmer(refusClos, MAINTENANT)).resolves.toBe(1);
    const retenue = await uneAnomalie();
    await confirmer(retenue);
    await expect(terminerLaMesure(retenue)).resolves.toBe(1);
  });

  it('REQ-DM-033 : TÉMOIN — une fin sur une anomalie levée, ou antérieure à traite_at, est refusée (anomalies_mesure_terminee) ; réécrite, refusée', async () => {
    const levee = await uneAnomalie();
    await clore(levee);
    expect(await refus(terminerLaMesure(levee))).toContain('anomalies_mesure_terminee');
    const retenue = await uneAnomalie();
    await confirmer(retenue);
    expect(await refus(terminerLaMesure(retenue, plusTard(-1)))).toContain(
      'anomalies_mesure_terminee'
    );
    await terminerLaMesure(retenue);
    expect(await refus(terminerLaMesure(retenue, plusTard(120_000)))).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — l’anonymisation d’une confirmée sans fin est refusée (mesure non terminée) ; avec sa fin, elle passe et la vide', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    expect(await refus(anonymiser(id))).toContain(NON_TERMINEE);
    await terminerLaMesure(id);
    await expect(anonymiser(id)).resolves.toBe(1);
    const [l] = await base.prisma.$queryRaw<{ fin: Date | null }[]>`
      SELECT mesure_terminee_at AS fin FROM anomalies WHERE id = ${id}::uuid`;
    expect(l!.fin).toBeNull();
  });

  it('REQ-DM-033 : TÉMOIN — le gel pour litige posé puis levé passe ; sur une anomalie levée, refusé (anomalies_gel_litige_confirmee)', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    await expect(geler(id)).resolves.toBe(1);
    await expect(lever(id)).resolves.toBe(1);
    const levee = await uneAnomalie();
    await clore(levee);
    expect(await refus(geler(levee))).toContain('anomalies_gel_litige_confirmee');
  });

  it('REQ-DM-033 : TÉMOIN — une référence sans chiffre ou avec un espace est refusée (anomalies_gel_litige_ref_forme)', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    for (const ref of ['Dupont', 'RG 24/01234']) {
      expect(await refus(geler(id, ref)), ref).toContain('anomalies_gel_litige_ref_forme');
    }
  });

  it('REQ-DM-033 : TÉMOIN — un gel sans référence, ou une levée sans gel, est refusé (anomalies_gel_litige_forme)', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    expect(await refus(geler(id, null))).toContain('anomalies_gel_litige_forme');
    expect(await refus(lever(id))).toContain('anomalies_gel_litige_forme');
  });

  it('REQ-DM-033 : TÉMOIN — un gel reposé, une référence réécrite, une levée réécrite, un second gel après la levée : refusés', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    await geler(id);
    expect(await refus(geler(id, 'RG-24/01234', plusTard(5_000)))).toContain(ANOMALIES);
    expect(await refus(geler(id, 'RG-24/09999'))).toContain(ANOMALIES);
    await lever(id);
    expect(await refus(lever(id, plusTard(9_000)))).toContain(ANOMALIES);
    expect(await refus(geler(id, 'RG-25/00001', plusTard(10_000)))).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — sous un gel actif, l’anonymisation et la purge de la justification sont refusées (gel pour litige actif)', async () => {
    const id = await uneAnomalie();
    await confirmer(id, MAINTENANT);
    await geler(id);
    expect(await refus(anonymiser(id))).toContain(ACTIF);
    expect(await refus(purgerLaJustification(id))).toContain(ACTIF);
  });

  it('REQ-DM-033 : TÉMOIN — le gel et la fin de la mesure sont indépendants : purgée, l’anomalie se gèle encore ; après la levée et la fin, l’anonymisation passe et vide le gel', async () => {
    const id = await uneAnomalie();
    await confirmer(id);
    await purgerLaJustification(id);
    await geler(id);
    await terminerLaMesure(id);
    expect(await refus(anonymiser(id))).toContain(ACTIF);
    await lever(id);
    await expect(anonymiser(id)).resolves.toBe(1);
    const [l] = await base.prisma.$queryRaw<{ n: number }[]>`
      SELECT num_nonnulls(gel_litige_at, gel_litige_leve_at, gel_litige_ref, mesure_terminee_at)::int AS n
      FROM anomalies WHERE id = ${id}::uuid`;
    expect(l!.n).toBe(0);
  });

  it('REQ-DM-033 : TÉMOIN — une anomalie levée s’anonymise sans fin de mesure', async () => {
    const id = await uneAnomalie();
    await clore(id);
    await expect(anonymiser(id)).resolves.toBe(1);
  });

  it('REQ-DM-033 : TÉMOIN — un apporteur NULL sans anonymisation est refusé (anomalies_apporteur_present)', async () => {
    expect(
      await refus(
        ecrire(
          `INSERT INTO anomalies (id, type, apporteur_id, statut, ouverte_at)
           VALUES ($1::uuid, 'auto_parrainage', NULL, 'ouverte', $2)`,
          randomUUID(),
          MAINTENANT
        )
      )
    ).toContain('anomalies_apporteur_present');
  });
});

describe('REQ-DM-034 — rattachements_manuels : justifiés, antérieurs au dépôt, un actif par SIREN', () => {
  async function unRattachement(p: {
    attributionId: string;
    siren?: string;
    justification?: Buffer | null;
    lienAt: Date;
    sourceType?: string;
    sourceRef?: string;
  }): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO rattachements_manuels (id, attribution_id, siren_commande, justification_chiffre,
         lien_controle_etabli_at, lien_controle_source_type, lien_controle_source_ref, decide_par_id,
         decide_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::source_lien_controle, $7, $8::uuid, $9)`,
      id,
      p.attributionId,
      p.siren ?? unSiren(),
      p.justification === undefined ? randomBytes(40) : p.justification,
      p.lienAt,
      p.sourceType ?? 'kbis',
      p.sourceRef ?? 'KBIS-2019-04-01',
      adminId,
      MAINTENANT
    );
    return id;
  }
  /** Le début, à Paris, du jour d'un instant : la date d'une pièce datée de ce jour. */
  const debutDuJourAParis = (instant: Date, decalageJours = 0) => {
    const jour = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date(instant.getTime() + decalageJours * 24 * 3600 * 1000))
      .split('-')
      .map(Number) as [number, number, number];
    return new Date(dateDeLaPiece({ annee: jour[0], mois: jour[1], jour: jour[2] }));
  };

  it('REQ-DM-034 : TÉMOIN — la référence de la source : sans chiffre, ou avec un espace, refusée (rattachements_manuels_source_ref_forme)', async () => {
    const { id, deposeeAt } = await uneAttribution();
    for (const ref of ['Dupont', 'kbis 2019']) {
      expect(
        await refus(unRattachement({ attributionId: id, lienAt: deposeeAt, sourceRef: ref })),
        ref
      ).toContain('rattachements_manuels_source_ref_forme');
    }
  });

  it('REQ-DM-034 : TÉMOIN — une référence de 65 caractères est refusée par son TYPE, VARCHAR(64), SQLSTATE 22001, lu sur le code', async () => {
    const { id, deposeeAt } = await uneAttribution();
    let erreur: unknown = null;
    await unRattachement({
      attributionId: id,
      lienAt: deposeeAt,
      sourceRef: `${'x'.repeat(64)}1`,
    }).catch((e: unknown) => {
      erreur = e;
    });
    expect(codeSql(erreur)).toBe('22001');
  });

  it('REQ-DM-034 : TÉMOIN — une source hors de la liste fermée est refusée par l’enum ; le registre des bénéficiaires n’en est pas', async () => {
    const { id, deposeeAt } = await uneAttribution();
    for (const type of ['registre_beneficiaires', 'piece_kyc', 'attestation']) {
      expect(
        await refus(unRattachement({ attributionId: id, lienAt: deposeeAt, sourceType: type })),
        type
      ).toMatch(/source_lien_controle/);
    }
  });

  it('REQ-DM-034 : TÉMOIN — une justification absente ou vide est refusée (purge_liee, non_vide)', async () => {
    const { id, deposeeAt } = await uneAttribution();
    expect(
      await refus(unRattachement({ attributionId: id, lienAt: deposeeAt, justification: null }))
    ).toContain('rattachements_manuels_justification_purge_liee');
    expect(
      await refus(
        unRattachement({ attributionId: id, lienAt: deposeeAt, justification: Buffer.alloc(0) })
      )
    ).toContain('rattachements_manuels_justification_non_vide');
  });

  it('REQ-DM-034 : TÉMOIN — une pièce de la VEILLE du dépôt passe ; du JOUR même, au début du jour à Paris, passe ; du LENDEMAIN, refusée (rattachement_lien_anterieur)', async () => {
    const { id, deposeeAt } = await uneAttribution();
    await expect(
      unRattachement({ attributionId: id, lienAt: debutDuJourAParis(deposeeAt, -1) })
    ).resolves.toBeDefined();
    const { id: autre, deposeeAt: depot2 } = await uneAttribution();
    await expect(
      unRattachement({ attributionId: autre, lienAt: debutDuJourAParis(depot2) })
    ).resolves.toBeDefined();
    const { id: troisieme, deposeeAt: depot3 } = await uneAttribution();
    expect(
      await refus(
        unRattachement({ attributionId: troisieme, lienAt: debutDuJourAParis(depot3, 1) })
      )
    ).toContain('rattachement_lien_anterieur');
  });

  it('REQ-DM-034 : TÉMOIN — la purge de la justification : avec sa date, une fois ; sans date, ou la date sans le vide, refusée ; le texte ne revient pas, la date ne se réécrit pas', async () => {
    const { id: attributionId, deposeeAt } = await uneAttribution();
    const id = await unRattachement({ attributionId, lienAt: deposeeAt });
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification_chiffre = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('rattachements_manuels_justification_purge_liee');
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          MAINTENANT
        )
      )
    ).toContain('rattachements_manuels_justification_purge_liee');
    await ecrire(
      `UPDATE rattachements_manuels SET justification_chiffre = NULL, justification_purgee_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification_chiffre = $2, justification_purgee_at = NULL
           WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-DM-034 : TÉMOIN — un seul rattachement actif par SIREN ; révoqué une fois, un neuf passe ; la justification et la source ne se réécrivent pas', async () => {
    const siren = unSiren();
    const { id, deposeeAt } = await uneAttribution();
    const premier = await unRattachement({ attributionId: id, siren, lienAt: deposeeAt });
    expect(
      await refusDUnicite(unRattachement({ attributionId: id, siren, lienAt: deposeeAt }))
    ).toBe('23505 (siren_commande)');
    expect(await indexUnique('rattachements_manuels_un_actif_par_siren')).toMatch(
      /UNIQUE INDEX rattachements_manuels_un_actif_par_siren .*\(siren_commande\) WHERE \(revoque_at IS NULL\)/
    );
    await ecrire(
      `UPDATE rattachements_manuels SET revoque_at = $2 WHERE id = $1::uuid`,
      premier,
      MAINTENANT
    );
    await expect(
      unRattachement({ attributionId: id, siren, lienAt: deposeeAt })
    ).resolves.toBeDefined();
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET revoque_at = $2 WHERE id = $1::uuid`,
          premier,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification_chiffre = $2 WHERE id = $1::uuid`,
          premier,
          randomBytes(40)
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET lien_controle_source_ref = 'KBIS-2020-01-01' WHERE id = $1::uuid`,
          premier
        )
      )
    ).toContain(GABARIT);
    expect(await refus(tronquer('rattachements_manuels'))).toContain(GABARIT);
  });
});

describe('REQ-DM-043 — contestations : un objet, une cible, une réponse posée ensemble et une fois', () => {
  async function uneContestation(p: {
    objet: string;
    depotRefuseId?: string | null;
    attributionId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO contestations (id, apporteur_id, objet, depot_refuse_id, attribution_id,
         texte_chiffre, recue_at)
       VALUES ($1::uuid, $2::uuid, $3::objet_contestation, $4::uuid, $5::uuid, $6, $7)`,
      id,
      apporteurId,
      p.objet,
      p.depotRefuseId ?? null,
      p.attributionId ?? null,
      randomBytes(40),
      MAINTENANT
    );
    return id;
  }

  it('REQ-DM-043 : le semeur chiffre le texte pour SA ligne : il se relit sous elle, jamais sous une autre', async () => {
    const { id: attributionId } = await uneAttribution();
    const id = randomUUID();
    await semerContestation(base.prisma, {
      id,
      apporteurId,
      objet: 'annulation_attribution',
      depotRefuseId: null,
      attributionId,
      texte: 'je conteste cette annulation',
      recueAt: MAINTENANT,
      cles: CLES,
    });
    const [l] = await base.prisma.$queryRaw<{ t: Buffer }[]>`
      SELECT texte_chiffre AS t FROM contestations WHERE id = ${id}::uuid`;
    const ligne = { modele: MODELE_CONTESTATION, champ: 'texteChiffre', id };
    expect(decryptPii(ligne, l!.t, CLES)).toBe('je conteste cette annulation');
    expect(() => decryptPii({ ...ligne, id: randomUUID() }, l!.t, CLES)).toThrow();
  });

  it('REQ-DM-043 : TÉMOIN — la cible suit l’objet (contestations_objet_cible)', async () => {
    const refusId = await unRefus();
    const { id: attributionId } = await uneAttribution();
    await expect(
      uneContestation({ objet: 'refus_depot', depotRefuseId: refusId })
    ).resolves.toBeDefined();
    await expect(
      uneContestation({ objet: 'annulation_attribution', attributionId })
    ).resolves.toBeDefined();
    for (const mauvaise of [
      { objet: 'refus_depot', attributionId },
      { objet: 'refus_depot', depotRefuseId: refusId, attributionId },
      { objet: 'demande_rattachement', depotRefuseId: refusId },
      { objet: 'annulation_attribution' },
    ]) {
      expect(await refus(uneContestation(mauvaise)), JSON.stringify(mauvaise)).toContain(
        'contestations_objet_cible'
      );
    }
  });

  /** Une contestation d'attribution, neuve. */
  async function neuve(): Promise<string> {
    const { id: attributionId } = await uneAttribution();
    return uneContestation({ objet: 'demande_rattachement', attributionId });
  }
  const repondre = (id: string) =>
    ecrire(
      `UPDATE contestations SET reponse_chiffre = $2, repondue_par_id = $3::uuid, repondue_at = $4
       WHERE id = $1::uuid`,
      id,
      randomBytes(40),
      adminId,
      MAINTENANT
    );
  const purger = (id: string) =>
    ecrire(
      `UPDATE contestations SET texte_chiffre = NULL, reponse_chiffre = NULL, purgee_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );

  it('REQ-DM-043 : TÉMOIN — la réponse en deux temps est refusée ; posée ensemble, admise ; réécrite, refusée', async () => {
    const id = await neuve();
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET reponse_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    await repondre(id);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET reponse_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET repondue_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
  });

  it('REQ-DM-043 : TÉMOIN — la purge : sans sa date, ou la date sans la purge, refusée (contestations_purge_liee) ; ensemble, admise, la réponse gardée en trace', async () => {
    const id = await neuve();
    await repondre(id);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = NULL, reponse_chiffre = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('contestations_purge_liee');
    expect(
      await refus(
        ecrire(`UPDATE contestations SET purgee_at = $2 WHERE id = $1::uuid`, id, MAINTENANT)
      )
    ).toContain('contestations_purge_liee');
    await purger(id);
    const [l] = await base.prisma.$queryRaw<
      { texte: Buffer | null; reponse: Buffer | null; par: string | null; at: Date | null }[]
    >`SELECT texte_chiffre AS texte, reponse_chiffre AS reponse, repondue_par_id AS par,
        repondue_at AS at FROM contestations WHERE id = ${id}::uuid`;
    expect([l!.texte, l!.reponse, l!.par, l!.at?.toISOString()]).toEqual([
      null,
      null,
      adminId,
      MAINTENANT.toISOString(),
    ]);
  });

  it('REQ-DM-043 : TÉMOIN — après la purge, plus rien ne bouge : réponse, texte qui revient, date réécrite, refusés', async () => {
    const id = await neuve();
    await purger(id);
    expect(await refus(repondre(id))).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
  });

  it('REQ-DM-043 : TÉMOIN — un texte réécrit, l’identité changée, DELETE et TRUNCATE : refusés', async () => {
    const id = await neuve();
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET recue_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(await refus(ecrire(`DELETE FROM contestations WHERE id = $1::uuid`, id))).toContain(
      CONTESTATIONS
    );
    expect(await refus(tronquer('contestations'))).toContain(CONTESTATIONS);
  });

  const gelerLaContestation = (
    id: string,
    ref: string | null = 'RG-24/05678',
    at: Date = new Date(MAINTENANT.getTime() + 1_000)
  ) =>
    ecrire(
      `UPDATE contestations SET gel_litige_at = $2, gel_litige_ref = $3 WHERE id = $1::uuid`,
      id,
      at,
      ref
    );
  const leverLaContestation = (id: string, at: Date = new Date(MAINTENANT.getTime() + 2_000)) =>
    ecrire(`UPDATE contestations SET gel_litige_leve_at = $2 WHERE id = $1::uuid`, id, at);

  it('REQ-DM-043 : TÉMOIN — le gel pour litige posé puis levé passe ; la référence sans chiffre ou avec un espace est refusée (contestations_gel_litige_ref_forme)', async () => {
    const id = await neuve();
    for (const ref of ['Dupont', 'RG 24/05678']) {
      expect(await refus(gelerLaContestation(id, ref)), ref).toContain(
        'contestations_gel_litige_ref_forme'
      );
    }
    await expect(gelerLaContestation(id)).resolves.toBe(1);
    await expect(leverLaContestation(id)).resolves.toBe(1);
  });

  it('REQ-DM-043 : TÉMOIN — un gel sans référence, ou une levée sans gel, est refusé (contestations_gel_litige_forme)', async () => {
    const id = await neuve();
    expect(await refus(gelerLaContestation(id, null))).toContain('contestations_gel_litige_forme');
    expect(await refus(leverLaContestation(id))).toContain('contestations_gel_litige_forme');
  });

  it('REQ-DM-043 : TÉMOIN — un gel reposé, une référence réécrite, une levée réécrite : refusés', async () => {
    const id = await neuve();
    await gelerLaContestation(id);
    expect(
      await refus(gelerLaContestation(id, 'RG-24/05678', new Date(MAINTENANT.getTime() + 5_000)))
    ).toContain(CONTESTATIONS);
    expect(await refus(gelerLaContestation(id, 'RG-24/09999'))).toContain(CONTESTATIONS);
    await leverLaContestation(id);
    expect(await refus(leverLaContestation(id, new Date(MAINTENANT.getTime() + 9_000)))).toContain(
      CONTESTATIONS
    );
  });

  it('REQ-DM-043 : TÉMOIN — sous un gel actif, la purge est refusée (gel pour litige actif) ; après la levée, elle passe', async () => {
    const id = await neuve();
    await repondre(id);
    await gelerLaContestation(id);
    expect(await refus(purger(id))).toContain('gel pour litige actif');
    await leverLaContestation(id);
    await expect(purger(id)).resolves.toBe(1);
  });
});

describe('REQ-DM-033 REQ-DM-043 — les deux fonctions dédiées sont branchées, ligne et instruction', () => {
  it('REQ-DM-043 : TÉMOIN — anomalies et contestations portent chacune leur déclencheur de ligne et de troncature, sur leur fonction', async () => {
    const lignes = await base.prisma.$queryRaw<{ table: string; nom: string; fonction: string }[]>`
      SELECT c.relname AS table, t.tgname AS nom, p.proname AS fonction
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE p.proname IN (${ANOMALIES}, ${CONTESTATIONS}) AND NOT t.tgisinternal
      ORDER BY t.tgname`;
    expect(lignes.map((l) => [l.table, l.nom, l.fonction])).toEqual([
      ['anomalies', 'anomalies_trace', ANOMALIES],
      ['anomalies', 'anomalies_troncature', ANOMALIES],
      ['contestations', 'contestations_trace', CONTESTATIONS],
      ['contestations', 'contestations_troncature', CONTESTATIONS],
    ]);
  });
});

describe('W19 — jamais un conseiller pour traiter, décider ou répondre', () => {
  it('W19 : TÉMOIN — la fonction partagée compare role::text, sans EXECUTE, et refuse un argument qui ne nomme pas une colonne', async () => {
    const [f] = await base.prisma.$queryRaw<{ corps: string }[]>`
      SELECT pg_get_functiondef(p.oid) AS corps FROM pg_proc p WHERE p.proname = ${CONSEILLER}`;
    expect(f!.corps).toContain("'conseiller_salarie'");
    expect(f!.corps).toContain('TG_ARGV[0]');
    expect(f!.corps).not.toMatch(/\bEXECUTE\b/);
  });

  it('W19 : TÉMOIN — trois déclencheurs, et chaque argument nomme une colonne de sa table', async () => {
    const lignes = await base.prisma.$queryRaw<{ table: string; nom: string; colonne: string }[]>`
      SELECT c.relname AS table, t.tgname AS nom,
             convert_from(substring(t.tgargs FROM 1 FOR length(t.tgargs) - 1), 'UTF8') AS colonne
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE p.proname = ${CONSEILLER} AND NOT t.tgisinternal
      ORDER BY t.tgname`;
    expect(lignes.map((l) => [l.table, l.nom, l.colonne])).toEqual([
      ['anomalies', 'anomalies_traite_par_pas_conseiller', 'traite_par_id'],
      ['contestations', 'contestations_repondue_par_pas_conseiller', 'repondue_par_id'],
      ['rattachements_manuels', 'rattachements_manuels_decide_par_pas_conseiller', 'decide_par_id'],
    ]);
    for (const l of lignes) {
      const [c] = await base.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = ${l.table} AND column_name = ${l.colonne}`;
      expect(c!.n, `${l.table}.${l.colonne}`).toBe(1);
    }
  });
});

describe('REQ-DM-034 — l’écrivain du rattachement, émetteur de rattachement_decide', () => {
  it('REQ-DM-034 : TÉMOIN — la décision et son événement s’écrivent sous partners_app, et la clé part UNE fois, au bon apporteur', async () => {
    const { id: attributionId } = await uneAttribution();
    const courriels: { gabarit: string; apporteurId: string }[] = [];
    const r = await deciderLeRattachement(
      {
        attributionId,
        sirenCommande: unSiren(),
        justification: 'le Kbis montre une filiale à 100 % depuis 2019',
        lienControleDuJour: { annee: 2019, mois: 4, jour: 1 },
        sourceType: 'kbis',
        sourceRef: 'KBIS-2019-04-01',
        decideParId: adminId,
        maintenant: MAINTENANT,
        notification: {
          a: 'apporteur@exemple.invalid',
          entreprise: 'Entreprise Essai',
          decision: 'La commande est rattachée à votre attribution',
          motif: 'la société commandeuse est une filiale de celle que vous avez déclarée',
        },
      },
      {
        prisma: app,
        cles: CLES,
        notifier: (id, demande) =>
          notifier(demande, {
            acces: forApporteur(app, id),
            urlDeLEspace: new URL('https://partners.exemple.invalid'),
            envoyerCourriel: async (dem) => {
              courriels.push({ gabarit: dem.gabarit, apporteurId: dem.apporteurId ?? '' });
              return 'retenu_dmarc_non_verifie';
            },
          }),
      }
    );
    expect(r.notifie).toBe(true);
    const notifications = await base.prisma.notificationEspace.findMany({
      where: { cle: 'rattachement_decide' },
      select: { apporteurId: true, attributionId: true },
    });
    expect(notifications).toEqual([{ apporteurId, attributionId }]);
    expect(courriels).toEqual([{ gabarit: 'rattachement_decide', apporteurId }]);
    const evenements = await base.prisma.evenement.findMany({
      where: { type: 'rattachement_manuel_modifie', agregatId: attributionId },
      select: { agregat: true },
    });
    expect(evenements).toEqual([{ agregat: 'attribution' }]);
  });
});

describe('REQ-DM-032 REQ-DM-043 — les purges de l’échéance du registre (corrections d’A02)', () => {
  it('REQ-DM-032 : TÉMOIN — verifications : le porteur se purge avec sa date (le déclencheur du conseiller laisse passer le NULL) ; sans date, ou la date sans le vide, refusé ; il ne revient pas', async () => {
    const id = await uneVerification();
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET apporteur_id = NULL, utilisateur_console_id = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('verifications_porteur_unique');
    expect(
      await refus(
        ecrire(`UPDATE verifications SET porteur_purge_at = $2 WHERE id = $1::uuid`, id, MAINTENANT)
      )
    ).toContain('verifications_porteur_unique');
    await ecrire(
      `UPDATE verifications SET apporteur_id = NULL, utilisateur_console_id = NULL, porteur_purge_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET apporteur_id = $2::uuid WHERE id = $1::uuid`,
          id,
          apporteurId
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET porteur_purge_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-DM-032 : TÉMOIN — alertes_liberation : l’apporteur se purge avec sa date ; sans date, ou la date sans le vide, refusé (alertes_liberation_apporteur_purge_liee) ; il ne revient pas', async () => {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO alertes_liberation (id, apporteur_id, siren, cree_at) VALUES ($1::uuid, $2::uuid, $3, $4)`,
      id,
      apporteurId,
      unSiren(),
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(`UPDATE alertes_liberation SET apporteur_id = NULL WHERE id = $1::uuid`, id)
      )
    ).toContain('alertes_liberation_apporteur_purge_liee');
    expect(
      await refus(
        ecrire(
          `UPDATE alertes_liberation SET apporteur_purge_at = $2 WHERE id = $1::uuid`,
          id,
          MAINTENANT
        )
      )
    ).toContain('alertes_liberation_apporteur_purge_liee');
    await ecrire(
      `UPDATE alertes_liberation SET apporteur_id = NULL, apporteur_purge_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(
          `UPDATE alertes_liberation SET apporteur_id = $2::uuid, apporteur_purge_at = NULL
           WHERE id = $1::uuid`,
          id,
          apporteurId
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-DM-043 : TÉMOIN — une purge qui pose repondue_at sur une contestation jamais répondue est refusée', async () => {
    const { id: attributionId } = await uneAttribution();
    const id = randomUUID();
    await ecrire(
      `INSERT INTO contestations (id, apporteur_id, objet, attribution_id, texte_chiffre, recue_at)
       VALUES ($1::uuid, $2::uuid, 'demande_rattachement', $3::uuid, $4, $5)`,
      id,
      apporteurId,
      attributionId,
      randomBytes(40),
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = NULL, purgee_at = $2,
             repondue_par_id = $3::uuid, repondue_at = $2
           WHERE id = $1::uuid`,
          id,
          MAINTENANT,
          adminId
        )
      )
    ).toContain(CONTESTATIONS);
  });
});
