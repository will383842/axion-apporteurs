/**
 * Le registre des outils de l'adaptateur `partners` (INT-T11, REQ-INT-026).
 *
 * VIDE EN PHASE 0, ET C'EST DIT. Les trois outils de REQ-INT-027 arrivent avec la tâche nommée par
 * `PERIMETRE_VIDE`. Un registre vide n'est pas un registre oublié : le harnais exige cette
 * déclaration tant qu'aucun outil n'est inscrit, et la refuse dès qu'il y en a un
 * (`docs/CONVENTIONS.md` §11 — un périmètre vide se motive et se reprend).
 */
import type { OutilQuelconque } from './contrat';

export const OUTILS: readonly OutilQuelconque[] = [];

export interface DeclarationDePerimetreVide {
  readonly motif: string;
  /** La tâche du registre qui inscrit le premier outil. */
  readonly tache: string;
}

export const PERIMETRE_VIDE: DeclarationDePerimetreVide | null = {
  motif:
    'phase 0 : la porte, la serrure et le contrat sont posés avant tout outil de lecture ; ' +
    'les outils de REQ-INT-027 viennent avec leur tâche',
  tache: 'INT-T13',
};

/**
 * Contrôle 3 — les symboles de la couche service du produit qu'un fichier de l'adaptateur a le droit
 * d'importer, NOMMÉS, par module. Vide tant qu'aucun outil ne lit le produit.
 */
export const SYMBOLES_AUTORISES: readonly {
  readonly module: string;
  readonly symboles: readonly string[];
}[] = [];
