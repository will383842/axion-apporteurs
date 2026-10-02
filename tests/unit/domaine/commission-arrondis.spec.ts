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
 *   2. le prorata, par le plancher cumulatif, sur une facture SOLDÉE (le dernier absorbe le reste) ;
 *   3. la PERMUTATION sur une facture NON SOLDÉE : les parts changent avec l'ordre, leur total, non.
 */
import { describe, it, expect } from 'vitest';
import {
  calculerCommission,
  partsDuProrata,
  prorataDesEncaissements,
  type EntreeCalcul,
} from '../../../src/domain/commission/calcul';
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

describe('REQ-DM-015 — le prorata, sur des attendus calculés à la main', () => {
  it('REQ-DM-015 : facture SOLDÉE en trois tiers — le plancher cumulatif, et le dernier absorbe le reste', () => {
    // commission 1 000 c, TTC net 3 000 c, encaissements 1 000 + 1 000 + 1 000 :
    //   ⌊1 000 × 1 000 / 3 000⌋ = ⌊333,33…⌋ = 333            → part 1 = 333
    //   ⌊1 000 × 2 000 / 3 000⌋ = ⌊666,66…⌋ = 666 − 333      → part 2 = 333
    //   ⌊1 000 × 3 000 / 3 000⌋ = 1 000 − 666                → part 3 = 334
    expect(partsDuProrata(1_000, 3_000, [1_000, 1_000, 1_000])).toEqual([333, 333, 334]);
  });

  it('REQ-DM-015 : PERMUTATION sur une facture NON soldée — les parts suivent l’ordre, leur total ne bouge pas', () => {
    // commission 777 c, TTC net 10 000 c, encaissés 1 234 c et 2 345 c (cumul 3 579 c < 10 000 c) :
    //   ordre A : ⌊777 × 1 234 / 10 000⌋ = ⌊95,8818⌋  = 95  ; ⌊777 × 3 579 / 10 000⌋ = ⌊278,0883⌋ = 278 − 95  = 183
    //   ordre B : ⌊777 × 2 345 / 10 000⌋ = ⌊182,2065⌋ = 182 ; 278 − 182 = 96
    //   total, dans les deux ordres : 278 c — ce que la facture a acquis à ce stade, pas 777 c
    const a = partsDuProrata(777, 10_000, [1_234, 2_345]);
    const b = partsDuProrata(777, 10_000, [2_345, 1_234]);
    expect(a).toEqual([95, 183]);
    expect(b).toEqual([182, 96]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(278);
    expect(b.reduce((x, y) => x + y, 0)).toBe(278);
  });
});

// ── La règle d'un encaissement nul, négatif ou non entier (décision A02 du 2026-10-02) ───────────

describe('REQ-DM-015 — un encaissement nul est écarté et rapporté ; négatif ou non entier, il lève', () => {
  it('REQ-DM-015 : un NUL n’acquiert rien, ne change ni le cumul ni les autres parts, et il est RAPPORTÉ', () => {
    // Sans le nul : ⌊1 000 × 1 000 / 3 000⌋ = 333 ; ⌊1 000 × 2 000 / 3 000⌋ = 666 − 333 = 333
    expect(prorataDesEncaissements(1_000, 3_000, [1_000, 0, 1_000])).toEqual({
      parts: [333, 0, 333],
      ecartes: [{ indice: 1, motif: 'encaissement_nul' }],
    });
    expect(partsDuProrata(1_000, 3_000, [1_000, 0, 1_000])).toEqual([333, 0, 333]);
    expect(prorataDesEncaissements(1_000, 3_000, [1_000, 1_000])).toEqual({
      parts: [333, 333],
      ecartes: [],
    });
  });

  it.each([
    ['NÉGATIF', -500],
    ['NON ENTIER', 500.5],
    ['non fini', Number.NaN],
  ])(
    'REQ-DM-015 : un encaissement %s LÈVE en nommant son indice — un remboursement passe par sa reprise, jamais par un encaissement',
    (_quoi, valeur) => {
      expect(() => prorataDesEncaissements(1_000, 3_000, [1_000, valeur])).toThrow(
        new RangeError("prorata : l'encaissement 1 doit être un entier de centimes ≥ 0")
      );
      expect(() => partsDuProrata(1_000, 3_000, [1_000, valeur])).toThrow(RangeError);
    }
  );

  it('REQ-DM-015 : INCHANGÉ — une commission négative ou non entière, un TTC net nul, lèvent', () => {
    expect(() => prorataDesEncaissements(-1, 3_000, [1_000])).toThrow(RangeError);
    expect(() => prorataDesEncaissements(1.5, 3_000, [1_000])).toThrow(RangeError);
    expect(() => prorataDesEncaissements(1_000, 0, [1_000])).toThrow(RangeError);
  });

  it('REQ-DM-015 : sur une série mêlant nuls et encaissements, toute part est entière et ≥ 0, le cumul ne décroît jamais, et la facture soldée rend EXACTEMENT la commission', () => {
    // commission 1 001 c, TTC net 7 000 c, encaissés 0 + 2 500 + 0 + 4 499 + 1 (= 7 000 c, soldée) :
    //   ⌊1 001 × 2 500 / 7 000⌋ = ⌊357,5⌋ = 357
    //   ⌊1 001 × 6 999 / 7 000⌋ = ⌊1 000,857…⌋ = 1 000 − 357 = 643
    //   ⌊1 001 × 7 000 / 7 000⌋ = 1 001 − 1 000 = 1
    const { parts, ecartes } = prorataDesEncaissements(1_001, 7_000, [0, 2_500, 0, 4_499, 1]);
    expect(parts).toEqual([0, 357, 0, 643, 1]);
    expect(ecartes.map((e) => e.indice)).toEqual([0, 2]);
    expect(parts.every((p) => Number.isSafeInteger(p) && p >= 0)).toBe(true);
    let cumul = 0;
    for (const p of parts) {
      const avant = cumul;
      cumul += p;
      expect(cumul).toBeGreaterThanOrEqual(avant);
    }
    expect(cumul).toBe(1_001);
  });
});
