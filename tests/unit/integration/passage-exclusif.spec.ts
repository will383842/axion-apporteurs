// @req REQ-DM-036
// @req REQ-ARG-003
/**
 * INT-T55, en mémoire — le passage est BORNÉ par son budget, et la route du webhook prend le MÊME
 * verrou que le lanceur. Le vrai verrou, deux passages simultanés et un passage tué :
 * `tests/integration/passage-exclusif.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TypeEvenementRecu } from '@prisma/client';
import {
  BUDGET_D_UN_PASSAGE_MS,
  TACHE_DE_RECEPTION,
  passerLeTravail,
  type Battre,
  type DepotDuTravail,
  type EvenementATraiter,
  type Marque,
} from '../../../src/server/queue/workers/evenement-recu';
import { cleDuVerrou } from '../../../src/server/taches/lanceur';

const DEBUT = Date.UTC(2026, 9, 2, 8, 0, 0);

/** Un dépôt de `n` événements `recu` sans dépendance, qui compte les marques et les battements. */
function depot(n: number) {
  const lignes = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    statut: 'recu' as string,
  }));
  const battements: Parameters<Battre>[] = [];
  const d: DepotDuTravail = {
    async aTraiter(): Promise<EvenementATraiter[]> {
      return lignes
        .filter((l) => l.statut === 'recu')
        .map((l) => ({
          id: l.id,
          eventType: TypeEvenementRecu.client_cree,
          sujetRef: null,
          charge: {},
          retryCount: 0,
        }));
    },
    parentTraite: async () => true,
    async marquer(id: string, m: Marque) {
      lignes.find((l) => l.id === id)!.statut = m.statut;
    },
    reveiller: async () => 0,
    async battre(...args) {
      battements.push(args);
    },
  };
  return { d, lignes, battements };
}

describe('REQ-DM-036 — le passage est BORNÉ par son budget', () => {
  it('REQ-DM-036 : le budget est plus court que la patience de la transaction qui tient le verrou (dix minutes)', () => {
    expect(BUDGET_D_UN_PASSAGE_MS).toBeGreaterThan(0);
    expect(BUDGET_D_UN_PASSAGE_MS).toBeLessThan(10 * 60 * 1000);
  });

  it('REQ-DM-036 : passé son budget, le passage ne commence plus d’événement ; le reste demeure `recu`', async () => {
    const { d, lignes } = depot(3);
    let t = DEBUT;
    const joues: string[] = [];
    const c = await passerLeTravail({
      depot: d,
      dispatch: async (e) => {
        joues.push(e.id);
        t += BUDGET_D_UN_PASSAGE_MS;
      },
      maintenant: () => new Date(t),
    });
    expect(joues).toEqual(['e0']);
    expect(c.traites).toBe(1);
    expect(lignes.map((l) => l.statut)).toEqual(['traite', 'recu', 'recu']);
  });

  it('REQ-DM-036 : à une milliseconde du budget, l’événement suivant est encore commencé', async () => {
    const { d } = depot(2);
    let t = DEBUT;
    const joues: string[] = [];
    await passerLeTravail({
      depot: d,
      dispatch: async (e) => {
        joues.push(e.id);
        t += BUDGET_D_UN_PASSAGE_MS - 1;
      },
      maintenant: () => new Date(t),
    });
    expect(joues).toEqual(['e0', 'e1']);
  });

  it('REQ-DM-036 : un passage borné écrit un battement de SUCCÈS, et le passage suivant prend le reste', async () => {
    const { d, lignes, battements } = depot(3);
    let t = DEBUT;
    const avance = async () => void (t += BUDGET_D_UN_PASSAGE_MS);
    await passerLeTravail({ depot: d, dispatch: avance, maintenant: () => new Date(t) });
    expect(battements.at(-1)![0]).toBe(TACHE_DE_RECEPTION);
    expect(battements.at(-1)![1]).toHaveProperty('succesAt');
    await passerLeTravail({
      depot: d,
      dispatch: async () => undefined,
      maintenant: () => new Date(t),
    });
    expect(lignes.every((l) => l.statut === 'traite')).toBe(true);
  });

  it('REQ-DM-036 : sans dépassement, le passage traite tout, comme avant', async () => {
    const { d, lignes } = depot(5);
    await passerLeTravail({
      depot: d,
      dispatch: async () => undefined,
      maintenant: () => new Date(DEBUT),
    });
    expect(lignes.every((l) => l.statut === 'traite')).toBe(true);
  });
});

// INT-T49 a changé la face de ce bloc (INT-T55 l'avait livré sous l'ancienne) : la route prenait le
// MÊME verrou que le lanceur pour jouer le passage ; elle n'en joue plus AUCUN. Le seul chemin du
// passage est le lanceur, sous le verrou de sa tâche : l'exclusion tient par construction.
describe('REQ-ARG-003 — la route ne joue aucun passage ; le lanceur seul, sous son verrou', () => {
  const ROUTE = readFileSync('src/app/api/webhooks/axionia/route.ts', 'utf8');
  const LANCEUR = readFileSync('src/server/taches/lanceur.ts', 'utf8');

  it('REQ-ARG-003 : la route n’appelle ni le passage, ni le verrou, ni after()', () => {
    expect(ROUTE).not.toMatch(
      /passageDesEvenementsRecus|passerLeTravail|verrouConsultatif|\bafter\s*\(/
    );
  });

  it('REQ-ARG-003 : le lanceur joue chaque passage sous le verrou de sa tâche', () => {
    expect(LANCEUR).toMatch(/d\.verrou\.sous\(cleDuVerrou\(tache\), passage\)/);
    expect(cleDuVerrou(TACHE_DE_RECEPTION)).toBe('lanceur:evenements_recus');
  });
});
