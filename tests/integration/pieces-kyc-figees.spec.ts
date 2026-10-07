// @req REQ-UX-027
// @req REQ-DM-027
/**
 * SEC-49 (REQ-UX-027, REQ-DM-027) — l'IBAN d'une pièce du KYC est FIGÉ par la base.
 *
 * Sans ce verrou, un simple UPDATE de `iban_chiffre` et `iban_hash` sur le RIB courant et validé
 * changerait le compte de versement sans nouvelle pièce `a_verifier`, sans vérification hors bande
 * et sans deux personnes. Un changement de RIB est TOUJOURS une nouvelle pièce ; l'ancienne reçoit
 * `remplacee_at`, une fois, sans retour.
 *
 * CE QU'IL PROUVE, contre la base réelle, chaque refus attendu sur le NOM du déclencheur :
 *   — `iban_chiffre`, `iban_hash`, `type`, `apporteur_id`, `fichier_ref` ne changent pas ;
 *   — `statut`, `verifiee_at` et `expire_at` restent libres ;
 *   — `remplacee_at` et `fichier_purge_at` s'écrivent une fois : ni modification, ni retour à NULL ;
 *   — la purge de la pièce d'identité (`fichier_ref` à NULL avec `fichier_purge_at`) passe, et le
 *     fichier ne revient pas ;
 *   — DELETE et TRUNCATE sont refusés ; les deux déclencheurs existent (`pg_trigger`).
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';

let base: Base;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const PLUS_TARD = new Date('2026-10-04T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

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
const FIGEES = 'pieces_kyc_coordonnees_figees';
const TRONCATURE = 'pieces_kyc_troncature';

/**
 * Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. Les insertions
 * et les écritures des témoins passent par lui ; la fixture d'apporteur et les lectures restent sous
 * le propriétaire. `partners_app` n'a pas TRUNCATE : le refus du déclencheur d'instruction se juge
 * sous le propriétaire, le seul rôle qui pourrait tronquer.
 */
let app: PrismaClient;

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  await deuxAdministrateursDuRib(base.prisma);
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'kyc_en_cours',
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

/** Une pièce par SQL brut : c'est la BASE qu'on juge. */
async function piece(type: 'rib' | 'identite', fichierRef: string | null = null): Promise<string> {
  const id = randomUUID();
  const rib = type === 'rib';
  await app.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, fichier_ref, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, $3::type_piece_kyc, $7::statut_piece_kyc, $4, $5, $6)`,
    id,
    await unApporteur(),
    type,
    fichierRef,
    rib ? randomBytes(40) : null,
    rib ? hex(32) : null,
    rib ? 'a_verifier' : 'valide'
  );
  if (rib) await confirmerLeRib(app, id);
  return id;
}

/** Une modification d'une colonne, paramétrée ; le nom de colonne vient de la liste de ce fichier. */
async function poser(id: string, colonne: string, valeur: unknown): Promise<number> {
  return app.$executeRawUnsafe(
    `UPDATE pieces_kyc SET ${colonne} = $2 WHERE id = $1::uuid`,
    id,
    valeur
  );
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-UX-027 — l’IBAN et l’identité de la pièce sont figés', () => {
  it.each([
    ['iban_chiffre', () => randomBytes(40)],
    ['iban_hash', () => hex(32)],
  ])('REQ-UX-027 : TÉMOIN — un UPDATE de %s sur un RIB valide est refusé', async (colonne, v) => {
    const id = await piece('rib');
    expect(await refus(poser(id, colonne, v()))).toContain(FIGEES);
  });

  it('REQ-UX-027 : TÉMOIN — l’IBAN ne s’efface pas non plus (aucune purge en phase 1)', async () => {
    const id = await piece('rib');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE pieces_kyc SET iban_chiffre = NULL, iban_hash = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(FIGEES);
  });

  it('REQ-DM-027 : TÉMOIN — le type, l’apporteur et le fichier d’une pièce ne changent pas', async () => {
    const id = await piece('identite', 'stockage/essai-1');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE pieces_kyc SET type = 'siret'::type_piece_kyc WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(FIGEES);
    // Transtypée `::uuid` : sinon Postgres refuse le TYPE (42804) avant que le déclencheur ne juge.
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE pieces_kyc SET apporteur_id = $2::uuid WHERE id = $1::uuid`,
          id,
          await unApporteur()
        )
      )
    ).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_ref', 'stockage/essai-2'))).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_ref', null))).toContain(FIGEES);
  });

  it('REQ-DM-027 : le statut, la date de vérification et l’échéance restent libres', async () => {
    const id = await piece('rib');
    await expect(
      app.$executeRawUnsafe(
        `UPDATE pieces_kyc SET statut = 'refusee'::statut_piece_kyc WHERE id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    await expect(poser(id, 'verifiee_at', MAINTENANT)).resolves.toBe(1);
    await expect(poser(id, 'verifiee_at', PLUS_TARD)).resolves.toBe(1);
    await expect(poser(id, 'expire_at', PLUS_TARD)).resolves.toBe(1);
  });
});

describe('REQ-UX-027 — remplacee_at et fichier_purge_at s’écrivent une fois', () => {
  it('REQ-UX-027 : TÉMOIN — remplacee_at se pose une fois ; ni modification, ni retour à NULL', async () => {
    const id = await piece('rib');
    await expect(poser(id, 'remplacee_at', MAINTENANT)).resolves.toBe(1);
    expect(await refus(poser(id, 'remplacee_at', PLUS_TARD))).toContain(FIGEES);
    expect(await refus(poser(id, 'remplacee_at', null))).toContain(FIGEES);
  });

  it('REQ-DM-027 : TÉMOIN — la purge de la pièce d’identité passe, une fois, et le fichier ne revient pas', async () => {
    const id = await piece('identite', 'stockage/identite-1');
    await expect(
      app.$executeRawUnsafe(
        `UPDATE pieces_kyc SET fichier_ref = NULL, fichier_purge_at = $2 WHERE id = $1::uuid`,
        id,
        MAINTENANT
      )
    ).resolves.toBe(1);
    expect(await refus(poser(id, 'fichier_ref', 'stockage/identite-1'))).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_purge_at', PLUS_TARD))).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_purge_at', null))).toContain(FIGEES);
  });

  it('REQ-DM-027 : TÉMOIN — fichier_purge_at posé SEUL, le fichier encore présent, est refusé ; la purge complète passe ensuite', async () => {
    const id = await piece('identite', 'stockage/identite-2');
    expect(await refus(poser(id, 'fichier_purge_at', MAINTENANT))).toContain(FIGEES);
    // La pièce reste reprenable par la purge : ni date posée, ni fichier effacé.
    const [l] = await base.prisma.$queryRaw<{ ref: string | null; purge: Date | null }[]>`
      SELECT fichier_ref AS ref, fichier_purge_at AS purge FROM pieces_kyc WHERE id = ${id}::uuid`;
    expect(l).toStrictEqual({ ref: 'stockage/identite-2', purge: null });
    // Puis la purge COMPLÈTE, fichier effacé et date posée ensemble, passe.
    await expect(
      app.$executeRawUnsafe(
        `UPDATE pieces_kyc SET fichier_ref = NULL, fichier_purge_at = $2 WHERE id = $1::uuid`,
        id,
        MAINTENANT
      )
    ).resolves.toBe(1);
  });
});

describe('REQ-DM-027 — une pièce ne disparaît pas', () => {
  it('REQ-DM-027 : TÉMOIN — DELETE est refusé', async () => {
    const id = await piece('rib');
    expect(
      await refus(app.$executeRawUnsafe(`DELETE FROM pieces_kyc WHERE id = $1::uuid`, id))
    ).toContain(FIGEES);
  });

  it('REQ-DM-027 : TÉMOIN — TRUNCATE est refusé', async () => {
    await piece('rib');
    expect(await refus(base.prisma.$executeRawUnsafe(`TRUNCATE pieces_kyc CASCADE`))).toContain(
      TRONCATURE
    );
  });

  it('REQ-DM-027 : TÉMOIN — les deux déclencheurs existent, lus dans pg_trigger', async () => {
    const lignes = await base.prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'pieces_kyc'::regclass AND NOT tgisinternal ORDER BY tgname`;
    expect(lignes.map((l) => l.tgname)).toEqual(expect.arrayContaining([FIGEES, TRONCATURE]));
  });
});
