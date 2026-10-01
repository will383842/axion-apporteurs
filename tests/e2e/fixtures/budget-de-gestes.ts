/**
 * La fixture Playwright « budget de gestes » (QA-T33 ; REQ-UX-047 points 1 et 2, REQ-UX-001,
 * REQ-UX-021, REQ-QA-016). Elle mesure ce que les exigences fixent et que rien ne mesurait :
 *   — le NOMBRE D'INTERACTIONS d'un geste, compté comme REQ-UX-001 le compte : un toucher vaut une
 *     interaction, un champ rempli en vaut une, quel que soit le nombre de frappes ;
 *   — les TABULATIONS jusqu'à la première action ;
 *   — la PREMIÈRE ACTION CLIQUABLE, chronométrée sur le profil réseau « 4G ralentie » ;
 *   — la première action VISIBLE SANS DÉFILEMENT à 375×667 et 1280×800.
 * Tous les seuils sont LUS dans `BUDGETS_UX` (`src/domain/seuils/ssot.ts`) : aucun chiffre ici.
 * Une exigence plus stricte (REQ-UX-001 pour le dépôt, REQ-UX-021 pour la qualification) se passe en
 * argument, nommée, au parcours qui la mesure.
 *
 * Usage dans un parcours `tests/e2e/{espace,console}/**` :
 *   import { test, expect } from '../fixtures/budget-de-gestes';
 *   test('déposer', async ({ page, budgetDeGestes }) => {
 *     … le parcours …
 *     expect(await budgetDeGestes.juger('saisie')).toEqual([]);
 *   });
 */
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { BUDGETS_UX, type NomDeBudgetUx } from '../../../src/domain/seuils/ssot';

export type Mesure = { clics: number; champs: number; tabulations: number };
export type Geste = 'consultation' | 'saisie';

/** Les deux fenêtres de référence de REQ-UX-047 point 2 : mobile (espace, console mobile) et bureau. */
export const FENETRES = {
  mobile: { width: 375, height: 667 },
  bureau: { width: 1280, height: 800 },
} as const;

const BUDGET_DU_GESTE: Readonly<Record<Geste, NomDeBudgetUx>> = {
  consultation: 'CONSULTATION_INTERACTIONS_MAX',
  saisie: 'SAISIE_INTERACTIONS_MAX',
};

/**
 * Le jugement, pur : la mesure d'un geste contre son budget, et les tabulations contre le leur. Un
 * dépassement est NOMMÉ, avec la clé de `BUDGETS_UX` qu'il dépasse. `plafond` porte une exigence plus
 * stricte (REQ-UX-021 : six interactions pour qualifier) ; il ne peut qu'abaisser le budget.
 */
export function jugerLeBudget(
  geste: Geste,
  m: Mesure,
  plafond?: { valeur: number; source: string }
): string[] {
  const fautes: string[] = [];
  const cle = BUDGET_DU_GESTE[geste];
  const budget = Math.min(BUDGETS_UX[cle].valeur, plafond?.valeur ?? Infinity);
  const source =
    plafond && plafond.valeur < BUDGETS_UX[cle].valeur ? plafond.source : `BUDGETS_UX.${cle}`;
  const interactions = m.clics + m.champs;
  if (interactions > budget)
    fautes.push(`${geste} : ${interactions} interactions, budget ${budget} (${source})`);
  const tabs = BUDGETS_UX.PREMIERE_ACTION_TABULATIONS_MAX.valeur;
  if (m.tabulations > tabs)
    fautes.push(
      `première action : ${m.tabulations} tabulations, budget ${tabs} (BUDGETS_UX.PREMIERE_ACTION_TABULATIONS_MAX)`
    );
  return fautes;
}

/** Vrai si la boîte d'un élément tient entière dans la fenêtre, sans défilement. */
export function dansLaFenetre(
  boite: { x: number; y: number; width: number; height: number } | null,
  fenetre: { width: number; height: number }
): boolean {
  if (!boite) return false;
  return (
    boite.x >= 0 &&
    boite.y >= 0 &&
    boite.x + boite.width <= fenetre.width &&
    boite.y + boite.height <= fenetre.height
  );
}

/** Le profil « 4G ralentie » de `BUDGETS_UX`, dans les unités de l'émulation réseau de Chromium (octets/s). */
export function profilReseau(): {
  offline: false;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;
} {
  return {
    offline: false,
    latency: BUDGETS_UX.RESEAU_4G_RALENTIE_LATENCE_MS.valeur,
    downloadThroughput: (BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_DESCENDANT_KBPS.valeur * 1000) / 8,
    uploadThroughput: (BUDGETS_UX.RESEAU_4G_RALENTIE_DEBIT_MONTANT_KBPS.valeur * 1000) / 8,
  };
}

/**
 * Le compteur posé dans la page avant tout script (`addInitScript`) : un clic par `click`, un champ
 * par élément de saisie modifié (ensemble : plusieurs frappes comptent une fois), une tabulation par
 * `Tab`. Une chaîne, pas une fonction : elle s'exécute dans la page, sans rien de ce module.
 */
export const COMPTEUR_DANS_LA_PAGE = `(() => {
  if (window.__budgetDeGestes) return;
  const m = { clics: 0, champs: new Set(), tabulations: 0 };
  Object.defineProperty(window, '__budgetDeGestes', { value: m, configurable: true });
  let n = 0;
  const cle = (el) => el.id || el.name || (el.__cleBudget ||= 'champ-' + ++n);
  addEventListener('click', () => { m.clics += 1; }, true);
  addEventListener('input', (e) => { const t = e.target; if (t && 'value' in t) m.champs.add(cle(t)); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Tab') m.tabulations += 1; }, true);
})();`;

/**
 * Pose le compteur dans le document COURANT, s'il n'y est pas déjà. `addInitScript` le pose à chaque
 * navigation ; un contenu injecté par `setContent` peut réutiliser le document, et l'y poser à la main
 * évite de compter dans le vide.
 */
export async function poserLeCompteur(page: Page): Promise<void> {
  await page.evaluate(COMPTEUR_DANS_LA_PAGE);
}

/** La mesure lue dans la page. */
export async function lireLaMesure(page: Page): Promise<Mesure> {
  return page.evaluate(() => {
    const m = (
      window as unknown as {
        __budgetDeGestes: { clics: number; champs: Set<string>; tabulations: number };
      }
    ).__budgetDeGestes;
    return { clics: m.clics, champs: m.champs.size, tabulations: m.tabulations };
  });
}

export class BudgetDeGestes {
  constructor(private readonly page: Page) {}

  /** La mesure du geste en cours. */
  mesure(): Promise<Mesure> {
    return lireLaMesure(this.page);
  }

  /** Les dépassements du geste, nommés ; vide si le geste tient dans son budget. */
  async juger(geste: Geste, plafond?: { valeur: number; source: string }): Promise<string[]> {
    return jugerLeBudget(geste, await this.mesure(), plafond);
  }

  /** Vrai si l'élément est visible sans défilement dans la fenêtre courante. */
  async visibleSansDefilement(cible: Locator): Promise<boolean> {
    const fenetre = this.page.viewportSize();
    return fenetre !== null && dansLaFenetre(await cible.boundingBox(), fenetre);
  }

  /**
   * Le temps, en secondes, jusqu'à ce que la première action soit cliquable, la page étant chargée
   * sur le profil « 4G ralentie » (Chromium seulement : l'émulation réseau passe par CDP). Rend aussi
   * la faute nommée si le temps dépasse `BUDGETS_UX.PREMIERE_ACTION_CLIQUABLE_SECONDES_MAX`.
   */
  async premiereActionCliquable(
    url: string,
    cible: Locator
  ): Promise<{ secondes: number; fautes: string[] }> {
    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', profilReseau());
    const debut = Date.now();
    await this.page.goto(url);
    await cible.click({ trial: true });
    const secondes = (Date.now() - debut) / 1000;
    const max = BUDGETS_UX.PREMIERE_ACTION_CLIQUABLE_SECONDES_MAX.valeur;
    return {
      secondes,
      fautes:
        secondes > max
          ? [
              `première action cliquable en ${secondes.toFixed(2)} s, budget ${max} s (BUDGETS_UX.PREMIERE_ACTION_CLIQUABLE_SECONDES_MAX)`,
            ]
          : [],
    };
  }
}

/** Le `test` des parcours : il pose le compteur dans chaque page et fournit `budgetDeGestes`. */
export const test = base.extend<{ budgetDeGestes: BudgetDeGestes }>({
  budgetDeGestes: async ({ page }, utiliser) => {
    await page.addInitScript(COMPTEUR_DANS_LA_PAGE);
    await utiliser(new BudgetDeGestes(page));
  },
});

export { expect };
