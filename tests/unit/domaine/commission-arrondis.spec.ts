// @req REQ-DM-015
/**
 * DM-46 — les arrondis de la commission, sur des attendus calculés À LA MAIN (écart de la
 * vérification de bout en bout : l'oracle d'arrondi ÉTAIT la formule, et la permutation se jouait
 * sur des factures soldées, où l'ordre ne peut rien changer).
 *
 * AUCUN MONTANT RÉEL. La grille est SYNTHÉTIQUE, écrite ici pour ce seul témoin : deux taux
 * ronds, aucune valeur d'une grille publiée. Chaque attendu porte, au-dessus de lui, le calcul fait
 * à la main — jamais par le code qu'il juge.
 *
 * CE QU'IL PROUVE :
 *   1. l'arrondi au DEMI-CENTIME SUPÉRIEUR, sur trois cas qui le distinguent de toute autre règle :
 *      un reste sous la moitié (vers le bas), une moitié EXACTE (vers le haut), un reste au-dessus de
 *      la moitié (vers le haut) — un arrondi bancaire, une troncature ou un plafond en rougiraient ;
 *   (le prorata et sa permutation sont RETIRÉS par T-ARG-044, contrat v2 art. 4.2 et 4.3 : la commission
 *   s'acquiert au paiement intégral ; leurs témoins sont dans acquisition-au-paiement-integral.spec.ts).
 */
import { describe, it, expect } from 'vitest';
import { calculerCommission, type EntreeCalcul } from '../../../src/domain/commission/calcul';
import { BPS_MAX, type ContenuGrille } from '../../../src/domain/commission/grille';

/** Une grille SYNTHÉTIQUE : deux taux ronds, aucune valeur réelle. */
const GRILLE_SYNTHETIQUE: ContenuGrille = {
  schema: 1,
  unites: { montant: 'centimes_ht', taux: 'points_de_base' },
  grilleVersionEvenement: '000000000000',
  commissions: [
    {
      commissionId: 'temoin-12-5',
      libelleFr: 'Taux témoin, un huitième',
      kind: 'percent',
      montantCents: null,
      // un huitième de 10 000 bps = 1 250 bps — synthétique, aucune valeur d'une grille publiée
      tauxBps: BPS_MAX / 8,
    },
    {
      commissionId: 'temoin-15',
      libelleFr: 'Taux témoin, trois vingtièmes',
      kind: 'percent',
      montantCents: null,
      // trois vingtièmes de 10 000 bps = 1 500 bps — synthétique
      tauxBps: (BPS_MAX * 3) / 20,
    },
  ],
  paliers: [
    {
      tierId: 'temoin',
      categorie: 'temoin',
      commissionId: 'temoin-12-5',
      statut: 'taux',
      baremeIndefini: null,
    },
  ],
};

const entree = (commissionId: string, montantHtCents: number): EntreeCalcul => ({
  grille: GRILLE_SYNTHETIQUE,
  commissionId,
  activite: null,
  jours: null,
  montantHtCents,
});

describe('REQ-DM-015 — l’arrondi au demi-centime supérieur, sur trois attendus calculés à la main', () => {
  it('REQ-DM-015 : un reste SOUS la moitié s’arrondit vers le bas', () => {
    // 12 345 c × 1 250 bps / 10 000 = 15 431 250 / 10 000 = 1 543,125 c → 1 543 c
    expect(calculerCommission(entree('temoin-12-5', 12_345))).toEqual({
      statut: 'calculee',
      commissionId: 'temoin-12-5',
      montantCents: 1_543,
    });
  });

  it('REQ-DM-015 : une moitié EXACTE s’arrondit vers le haut — ni arrondi bancaire, ni troncature', () => {
    // 12 348 c × 1 250 bps / 10 000 = 15 435 000 / 10 000 = 1 543,5 c → 1 544 c
    // (un arrondi bancaire rendrait 1 544 aussi, l'entier pair : le cas suivant le départage)
    expect(calculerCommission(entree('temoin-12-5', 12_348))).toMatchObject({
      montantCents: 1_544,
    });
    // 12 340 c × 1 250 bps / 10 000 = 15 425 000 / 10 000 = 1 542,5 c → 1 543 c
    // (l'arrondi bancaire rendrait 1 542, l'entier pair : seul le demi supérieur rend 1 543)
    expect(calculerCommission(entree('temoin-12-5', 12_340))).toMatchObject({
      montantCents: 1_543,
    });
  });

  it('REQ-DM-015 : un reste AU-DESSUS de la moitié s’arrondit vers le haut — une troncature rendrait 499', () => {
    // 3 333 c × 1 500 bps / 10 000 = 4 999 500 / 10 000 = 499,95 c → 500 c
    const attendu = 500;
    expect(calculerCommission(entree('temoin-15', 3_333))).toMatchObject({ montantCents: attendu });
  });
});
