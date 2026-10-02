/**
 * ux-ecrans.ts — GOV-113 (REQ-UX-047, REQ-UX-019) : ce qu'est une tâche d'écran, et ce que sont les
 * cinq états d'une maquette. MODULE PUR, sans point d'entrée : `scripts/gates/maquettes-validees.ts`, déjà câblé en
 * porte A, l'importe et en tire trois familles (arbitrage de la gouvernance du 2026-10-01).
 *
 * UNE TÂCHE D'ÉCRAN (arbitrage de la gouvernance, rattrapage 44) : elle déclare une page sous
 * `src/app/(espace)` ou `src/app/(console)` — un `page.tsx`, ou un dossier qui en contiendra — OU elle
 * est nommée dans la colonne « Tâche » d'un tableau de routes de `docs/ESPACE-ROUTES.md` ou de
 * `docs/CONSOLE-ROUTES.md`. Un `error.tsx`, un `loading.tsx` ou un `not-found.tsx` seul n'en fait pas
 * une. La prose des cartes n'est jamais lue : une tâche qui PRODUIT des maquettes y est citée sans être
 * un écran.
 *
 * LES CINQ ÉTATS (REQ-UX-047 point 3, REQ-UX-019 amendée) se lisent dans la MAQUETTE, par l'identifiant
 * de ses sections d'état : au minimum un état vide, un chargement, une erreur, et pour la console un
 * accès refusé ; le nominal est l'écran lui-même. Chaque famille a ses alias, NOMMÉS ici : un nom
 * d'état qui n'y figure pas ne compte pas, et l'ajouter est un geste relu.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Le schéma du registre, résolu depuis CE module : la garde le lit même lancée hors de la racine. */
const SCHEMA_DU_REGISTRE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'lot',
  'tasks.schema.json'
);

/** Le motif d'identifiant de tâche, LU dans le schéma du registre (RM-01), jamais retapé. */
export function motifIdentifiant(schema = readFileSync(SCHEMA_DU_REGISTRE, 'utf8')): RegExp {
  const m = /"pattern"\s*:\s*"\^(\[A-Z\][^"]*)\$"/.exec(schema);
  if (!m)
    throw new Error('scripts/lot/tasks.schema.json : motif d’identifiant de tâche introuvable');
  return new RegExp(`\\b${m[1]!.replace(/\\\\/g, '\\')}\\b`, 'g');
}

const RACINE_D_ECRAN = /^src\/app\/\((?:espace|console)\)\//;
const FICHIERS_QUI_NE_SONT_PAS_DES_ECRANS = /\/(?:error|loading|not-found|layout|template)\.tsx$/;

/** Vrai si un chemin déclaré désigne une page : un `page.tsx`, ou un dossier, sous un groupe d'écrans. */
export function cheminDEcran(chemin: string): boolean {
  if (!RACINE_D_ECRAN.test(chemin) || FICHIERS_QUI_NE_SONT_PAS_DES_ECRANS.test(chemin))
    return false;
  return chemin.endsWith('/') || /\/page\.tsx$/.test(chemin);
}

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Les tâches nommées dans la colonne « Tâche » des tableaux de routes d'une carte — jamais la prose. */
export function tachesDeLaCarte(carte: string, motif: RegExp): Set<string> {
  const ids = new Set<string>();
  let colonne = -1;
  for (const ligne of carte.split('\n')) {
    if (!ligne.trimStart().startsWith('|')) {
      colonne = -1;
      continue;
    }
    const c = cellules(ligne);
    if (colonne < 0) {
      const aRoute = c.some((x) => /^Route\b/.test(x));
      colonne = aRoute ? c.findIndex((x) => /^T[âa]che$/.test(x)) : -1;
      if (colonne < 0) colonne = -2;
      continue;
    }
    if (colonne === -2 || /^-+$/.test(c[0] ?? '')) continue;
    for (const id of (c[colonne] ?? '').match(new RegExp(motif.source, 'g')) ?? []) ids.add(id);
  }
  return ids;
}

export type TacheDuRegistre = {
  id: string;
  statut: string;
  owner: string | null;
  reqs?: readonly string[];
  paths?: readonly string[];
};

/** Les tâches d'écran du registre : une page déclarée, ou une ligne d'une carte de routes. */
export function tachesDEcran<T extends TacheDuRegistre>(
  taches: readonly T[],
  desCartes: Set<string>
): T[] {
  return taches.filter((t) => desCartes.has(t.id) || (t.paths ?? []).some(cheminDEcran));
}

/**
 * Les familles d'états exigées, et leurs alias d'identifiant de section — NOMMÉS, jamais devinés, et
 * EXACTS : un alias n'appartient qu'à une famille (témoin dans `ux-ecrans.spec.ts`), et une vue propre
 * à un rôle (`etat-lecteur`, `etat-qualifieur`) n'est pas un accès refusé.
 */
export const FAMILLES_D_ETATS = {
  vide: [
    'etat-vide',
    'etat-premier-jour',
    'etat-aucune',
    'etat-adresse',
    'etat-lien-inconnu',
    'etat-filtre-vide',
  ],
  chargement: ['etat-chargement', 'etat-envoi'],
  erreur: ['etat-erreur', 'etat-erreurs', 'etat-erreur-envoi', 'etat-service-indisponible'],
  refus: ['etat-refuse', 'etat-ecran'],
} as const;
export type FamilleDEtat = keyof typeof FAMILLES_D_ETATS;

/** La console exige en plus l'accès refusé ; l'espace n'a pas de rôles. */
export const familleExigees = (console: boolean): FamilleDEtat[] =>
  console ? ['vide', 'chargement', 'erreur', 'refus'] : ['vide', 'chargement', 'erreur'];

/**
 * Les états d'une maquette (arbitrage iii) : une section ne COMPTE comme état que par son
 * `aria-label` « État : … » ; sa famille se lit ensuite par son identifiant, nommé ci-dessus —
 * l'étiquette est un titre libre, l'identifiant est ce que les liens `#etat-…` désignent.
 */
export function etatsDe(html: string): string[] {
  return [...html.matchAll(/<section\s+class="ecran"\s+id="([^"]+)"([^>]*)>/g)]
    .filter((m) => /\saria-label="État : [^"]+"/.test(m[2]!))
    .map((m) => m[1]!);
}

/**
 * Les familles SANS OBJET pour une maquette précise, chacune avec sa raison : une exception nommée,
 * jamais un alias élargi. En ajouter une est un geste relu.
 */
export const FAMILLES_SANS_OBJET: Readonly<
  Record<string, Readonly<Partial<Record<FamilleDEtat, string>>>>
> = {
  'acces-refuse.html': {
    vide: 'la page EST l’accès refusé : elle ne liste rien dont l’absence ferait un état vide',
  },
};

/** Les familles d'états qu'une maquette ne montre pas. */
export function etatsManquants(html: string, console: boolean, fichier = ''): FamilleDEtat[] {
  const ids = new Set(etatsDe(html));
  const sansObjet = FAMILLES_SANS_OBJET[fichier] ?? {};
  return familleExigees(console).filter(
    (f) => !Object.hasOwn(sansObjet, f) && !FAMILLES_D_ETATS[f].some((alias) => ids.has(alias))
  );
}

/**
 * Les maquettes antérieures à la règle (point 6, non rétroactif), chacune avec sa raison. Une maquette
 * qui en sort est jugée comme les autres ; en ajouter une est un geste relu, jamais une échappatoire.
 */
export const NON_RETROACTIVES: Readonly<Record<string, string>> = {
  'accueil.html':
    'validée par Will le 2026-09-19, avant la règle : pas d’état d’erreur, le hors-ligne en tient lieu',
  'mes-commissions.html':
    'validée par Will le 2026-09-19, avant la règle : pas d’état d’erreur, le hors-ligne en tient lieu',
  'conformite.html': 'validée par Will le 2026-09-19, avant la règle : pas d’état vide distinct',
  'lot-paiement.html': 'phase 2, refaite par UX-P2-14 : pas d’état d’erreur',
};
