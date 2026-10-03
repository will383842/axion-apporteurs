// @req REQ-DM-011
/**
 * La fin de plein droit du contrat (art. 12.5 : décès de l'apporteur personne physique, cessation de
 * son activité, radiation de son immatriculation ; sans préavis, ni décision de la Société) a sa
 * valeur dans le motif de résiliation, en base RÉELLE.
 *
 * Témoins : une résiliation de plein droit s'enregistre avec `fin_de_plein_droit` ; la valeur est la
 * DERNIÈRE de l'enum, les trois existantes ne changent ni de nom ni d'ordre ; une procédure collective
 * n'est pas une fin de plein droit, aucune valeur ne la porte ; le CHECK qui lie le motif au statut
 * `resilie` vaut aussi pour la valeur neuve.
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

/** Un apporteur au statut et au motif donnés. */
function apporteur(statut: 'signe' | 'resilie', motif: string | null) {
  return base.prisma.apporteur.create({
    data: {
      statut,
      resiliationMotif: motif as never,
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: new Date('2026-01-01T00:00:00.000Z'),
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

describe('REQ-DM-011 — la fin de plein droit, valeur du motif de résiliation (art. 12.5)', () => {
  it('REQ-DM-011 : TÉMOIN — une résiliation de plein droit s’enregistre avec `fin_de_plein_droit`', async () => {
    const a = await apporteur('resilie', 'fin_de_plein_droit');
    const lu = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a.id } });
    expect(lu.statut).toBe('resilie');
    expect(lu.resiliationMotif).toBe('fin_de_plein_droit');
  });

  it('REQ-DM-011 : TÉMOIN — la valeur est la DERNIÈRE de l’enum, et les trois existantes ne changent ni de nom ni d’ordre', async () => {
    const lignes = await base.prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'motif_resiliation' ORDER BY e.enumsortorder`
    );
    expect(lignes.map((l) => l.v)).toEqual([
      'ordinaire_apporteur',
      'ordinaire_axion',
      'manquement_grave',
      'fin_de_plein_droit',
    ]);
  });

  it('REQ-DM-011 : TÉMOIN — une procédure collective n’est pas une fin de plein droit : aucune valeur ne la porte, la base la refuse', async () => {
    expect(await refus(apporteur('resilie', 'procedure_collective'))).toMatch(
      /motif_resiliation|MotifResiliation|invalid/i
    );
  });

  it('REQ-DM-011 : le motif reste lié au statut — `fin_de_plein_droit` hors `resilie` est refusé sur le nom du CHECK', async () => {
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE "apporteurs" SET "resiliation_motif" = 'fin_de_plein_droit' WHERE "id" = $1::uuid`,
          (await apporteur('signe', null)).id
        )
      )
    ).toContain('apporteurs_motif_si_resilie');
  });
});
