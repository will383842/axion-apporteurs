// @req REQ-SEC-001
/**
 * `apporteur-acces-espace.spec.ts` — quels statuts ouvrent l'espace (SEC-03, `HYP-SEC03-ACCES`).
 *
 * La population des statuts est DÉRIVÉE de `STATUTS_APPORTEUR` (REQ-DM-011), jamais retapée : un
 * statut ajouté au domaine est jugé ici sans qu'on y pense, et il est FERMÉ (liste blanche).
 * Placé sous `tests/unit/domaine/` pour que la mesure de couverture du domaine le compte.
 */
import { describe, it, expect } from 'vitest';
import { peutOuvrirLEspace } from '../../../src/domain/apporteur/acces-espace';
import { STATUTS_APPORTEUR } from '../../../src/domain/apporteur/statut';

describe('REQ-SEC-001 — statuts qui ouvrent l’espace, défaut fermé (HYP-SEC03-ACCES)', () => {
  it('REQ-SEC-001 : `signe` et `suspendu` ouvrent ; tout autre statut du domaine ferme', () => {
    // Plancher : la population n'est pas vide.
    expect(STATUTS_APPORTEUR.length).toBeGreaterThan(2);
    expect(STATUTS_APPORTEUR.filter(peutOuvrirLEspace)).toEqual(['signe', 'suspendu']);
  });

  it('REQ-SEC-001 : un statut inconnu, vide ou d’une autre casse ferme', () => {
    for (const statut of ['inconnu', '', 'SIGNE', ' signe']) {
      expect(peutOuvrirLEspace(statut)).toBe(false);
    }
  });
});
