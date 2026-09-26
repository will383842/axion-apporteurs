// @req REQ-QA-016
// @req REQ-UX-018
/**
 * axe.spec.ts — UX-P0-03 : les projets Playwright, et l'audit axe-core de chaque surface.
 *
 * REQ-QA-016 : les parcours de l'espace tournent sur les projets mobiles (iPhone 14 Pro, Pixel 7),
 * ceux de la console sur le bureau ; un spec de parcours d'espace qu'aucun projet mobile ne prend
 * fait rougir. La liste des specs est DÉRIVÉE du disque (`tests/e2e/**`), jamais tapée.
 *
 * REQ-UX-018 (et REQ-UX-017 pour l'espace) : zéro violation grave ou critique d'axe-core, sur le
 * profil iPhone et sur le bureau. Les surfaces sont celles du dépôt (les maquettes validées, et
 * les routes réelles quand elles existent) ; la page-piège du bac d'essai fait rougir la passe en
 * NOMMANT la surface et le sélecteur fautif. Les maquettes ne BLOQUENT pas avant la phase 1
 * (décision du 2026-09-16, écrite dans `docs/gates.json`) : leurs fautes sont IMPRIMÉES.
 *
 * `A11Y_BAC=1` ajoute la page-piège aux surfaces BLOQUANTES de la passe du dépôt : la spec sort alors
 * en code non nul — c'est le témoin à deux faces.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import config, { PROFILS_A11Y, PROJETS } from '../../playwright.config';
import {
  SURFACE_PIEGE,
  auditAxe,
  juger,
  mesurer,
  specsDuDisque,
  specsSansProjet,
  surfacesJugees,
} from './harnais';

const DELAI = 300_000;

describe('REQ-QA-016 — les projets Playwright', () => {
  it('REQ-QA-016 : l’espace tourne sur iPhone 14 Pro et Pixel 7, la console sur le bureau, l’accessibilité sur iPhone et bureau', () => {
    const projets = new Map((config.projects ?? []).map((p) => [p.name, p]));
    expect(projets.get(PROJETS.mobileSafari)?.use?.defaultBrowserType).toBe('webkit');
    expect(projets.get(PROJETS.mobileSafari)?.use?.isMobile).toBe(true);
    expect(projets.get(PROJETS.mobileChrome)?.use?.defaultBrowserType).toBe('chromium');
    expect(projets.get(PROJETS.mobileChrome)?.use?.isMobile).toBe(true);
    expect(projets.get(PROJETS.bureau)?.use?.isMobile).toBe(false);
    expect([...PROFILS_A11Y]).toEqual([PROJETS.mobileSafari, PROJETS.bureau]);
  });

  it('REQ-QA-016 : la liste des parcours est LUE sur le disque — un bac posé ailleurs est énuméré, sous-dossiers compris', () => {
    const racine = mkdtempSync(join(tmpdir(), 'uxp003-'));
    try {
      for (const f of [
        'espace/deposer.spec.ts',
        'espace/profil/editer.spec.ts',
        'console/lot.spec.ts',
      ]) {
        mkdirSync(join(racine, 'tests/e2e', f, '..'), { recursive: true });
        writeFileSync(join(racine, 'tests/e2e', f), '');
      }
      writeFileSync(join(racine, 'tests/e2e/espace/aide.ts'), '');
      expect(specsDuDisque('tests/e2e', racine).sort()).toEqual([
        'tests/e2e/console/lot.spec.ts',
        'tests/e2e/espace/deposer.spec.ts',
        'tests/e2e/espace/profil/editer.spec.ts',
      ]);
      expect(specsSansProjet(config, specsDuDisque('tests/e2e', racine))).toEqual([]);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('REQ-QA-016 : un spec de parcours d’espace sans projet mobile fait rougir — la liste est dérivée du disque', () => {
    const specs = specsDuDisque();
    console.log(`${specs.length} spec(s) de parcours sous tests/e2e/ (aucun avant QA-T16).`);
    expect(specsSansProjet(config, specs)).toEqual([]);
    // Témoin : la même configuration privée de ses projets mobiles laisse un parcours d'espace orphelin.
    const sansMobile = {
      ...config,
      projects: (config.projects ?? []).filter((p) => p.use?.isMobile !== true),
    };
    expect(specsSansProjet(sansMobile, ['tests/e2e/espace/deposer.spec.ts'])).toEqual([
      'tests/e2e/espace/deposer.spec.ts : aucun projet mobile',
    ]);
    // Et un parcours de console qu'un projet mobile prendrait est refusé aussi.
    const consoleSurMobile = {
      ...config,
      projects: (config.projects ?? []).map((p) => ({ ...p, testMatch: '**/*.spec.ts' })),
    };
    expect(specsSansProjet(consoleSurMobile, ['tests/e2e/console/lot.spec.ts'])).toEqual([
      'tests/e2e/console/lot.spec.ts : pris par un projet mobile',
    ]);
  });
});

describe('REQ-UX-018 — axe-core : zéro violation grave ou critique', () => {
  it(
    'REQ-UX-018 : la page-piège fait rougir la passe, en nommant la surface et le sélecteur fautif',
    async () => {
      const m = await mesurer([SURFACE_PIEGE], PROFILS_A11Y, auditAxe);
      const v = juger('axe', [SURFACE_PIEGE], m);
      console.log(v.lignes.join('\n'));
      expect(v.code).toBe(1);
      expect(v.lignes.join('\n')).toMatch(/piege\.html .*color-contrast/);
      expect(m.fautes.some((f) => f.selecteur.includes('.contraste-faible'))).toBe(true);
    },
    DELAI
  );

  it(
    'REQ-UX-018 : sur chaque surface du dépôt, iPhone et bureau — verdict imprimé, mesuré au premier plan',
    async () => {
      const surfaces = surfacesJugees();
      const m = await mesurer(surfaces, PROFILS_A11Y, auditAxe);
      const v = juger('axe', surfaces, m);
      console.log(v.lignes.join('\n'));
      expect(m.mesures).toBeGreaterThanOrEqual(surfaces.length * PROFILS_A11Y.length);
      expect(m.auPremierPlan).toBe(m.mesures);
      expect(v.code).toBe(0);
    },
    DELAI
  );
});
