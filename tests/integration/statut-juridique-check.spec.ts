// @req REQ-DM-065
/**
 * DM-56 — le statut juridique de l'apporteur en base RÉELLE : l'enum `statut_juridique`, la colonne
 * NULLABLE et sans défaut, et le CHECK `apporteurs_qualite_suit_le_statut` (précision (b) d'A02),
 * garde-fou de la correspondance d'écriture (partners/ADR-0022 §8).
 *
 * Témoins sur le NOM du CHECK : une SAS commerçante refusée, un micro-entrepreneur en société
 * commerciale refusé. Contre-témoins : chaque société en `societe_commerciale`, chaque forme
 * individuelle dans les trois qualités individuelles, et un des deux côtés nul, passent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const hex = (octets: number) => randomBytes(octets).toString('hex');
const SOCIETES = ['sarl', 'eurl', 'sas', 'sasu', 'sa', 'snc'];
const INDIVIDUELLES = ['commercant', 'artisan', 'profession_liberale'];

/** Un apporteur au statut juridique et à la qualité donnés. */
function apporteur(statutJuridique: string | null, qualiteExercice: string | null) {
  return base.prisma.apporteur.create({
    data: {
      statut: 'kyc_en_cours',
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: new Date('2026-01-01T00:00:00.000Z'),
      statutJuridique: statutJuridique as never,
      qualiteExercice: qualiteExercice as never,
    },
  });
}

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-065 — l’enum et la colonne, en base réelle', () => {
  it('REQ-DM-065 : TÉMOIN — l’enum `statut_juridique` porte les huit valeurs, dans cet ordre', async () => {
    const lignes = await base.prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'statut_juridique' ORDER BY e.enumsortorder`
    );
    expect(lignes.map((l) => l.v)).toEqual([
      'micro_entrepreneur',
      'entrepreneur_individuel',
      'sarl',
      'eurl',
      'sas',
      'sasu',
      'sa',
      'snc',
    ]);
  });

  it('REQ-DM-065 : TÉMOIN — `apporteurs.statut_juridique` est NULLABLE, sans défaut, et porte l’enum', async () => {
    const [col] = await base.prisma.$queryRawUnsafe<
      { is_nullable: string; column_default: string | null; udt_name: string }[]
    >(
      `SELECT is_nullable, column_default, udt_name FROM information_schema.columns
       WHERE table_name = 'apporteurs' AND column_name = 'statut_juridique'`
    );
    expect(col).toEqual({ is_nullable: 'YES', column_default: null, udt_name: 'statut_juridique' });
  });

  it('REQ-DM-065 : TÉMOIN — un apporteur existant n’a pas de statut saisi : la colonne reste nulle', async () => {
    const a = await apporteur(null, null);
    const lu = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a.id } });
    expect(lu.statutJuridique).toBeNull();
  });

  it('REQ-DM-065 : TÉMOIN — une valeur hors de l’enum est refusée par la base', async () => {
    expect(await refus(apporteur('portage_salarial', null))).toMatch(
      /statut_juridique|StatutJuridique|invalid/i
    );
  });
});

describe('REQ-DM-065 — le CHECK `apporteurs_qualite_suit_le_statut`', () => {
  it('REQ-DM-065 : TÉMOIN — une SAS commerçante est refusée, sur le nom du CHECK', async () => {
    expect(await refus(apporteur('sas', 'commercant'))).toMatch(
      /apporteurs_qualite_suit_le_statut/
    );
  });

  it('REQ-DM-065 : TÉMOIN — un micro-entrepreneur en société commerciale est refusé, sur le nom du CHECK', async () => {
    expect(await refus(apporteur('micro_entrepreneur', 'societe_commerciale'))).toMatch(
      /apporteurs_qualite_suit_le_statut/
    );
  });

  it('REQ-DM-065 : TÉMOIN — chaque société hors `societe_commerciale`, et chaque forme individuelle en société commerciale, sont refusées', async () => {
    for (const s of SOCIETES) {
      for (const q of INDIVIDUELLES) {
        expect(await refus(apporteur(s, q)), `${s} / ${q}`).toMatch(
          /apporteurs_qualite_suit_le_statut/
        );
      }
    }
    expect(await refus(apporteur('entrepreneur_individuel', 'societe_commerciale'))).toMatch(
      /apporteurs_qualite_suit_le_statut/
    );
  });

  it('REQ-DM-065 : CONTRE-TÉMOIN — chaque société en `societe_commerciale`, chaque forme individuelle dans une qualité individuelle, passent', async () => {
    for (const s of SOCIETES)
      await expect(apporteur(s, 'societe_commerciale')).resolves.toBeDefined();
    for (const s of ['micro_entrepreneur', 'entrepreneur_individuel']) {
      for (const q of INDIVIDUELLES) await expect(apporteur(s, q)).resolves.toBeDefined();
    }
  });

  it('REQ-DM-065 : CONTRE-TÉMOIN — un statut sans qualité, ou une qualité sans statut, passent (l’un des deux n’est pas encore déclaré)', async () => {
    await expect(apporteur('sas', null)).resolves.toBeDefined();
    await expect(apporteur('micro_entrepreneur', null)).resolves.toBeDefined();
    await expect(apporteur(null, 'commercant')).resolves.toBeDefined();
    await expect(apporteur(null, 'societe_commerciale')).resolves.toBeDefined();
  });
});
