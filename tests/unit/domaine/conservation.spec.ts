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
 *   3. acquise au PREMIER JOUR, crédits et avoirs confondus, où le cumul encaissé atteint le prix moins
 *      les avoirs ÉMIS ce jour-là (avoirs DATÉS : A15, #815 ; juriste, #815 6041629550) ;
 *   4. MONOTONE : un encaissement de plus ne retire jamais l'acquisition ;
 *   5. l'ordre de réception ne change rien.
 *
 * TÉMOIN À DEUX FACES : une implémentation qui acquiert à 99 %, une qui ignore les avoirs, une qui lit
 * les avoirs SANS LEUR DATE (rétroactivement, le défaut trouvé par A15), et une qui compare un cumul TTC
 * à un prix HT, font
 * rougir le juge, qui NOMME l'invariant rompu ; l'implémentation du dépôt passe sur les MÊMES tirages.
 */
import { describe, expect, it } from 'vitest';
import {
  acquisitionAuPaiementIntegral,
  type Acquisition,
  type AvoirEmis,
  type EncaissementRecu,
} from '../../../src/domain/commission/calcul';

type Scenario = {
  prixFactureTtcCents: number;
  avoirs: AvoirEmis[];
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
    const prixFactureTtcCents = 1 + entier(5_000_000);
    const avoirs = Array.from({ length: entier(3) }, () => ({
      montantTtcCents: entier(prixFactureTtcCents / 4),
      le: unJour(),
    }));
    const net = prixFactureTtcCents - sommeAvoirs(avoirs);
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
      prixFactureTtcCents,
      avoirs,
      encaissements: montants.map((montantTtcCents) => ({
        montantTtcCents,
        payeur: PAYEURS[entier(3)]!,
        creditLe: unJour(),
      })),
    };
  });
}

const ordre = (d: EncaissementRecu['creditLe']) => d.annee * 10_000 + d.mois * 100 + d.jour;
function sommeAvoirs(avoirs: readonly AvoirEmis[]): number {
  return avoirs.reduce((a, b) => a + b.montantTtcCents, 0);
}

/** Le juge : les invariants, nommés. Il ne lit QUE le résultat de l'implémentation. */
function violations(impl: Implementation, s: Scenario): string[] {
  const v: string[] = [];
  const res = impl(s);
  const net =
    BigInt(s.prixFactureTtcCents) - s.avoirs.reduce((a, b) => a + BigInt(b.montantTtcCents), 0n);
  const total = s.encaissements.reduce((a, e) => a + BigInt(e.montantTtcCents), 0n);
  if (Object.keys(res).some((k) => k !== 'acquise' && k !== 'le')) v.push('tout_ou_rien');
  if (res.acquise !== total >= net) v.push('si_et_seulement_si_solde');
  if (res.acquise) {
    // Le premier jour, crédits et avoirs confondus, où le cumul atteint le prix moins les avoirs
    // émis à cette date : l'état est jugé à la FIN de chaque jour où il change.
    const jours = [
      ...new Set([
        ...s.encaissements.map((e) => ordre(e.creditLe)),
        ...s.avoirs.map((a) => ordre(a.le)),
      ]),
    ].sort((a, b) => a - b);
    const attendu =
      jours.find((j) => {
        const cumul = s.encaissements
          .filter((e) => ordre(e.creditLe) <= j)
          .reduce((a, e) => a + BigInt(e.montantTtcCents), 0n);
        const avoirs = s.avoirs
          .filter((a) => ordre(a.le) <= j)
          .reduce((a, b) => a + BigInt(b.montantTtcCents), 0n);
        return cumul >= BigInt(s.prixFactureTtcCents) - avoirs;
      }) ?? null;
    if (ordre(res.le) !== attendu) v.push('au_jour_du_solde');
    // Monotone : un encaissement de plus, à n'importe quelle date, ne retire jamais l'acquisition.
    const plus = impl({
      ...s,
      encaissements: [
        ...s.encaissements,
        { montantTtcCents: 1, payeur: 'client', creditLe: unJour() },
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
    { prixFactureTtcCents: s.prixFactureTtcCents, avoirs: s.avoirs },
    s.encaissements
  );

/** Faute 1 : acquise dès 99 % du prix net. */
const a99pourcent: Implementation = (s) => {
  const net = s.prixFactureTtcCents - sommeAvoirs(s.avoirs);
  const total = s.encaissements.reduce((a, e) => a + e.montantTtcCents, 0);
  return total >= 0.99 * net && total < net
    ? { acquise: true, le: s.encaissements[0]!.creditLe }
    : depot(s);
};

/** Faute 2 : le solde jugé sur le prix FACTURÉ, avoirs ignorés. */
const sansAvoirs: Implementation = (s) => depot({ ...s, avoirs: [] });

/** Faute 3 (A15, #815) : les avoirs lus SANS leur date, comme s'ils précédaient tout crédit. */
const avoirsNonDates: Implementation = (s) =>
  depot({ ...s, avoirs: s.avoirs.map((a) => ({ ...a, le: { annee: 2000, mois: 1, jour: 1 } })) });

/**
 * Faute 4 (A15, #815) : le solde jugé sur un prix HORS TAXES, alors que le cumul encaissé est TTC — la
 * seule projection de prix en base est HT (`DevisConnu.factureHtCents`). Une TVA de 20 % : HT = 5/6 du TTC.
 */
const HT_SUR_TTC = 5 / 6;
const htContreTtc: Implementation = (s) =>
  depot({ ...s, prixFactureTtcCents: Math.floor(s.prixFactureTtcCents * HT_SUR_TTC) });

const TIRAGES = scenarios(500);
const MARS = { annee: 2027, mois: 3, jour: 5 };
const PRIX = 100_000;
const AVOIR = PRIX / 5;

describe('REQ-ARG-004, REQ-DM-017 — l’acquisition au paiement intégral, invariants prouvés sur 500 tirages', () => {
  it('REQ-ARG-004, REQ-DM-017 : l’implémentation du dépôt tient les cinq invariants sur chaque tirage', () => {
    expect(TIRAGES).toHaveLength(500);
    const fautes = TIRAGES.flatMap((s, i) => violations(depot, s).map((v) => `${i}:${v}`));
    expect(fautes).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : une acquisition à 99 % est prise, invariant nommé', () => {
    const s: Scenario = {
      prixFactureTtcCents: PRIX,
      avoirs: [],
      encaissements: [{ montantTtcCents: PRIX - PRIX / 200, payeur: 'client', creditLe: MARS }],
    };
    expect(violations(a99pourcent, s)).toContain('si_et_seulement_si_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : un solde jugé sans les avoirs est pris, invariant nommé', () => {
    const s: Scenario = {
      prixFactureTtcCents: PRIX,
      avoirs: [{ montantTtcCents: AVOIR, le: MARS }],
      encaissements: [{ montantTtcCents: PRIX - AVOIR, payeur: 'opco', creditLe: MARS }],
    };
    expect(violations(sansAvoirs, s)).toContain('si_et_seulement_si_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : des avoirs lus sans leur date sont pris (A15, S10), invariant nommé', () => {
    // Prix ; 90 % crédités le 1er février ; l'avoir des 10 % restants, le 20 : soldée le 20, jamais le 1er.
    const s: Scenario = {
      prixFactureTtcCents: PRIX,
      avoirs: [{ montantTtcCents: PRIX / 10, le: { annee: 2027, mois: 2, jour: 20 } }],
      encaissements: [
        {
          montantTtcCents: PRIX - PRIX / 10,
          payeur: 'client',
          creditLe: { annee: 2027, mois: 2, jour: 1 },
        },
      ],
    };
    expect(violations(avoirsNonDates, s)).toContain('au_jour_du_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-ARG-004 — TÉMOIN : un cumul TTC comparé à un prix HT est pris (A15), invariant nommé', () => {
    // Le prix TTC ; encaissé : son seul montant HT. Rien n'est acquis : le solde se juge en TTC.
    const s: Scenario = {
      prixFactureTtcCents: PRIX,
      avoirs: [],
      encaissements: [
        { montantTtcCents: Math.floor(PRIX * HT_SUR_TTC), payeur: 'client', creditLe: MARS },
      ],
    };
    expect(violations(htContreTtc, s)).toContain('si_et_seulement_si_solde');
    expect(violations(depot, s)).toEqual([]);
  });

  it('REQ-DM-017 : les tirages couvrent les trois cas : soldé exactement, en deçà, au-delà', () => {
    const cas = new Set(
      TIRAGES.map((s) => {
        const net = s.prixFactureTtcCents - sommeAvoirs(s.avoirs);
        const total = s.encaissements.reduce((a, e) => a + e.montantTtcCents, 0);
        return total === net ? 'exact' : total < net ? 'en_deca' : 'au_dela';
      })
    );
    expect([...cas].sort()).toEqual(['au_dela', 'en_deca', 'exact']);
  });
});

describe('REQ-DM-017 — une donnée fausse n’a pas de valeur par défaut', () => {
  it('REQ-DM-017 : TÉMOIN — un prix facturé négatif ou non entier lève, nommé', () => {
    for (const prixFactureTtcCents of [-1, 10.5, Number.NaN]) {
      expect(() => acquisitionAuPaiementIntegral({ prixFactureTtcCents, avoirs: [] }, [])).toThrow(
        /prix facturé/
      );
    }
  });

  it('REQ-DM-017 : un encaissement NUL n’acquiert rien et ne lève pas', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100, avoirs: [] }, [
        { montantTtcCents: 0, payeur: 'client', creditLe: MARS },
      ])
    ).toEqual({ acquise: false });
  });
});
