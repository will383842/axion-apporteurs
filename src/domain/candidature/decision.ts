/**
 * CPL-T06 — l'étape 3 du cycle : la DÉCISION sur une candidature (REQ-CPL-006 ; cadrage de
 * l'architecte du 2026-09-26, partners/ADR-0022).
 *
 * PUR. Ce module ne lit ni la base ni l'heure : il rend ce qu'il faut écrire — la ligne de
 * `decisions_candidature`, le statut d'arrivée de l'apporteur, et la charge de son changement de
 * statut (type `apporteur_statut_modifie`, `src/domain/evenement/charges.ts`). L'écrivain les pose
 * dans UNE transaction.
 *
 * LA MATRICE DÉCIDE, PAS CE MODULE. Un résultat se traduit en un code de transition de la matrice
 * (`retenir`, `mettre_en_vivier`, `refuser`), et c'est `transitionner` qui juge le couple : décider
 * sur un apporteur déjà retenu, refusé ou plus loin lève `ErreurTransitionApporteur`. Aucun contrat ne
 * part sans `retenu` : la matrice n'ouvre le KYC, donc la signature, que depuis `retenu`.
 *
 * LA PRÉSENCE AU WEBINAIRE EST DÉCLARATIVE ET INFORMATIVE (REQ-JUR-013). Elle est inscrite telle que
 * déclarée — oui, non, ou inconnue (`null`) — et rien ne la lit : ni la transition, ni la charge.
 */
import { transitionner } from '../apporteur/matrice';
import type { EvenementApporteur, StatutApporteur } from '../apporteur/statut';

/** Les trois résultats, dans l'ordre de REQ-CPL-006 ; l'enum `ResultatDecisionCandidature` du schéma. */
export const RESULTATS_DECISION_CANDIDATURE = ['retenu', 'vivier', 'refuse'] as const;

export type ResultatDecisionCandidature = (typeof RESULTATS_DECISION_CANDIDATURE)[number];

/** Le code de la matrice qui porte chaque résultat. */
export const TRANSITION_DU_RESULTAT = {
  retenu: 'retenir',
  vivier: 'mettre_en_vivier',
  refuse: 'refuser',
} as const satisfies Record<ResultatDecisionCandidature, EvenementApporteur>;

export class ErreurDecisionCandidature extends Error {
  constructor(detail: string) {
    super(`decision_refusee : ${detail}`);
    this.name = 'ErreurDecisionCandidature';
  }
}

export interface DemandeDecision {
  readonly statutActuel: StatutApporteur;
  readonly resultat: ResultatDecisionCandidature;
  /** Le motif de la décision (REQ-CPL-006) : exigé, jamais vide. */
  readonly justification: string;
  /** Déclaratif et informatif : `null` quand la présence n'est pas connue. */
  readonly webinaireSuivi: boolean | null;
  /** L'utilisateur de la console qui décide. */
  readonly auteurId: string;
  readonly decideeAt: Date;
}

export interface DecisionRendue {
  readonly decision: {
    readonly resultat: ResultatDecisionCandidature;
    readonly justification: string;
    readonly webinaireSuivi: boolean | null;
    readonly auteurId: string;
    readonly decideeAt: Date;
  };
  readonly statut: StatutApporteur;
  readonly chargeStatut: {
    readonly de: StatutApporteur;
    readonly vers: StatutApporteur;
    readonly transition: EvenementApporteur;
    readonly acteur: { readonly par: 'utilisateur_console'; readonly id: string };
  };
}

export function deciderCandidature(d: DemandeDecision): DecisionRendue {
  if (d.justification.trim() === '') throw new ErreurDecisionCandidature('justification_vide');
  const transition = TRANSITION_DU_RESULTAT[d.resultat];
  const { statut } = transitionner({
    de: d.statutActuel,
    evenementApporteur: transition,
    motif: null,
  });
  return {
    decision: {
      resultat: d.resultat,
      justification: d.justification,
      webinaireSuivi: d.webinaireSuivi,
      auteurId: d.auteurId,
      decideeAt: d.decideeAt,
    },
    statut,
    chargeStatut: {
      de: d.statutActuel,
      vers: statut,
      transition,
      acteur: { par: 'utilisateur_console', id: d.auteurId },
    },
  };
}
