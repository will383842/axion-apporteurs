/**
 * Le cadre de la console (UX-P1-16, REQ-UX-048), ses textes seuls : les entrées de la navigation de
 * premier niveau, telles que `docs/CONSOLE-ROUTES.md` les nomme, et le bouton du menu mobile. Lu par
 * les utilisateurs de la console seuls. Aucun libellé n'est retapé ailleurs : la navigation de
 * `src/server/console/navigation.ts` les lit ici.
 */
export const NAVIGATION_CONSOLE = {
  entrees: {
    qualification: 'Qualification',
    apporteurs: 'Apporteurs',
    prospects: 'Prospects',
    argent: 'Argent',
    pilotage: 'Pilotage',
    statistiques: 'Statistiques',
    administration: 'Administration',
  },
  menu: 'Menu',
  /** Le nom de la navigation pour les lecteurs d'écran. */
  etiquette: 'Navigation de la console',
} as const;
