/**
 * acces-espace.ts — quels statuts d'apporteur ouvrent l'espace, et jusqu'où (SEC-03, SEC-43).
 *
 * UN SEUL VERDICT, défaut FERMÉ : un statut absent de la liste blanche, inconnu ou mal orthographié
 * ne donne pas accès.
 *   — `plein` : `signe` et `suspendu` — la suspension déconnecte mais ne coupe pas l'accès
 *     (REQ-SEC-032) ;
 *   — `limite` : `kyc_en_cours` et `pret_a_signer` — l'apporteur entre, mais ne voit que « Ma
 *     conformité » et « Mon contrat » (décision D1 de Williams du 2026-10-01, qui amende
 *     HYP-SEC03-ACCES) ;
 *   — `ferme` : tout le reste. `resilie` y est : la lecture seule après résiliation est un autre
 *     niveau, que sa tâche ajoutera.
 *
 * Les listes vivent DANS les fonctions, jamais en constantes de module : une constante est évaluée
 * au chargement, avant toute activation d'un mutant, et Stryker y laisse survivre un mutant que
 * chaque test tuerait (SEC-17). Un statut ABSENT (`null`, apporteur introuvable) se juge ici, fermé.
 */

/** Le niveau d'accès à l'espace. */
export type NiveauDAcces = 'plein' | 'limite' | 'ferme';

export function niveauDAcces(statut: string | null): NiveauDAcces {
  if (statut === 'signe' || statut === 'suspendu') return 'plein';
  if (statut === 'kyc_en_cours' || statut === 'pret_a_signer') return 'limite';
  return 'ferme';
}

/** Vrai si le statut ouvre l'espace, pleinement ou en ouverture limitée. */
export function peutOuvrirLEspace(statut: string | null): boolean {
  return niveauDAcces(statut) !== 'ferme';
}

/**
 * Vrai si la route (son premier segment sous l'espace, `docs/ESPACE-ROUTES.md`) répond à ce niveau.
 * En ouverture limitée, la LISTE BLANCHE : « Ma conformité » et « Mon contrat », et rien d'autre —
 * une route ajoutée plus tard est refusée sans que cette fonction change.
 */
export function routeOuverte(niveau: NiveauDAcces, segment: string): boolean {
  if (niveau === 'plein') return true;
  if (niveau === 'limite') return segment === 'conformite' || segment === 'mon-contrat';
  return false;
}
