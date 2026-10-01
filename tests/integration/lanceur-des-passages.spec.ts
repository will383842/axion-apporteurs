// @req REQ-QA-027
/**
 * GOV-137, en base RÉELLE — le verrou consultatif de Postgres tient la règle du lanceur : deux
 * lanceurs concurrents ne jouent un passage qu'une fois, et le battement s'écrit dans `battements`.
 *
 * Le verrou (`verrouConsultatif`) et le dépôt des battements (`depotDuTravail(...).battre`) sont
 * ceux de la production. Les mêmes règles, verrou en mémoire : `tests/unit/integration/lanceur-des-
 * passages.spec.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { demarrerBase, type Base } from './harnais';
import { lancerLesPassages, verrouConsultatif } from '../../src/server/taches/lanceur';
import { depotDuTravail } from '../../src/server/queue/workers/evenement-recu';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const INSTANT = new Date('2026-10-01T22:00:00.000Z');

describe('REQ-QA-027 — deux lanceurs concurrents, un seul passage, sur le vrai verrou', () => {
  it('REQ-QA-027 : le second lanceur trouve la tâche tenue et la saute ; un seul battement', async () => {
    let joue = 0;
    let liberer!: () => void;
    const tenu = new Promise<void>((r) => (liberer = r));
    let entre!: () => void;
    const dedans = new Promise<void>((r) => (entre = r));
    const inscriptions = {
      evenements_recus: async () => {
        joue += 1;
        entre();
        await tenu;
        return { traites: 1, enAttente: 0, enErreur: 0, reveilles: 0 };
      },
    };
    const commun = {
      inscriptions,
      verrou: verrouConsultatif(base.prisma),
      battre: depotDuTravail(base.prisma).battre,
      maintenant: () => INSTANT,
    };
    const premier = lancerLesPassages(commun);
    await dedans;
    const second = await lancerLesPassages(commun);
    liberer();
    expect(await premier).toEqual({ evenements_recus: 'joue' });
    expect(second).toEqual({ evenements_recus: 'deja_en_cours' });
    expect(joue).toBe(1);
    const b = await base.prisma.battement.findUniqueOrThrow({
      where: { tache: 'evenements_recus' },
    });
    expect(b.dernierSuccesAt?.toISOString()).toBe(INSTANT.toISOString());
  });

  it('REQ-QA-027 : le verrou est relâché à la fin du passage — un lanceur suivant joue', async () => {
    let joue = 0;
    const commun = {
      inscriptions: {
        evenements_recus: async () => {
          joue += 1;
          return { traites: 0, enAttente: 0, enErreur: 0, reveilles: 0 };
        },
      },
      verrou: verrouConsultatif(base.prisma),
      battre: depotDuTravail(base.prisma).battre,
      maintenant: () => INSTANT,
    };
    expect(await lancerLesPassages(commun)).toEqual({ evenements_recus: 'joue' });
    expect(await lancerLesPassages(commun)).toEqual({ evenements_recus: 'joue' });
    expect(joue).toBe(2);
  });
});
