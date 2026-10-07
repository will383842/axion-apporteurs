/**
 * UX-P1-16 — la navigation de la console et l'accueil de chaque rôle (REQ-UX-048, REQ-UX-019).
 *
 * DÉRIVÉE, JAMAIS TAPÉE PAR RÔLE. Une entrée n'apparaît que si le rôle a le droit de son écran dans
 * la matrice (`src/server/roles/matrice.ts`, RM-05) ET que l'écran est LIVRÉ : aucun onglet ne mène à
 * un écran prévu. Ajouter un droit à la matrice fait apparaître l'entrée, sans autre modification.
 *
 * La table, les listes de préférence et les routes livrées sont celles de `docs/CONSOLE-ROUTES.md`,
 * confrontées ligne pour ligne par `tests/unit/console/navigation-par-role.spec.ts` : la carte et ce
 * module ne peuvent pas diverger sans qu'un témoin le dise. Une route passe à « livrée » dans la PR
 * qui la livre, ici ET dans la carte.
 *
 * Module pur : aucune lecture de session ici. La page et la mise en page lisent le rôle par
 * `requireRole`, puis demandent ici les entrées et l'accueil.
 */
import type { ConsoleRole } from '@prisma/client';
import { NAVIGATION_CONSOLE } from '../../content/micro-copy/console/navigation';
import { roleAutorise } from '../roles/matrice';

/** Une entrée de premier niveau : son ordre, son libellé, sa route d'arrivée et le droit de son écran. */
export interface EntreeDeLaConsole {
  readonly ordre: number;
  readonly libelle: string;
  readonly route: string;
  /** Le droit d'écran que la matrice porte, ou portera quand l'écran entrera dans sa phase. */
  readonly droit: `ecran:${string}`;
}

const E = NAVIGATION_CONSOLE.entrees;

/** La navigation de premier niveau de la carte (sept entrées au plus, groupées par métier). */
export const ENTREES_DE_LA_CONSOLE: readonly EntreeDeLaConsole[] = [
  {
    ordre: 1,
    libelle: E.qualification,
    route: '/console/qualification',
    droit: 'ecran:qualification',
  },
  { ordre: 2, libelle: E.apporteurs, route: '/console/apporteurs', droit: 'ecran:apporteurs' },
  { ordre: 3, libelle: E.prospects, route: '/console/attributions', droit: 'ecran:attributions' },
  { ordre: 4, libelle: E.argent, route: '/console/lots', droit: 'ecran:lots' },
  { ordre: 5, libelle: E.pilotage, route: '/console/pilotage', droit: 'ecran:pilotage' },
  {
    ordre: 6,
    libelle: E.statistiques,
    route: '/console/statistiques',
    droit: 'ecran:statistiques',
  },
  {
    ordre: 7,
    libelle: E.administration,
    route: '/console/utilisateurs',
    droit: 'ecran:utilisateurs_console',
  },
];

/** Les routes de la console que la carte dit LIVRÉES. Une PR qui livre un écran l'ajoute ici. */
export const ROUTES_LIVREES_DE_LA_CONSOLE: readonly string[] = [
  '/console/connexion',
  '/console/connexion/[jeton]',
  '/console',
  '/console/acces-refuse',
  // SEC-30 : l'administration des utilisateurs de la console.
  '/console/utilisateurs',
  // CPL-T07 : le dossier de conformité d'un apporteur, ouvert depuis sa fiche (hors du menu).
  '/console/apporteurs/[id]/conformite',
  // UX-P1-53 : les gels du journal des accès, ouverts depuis l'administration (hors du menu).
  '/console/journal-des-acces/gels',
  // UX-P1-57 : la mise en demeure d'un apporteur, ouverte depuis sa fiche (hors du menu).
  '/console/apporteurs/[id]/mise-en-demeure',
];

/** La liste de préférence de l'accueil, rôle par rôle (`docs/CONSOLE-ROUTES.md`). */
export const PREFERENCES_D_ACCUEIL: Readonly<Record<ConsoleRole, readonly string[]>> = {
  admin: ['/console/qualification', '/console/apporteurs'],
  qualifieur: ['/console/qualification'],
  comptable: ['/console/lots', '/console/apporteurs'],
  lecteur: ['/console/statistiques', '/console/qualification'],
};

/** Le plafond du bureau : sept entrées au plus. */
const ENTREES_DU_BUREAU_MAX = 7;
/** La barre mobile, en dessous de 768 px : trois entrées, puis le menu. */
const ENTREES_DE_LA_BARRE_MOBILE = 3;

type Autorisation = (droit: string, role: ConsoleRole) => boolean;

interface Contexte {
  /** Les routes livrées ; par défaut, celles de la carte. */
  readonly livrees?: readonly string[];
  /** La question à la matrice ; par défaut, la matrice elle-même. */
  readonly autorise?: Autorisation;
}

/** Les entrées du rôle : le droit de l'écran ET l'écran livré, dans l'ordre de la carte. */
export function entreesDuRole(role: ConsoleRole, contexte: Contexte = {}): EntreeDeLaConsole[] {
  const livrees = contexte.livrees ?? ROUTES_LIVREES_DE_LA_CONSOLE;
  const autorise = contexte.autorise ?? roleAutorise;
  return ENTREES_DE_LA_CONSOLE.filter(
    (e) => autorise(e.droit, role) && livrees.includes(e.route)
  ).slice(0, ENTREES_DU_BUREAU_MAX);
}

/** La barre mobile : les trois premières entrées ; le menu porte le reste. */
export function barreMobile(entrees: readonly EntreeDeLaConsole[]): {
  visibles: EntreeDeLaConsole[];
  dansLeMenu: EntreeDeLaConsole[];
} {
  return {
    visibles: entrees.slice(0, ENTREES_DE_LA_BARRE_MOBILE),
    dansLeMenu: entrees.slice(ENTREES_DE_LA_BARRE_MOBILE),
  };
}

/** Le droit d'écran d'une route de la navigation, ou `null` si elle n'y figure pas. */
function droitDeLaRoute(route: string): string | null {
  return ENTREES_DE_LA_CONSOLE.find((e) => e.route === route)?.droit ?? null;
}

/**
 * L'accueil du rôle : la première route LIVRÉE et PERMISE de sa liste de préférence ; `null` sinon,
 * et la page montre alors l'état vide guidant (« ce qui arrive, et quand »). Jamais une route prévue.
 */
export function accueilDuRole(role: ConsoleRole, contexte: Contexte = {}): string | null {
  const livrees = contexte.livrees ?? ROUTES_LIVREES_DE_LA_CONSOLE;
  const autorise = contexte.autorise ?? roleAutorise;
  return (
    PREFERENCES_D_ACCUEIL[role].find((route) => {
      const droit = droitDeLaRoute(route);
      return livrees.includes(route) && droit !== null && autorise(droit, role);
    }) ?? null
  );
}
