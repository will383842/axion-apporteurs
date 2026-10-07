// @req REQ-ARG-004
// @req REQ-DM-017
/**
 * L'acquisition d'une commission au PAIEMENT INTÉGRAL — T-ARG-044 (contrat v2, art. 4.0, 4.2 et 4.3 ;
 * REQ-ARG-004, REQ-DM-017). Le prorata est retiré : aucune part n'est due au titre d'un paiement
 * partiel.
 *
 * LES INVARIANTS SONT PROUVÉS, PAS POSTULÉS, sur 500 tirages DÉTERMINISTES (graine fixe : un rouge se
 * rejoue), par un juge qui ne connaît que le résultat rendu :
 *   1. TOUT OU RIEN : le résultat n'est jamais un montant ni une part ;
 *   2. acquise SI ET SEULEMENT SI le cumul des encaissements atteint le prix NET des avoirs, au
 *      centime près : jamais avant le solde ;
 *   3. acquise au jour du crédit qui SOLDE, les crédits pris dans l'ordre de leur date ;
 *   4. MONOTONE : un encaissement de plus ne retire jamais l'acquisition ;
 *   5. l'ordre de réception ne change rien.
 *
 * TÉMOIN À DEUX FACES : une implémentation qui acquiert à 99 %, puis une qui ignore les avoirs, font
 * rougir le juge, qui NOMME l'invariant rompu ; l'implémentation du dépôt passe sur les MÊMES tirages.
 */
import { describe, expect, it } from 'vitest';
import {
  acquisitionAuPaiementIntegral,
  type Acquisition,
  type EncaissementRecu,
} from '../../../src/domain/commission/calcul';

type Scenario = {
  prixFactureCents: number;
  avoirsCents: number[];
  encaissements: EncaissementRecu[];
};
type Implementation = (s: Scenario) => Acquisition;

/** Générateur à graine fixe (Mulberry32) : un tirage rouge se rejoue à l'identique. */
function tirage(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAYEURS = ['client', 'opco', 'autre_financeur'] as const;
const r = tirage(0x7a44);
const entier = (max: number) => Math.floor(r() * max);
const unJour = () => ({ annee: 2027, mois: 1 + entier(12), jour: 1 + entier(28) });

function scenarios(n: number): Scenario[] {
  return Array.from({ length: n }, () => {
    const prixFactureCents = 1 + entier(5_000_000);
    const avoirsCents = Array.from({ length: entier(3) }, () => entier(prixFactureCents / 4));
    const net = prixFactureCents - avoirsCents.reduce((a, b) => a + b, 0);
    // Un tiers solde exactement, un tiers reste en deçà (un centime au moins), un tiers dépasse.
    const cible = [net, Math.max(0, net - 1 - entier(net)), net + entier(net)][entier(3)]!;
    const nb = 1 + entier(4);
    const montants: number[] = [];
    let reste = cible;
    for (let i = 0; i < nb - 1; i += 1) {
      const m = entier(reste + 1);
      montants.push(m);
      reste -= m;
    }
    montants.push(reste);
    return {
      prixFactureCents,
      avoirsCents,
      encaissements: montants.map((montantCents) => ({
        montantCents,
        payeur: PAYEURS[entier(3)]!,
        creditLe: unJour(),
      })),
    };
  });
}

const ordre = (d: EncaissementRecu['creditLe']) => d.annee * 10_000 + d.mois * 100 + d.jour;

/** Le juge : les invariants, nommés. Il ne lit QUE le résultat de l'implémentation. */
function violations(impl: Implementation, s: Scenario): string[] {
  const v: string[] = [];
  const res = impl(s);
  const net = BigInt(s.prixFactureCents) - s.avoirsCents.reduce((a, b) => a + BigInt(b), 0n);
  const total = s.encaissements.reduce((a, e) => a + BigInt(e.montantCents), 0n);
  if (Object.keys(res).some((k) => k !== 'acquise' && k !== 'le')) v.push('tout_ou_rien');
  if (res.acquise !== total >= net) v.push('si_et_seulement_si_solde');
  if (res.acquise) {
    // Le premier jour, dans l'ordre des dates, où le cumul atteint le prix net.
    let cumul = 0n;
    let attendu: number | null = null;
    for (const e of [...s.encaissements].sort((a, b) => ordre(a.creditLe) - ordre(b.creditLe))) {
      cumul += BigInt(e.montantCents);
      if (cumul >= net) {
        attendu = ordre(e.creditLe);
        break;
      }
    }
    if (ordre(res.le) !== attendu) v.push('au_jour_du_solde');
    // Monotone : un encaissement de plus, à n'importe quelle date, ne retire jamais l'acquisition.
    const plus = impl({
      ...s,
      encaissements: [
        ...s.encaissements,
        { montantCents: 1, payeur: 'client', creditLe: unJour() },
      ],
    });
    if (!plus.acquise) v.push('monotone');
  }
  const inverse = impl({ ...s, encaissements: [...s.encaissements].reverse() });
  if (JSON.stringify(inverse) !== JSON.stringify(res)) v.push('ordre_de_reception');
  return v;
}

const depot: Implementation = (s) =>
  acquisitionAuPaiementIntegral(
    { prixFactureCents: s.prixFactureCents, avoirsCents: s.avoirsCents },
    s.encaissements
  );

/** Faute 1 : acquise dès 99 % du prix net. */
const a99pourcent: Implementation = (s) => {
  const net = s.prixFactureCents - s.avoirsCents.reduce((a, b) => a + b, 0);
  const total = s.encaissements.reduce((a, e) => a + e.montantCents, 0);
  return total >= 0.99 * net && total < net
    ? { acquise: true, le: s.encaissements[0]!.creditLe }
    : depot(s);
};

/** Faute 2 : le solde jugé sur le prix FACTURÉ, avoirs ignorés. */
const sansAvoirs: Implementation = (s) => depot({ ...s, avoirsCents: [] });

const TIRAGES = scenarios(500);
const MARS = { annee: 2027, mois: 3, jour: 5 };

describe('REQ-ARG-004, REQ-DM-017 — l’acquisition au paiement intégral, invariants prouvés sur 500 tirages', () => {
  it('REQ-ARG-004, REQ-DM-017 : l’implémentation du dépôt tient les cinq invariants sur chaque tirage', () => {
    expect(TIRAGES).toHaveLength(500);
    const fautes = TIRAGES.flatMap((s, i) => violations(depot, s).map((v) => `${i}:${v}`));
    expect(fautes).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : une acquisition à 99 % est prise, invariant nommé', () => {
    const s: Scenario = {
      prixFactureCents: 100_000,
      avoirsCents: [],
      encaissements: [{ montantCents: 99_500, payeur: 'client', creditLe: MARS }],
    };
    expect(violations(a99pourcent, s)).toContain('si_et_seulement_si_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : un solde jugé sans les avoirs est pris, invariant nommé', () => {
    const s: Scenario = {
      prixFactureCents: 100_000,
      avoirsCents: [20_000],
      encaissements: [{ montantCents: 80_000, payeur: 'opco', creditLe: MARS }],
    };
    expect(violations(sansAvoirs, s)).toContain('si_et_seulement_si_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-DM-017 : les tirages couvrent les trois cas : soldé exactement, en deçà, au-delà', () => {
    const cas = new Set(
      TIRAGES.map((s) => {
        const net = s.prixFactureCents - s.avoirsCents.reduce((a, b) => a + b, 0);
        const total = s.encaissements.reduce((a, e) => a + e.montantCents, 0);
        return total === net ? 'exact' : total < net ? 'en_deca' : 'au_dela';
      })
    );
    expect([...cas].sort()).toEqual(['au_dela', 'en_deca', 'exact']);
  });
});

describe('REQ-DM-017 — une donnée fausse n’a pas de valeur par défaut', () => {
  it('REQ-DM-017 : TÉMOIN — un prix facturé négatif ou non entier lève, nommé', () => {
    for (const prixFactureCents of [-1, 10.5, Number.NaN]) {
      expect(() =>
        acquisitionAuPaiementIntegral({ prixFactureCents, avoirsCents: [] }, [])
      ).toThrow(/prix facturé/);
    }
  });

  it('REQ-DM-017 : un encaissement NUL n’acquiert rien et ne lève pas', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100, avoirsCents: [] }, [
        { montantCents: 0, payeur: 'client', creditLe: MARS },
      ])
    ).toEqual({ acquise: false });
  });
});
