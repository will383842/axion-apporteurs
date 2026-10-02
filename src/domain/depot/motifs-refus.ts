/**
 * `MotifRefusDepot` — le motif d'un dépôt refusé, colonne `motif` de `depots_refuses` (DM-07,
 * REQ-SEC-022, REQ-DM-043).
 *
 * SEPT VALEURS EXACTEMENT. Six sont les refus de catégorie que l'apporteur voit (`ISSUES_DE_REFUS`,
 * `src/domain/depot/issue-depot.ts`) ; la septième, `insincerite`, est un refus que l'espace ne
 * nomme jamais comme tel. La constante est confrontée à l'enum du schéma généré, et les refus de
 * catégorie à elle, par `tests/unit/securite/acces-scope.spec.ts` : une huitième valeur, ou une
 * issue de refus sans motif stocké, rougit.
 */
import { ISSUES_DE_REFUS } from './issue-depot';

export const MOTIFS_REFUS_DEPOT = [
  'anteriorite_client',
  'anteriorite_devis',
  'etablissement_cesse',
  'entreprise_hors_perimetre',
  'file_complete',
  'opposition_demarchage',
  'insincerite',
] as const;

/** Le motif d'un refus de dépôt — dérivé de la constante, jamais retapé. */
export type MotifRefusDepot = (typeof MOTIFS_REFUS_DEPOT)[number];

/**
 * Chaque issue de refus de catégorie EST un motif stocké : le type le vérifie à la compilation,
 * sans qu'aucune liste ne soit recopiée.
 */
export const ISSUES_DE_REFUS_STOCKEES: readonly MotifRefusDepot[] = ISSUES_DE_REFUS;
