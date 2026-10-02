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
import { demarrerBase, type Base } from './harnais';

let base: Base;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const PLUS_TARD = new Date('2026-10-04T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
const FIGEES = 'pieces_kyc_coordonnees_figees';
const TRONCATURE = 'pieces_kyc_troncature';

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
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
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, fichier_ref, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, $3::type_piece_kyc, 'valide', $4, $5, $6)`,
    id,
    await unApporteur(),
    type,
    fichierRef,
    rib ? randomBytes(40) : null,
    rib ? hex(32) : null
  );
  return id;
}

/** Une modification d'une colonne, paramétrée ; le nom de colonne vient de la liste de ce fichier. */
async function poser(id: string, colonne: string, valeur: unknown): Promise<number> {
  return base.prisma.$executeRawUnsafe(
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
        base.prisma.$executeRawUnsafe(
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
        base.prisma.$executeRawUnsafe(
          `UPDATE pieces_kyc SET type = 'siret'::type_piece_kyc WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(FIGEES);
    expect(await refus(poser(id, 'apporteur_id', await unApporteur()))).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_ref', 'stockage/essai-2'))).toContain(FIGEES);
    expect(await refus(poser(id, 'fichier_ref', null))).toContain(FIGEES);
  });

  it('REQ-DM-027 : le statut, la date de vérification et l’échéance restent libres', async () => {
    const id = await piece('rib');
    await expect(
      base.prisma.$executeRawUnsafe(
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
      base.prisma.$executeRawUnsafe(
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
      base.prisma.$executeRawUnsafe(
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
      await refus(base.prisma.$executeRawUnsafe(`DELETE FROM pieces_kyc WHERE id = $1::uuid`, id))
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
