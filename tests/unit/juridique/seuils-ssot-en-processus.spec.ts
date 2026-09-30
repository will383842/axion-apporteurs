// @req REQ-JUR-015
// @no-red-first: ce test juge EN PROCESSUS une forme deja vraie sur main (dates et renvois de la SSOT), pour que l outil de mutation voie ce que la garde en sous-processus lui cache ; il n affirme rien de neuf, il rend visible.
/**
 * La SSOT des seuils, jugée EN PROCESSUS (QA-T12, qui y a versé `EXERCICE_DE_RESTAURATION_MAX_JOURS`).
 *
 * La garde `ssot:seuils` (`scripts/gates/seuils-ssot.ts`) tient déjà ces règles, mais ses témoins la
 * lancent en sous-processus, que l'outil de mutation ne voit pas : muter la date de vérification ou
 * l'aide qui forme les renvois au contrat laissait les mutants survivre (PR 280, cinq survivants sur
 * `src/domain/seuils/ssot.ts` l. 38-40). Ce fichier juge la même forme en important la SSOT.
 *
 * L'IMPORT EST REFAIT À CHAQUE TEST : la date et l'aide des renvois sont évaluées au chargement du
 * module. Importée une fois en tête de fichier, la SSOT resterait en cache, et un mutant de ces
 * lignes ne serait jamais évalué — il « survivrait » sans avoir été vu (PR 280, second passage).
 */
import { describe, it, expect, vi } from 'vitest';

/** La SSOT fraîchement évaluée : le cache des modules est vidé avant l'import. */
async function entreesFraiches() {
  vi.resetModules();
  const { SEUILS } = await import('../../../src/domain/seuils/ssot');
  return Object.entries(SEUILS);
}

describe('REQ-JUR-015 — chaque seuil porte sa date et ses renvois bien formés', () => {
  it('REQ-JUR-015 : la SSOT n’est pas vide', async () => {
    const entrees = await entreesFraiches();
    expect(entrees.length).toBeGreaterThan(0);
  });

  it('REQ-JUR-015 : chaque date de vérification est une date ISO réelle', async () => {
    const entrees = await entreesFraiches();
    for (const [nom, s] of entrees) {
      expect(s.verifieLe, nom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.verifieLe)), nom).toBe(false);
    }
  });

  it('REQ-JUR-015 : chaque renvoi nomme un document du contrat et une unité non vide', async () => {
    const entrees = await entreesFraiches();
    let renvois = 0;
    for (const [nom, s] of entrees) {
      expect(Array.isArray(s.renvois), nom).toBe(true);
      for (const r of s.renvois) {
        renvois++;
        expect(['contrat', 'annexe-2'], nom).toContain(r.document);
        expect(r.unite.length, nom).toBeGreaterThan(0);
      }
    }
    expect(
      renvois,
      'aucun renvoi au contrat : l’aide qui les forme ne serait jugée par rien'
    ).toBeGreaterThan(0);
  });

  it('REQ-JUR-015 : un renvoi à un article du CORPS du contrat porte le document « contrat »', async () => {
    const entrees = await entreesFraiches();
    const corps = entrees
      .flatMap(([, s]) => s.renvois)
      .filter((r) => /^\d+(\.\d+)?$/.test(r.unite));
    expect(corps.length).toBeGreaterThan(0);
    expect(corps.some((r) => r.document === 'contrat')).toBe(true);
  });

  it('REQ-JUR-015 : chaque source est nommée', async () => {
    const entrees = await entreesFraiches();
    for (const [nom, s] of entrees) expect(s.source.trim().length, nom).toBeGreaterThan(0);
  });
});
