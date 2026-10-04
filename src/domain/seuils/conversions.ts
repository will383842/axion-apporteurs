/**
 * `conversions.ts` — les constantes qui convertissent un seuil de la SSOT en secondes. (GOV-149, REQ-SEC-016)
 *
 * UNE TABLE FERMÉE. Un compteur de débit dont la fenêtre est LUE EN SSOT l'écrit
 * `SEUILS.<NOM>.valeur * <CONSTANTE>`, sans aucun littéral numérique : la conversion passe par une
 * constante nommée d'ici, celle que la table associe à l'`unite` du seuil. La garde
 * `scripts/gates/rate-famille.ts` lit cette table : une constante absente, ou qui ne correspond pas
 * à l'unité du seuil, rougit (`facteur_d_unite_faux`).
 *
 * Une unité sans durée fixe (`mois`, `ans`) n'y figure pas, et n'y figurera pas : une fenêtre de
 * débit se mesure en minutes ou en jours.
 */
import type { UniteDeSeuil } from './ssot';

export const SECONDES_PAR_MINUTE = 60;
export const SECONDES_PAR_JOUR = 86_400;

/** L'unité d'un seuil, et la SEULE constante qui la convertit en secondes. */
export const CONVERSIONS_EN_SECONDES = {
  minutes: { constante: 'SECONDES_PAR_MINUTE', valeur: SECONDES_PAR_MINUTE },
  jours: { constante: 'SECONDES_PAR_JOUR', valeur: SECONDES_PAR_JOUR },
} as const satisfies Partial<
  Record<UniteDeSeuil, { readonly constante: string; readonly valeur: number }>
>;

export type Conversion = { readonly constante: string; readonly valeur: number };

/**
 * La conversion d'une unité, lue dans la table et nulle part ailleurs. L'unité vient d'un seuil lu
 * à l'exécution : une clé héritée du prototype (`constructor`, `toString`…) n'est PAS une unité de
 * la table, et rend `undefined` comme une unité absente (échec fermé).
 */
export function conversionDeLUnite(unite: string): Conversion | undefined {
  return Object.hasOwn(CONVERSIONS_EN_SECONDES, unite)
    ? (CONVERSIONS_EN_SECONDES as Readonly<Record<string, Conversion>>)[unite]
    : undefined;
}
