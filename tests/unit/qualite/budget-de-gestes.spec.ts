// @req REQ-UX-047
// @req REQ-QA-016
/**
 * QA-T33 — la fixture « budget de gestes » : ce que REQ-UX-001 et REQ-UX-021 fixent, quelque chose le
 * mesure enfin. Les seuils sont LUS dans `BUDGETS_UX` (`src/domain/seuils/ssot.ts`), jamais retapés (RM-01).
 *
 * CE QUE CE FICHIER GARDE.
 *   1. Le JUGEMENT, pur : une mesure (clics, champs, tabulations) confrontée au budget d'un geste —
 *      consultation ou saisie — et le refus nomme ce qui dépasse. TÉMOIN : 9 saisies contre 8.
 *   2. Le COMPTAGE dans un vrai navigateur : le script que la fixture pose dans la page compte un
 *      clic, un champ rempli (une fois, quel que soit le nombre de frappes) et une tabulation.
 *   3. « Visible sans défilement » à 375×667 et 1280×800, et la première action cliquable chronométrée
 *      sur le profil « 4G ralentie » de `BUDGETS_UX`.
 *   4. Les projets mobile-safari et mobile-chrome prennent aussi les parcours `console/**`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import config, { PROJETS, PARCOURS } from '../../../playwright.config';
import { BUDGETS_UX } from '../../../src/domain/seuils/ssot';
import {
  COMPTEUR_DANS_LA_PAGE,
  FENETRES,
  dansLaFenetre,
  jugerLeBudget,
  lireLaMesure,
  poserLeCompteur,
  profilReseau,
  type Mesure,
} from '../../e2e/fixtures/budget-de-gestes';

const mesure = (clics: number, champs: number, tabulations = 0): Mesure => ({
  clics,
  champs,
  tabulations,
});

describe('REQ-UX-047 — le jugement du budget, pur', () => {
  it('REQ-UX-047 — un geste de saisie dans son budget passe, et le budget vient de BUDGETS_UX', () => {
    const budget = BUDGETS_UX.SAISIE_INTERACTIONS_MAX.valeur;
    expect(jugerLeBudget('saisie', mesure(1, budget - 1))).toEqual([]);
  });

  it('REQ-UX-047 — TÉMOIN : un parcours de 9 saisies échoue face au budget de 8, en le nommant', () => {
    expect(BUDGETS_UX.SAISIE_INTERACTIONS_MAX.valeur).toBe(8);
    expect(jugerLeBudget('saisie', mesure(0, 9))).toEqual([
      'saisie : 9 interactions, budget 8 (BUDGETS_UX.SAISIE_INTERACTIONS_MAX)',
    ]);
  });

  it('REQ-UX-047 — TÉMOIN : une consultation de 4 interactions échoue face au budget de 3, et les tabulations ont leur propre budget', () => {
    expect(jugerLeBudget('consultation', mesure(4, 0))).toEqual([
      'consultation : 4 interactions, budget 3 (BUDGETS_UX.CONSULTATION_INTERACTIONS_MAX)',
    ]);
    expect(jugerLeBudget('consultation', mesure(1, 0, 4))).toEqual([
      'première action : 4 tabulations, budget 3 (BUDGETS_UX.PREMIERE_ACTION_TABULATIONS_MAX)',
    ]);
  });

  it('REQ-UX-047 — « visible sans défilement » aux deux fenêtres de référence', () => {
    expect(FENETRES).toEqual({
      mobile: { width: 375, height: 667 },
      bureau: { width: 1280, height: 800 },
    });
    expect(dansLaFenetre({ x: 16, y: 600, width: 200, height: 48 }, FENETRES.mobile)).toBe(true);
    expect(dansLaFenetre({ x: 16, y: 640, width: 200, height: 48 }, FENETRES.mobile)).toBe(false);
    expect(dansLaFenetre(null, FENETRES.bureau)).toBe(false);
  });

  it('REQ-UX-047 — le profil « 4G ralentie » est celui de BUDGETS_UX, converti pour le navigateur', () => {
    const p = profilReseau();
    expect(p.latency).toBe(BUDGETS_UX.RESEAU_4G_RALENTIE_LATENCE_MS.valeur);
    expect(p.downloadThroughput).toBe(
      (BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_DESCENDANT_KBPS.valeur * 1000) / 8
    );
    expect(p.uploadThroughput).toBe(
      (BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_MONTANT_KBPS.valeur * 1000) / 8
    );
  });
});

describe('REQ-UX-047 — le comptage dans un vrai navigateur', () => {
  let navigateur: Browser | undefined;
  afterAll(async () => {
    await navigateur?.close();
  });

  it('REQ-UX-047 — un clic, un champ rempli de plusieurs frappes, une tabulation : 1, 1, 1', async () => {
    navigateur = await chromium.launch();
    const page = await navigateur.newPage();
    await page.addInitScript(COMPTEUR_DANS_LA_PAGE);
    await page.setContent('<input id="a" /><input id="b" /><button id="c">Envoyer</button>');
    await poserLeCompteur(page);
    await page.fill('#a', 'Claire');
    await page.type('#a', ' Exemple');
    await page.keyboard.press('Tab');
    await page.click('#c');
    expect(await lireLaMesure(page)).toEqual(mesure(1, 1, 1));
  });

  it('REQ-UX-047 — TÉMOIN : neuf champs remplis dans la page dépassent le budget de saisie', async () => {
    navigateur ??= await chromium.launch();
    const page = await navigateur.newPage();
    await page.addInitScript(COMPTEUR_DANS_LA_PAGE);
    await page.setContent(Array.from({ length: 9 }, (_, i) => `<input id="c${i}" />`).join(''));
    await poserLeCompteur(page);
    for (let i = 0; i < 9; i++) await page.fill(`#c${i}`, 'x');
    expect(jugerLeBudget('saisie', await lireLaMesure(page))).toEqual([
      'saisie : 9 interactions, budget 8 (BUDGETS_UX.SAISIE_INTERACTIONS_MAX)',
    ]);
  });
});

describe('REQ-QA-016 — les projets mobiles prennent aussi la console', () => {
  it('REQ-QA-016 — mobile-safari et mobile-chrome lisent espace/** ET console/**', () => {
    for (const nom of [PROJETS.mobileSafari, PROJETS.mobileChrome]) {
      const p = (config.projects ?? []).find((x) => x.name === nom)!;
      const motifs = [p.testMatch].flat();
      expect(motifs, nom).toEqual(expect.arrayContaining([PARCOURS.espace, PARCOURS.console]));
    }
  });
});
