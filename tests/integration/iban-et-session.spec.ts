// @req REQ-SEC-003
/**
 * SEC-45 — un changement d'IBAN révoque les sessions de l'apporteur, en base RÉELLE.
 *
 * L'IBAN d'une pièce est figé (verrou de la pièce du KYC) : un changement de RIB est TOUJOURS une
 * nouvelle pièce `rib`. La base incrémente donc `apporteurs.session_version` à l'INSERTION d'une
 * pièce `rib` quand une AUTRE pièce `rib` existe déjà pour l'apporteur, quel que soit son statut
 * (un premier RIB refusé ne rouvre pas la fenêtre). Le premier RIB ne déconnecte personne.
 *
 * CE QU'IL PROUVE :
 *   1. premier RIB : version inchangée, la session passe ;
 *   2. second RIB : +1 exactement, et TOUTES les sessions ouvertes avant, celle qui dépose
 *      comprise, sont refusées à la requête suivante ;
 *   3. une pièce d'un autre type : version inchangée ;
 *   4. une insertion annulée : version inchangée ;
 *   5. un RIB qui suit un RIB refusé : +1 ;
 *   6. le déclencheur existe, sur `pieces_kyc`, AFTER INSERT, par ligne : sans lui, ce fichier rougit.
 * Les pièces s'insèrent, les versions se lisent et les sessions se jugent sous `partners_app`, le
 * rôle d'exécution PROVISIONNÉ : le déclencheur, SECURITY INVOKER, écrit avec SES droits.
 * Secrets et jetons sont tirés à l'exécution ; blocs et empreintes sont factices.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessions, exigerSession, type PortsDeSession } from '../../src/server/auth/session';
import { semerSession } from '../../prisma/seed/05-sessions';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;
/** Une SECONDE connexion du serveur, sous le même rôle : le témoin de la course. */
let app2: PrismaClient;

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  app2 = new PrismaClient({ datasourceUrl: u.toString() });
  await deuxAdministrateursDuRib(base.prisma);
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await app2?.$disconnect();
  await base?.arreter();
});

const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec45-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const t0 = Date.now();
const MINUTE = 60 * 1000;
const hex = (octets: number) => randomBytes(octets).toString('hex');

/**
 * Un RIB VALIDE, tel que la base l'exige depuis la migration 004750 : il naît SANS regard, dans un
 * statut qui n'est pas `a_verifier` (il occupe donc le même index partiel qu'une pièce courante,
 * comme avant), puis un administrateur le vérifie et un AUTRE le confirme ; la confirmation le passe à
 * `valide`, dans la même écriture.
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
async function confirmerLeRib(client: ClientSql, id: string) {
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = clock_timestamp()
     WHERE id = $2::uuid`,
    VERIFICATEUR_DU_RIB,
    id
  );
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = clock_timestamp(),
       statut = 'valide' WHERE id = $2::uuid`,
    CONFIRMATEUR_DU_RIB,
    id
  );
}

function ports(maintenant: Date): PortsDeSession {
  return {
    maintenant: () => maintenant,
    depot: depotDeSessions(app),
    configuration: CONFIGURATION.session,
  };
}

let sequence = 0;
/** Un code de parrainage neuf à chaque appel, dans la forme du CHECK (`AX` + 6 Crockford). */
function code(): string {
  sequence += 1;
  return `AX5${String(sequence).padStart(5, '0')}`;
}

/** Un apporteur `signe` au courriel posé par la couche des données personnelles. */
async function apporteur(): Promise<string> {
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: `rib-${sequence}@example.org` },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut: 'signe',
      codeParrainage: code(),
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/connexion',
      parrainCodeCapture: null,
      creeAt: new Date(t0),
    },
  });
  return id;
}

/** Ouvre une session par le semeur ; rend le jeton de session. */
async function ouvrir(apporteurId: string): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt: new Date(t0),
    ipHash: null,
    configuration: CONFIGURATION,
  });
  return jetonSession;
}

async function version(apporteurId: string): Promise<number> {
  const a = await app.apporteur.findUniqueOrThrow({
    where: { id: apporteurId },
    select: { sessionVersion: true },
  });
  return a.sessionVersion;
}

const maintenant = new Date(t0 + MINUTE);
const verdict = async (jeton: string) => {
  const v = await exigerSession(jeton, ports(maintenant));
  return v.ok ? 'acceptee' : v.motif;
};

/**
 * Une pièce par SQL brut : c'est la BASE qu'on juge. Un RIB porte son bloc et son empreinte ; les
 * types employés ici (`rib`, `siret`) n'ont pas d'échéance obligatoire.
 */
async function piece(p: {
  apporteur: string;
  type: 'rib' | 'siret';
  statut: string;
}): Promise<void> {
  const rib = p.type === 'rib';
  const ribValide = rib && p.statut === 'valide';
  const id = randomUUID();
  await app.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, $3::type_piece_kyc, $4::statut_piece_kyc, $5, $6)`,
    id,
    p.apporteur,
    p.type,
    ribValide ? 'refusee' : p.statut,
    rib ? randomBytes(40) : null,
    rib ? hex(32) : null
  );
  if (ribValide) await confirmerLeRib(app, id);
}

describe('REQ-SEC-003 — SEC-45 : un nouveau RIB révoque les sessions, le premier non', () => {
  it('REQ-SEC-003 : TÉMOIN — le PREMIER RIB ne change pas la version, et la session passe', async () => {
    const a = await apporteur();
    const jeton = await ouvrir(a);
    await piece({ apporteur: a, type: 'rib', statut: 'a_verifier' });
    expect(await version(a)).toBe(0);
    expect(await verdict(jeton)).toBe('acceptee');
  });

  it('REQ-SEC-003 : TÉMOIN — un SECOND RIB : +1 exactement, et toutes les sessions ouvertes avant, celle qui dépose comprise, sont refusées', async () => {
    const a = await apporteur();
    await piece({ apporteur: a, type: 'rib', statut: 'valide' });
    expect(await version(a)).toBe(0);
    const quiDepose = await ouvrir(a);
    const autre = await ouvrir(a);
    expect(await verdict(quiDepose)).toBe('acceptee');
    await piece({ apporteur: a, type: 'rib', statut: 'a_verifier' });
    expect(await version(a)).toBe(1);
    expect(await verdict(quiDepose)).toBe('version_perimee');
    expect(await verdict(autre)).toBe('version_perimee');
    // Une session rouverte ensuite porte la nouvelle version et passe.
    expect(await verdict(await ouvrir(a))).toBe('acceptee');
  });

  it('REQ-SEC-003 : une pièce d’un AUTRE type, après un RIB, ne change pas la version', async () => {
    const a = await apporteur();
    await piece({ apporteur: a, type: 'rib', statut: 'valide' });
    const jeton = await ouvrir(a);
    await piece({ apporteur: a, type: 'siret', statut: 'valide' });
    expect(await version(a)).toBe(0);
    expect(await verdict(jeton)).toBe('acceptee');
  });

  it('REQ-SEC-003 : un second RIB dont l’insertion est ANNULÉE ne change pas la version', async () => {
    const a = await apporteur();
    await piece({ apporteur: a, type: 'rib', statut: 'valide' });
    const jeton = await ouvrir(a);
    const ANNULATION = 'annulation voulue par le témoin';
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
           VALUES ($1::uuid, $2::uuid, 'rib', 'a_verifier', $3, $4)`,
          randomUUID(),
          a,
          randomBytes(40),
          hex(32)
        );
        throw new Error(ANNULATION);
      })
    ).rejects.toThrow(ANNULATION);
    expect(await version(a)).toBe(0);
    expect(await verdict(jeton)).toBe('acceptee');
  });

  it('REQ-SEC-003 : TÉMOIN — un RIB qui suit un RIB REFUSÉ compte comme un changement : +1', async () => {
    const a = await apporteur();
    await piece({ apporteur: a, type: 'rib', statut: 'refusee' });
    expect(await version(a)).toBe(0);
    const jeton = await ouvrir(a);
    await piece({ apporteur: a, type: 'rib', statut: 'a_verifier' });
    expect(await version(a)).toBe(1);
    expect(await verdict(jeton)).toBe('version_perimee');
  });

  it('REQ-SEC-003 : le déclencheur existe sur pieces_kyc, AFTER INSERT, par ligne', async () => {
    const lignes = await base.prisma.$queryRaw<{ nom: string; type: number; fonction: string }[]>`
      SELECT t.tgname AS nom, t.tgtype::int AS type, p.proname AS fonction
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE c.relname = 'pieces_kyc' AND t.tgname = 'pieces_kyc_rib_revoque_les_sessions'
        AND NOT t.tgisinternal`;
    expect(lignes).toHaveLength(1);
    const [d] = lignes;
    expect(d!.fonction).toBe('pieces_kyc_revoquer_sessions_au_changement_de_rib');
    // tgtype : bit 0 = par ligne, bit 1 = BEFORE (absent : AFTER), bit 2 = INSERT, bit 4 = UPDATE.
    expect(d!.type & 0b1).toBe(1);
    expect(d!.type & 0b10).toBe(0);
    expect(d!.type & 0b100).toBe(0b100);
    expect(d!.type & 0b10000).toBe(0);
  });

  it('REQ-SEC-003 : TÉMOIN — la COURSE : deux premiers RIB insérés en concurrence par deux connexions révoquent quand même, une fois', async () => {
    const a = await apporteur();
    /** Une insertion de RIB par SQL brut, dans la transaction donnée. */
    const rib = (tx: Pick<PrismaClient, '$executeRawUnsafe'>, statut: string) =>
      (async () => {
        const id = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
           VALUES ($1::uuid, $2::uuid, 'rib', $3::statut_piece_kyc, $4, $5)`,
          id,
          a,
          statut === 'valide' ? 'refusee' : statut,
          randomBytes(40),
          hex(32)
        );
        if (statut === 'valide') await confirmerLeRib(tx, id);
      })();
    let insere!: () => void;
    const premiereInseree = new Promise<void>((r) => (insere = r));
    let relacher!: () => void;
    const tenue = new Promise<void>((r) => (relacher = r));
    // La première transaction insère son RIB, puis RESTE OUVERTE.
    const premiere = app.$transaction(
      async (tx) => {
        await rib(tx, 'valide');
        insere();
        await tenue;
      },
      { timeout: 30_000 }
    );
    await premiereInseree;
    // La seconde, sur une AUTRE connexion, insère le sien : son déclencheur attend le verrou.
    const seconde = app2.$transaction(async (tx) => rib(tx, 'a_verifier'), { timeout: 30_000 });
    // On ne relâche la première qu'une fois la seconde VUE en attente d'un verrou.
    for (let i = 0; ; i += 1) {
      const [attente] = await base.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND usename = 'partners_app'`;
      if ((attente?.n ?? 0) > 0) break;
      if (i > 200) throw new Error('la seconde insertion n’a jamais attendu le verrou');
      await new Promise((r) => setTimeout(r, 50));
    }
    relacher();
    await Promise.all([premiere, seconde]);
    expect(await version(a)).toBe(1);
  });

  it('REQ-SEC-003 : TÉMOIN — SANS DEADLOCK : les deux transactions tiennent d’abord FOR KEY SHARE sur l’apporteur (comme la clé étrangère), puis insèrent ; aucune erreur, et la version vaut 1', async () => {
    const a = await apporteur();
    const rib = (tx: Pick<PrismaClient, '$executeRawUnsafe'>, statut: string) =>
      (async () => {
        const id = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
           VALUES ($1::uuid, $2::uuid, 'rib', $3::statut_piece_kyc, $4, $5)`,
          id,
          a,
          statut === 'valide' ? 'refusee' : statut,
          randomBytes(40),
          hex(32)
        );
        if (statut === 'valide') await confirmerLeRib(tx, id);
      })();
    const partager = (tx: Pick<PrismaClient, '$executeRawUnsafe'>) =>
      tx.$executeRawUnsafe(`SELECT 1 FROM apporteurs WHERE id = $1::uuid FOR KEY SHARE`, a);
    const signal = () => {
      let donner!: () => void;
      const attendre = new Promise<void>((r) => (donner = r));
      return { donner, attendre };
    };
    const premierPartage = signal();
    const secondPartage = signal();
    const premiereInseree = signal();
    const relache = signal();
    // Ordre forcé : les DEUX tiennent KEY SHARE avant toute insertion — le cas qui bloquait FOR UPDATE.
    const premiere = app.$transaction(
      async (tx) => {
        await partager(tx);
        premierPartage.donner();
        await secondPartage.attendre;
        await rib(tx, 'valide');
        premiereInseree.donner();
        await relache.attendre;
      },
      { timeout: 30_000 }
    );
    const seconde = app2.$transaction(
      async (tx) => {
        await premierPartage.attendre;
        await partager(tx);
        secondPartage.donner();
        await premiereInseree.attendre;
        await rib(tx, 'a_verifier');
      },
      { timeout: 30_000 }
    );
    await premiereInseree.attendre;
    for (let i = 0; ; i += 1) {
      const [attente] = await base.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND usename = 'partners_app'`;
      if ((attente?.n ?? 0) > 0) break;
      if (i > 200) throw new Error('la seconde insertion n’a jamais attendu le verrou');
      await new Promise((r) => setTimeout(r, 50));
    }
    relache.donner();
    await expect(Promise.all([premiere, seconde])).resolves.toBeDefined();
    expect(await version(a)).toBe(1);
  });
});
