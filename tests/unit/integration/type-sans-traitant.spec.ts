// @req REQ-DM-036
// @req REQ-ARG-003
/**
 * INT-T43 — un événement dont le type n'a pas encore de traitant n'est JAMAIS marqué `traite`.
 *
 * Avant : le port métier de la route rendait la main sans rien faire pour tout type autre que
 * la candidature, et le travail de fond marquait l'événement `traite`. Un `paiement.recu` reçu avant
 * le branchement de son traitant (DM-15) était donc perdu pour le calcul des commissions : un
 * événement `traite` n'est jamais redonné au dispatch.
 *
 * Arbitrage d'A01 à la revendication (issue #331) : l'événement passe `en_attente_dependance`
 * avec la référence `traitant:<type>` ; en tête de passage, la reprise ne remet en `recu` que les
 * attentes dont le type a désormais un traitant. Aucune migration.
 *
 * Sur un dépôt en mémoire qui tient les règles de la table ; la même chose en base réelle vit
 * dans `tests/integration/worker-type-sans-traitant.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import {
  aiguiller,
  passerLeTravail,
  refsDesTraitants,
  type DepotDuTravail,
  type EvenementATraiter,
  type Marque,
  type Traitants,
} from '../../../src/server/queue/workers/evenement-recu';

type Ligne = EvenementATraiter & { statut: string; dependanceRef: string | null };

function depotEnMemoire(lignes: Ligne[]): DepotDuTravail {
  return {
    async aTraiter() {
      return lignes
        .filter((l) => l.statut === 'recu')
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
    },
    async reveiller(ref) {
      const enfants = lignes.filter(
        (l) => l.statut === 'en_attente_dependance' && l.dependanceRef === ref
      );
      for (const e of enfants) Object.assign(e, { statut: 'recu', dependanceRef: null });
      return enfants.length;
    },
    async battre() {},
  };
}

/** La reprise en tête de passage, sur les SEULES références que rend `refsDesTraitants`. */
function reprise(lignes: Ligne[], traitants: Traitants) {
  return async () => {
    const refs = refsDesTraitants(traitants);
    const reprises = lignes.filter(
      (l) => l.statut === 'en_attente_dependance' && refs.includes(l.dependanceRef ?? '')
    );
    for (const l of reprises) Object.assign(l, { statut: 'recu', dependanceRef: null });
    return reprises.length;
  };
}

const ligne = (
  id: string,
  eventType: TypeEvenementRecu,
  sujetRef: string,
  charge: Record<string, string>
): Ligne => ({
  id,
  eventType,
  sujetRef,
  charge,
  retryCount: 0,
  statut: 'recu',
  dependanceRef: null,
});

const INSTANT = new Date('2026-10-01T10:00:00.000Z');
const sansEffet = async () => undefined;

describe('INT-T43 — un type sans traitant reste en attente, jamais `traite`', () => {
  it('un `paiement.recu` sans traitant attend `traitant:paiement_recu` ; sa facture, traitée, passe', async () => {
    const lignes = [
      ligne('f', TypeEvenementRecu.facture_emise, 'facture:F1', { factureId: 'F1' }),
      ligne('p', TypeEvenementRecu.paiement_recu, 'paiement:P1', { factureId: 'F1' }),
    ];
    const traitants: Traitants = { [TypeEvenementRecu.facture_emise]: sansEffet };
    const c = await passerLeTravail({
      depot: depotEnMemoire(lignes),
      dispatch: aiguiller(traitants),
      reprendre: reprise(lignes, traitants),
      maintenant: () => INSTANT,
    });
    expect(lignes.map((l) => [l.id, l.statut, l.dependanceRef])).toEqual([
      ['f', 'traite', null],
      ['p', 'en_attente_dependance', 'traitant:paiement_recu'],
    ]);
    expect([c.traites, c.enAttente]).toEqual([1, 1]);
  });

  it('branché ensuite, le traitant reçoit le paiement une fois et une seule', async () => {
    const lignes = [
      ligne('f', TypeEvenementRecu.facture_emise, 'facture:F1', { factureId: 'F1' }),
      ligne('p', TypeEvenementRecu.paiement_recu, 'paiement:P1', { factureId: 'F1' }),
    ];
    const effets: string[] = [];
    const avant: Traitants = { [TypeEvenementRecu.facture_emise]: sansEffet };
    const apres: Traitants = {
      ...avant,
      [TypeEvenementRecu.paiement_recu]: async (e) => {
        effets.push(e.id);
      },
    };
    const passer = (t: Traitants) =>
      passerLeTravail({
        depot: depotEnMemoire(lignes),
        dispatch: aiguiller(t),
        reprendre: reprise(lignes, t),
        maintenant: () => INSTANT,
      });

    await passer(avant);
    await passer(avant);
    expect(effets).toEqual([]);

    await passer(apres);
    await passer(apres);
    expect(effets).toEqual(['p']);
    expect(lignes.find((l) => l.id === 'p')).toMatchObject({
      statut: 'traite',
      dependanceRef: null,
    });
  });

  it("la reprise ne vise que les types qui ont un traitant : l'attente d'un autre type ne bouge pas", async () => {
    const lignes = [
      ligne('a', TypeEvenementRecu.avoir_emis, 'avoir:A1', { factureId: 'F9' }),
      ligne('c', TypeEvenementRecu.client_cree, 'client:C1', { clientId: 'C1' }),
    ];
    const t: Traitants = {};
    await passerLeTravail({
      depot: depotEnMemoire(lignes),
      dispatch: aiguiller(t),
      reprendre: reprise(lignes, t),
      maintenant: () => INSTANT,
    });
    const avecClient: Traitants = { [TypeEvenementRecu.client_cree]: sansEffet };
    expect(refsDesTraitants(avecClient)).toEqual(['traitant:client_cree']);
    await passerLeTravail({
      depot: depotEnMemoire(lignes),
      dispatch: aiguiller(avecClient),
      reprendre: reprise(lignes, avecClient),
      maintenant: () => INSTANT,
    });
    expect(lignes.map((l) => [l.id, l.statut, l.dependanceRef])).toEqual([
      ['a', 'en_attente_dependance', 'traitant:avoir_emis'],
      ['c', 'traite', null],
    ]);
  });

  it('aucun type du contrat sans traitant ne passe `traite`, et le passage se termine', async () => {
    const lignes = Object.values(TypeEvenementRecu).map((t, i) =>
      ligne(`e${i}`, t, `sujet:${i}`, { clientId: 'x', factureId: 'y' })
    );
    await passerLeTravail({
      depot: depotEnMemoire(lignes),
      dispatch: aiguiller({}),
      maintenant: () => INSTANT,
    });
    expect(lignes.filter((l) => l.statut === 'traite')).toEqual([]);
  });
});
