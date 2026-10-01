// @req REQ-QA-027
/**
 * GOV-137 — LE LANCEUR DES PASSAGES PLANIFIÉS : « tout ce qui est dû à l'instant t » (REQ-QA-027).
 *
 * Un processus planifié appelle le lanceur ; le lanceur joue, pour chaque clé du registre des tâches
 * (`TACHES`), le passage qui s'y est inscrit, sous un verrou consultatif par tâche, et écrit son
 * battement. Une tâche s'inscrit sans toucher au lanceur : elle fournit son passage.
 *
 * TÉMOINS (acceptance de GOV-137) : deux lanceurs concurrents n'exécutent un passage qu'une fois ;
 * une tâche en échec n'arrête pas les autres. Et : un battement par clé jouée, succès ou échec ;
 * une clé hors registre ne s'inscrit pas.
 *
 * Sur un verrou en mémoire qui tient la règle du verrou consultatif (une clé, un seul détenteur) ; le
 * vrai verrou de Postgres est jugé par `tests/integration/lanceur-des-passages.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  cleDuVerrou,
  lancerLesPassages,
  verrouConsultatif,
  type Inscriptions,
  type VerrouConsultatif,
} from '../../../src/server/taches/lanceur';
import type { Battre } from '../../../src/server/queue/workers/evenement-recu';

const INSTANT = new Date('2026-10-01T22:00:00.000Z');

/** Un verrou en mémoire : une clé n'a qu'un détenteur à la fois. */
function verrouEnMemoire(): VerrouConsultatif & { pris: string[] } {
  const tenus = new Set<string>();
  const pris: string[] = [];
  return {
    pris,
    async sous(cle, travail) {
      if (tenus.has(cle)) return { pris: false };
      tenus.add(cle);
      pris.push(cle);
      try {
        return { pris: true, valeur: await travail() };
      } finally {
        tenus.delete(cle);
      }
    },
  };
}

function battements() {
  const lignes: Parameters<Battre>[] = [];
  const battre: Battre = async (...a) => void lignes.push(a);
  return { lignes, battre };
}

describe('REQ-QA-027 — le lanceur joue chaque passage inscrit, sous verrou, avec son battement', () => {
  it('REQ-QA-027 : un passage inscrit est joué une fois, et son battement de succès écrit ses compteurs', async () => {
    let joue = 0;
    const inscriptions: Inscriptions = {
      evenements_recus: async () => {
        joue += 1;
        return { traites: 2, enAttente: 0, enErreur: 0, reveilles: 0 };
      },
    };
    const b = battements();
    const issues = await lancerLesPassages({
      inscriptions,
      verrou: verrouEnMemoire(),
      battre: b.battre,
      maintenant: () => INSTANT,
    });
    expect(joue).toBe(1);
    expect(issues).toEqual({ evenements_recus: 'joue' });
    expect(b.lignes).toEqual([
      [
        'evenements_recus',
        { succesAt: INSTANT, compteurs: { traites: 2, enAttente: 0, enErreur: 0, reveilles: 0 } },
      ],
    ]);
  });

  it('REQ-QA-027 : deux lanceurs concurrents n’exécutent le passage qu’UNE fois', async () => {
    let joue = 0;
    let liberer!: () => void;
    const tenu = new Promise<void>((r) => (liberer = r));
    const inscriptions: Inscriptions = {
      evenements_recus: async () => {
        joue += 1;
        await tenu;
        return { traites: 0, enAttente: 0, enErreur: 0, reveilles: 0 };
      },
    };
    const verrou = verrouEnMemoire();
    const b = battements();
    const premier = lancerLesPassages({
      inscriptions,
      verrou,
      battre: b.battre,
      maintenant: () => INSTANT,
    });
    // Le second lanceur arrive pendant que le premier tient la tâche.
    await Promise.resolve();
    const second = await lancerLesPassages({
      inscriptions,
      verrou,
      battre: b.battre,
      maintenant: () => INSTANT,
    });
    liberer();
    expect(await premier).toEqual({ evenements_recus: 'joue' });
    expect(second).toEqual({ evenements_recus: 'deja_en_cours' });
    expect(joue).toBe(1);
    expect(b.lignes).toHaveLength(1);
  });

  it('REQ-QA-027 : une tâche en échec n’arrête pas les autres, et écrit son battement d’échec', async () => {
    const joues: string[] = [];
    // Le registre n'a qu'une clé aujourd'hui : elle est jouée DEUX fois par `ordre`, et la première
    // panne ne doit pas empêcher la seconde de partir.
    const inscriptions: Inscriptions = {
      evenements_recus: async () => {
        joues.push('evenements_recus');
        throw new TypeError('panne');
      },
    };
    const b = battements();
    const issues = await lancerLesPassages({
      inscriptions,
      verrou: verrouEnMemoire(),
      battre: b.battre,
      maintenant: () => INSTANT,
      ordre: ['evenements_recus', 'evenements_recus'],
    });
    expect(joues).toEqual(['evenements_recus', 'evenements_recus']);
    expect(issues).toEqual({ evenements_recus: 'echec' });
    expect(b.lignes).toEqual([
      ['evenements_recus', { echecAt: INSTANT }],
      ['evenements_recus', { echecAt: INSTANT }],
    ]);
  });

  it('REQ-QA-027 : une clé hors du registre ne s’inscrit pas — refus avant tout passage', async () => {
    let joue = 0;
    const inscriptions = {
      tache_inventee: async () => {
        joue += 1;
        return {};
      },
    } as unknown as Inscriptions;
    await expect(
      lancerLesPassages({
        inscriptions,
        verrou: verrouEnMemoire(),
        battre: battements().battre,
        maintenant: () => INSTANT,
      })
    ).rejects.toThrow(/tache_hors_registre/);
    expect(joue).toBe(0);
  });

  it('REQ-QA-027 : une clé du registre sans inscription n’est pas jouée, et ne bat pas', async () => {
    const b = battements();
    const issues = await lancerLesPassages({
      inscriptions: {},
      verrou: verrouEnMemoire(),
      battre: b.battre,
      maintenant: () => INSTANT,
    });
    expect(issues).toEqual({});
    expect(b.lignes).toEqual([]);
  });

  it('REQ-QA-027 : chaque tâche a SA clé de verrou, sous l’espace du lanceur', async () => {
    expect(cleDuVerrou('evenements_recus')).toBe('lanceur:evenements_recus');
    const verrou = verrouEnMemoire();
    await lancerLesPassages({
      inscriptions: { evenements_recus: async () => ({}) },
      verrou,
      battre: battements().battre,
      maintenant: () => INSTANT,
    });
    expect(verrou.pris).toEqual(['lanceur:evenements_recus']);
  });

  it('REQ-QA-027 : une clé ORDONNÉE sans inscription est sautée, sans battement', async () => {
    const b = battements();
    expect(
      await lancerLesPassages({
        inscriptions: {},
        verrou: verrouEnMemoire(),
        battre: b.battre,
        maintenant: () => INSTANT,
        ordre: ['evenements_recus'],
      })
    ).toEqual({});
    expect(b.lignes).toEqual([]);
  });
});

describe('REQ-QA-027 — le verrou de Postgres, sur un faux client qui enregistre', () => {
  function fauxClient(reponse: unknown[]) {
    const appels: { sql: string; valeurs: unknown[]; options: unknown }[] = [];
    const client = {
      async $transaction(f: (tx: unknown) => Promise<unknown>, options: unknown) {
        const tx = {
          $queryRaw: async (sql: TemplateStringsArray, ...valeurs: unknown[]) => {
            appels.push({ sql: sql.join('?'), valeurs, options });
            return reponse;
          },
        };
        return f(tx);
      },
    };
    return { client: client as never, appels };
  }

  it('REQ-QA-027 : clé libre — le travail est joué, sous pg_try_advisory_xact_lock et un délai borné', async () => {
    const { client, appels } = fauxClient([{ pris: true }]);
    let joue = 0;
    const r = await verrouConsultatif(client).sous('lanceur:evenements_recus', async () => {
      joue += 1;
      return 7;
    });
    expect(r).toEqual({ pris: true, valeur: 7 });
    expect(joue).toBe(1);
    expect(appels[0]!.sql).toContain('pg_try_advisory_xact_lock');
    expect(appels[0]!.valeurs).toEqual(['lanceur:evenements_recus']);
    expect(appels[0]!.options).toMatchObject({ timeout: expect.any(Number) });
  });

  it.each([
    ['la base refuse le verrou', [{ pris: false }]],
    ['la base ne rend aucune ligne', []],
  ])('REQ-QA-027 : %s — le travail n’est PAS joué', async (_quoi, reponse) => {
    const { client } = fauxClient(reponse);
    let joue = 0;
    const r = await verrouConsultatif(client).sous('x', async () => {
      joue += 1;
    });
    expect(r).toEqual({ pris: false });
    expect(joue).toBe(0);
  });
});
