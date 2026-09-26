/**
 * Playwright d'Axion Partners — UX-P0-03 (REQ-QA-016, REQ-UX-017, REQ-UX-018).
 *
 * LES PROJETS. Les parcours de l'ESPACE apporteur tournent sur les deux profils mobiles SEULEMENT
 * (iPhone 14 Pro sous WebKit, Pixel 7 sous Chromium) ; ceux de la CONSOLE sur le bureau SEULEMENT.
 * Un parcours d'espace qu'aucun projet mobile ne prend est un parcours que personne ne joue sur un
 * téléphone : `tests/a11y/axe.spec.ts` le fait rougir, en DÉRIVANT la liste des specs du disque.
 *
 * ARBITRAGE DU 2026-09-16 (texte de REQ-QA-016 amendé en conséquence) : le « uniquement » porte sur
 * les PARCOURS fonctionnels. Les passes d'accessibilité de `tests/a11y/` sont un contrôle de RENDU
 * et s'exécutent sur les DEUX profils que REQ-UX-017 nomme, iPhone et bureau : `PROFILS_A11Y`.
 *
 * Aucun parcours n'existe encore (QA-T16, phase 1) : `testDir` est vide, et c'est dit par la garde.
 */
import { defineConfig, devices } from '@playwright/test';

/** Les projets, nommés une fois. Les gardes et le harnais les lisent ici. */
export const PROJETS = {
  mobileSafari: 'mobile-safari',
  mobileChrome: 'mobile-chrome',
  bureau: 'chromium-desktop',
} as const;

/** Où vivent les parcours, par espace. */
export const PARCOURS = { espace: 'espace/**/*.spec.ts', console: 'console/**/*.spec.ts' } as const;

/** Les projets dont les passes d'accessibilité empruntent le profil : iPhone, puis bureau. */
export const PROFILS_A11Y = [PROJETS.mobileSafari, PROJETS.bureau] as const;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: true,
  projects: [
    {
      name: PROJETS.mobileSafari,
      testMatch: PARCOURS.espace,
      use: { ...devices['iPhone 14 Pro'] },
    },
    { name: PROJETS.mobileChrome, testMatch: PARCOURS.espace, use: { ...devices['Pixel 7'] } },
    { name: PROJETS.bureau, testMatch: PARCOURS.console, use: { ...devices['Desktop Chrome'] } },
  ],
});
