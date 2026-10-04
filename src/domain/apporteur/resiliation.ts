/**
 * SEC-19 (REQ-JUR-006, REQ-DM-011) — les règles PURES de la fin du contrat d'apporteur.
 *
 * LA MISE EN DEMEURE (art. 11.2, forme d'A02 sur #703). Elle vise un article d'une liste FERMÉE, les
 * seuls que l'art. 11.2 nomme. C'est un fait daté, PAS un antécédent : aucune règle ne compte les
 * mises en demeure ; la résiliation pour manquement ne lit que celle de l'article en cause.
 */

/** Les seuls articles que vise l'art. 11.2 : la liste FERMÉE de la juriste (#703, 5980966503). */
export const ARTICLES_MISE_EN_DEMEURE = ['3.7', '6', '7', '8', '9', '23'] as const;
export type ArticleMiseEnDemeure = (typeof ARTICLES_MISE_EN_DEMEURE)[number];
