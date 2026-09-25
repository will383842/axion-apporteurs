// @req REQ-UX-017
/**
 * reflow.spec.ts — UX-P0-03 : aucun défilement horizontal à 320 px, ni à 200 % de zoom.
 *
 * REQ-UX-017 : à 320 px CSS de large, et au zoom de 200 % du profil (sa largeur divisée par deux,
 * jamais sous 320 px), aucune surface ne fait apparaître de défilement horizontal. La faute nomme
 * la surface, la largeur, le débordement en pixels et l'élément le plus large.
 *
 * La page-piège (un bloc de largeur fixe) fait rougir la passe en le nommant.
 */
import { describe, it, expect } from 'vitest';
import { PROFILS_A11Y } from '../../playwright.config';
import { SURFACE_PIEGE, juger, mesurer, reflux, surfacesJugees } from './harnais';

const DELAI = 300_000;

describe('REQ-UX-017 — reflux à 320 px et à 200 %', () => {
  it(
    'REQ-UX-017 : la page-piège déborde à 320 px — la passe rougit et nomme le bloc de largeur fixe',
    async () => {
      const m = await mesurer([SURFACE_PIEGE], PROFILS_A11Y, reflux);
      const v = juger('reflux', [SURFACE_PIEGE], m);
      console.log(v.lignes.join('\n'));
      expect(v.code).toBe(1);
      expect(v.lignes.join('\n')).toMatch(/piege\.html .*\.largeur-fixe .*320 px/);
    },
    DELAI
  );

  it(
    'REQ-UX-017 : aucune surface du dépôt ne défile horizontalement à 320 px ni à 200 %',
    async () => {
      const surfaces = surfacesJugees();
      const m = await mesurer(surfaces, PROFILS_A11Y, reflux);
      const v = juger('reflux', surfaces, m);
      console.log(v.lignes.join('\n'));
      expect(m.mesures).toBeGreaterThanOrEqual(surfaces.length * PROFILS_A11Y.length);
      expect(m.auPremierPlan).toBe(m.mesures);
      expect(v.code).toBe(0);
    },
    DELAI
  );
});
