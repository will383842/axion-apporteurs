// @req REQ-UX-017
/**
 * cibles.spec.ts — UX-P0-03 : les cibles tactiles et le corps de texte.
 *
 * REQ-UX-017 : dans l'espace, toute cible interactive mesure au moins 48 × 48 px CSS ; le corps de
 * texte (paragraphes, éléments de liste, définitions) est à 18 px au moins, avec un contraste d'au
 * moins 4,5:1 sur son fond effectif. Dans la console, les cibles de REQ-UX-018 : 44 px sur mobile,
 * 24 px sur le bureau. Mesuré sur le profil iPhone et sur le bureau, AU PREMIER PLAN.
 *
 * La page-piège (un bouton de 24 px, un texte de 14 px à faible contraste) fait rougir la passe en
 * nommant la surface et le sélecteur. Le vert imprime le compte des surfaces et des cibles
 * RÉELLEMENT mesurées : des zéros passent tous les seuils, et c'est exactement ce que rendrait une
 * page mesurée en arrière-plan.
 */
import { describe, it, expect } from 'vitest';
import { PROFILS_A11Y } from '../../playwright.config';
import { SURFACE_PIEGE, ciblesEtCorps, juger, mesurer, surfacesJugees } from './harnais';

const DELAI = 300_000;

describe('REQ-UX-017 — cibles de 48 px et corps de texte de 18 px à 4,5:1', () => {
  it(
    'REQ-UX-017 : la page-piège fait rougir la passe — bouton de 24 px, texte de 14 px, contraste insuffisant, chacun nommé',
    async () => {
      const m = await mesurer([SURFACE_PIEGE], PROFILS_A11Y, ciblesEtCorps);
      const v = juger('cibles', [SURFACE_PIEGE], m);
      console.log(v.lignes.join('\n'));
      expect(v.code).toBe(1);
      const texte = v.lignes.join('\n');
      expect(texte).toMatch(/piege\.html .*#bouton-24 .*24 × 24/);
      expect(texte).toMatch(/piege\.html .*\.contraste-faible .*14 px/);
      expect(texte).toMatch(/piege\.html .*\.contraste-faible .*contraste \d/);
    },
    DELAI
  );

  it(
    'REQ-UX-017 : sur chaque surface du dépôt, iPhone et bureau — verdict imprimé avec le compte des cibles mesurées',
    async () => {
      const surfaces = surfacesJugees();
      const m = await mesurer(surfaces, PROFILS_A11Y, ciblesEtCorps);
      const v = juger('cibles', surfaces, m);
      console.log(v.lignes.join('\n'));
      expect(m.cibles).toBeGreaterThan(0);
      expect(m.auPremierPlan).toBe(m.mesures);
      expect(v.code).toBe(0);
    },
    DELAI
  );
});
