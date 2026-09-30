// @req REQ-JUR-015
// @no-red-first: ce test juge EN PROCESSUS une forme deja vraie sur main (dates et renvois de la SSOT), pour que l outil de mutation voie ce que la garde en sous-processus lui cache ; il n affirme rien de neuf, il rend visible.
/**
 * La SSOT des seuils, jugée EN PROCESSUS (QA-T12, qui y a versé `EXERCICE_DE_RESTAURATION_MAX_JOURS`).
 *
 * La garde `ssot:seuils` (`scripts/gates/seuils-ssot.ts`) tient déjà ces règles, mais ses témoins la
 * lancent en sous-processus, que l'outil de mutation ne voit pas : muter la date de vérification ou
 * l'aide qui forme les renvois au contrat laissait les mutants survivre (PR 280, cinq survivants sur
 * `src/domain/seuils/ssot.ts` l. 38-40). Ce fichier juge la même forme en important la SSOT.
 */
import { describe, it, expect } from 'vitest';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const entrees = Object.entries(SEUILS);

describe('REQ-JUR-015 — chaque seuil porte sa date et ses renvois bien formés', () => {
  it('REQ-JUR-015 : la SSOT n’est pas vide', () => {
    expect(entrees.length).toBeGreaterThan(0);
  });

  it('REQ-JUR-015 : chaque date de vérification est une date ISO réelle', () => {
    for (const [nom, s] of entrees) {
      expect(s.verifieLe, nom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.verifieLe)), nom).toBe(false);
    }
  });

  it('REQ-JUR-015 : chaque renvoi nomme un document du contrat et une unité non vide', () => {
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

  it('REQ-JUR-015 : un renvoi à un article du CORPS du contrat porte le document « contrat »', () => {
    const corps = entrees
      .flatMap(([, s]) => s.renvois)
      .filter((r) => /^\d+(\.\d+)?$/.test(r.unite));
    expect(corps.length).toBeGreaterThan(0);
    expect(corps.some((r) => r.document === 'contrat')).toBe(true);
  });

  it('REQ-JUR-015 : chaque source est nommée', () => {
    for (const [nom, s] of entrees) expect(s.source.trim().length, nom).toBeGreaterThan(0);
  });
});
