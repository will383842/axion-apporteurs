// @req REQ-ARG-004
// @req REQ-DM-017
/**
 * Le prorata entier d'une commission sur les encaissements — DM-04 (REQ-ARG-004, REQ-DM-017).
 *
 * part acquise au i-ème encaissement = ⌊ commission × cumul encaissé TTC / TTC net de la facture ⌋
 *                                      − Σ des parts déjà acquises
 *
 * LES INVARIANTS SONT PROUVÉS, PAS POSTULÉS : à facture soldée la somme des parts vaut la commission
 * au centime ; aucune part n'est négative ; aucune ne dépasse la commission ; l'ordre des
 * encaissements ne change pas l'état final. Ils sont jugés sur des tirages DÉTERMINISTES (graine
 * fixe : un rouge se rejoue), par un juge qui ne connaît que les parts rendues.
 *
 * TÉMOIN À DEUX FACES (acceptation 7) : une implémentation qui arrondit en flottant chaque part, puis
 * une qui divise un cumul TTC par un montant HT, font rougir le juge, qui NOMME l'invariant rompu et
 * l'écart en centimes ; l'implémentation du dépôt passe sur les MÊMES tirages.
 */
import { describe, expect, it } from 'vitest';
import { partsDuProrata } from '../../../src/domain/commission/calcul';

type Scenario = {
  aRepartirCents: number;
  factureTtcNetCents: number;
  factureHtCents: number;
  encaissementsTtcCents: number[];
};
type Prorata = (s: Scenario) => number[];
type Violation = { invariant: string; ecartCents: number };

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

/** Des factures soldées en 1 à 6 encaissements, TVA de 20 % (HT = TTC / 1,2, arrondi). */
function scenarios(n: number): Scenario[] {
  const alea = tirage(20260929);
  const entier = (max: number) => 1 + Math.floor(alea() * max);
  return Array.from({ length: n }, () => {
    const factureTtcNetCents = entier(5_000_000);
    const nb = Math.min(entier(6), factureTtcNetCents);
    const coupures = new Set<number>();
    while (coupures.size < nb - 1) coupures.add(entier(factureTtcNetCents - 1));
    const bornes = [0, ...[...coupures].sort((x, y) => x - y), factureTtcNetCents];
    return {
      aRepartirCents: entier(1_000_000),
      factureTtcNetCents,
      factureHtCents: Math.round((factureTtcNetCents * 5) / 6),
      encaissementsTtcCents: bornes.slice(1).map((b, i) => b - bornes[i]!),
    };
  });
}

/** Le juge : il ne voit que les parts rendues, jamais l'implémentation. */
function violations(prorata: Prorata, s: Scenario): Violation[] {
  const v: Violation[] = [];
  const parts = prorata(s);
  const somme = parts.reduce((x, y) => x + y, 0);
  if (somme !== s.aRepartirCents)
    v.push({
      invariant: 'somme_des_parts_egale_la_commission',
      ecartCents: somme - s.aRepartirCents,
    });
  for (const p of parts) {
    if (p < 0) v.push({ invariant: 'aucune_part_negative', ecartCents: p });
    if (p > s.aRepartirCents)
      v.push({
        invariant: 'aucune_part_au_dela_de_la_commission',
        ecartCents: p - s.aRepartirCents,
      });
    if (!Number.isSafeInteger(p))
      v.push({ invariant: 'parts_entieres', ecartCents: p - Math.trunc(p) });
  }
  const renverse = prorata({ ...s, encaissementsTtcCents: [...s.encaissementsTtcCents].reverse() });
  const sommeRenversee = renverse.reduce((x, y) => x + y, 0);
  if (sommeRenversee !== somme)
    v.push({
      invariant: 'ordre_des_encaissements_indifferent',
      ecartCents: sommeRenversee - somme,
    });
  return v;
}

const depot: Prorata = (s) =>
  partsDuProrata(s.aRepartirCents, s.factureTtcNetCents, s.encaissementsTtcCents);

/** Défaut 1 : chaque part arrondie en flottant, sans cumul — la somme dérive. */
const flottant: Prorata = (s) =>
  s.encaissementsTtcCents.map((e) => Math.round((s.aRepartirCents * e) / s.factureTtcNetCents));

/** Défaut 2 : le cumul TTC divisé par le HT — deux natures différentes, la commission gonfle. */
const denominateurHt: Prorata = (s) => {
  let cumul = 0;
  let deja = 0;
  return s.encaissementsTtcCents.map((e) => {
    cumul += e;
    const part = Math.floor((s.aRepartirCents * cumul) / s.factureHtCents) - deja;
    deja += part;
    return part;
  });
};

const TIRAGES = scenarios(500);

describe('REQ-ARG-004, REQ-DM-017 — le prorata entier, invariants prouvés sur 500 tirages', () => {
  it('REQ-ARG-004, REQ-DM-017 : l’implémentation du dépôt tient les quatre invariants sur chaque tirage', () => {
    const rompus = TIRAGES.flatMap((s, i) =>
      violations(depot, s).map((x) => ({ tirage: i, ...x }))
    );
    expect(rompus).toEqual([]);
  });

  it('REQ-ARG-004, REQ-DM-017 — TÉMOIN : un arrondi en flottant est pris, invariant et écart nommés', () => {
    const rompus = TIRAGES.flatMap((s) => violations(flottant, s));
    expect(rompus.length).toBeGreaterThan(0);
    expect(rompus[0]).toMatchObject({ invariant: 'somme_des_parts_egale_la_commission' });
    expect(rompus[0]!.ecartCents).not.toBe(0);
  });

  it('REQ-ARG-004, REQ-DM-017 — TÉMOIN : un dénominateur HT sous un numérateur TTC est pris, invariant et écart nommés', () => {
    const rompus = TIRAGES.flatMap((s) => violations(denominateurHt, s));
    const noms = new Set(rompus.map((r) => r.invariant));
    expect(noms.has('somme_des_parts_egale_la_commission')).toBe(true);
    expect(
      rompus.find((r) => r.invariant === 'somme_des_parts_egale_la_commission')!.ecartCents
    ).toBeGreaterThan(0);
  });

  it('REQ-DM-017 : le cas frontière de l’exigence — 14 400 TTC, 12 000 HT, trois encaissements de 4 800', () => {
    const s: Scenario = {
      aRepartirCents: 120_000,
      factureTtcNetCents: 1_440_000,
      factureHtCents: 1_200_000,
      encaissementsTtcCents: [480_000, 480_000, 480_000],
    };
    expect(depot(s)).toEqual([40_000, 40_000, 40_000]);
    expect(violations(denominateurHt, s)[0]).toMatchObject({
      invariant: 'somme_des_parts_egale_la_commission',
    });
  });

  it('REQ-ARG-004 : une facture non soldée n’a pas encore acquis toute la commission, et jamais plus', () => {
    const s = TIRAGES.find((x) => x.encaissementsTtcCents.length > 1)!;
    const partiel = partsDuProrata(
      s.aRepartirCents,
      s.factureTtcNetCents,
      s.encaissementsTtcCents.slice(0, -1)
    );
    const somme = partiel.reduce((x, y) => x + y, 0);
    expect(somme).toBeLessThanOrEqual(s.aRepartirCents);
    expect(partiel.every((p) => p >= 0)).toBe(true);
  });

  it('REQ-ARG-004 : un encaissement au-delà du TTC net n’acquiert rien de plus que la commission', () => {
    expect(partsDuProrata(100, 1_000, [600, 600])).toEqual([60, 40]);
  });
});
