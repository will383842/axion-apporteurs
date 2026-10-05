// @req REQ-SEC-001
/**
 * `apporteur-acces-espace.spec.ts` — quels statuts ouvrent l'espace (SEC-03, `HYP-SEC03-ACCES`).
 *
 * La population des statuts est DÉRIVÉE de `STATUTS_APPORTEUR` (REQ-DM-011), jamais retapée : un
 * statut ajouté au domaine est jugé ici sans qu'on y pense, et il est FERMÉ (liste blanche).
 * Placé sous `tests/unit/domaine/` pour que la mesure de couverture du domaine le compte.
 */
import { describe, it, expect } from 'vitest';
import {
  niveauDAcces,
  peutOuvrirLEspace,
  routeOuverte,
  SEGMENTS_LIMITES,
  SEGMENTS_PLEINS,
} from '../../../src/domain/apporteur/acces-espace';
import { STATUTS_APPORTEUR } from '../../../src/domain/apporteur/statut';

describe('REQ-SEC-001 — statuts qui ouvrent l’espace, défaut fermé (HYP-SEC03-ACCES amendée par la décision de Williams du 2026-10-01, SEC-43)', () => {
  it('REQ-SEC-001 : `signe` et `suspendu` en PLEIN ; `kyc_en_cours` et `pret_a_signer` en LIMITÉ ; tout autre statut du domaine FERMÉ', () => {
    // Plancher : la population n'est pas vide.
    expect(STATUTS_APPORTEUR.length).toBeGreaterThan(2);
    expect(STATUTS_APPORTEUR.filter((s) => niveauDAcces(s) === 'plein')).toEqual([
      'signe',
      'suspendu',
    ]);
    expect(STATUTS_APPORTEUR.filter((s) => niveauDAcces(s) === 'limite')).toEqual([
      'kyc_en_cours',
      'pret_a_signer',
    ]);
    expect(STATUTS_APPORTEUR.filter((s) => peutOuvrirLEspace(s))).toEqual([
      'kyc_en_cours',
      'pret_a_signer',
      'signe',
      'suspendu',
    ]);
  });

  it('REQ-SEC-001 : la route s’ouvre selon le niveau — limité aux segments limités, plein aux déclarés, fermé à aucun, inconnu à personne', () => {
    for (const s of SEGMENTS_LIMITES) expect(routeOuverte('limite', s)).toBe(true);
    for (const s of SEGMENTS_PLEINS) {
      expect(routeOuverte('limite', s)).toBe(false);
      expect(routeOuverte('plein', s)).toBe(true);
    }
    expect(routeOuverte('limite', 'confidentialite')).toBe(true);
    expect(routeOuverte('ferme', 'conformite')).toBe(false);
    expect(routeOuverte('plein', 'inconnu')).toBe(false);
  });

  it('REQ-SEC-001 : un statut inconnu, vide ou d’une autre casse ferme', () => {
    for (const statut of ['inconnu', '', 'SIGNE', ' signe']) {
      expect(peutOuvrirLEspace(statut)).toBe(false);
    }
  });
});
