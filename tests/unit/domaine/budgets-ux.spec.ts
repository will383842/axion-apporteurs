// @req REQ-UX-047
/**
 * QA-T58 — `BUDGETS_UX`, une seule source pour les budgets d'expérience (REQ-UX-047, RM-10).
 *
 * Sorti de la garde des écrans par l'audit indépendant du plan de la Phase 1 (2026-10-01) : les
 * budgets vivent dans `src/domain/seuils/ssot.ts`, ce qui découple l'espace des maquettes de console.
 *
 * CE QUE CE FICHIER GARDE.
 *   1. Chaque budget que REQ-UX-047 chiffre est dans la SSOT, à la valeur que le texte de l'exigence
 *      écrit : la valeur attendue se LIT dans `docs/requirements.json`, jamais retapée ici (RM-01).
 *   2. Le profil réseau « 4G ralentie » porte ses trois mesures (débit descendant, débit montant,
 *      latence), chacune sourcée et datée.
 *   3. Chaque budget a une source et une date ISO réelle.
 *   4. TÉMOIN : un budget absent de la SSOT est refusé, et le refus le nomme.
 *   5. Aucune valeur propre au conseiller (question 22 de W19) : ses budgets sont ceux du CRM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUDGETS_UX, budgetUx } from '../../../src/domain/seuils/ssot';

function texteDe(id: string): string {
  const brut = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as unknown;
  const liste = (
    Array.isArray(brut) ? brut : Object.values(brut as object).find(Array.isArray)
  ) as {
    id: string;
    texte: string;
  }[];
  return liste.find((x) => x.id === id)!.texte;
}

/** Les budgets que REQ-UX-047 écrit en toutes lettres, lus dans son texte. */
function budgetsDeLExigence(): Record<string, number> {
  const t = texteDe('REQ-UX-047');
  const lire = (motif: RegExp, nom: string): number => {
    const m = motif.exec(t);
    if (!m)
      throw new Error(`REQ-UX-047 ne dit plus « ${nom} » : la lecture du registre est à revoir`);
    return Number(m[1]);
  };
  return {
    CONSULTATION_INTERACTIONS_MAX: lire(/consultation ≤ (\d+) interactions/, 'consultation'),
    SAISIE_INTERACTIONS_MAX: lire(/saisie ≤ (\d+)/, 'saisie'),
    PREMIERE_ACTION_TABULATIONS_MAX: lire(/en ≤ (\d+) tabulations/, 'tabulations'),
    PREMIERE_ACTION_CLIQUABLE_SECONDES_MAX: lire(/cliquable en ≤ (\d+) s/, 'cliquable'),
    PREMIER_USAGE_PREMIERE_ACTION_SECONDES_MAX: lire(
      /temps de première action \(≤ (\d+) s\)/,
      'premier usage'
    ),
  };
}

describe('REQ-UX-047 — BUDGETS_UX, une seule source', () => {
  it('REQ-UX-047 — chaque budget chiffré par l’exigence est dans la SSOT, à sa valeur', () => {
    const attendus = budgetsDeLExigence();
    expect(Object.keys(attendus)).toHaveLength(5);
    for (const [nom, valeur] of Object.entries(attendus))
      expect(budgetUx(nom).valeur, nom).toBe(valeur);
  });

  it('REQ-UX-047 — le profil « 4G ralentie » porte débit descendant, débit montant et latence', () => {
    const reseau = [
      BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_DESCENDANT_KBPS,
      BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_MONTANT_KBPS,
      BUDGETS_UX.RESEAU_4G_RALENTIE_LATENCE_MS,
    ];
    for (const b of reseau) {
      expect(b.valeur).toBeGreaterThan(0);
      expect(b.source).toMatch(/lighthouse/i);
    }
    expect(BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_DESCENDANT_KBPS.valeur).toBeGreaterThan(
      BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_MONTANT_KBPS.valeur
    );
  });

  it('REQ-UX-047 — chaque budget a une source et une date ISO qui existe', () => {
    for (const [nom, b] of Object.entries(BUDGETS_UX)) {
      expect(b.source.trim().length, nom).toBeGreaterThan(0);
      const d = new Date(`${b.verifieLe}T00:00:00Z`);
      expect(
        /^\d{4}-\d{2}-\d{2}$/.test(b.verifieLe) && d.toISOString().startsWith(b.verifieLe),
        nom
      ).toBe(true);
    }
  });

  it('REQ-UX-047 — TÉMOIN : un budget absent de la SSOT est refusé, et nommé', () => {
    expect(() => budgetUx('SAISIE_DU_CONSEILLER_MAX')).toThrow(/SAISIE_DU_CONSEILLER_MAX/);
    expect(() => budgetUx('constructor')).toThrow(/constructor/);
  });

  it('REQ-UX-047 — aucune valeur propre au conseiller (question 22 de W19)', () => {
    expect(Object.keys(BUDGETS_UX).filter((n) => /CONSEILLER/i.test(n))).toEqual([]);
  });
});
