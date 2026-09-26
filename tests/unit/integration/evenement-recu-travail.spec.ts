// @req REQ-INT-011
// @req REQ-ARG-003
/**
 * `evenement-recu-travail.spec.ts` — le travail de fond des événements reçus (SEC-06), sur un
 * dépôt en mémoire qui tient les mêmes règles que la table `evenements_recus`.
 *
 * CE QUI EST JUGÉ :
 *   — l'attente de dépendance (REQ-INT-011) : un devis dont le client est inconnu, un paiement dont
 *     la facture est inconnue, sont CONSERVÉS en `en_attente_dependance` et rejoués
 *     AUTOMATIQUEMENT quand le parent est traité — jamais rejetés ;
 *   — le rejeu (REQ-ARG-003) : un même dossier livré dans TOUS les ordres possibles rend le même
 *     ensemble de statuts et la même résolution des dépendances ;
 *   — un dispatch qui lève laisse l'événement `en_erreur`, `processedAt` nul, `retryCount` à 1 ;
 *   — chaque passage écrit son battement (REQ-QA-026, acceptance 8 de SEC-06).
 * La même chose en base réelle vit dans `tests/integration/webhook-verdicts.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import { TACHES } from '../../../src/server/taches/registre';
import {
  TACHE_DE_RECEPTION,
  dependanceDe,
  passerLeTravail,
  type Battre,
  type DepotDuTravail,
  type EvenementATraiter,
  type Marque,
} from '../../../src/server/queue/workers/evenement-recu';

type Ligne = EvenementATraiter & {
  statut: string;
  dependanceRef: string | null;
  processedAt: Date | null;
  error: string | null;
  ordre: number;
};

function depotEnMemoire() {
  const lignes: Ligne[] = [];
  const battements: Parameters<Battre>[] = [];
  let ordre = 0;
  const depot: DepotDuTravail = {
    async aTraiter() {
      return lignes
        .filter((l) => l.statut === 'recu')
        .sort((a, b) => a.ordre - b.ordre)
        .map(({ id, eventType, sujetRef, charge, retryCount }) => ({
          id,
          eventType,
          sujetRef,
          charge,
          retryCount,
        }));
    },
    async parentTraite(ref, types) {
      return lignes.some(
        (l) => l.sujetRef === ref && types.includes(l.eventType) && l.statut === 'traite'
      );
    },
    async marquer(id, m: Marque) {
      const l = lignes.find((x) => x.id === id)!;
      l.statut = m.statut;
      l.dependanceRef = m.statut === 'en_attente_dependance' ? m.dependanceRef : null;
      l.processedAt = m.statut === 'traite' ? m.processedAt : null;
      if (m.statut === 'en_erreur') {
        l.error = m.error;
        l.retryCount = m.retryCount;
      }
    },
    async reveiller(ref) {
      const enfants = lignes.filter(
        (l) => l.statut === 'en_attente_dependance' && l.dependanceRef === ref
      );
      for (const e of enfants) {
        e.statut = 'recu';
        e.dependanceRef = null;
      }
      return enfants.length;
    },
    async battre(...args) {
      battements.push(args);
    },
  };
  const arriver = (e: Omit<EvenementATraiter, 'retryCount'>) => {
    ordre += 1;
    lignes.push({
      ...e,
      retryCount: 0,
      statut: 'recu',
      dependanceRef: null,
      processedAt: null,
      error: null,
      ordre,
    });
  };
  return { depot, lignes, battements, arriver };
}

const INSTANT = new Date('2026-09-26T10:00:00.000Z');
const sansEffet = async () => undefined;

/** Un dossier : un client, son devis, une facture, deux paiements dont l'un vise une facture qui ne viendra jamais. */
const DOSSIER: Omit<EvenementATraiter, 'retryCount'>[] = [
  {
    id: 'e1',
    eventType: TypeEvenementRecu.client_cree,
    sujetRef: 'client:C1',
    charge: { clientId: 'C1' },
  },
  {
    id: 'e2',
    eventType: TypeEvenementRecu.devis_signe,
    sujetRef: 'devis:D1',
    charge: { clientId: 'C1', devisId: 'D1' },
  },
  {
    id: 'e3',
    eventType: TypeEvenementRecu.facture_emise,
    sujetRef: 'facture:F1',
    charge: { factureId: 'F1', clientId: 'C1' },
  },
  {
    id: 'e4',
    eventType: TypeEvenementRecu.paiement_recu,
    sujetRef: 'paiement:P1',
    charge: { paymentId: 'P1', factureId: 'F1' },
  },
  {
    id: 'e5',
    eventType: TypeEvenementRecu.paiement_recu,
    sujetRef: 'paiement:P2',
    charge: { paymentId: 'P2', factureId: 'F9' },
  },
];

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])
  );
}

/** Livre le dossier dans l'ordre donné, un passage du travail après chaque arrivée, comme en production. */
async function livrer(ordre: readonly Omit<EvenementATraiter, 'retryCount'>[]) {
  const m = depotEnMemoire();
  for (const e of ordre) {
    m.arriver(e);
    await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
  }
  return m;
}

const etatFinal = (lignes: Ligne[]) =>
  Object.fromEntries(lignes.map((l) => [l.id, `${l.statut}|${l.dependanceRef ?? ''}`]));

describe('REQ-INT-011 — la dépendance manquante est conservée, puis rejouée à l’arrivée du parent', () => {
  it('REQ-INT-011 : le devis d’un client inconnu attend, puis passe `traite` quand le client arrive', async () => {
    const m = depotEnMemoire();
    m.arriver(DOSSIER[1]!);
    await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
    expect(m.lignes.map((l) => [l.statut, l.dependanceRef])).toEqual([
      ['en_attente_dependance', 'client:C1'],
    ]);
    m.arriver(DOSSIER[0]!);
    const c = await passerLeTravail({
      depot: m.depot,
      dispatch: sansEffet,
      maintenant: () => INSTANT,
    });
    expect(m.lignes.map((l) => l.statut)).toEqual(['traite', 'traite']);
    expect(c.reveilles).toBe(1);
  });

  it('REQ-INT-011 : le paiement d’une facture inconnue attend, et n’est JAMAIS rejeté', async () => {
    const m = depotEnMemoire();
    m.arriver(DOSSIER[4]!);
    for (let i = 0; i < 3; i++)
      await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
    expect(m.lignes.map((l) => [l.statut, l.dependanceRef])).toEqual([
      ['en_attente_dependance', 'facture:F9'],
    ]);
  });

  it('REQ-INT-011 : la dépendance se lit dans la charge, et un parent se désigne par son type', () => {
    expect(
      dependanceDe({ eventType: TypeEvenementRecu.devis_signe, charge: { clientId: 'C1' } })
    ).toEqual({
      ref: 'client:C1',
      parents: [TypeEvenementRecu.client_cree, TypeEvenementRecu.client_mis_a_jour],
    });
    expect(
      dependanceDe({ eventType: TypeEvenementRecu.paiement_recu, charge: { factureId: 'F1' } })
    ).toEqual({
      ref: 'facture:F1',
      parents: [TypeEvenementRecu.facture_emise],
    });
    expect(
      dependanceDe({ eventType: TypeEvenementRecu.client_cree, charge: { clientId: 'C1' } })
    ).toBeNull();
    expect(dependanceDe({ eventType: TypeEvenementRecu.paiement_recu, charge: {} })).toBe(
      'illisible'
    );
    expect(
      dependanceDe({ eventType: TypeEvenementRecu.devis_signe, charge: { clientId: 12 } })
    ).toBe('illisible');
    expect(dependanceDe({ eventType: TypeEvenementRecu.devis_signe, charge: null })).toBe(
      'illisible'
    );
  });

  it('REQ-INT-011 : une charge dont la dépendance est illisible passe `en_erreur`, nommée, jamais `traite`', async () => {
    const m = depotEnMemoire();
    m.arriver({
      id: 'x',
      eventType: TypeEvenementRecu.paiement_recu,
      sujetRef: 'paiement:X',
      charge: {},
    });
    const c = await passerLeTravail({
      depot: m.depot,
      dispatch: sansEffet,
      maintenant: () => INSTANT,
    });
    expect(m.lignes.map((l) => [l.statut, l.error, l.retryCount])).toEqual([
      ['en_erreur', 'dependance_illisible', 1],
    ]);
    expect(c.enErreur).toBe(1);
  });

  it('REQ-INT-011 : un parent d’un AUTRE type ne réveille rien — un avoir n’est pas une facture', async () => {
    const m = depotEnMemoire();
    m.arriver(DOSSIER[3]!);
    m.arriver({
      id: 'av',
      eventType: TypeEvenementRecu.avoir_emis,
      sujetRef: 'facture:F1',
      charge: {},
    });
    await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
    expect(m.lignes.find((l) => l.id === 'e4')!.statut).toBe('en_attente_dependance');
  });
});

describe('REQ-ARG-003 — le rejeu, dans l’ordre puis sous TOUTES les permutations d’un même dossier', () => {
  it('REQ-ARG-003 : les 120 ordres d’arrivée du dossier rendent le même ensemble de statuts et la même résolution', async () => {
    const reference = etatFinal((await livrer(DOSSIER)).lignes);
    expect(reference).toEqual({
      e1: 'traite|',
      e2: 'traite|',
      e3: 'traite|',
      e4: 'traite|',
      e5: 'en_attente_dependance|facture:F9',
    });
    const ordres = permutations(DOSSIER);
    expect(ordres).toHaveLength(120);
    for (const ordre of ordres) {
      expect(etatFinal((await livrer(ordre)).lignes), ordre.map((e) => e.id).join(',')).toEqual(
        reference
      );
    }
  });

  it('REQ-ARG-003 : tout livrer puis UN seul passage rend le même état que passer après chaque arrivée', async () => {
    for (const ordre of [DOSSIER, [...DOSSIER].reverse()]) {
      const m = depotEnMemoire();
      for (const e of ordre) m.arriver(e);
      await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
      expect(etatFinal(m.lignes)).toEqual(etatFinal((await livrer(DOSSIER)).lignes));
    }
  });

  it('REQ-ARG-003 : un événement déjà traité n’est jamais redonné au dispatch', async () => {
    const m = depotEnMemoire();
    const vus: string[] = [];
    const dispatch = async (e: EvenementATraiter) => {
      vus.push(e.id);
    };
    m.arriver(DOSSIER[0]!);
    await passerLeTravail({ depot: m.depot, dispatch, maintenant: () => INSTANT });
    await passerLeTravail({ depot: m.depot, dispatch, maintenant: () => INSTANT });
    expect(vus).toEqual(['e1']);
  });
});

describe('REQ-ARG-003 — un dispatch qui lève, et le battement de chaque passage', () => {
  it('REQ-ARG-003 : un dispatch qui lève laisse l’événement `en_erreur`, `processedAt` nul, `retryCount` 1, le nom de l’erreur et jamais son message', async () => {
    const m = depotEnMemoire();
    m.arriver(DOSSIER[0]!);
    class PanneMetier extends Error {
      override name = 'PanneMetier';
    }
    const c = await passerLeTravail({
      depot: m.depot,
      dispatch: async () => {
        throw new PanneMetier('secret du message à ne jamais écrire');
      },
      maintenant: () => INSTANT,
    });
    expect(m.lignes.map((l) => [l.statut, l.processedAt, l.retryCount, l.error])).toEqual([
      ['en_erreur', null, 1, 'PanneMetier'],
    ]);
    expect(c).toEqual({ traites: 0, enAttente: 0, enErreur: 1, reveilles: 0 });
  });

  it('REQ-ARG-003 : chaque passage écrit le battement de sa tâche, clé du registre des tâches', async () => {
    expect(Object.keys(TACHES)).toContain(TACHE_DE_RECEPTION);
    const m = depotEnMemoire();
    m.arriver(DOSSIER[0]!);
    await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
    await passerLeTravail({ depot: m.depot, dispatch: sansEffet, maintenant: () => INSTANT });
    expect(m.battements).toEqual([
      [
        TACHE_DE_RECEPTION,
        { succesAt: INSTANT, compteurs: { traites: 1, enAttente: 0, enErreur: 0, reveilles: 0 } },
      ],
      [
        TACHE_DE_RECEPTION,
        { succesAt: INSTANT, compteurs: { traites: 0, enAttente: 0, enErreur: 0, reveilles: 0 } },
      ],
    ]);
  });

  it('REQ-ARG-003 : un dépôt qui lève écrit un battement d’ÉCHEC, puis l’erreur remonte', async () => {
    const m = depotEnMemoire();
    const depot: DepotDuTravail = {
      ...m.depot,
      aTraiter: async () => {
        throw new Error('base_coupee');
      },
    };
    await expect(
      passerLeTravail({ depot, dispatch: sansEffet, maintenant: () => INSTANT })
    ).rejects.toThrow('base_coupee');
    expect(m.battements).toEqual([[TACHE_DE_RECEPTION, { echecAt: INSTANT }]]);
  });

  it('REQ-ARG-003 : les clés du registre des tâches ont la forme que la colonne `battements.tache` exige', () => {
    for (const cle of Object.keys(TACHES)) expect(cle).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
