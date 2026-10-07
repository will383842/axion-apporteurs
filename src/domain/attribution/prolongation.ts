/**
 * EXT-T07 (REQ-EXT-020 ; contrat v2, art. 3.4 al. 3 ; forme d'A02 #809 6039895839, amendée 6039970008 ;
 * juriste #809 6039901134 ; arbitrage de la coordination #809 6039931639) — la prolongation de
 * l'attribution, en règles PURES.
 *
 * Le contrat prolonge l'attribution UNE fois, sans démarche de l'Apporteur, si une condition de la Société
 * est remplie au terme. En phase 1, Partners n'a pas les données de ces conditions : un administrateur
 * décide, depuis une liste qui s'ouvre avant le terme, de PROLONGER (une condition) ou de CONSTATER
 * qu'aucune n'est remplie. Sans décision au terme, l'attribution est RÉPUTÉE PROLONGÉE : la Société ne
 * peut pas opposer à l'Apporteur son propre défaut de décision (juriste). La prolongation, réputée ou
 * décidée, vaut une fois ; à son terme, l'attribution expire, sans seconde prolongation.
 *
 * Aucune durée n'est écrite ici : la durée de la prolongation et l'avance de la liste sont lues dans la
 * SSOT. Le terme est `fenetreFinAt`, RECULÉ par la prolongation dans la même écriture (garde de la base).
 */
import { SEUILS } from '../seuils/ssot';
import { MS_PAR_JOUR } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { ajouterMoisParis, type EtatAttribution } from './machine';

/** Les trois conditions de l'art. 3.4 al. 3, posées par un administrateur (noms de la juriste). */
export const CONDITIONS_DECIDEES = [
  'devis_en_cours',
  'echange_recent',
  'financement_en_instruction',
] as const;
export type ConditionDecidee = (typeof CONDITIONS_DECIDEES)[number];

/** L'enum de la base (`condition_prolongation`) : les trois conditions, et la prolongation réputée. */
export const CONDITIONS_PROLONGATION = [...CONDITIONS_DECIDEES, 'reputee'] as const;
export type ConditionProlongation = (typeof CONDITIONS_PROLONGATION)[number];

/**
 * Les états d'une attribution qui court vers son terme : ceux que le passage au terme (DM-13) fait
 * expirer. Une attribution dans un autre état n'a rien à décider.
 */
export const ETATS_A_TERME: readonly EtatAttribution[] = [
  'active',
  'rdv_pris',
  'proposition',
  'signee',
  'convertie',
];

/** Ce que la prolongation lit d'une attribution : son état, son terme et ses deux décisions. */
export interface FaitsDeProlongation {
  readonly statut: EtatAttribution;
  readonly fenetreFinAt: Instant | null;
  readonly prolongeeAt: Instant | null;
  readonly prolongationRefuseeAt: Instant | null;
}

export const estUneConditionDecidee = (c: unknown): c is ConditionDecidee =>
  (CONDITIONS_DECIDEES as readonly unknown[]).includes(c);

/** Le nouveau terme : le terme reculé de la durée de la SSOT, en mois civils de Paris. */
export function termeProlonge(fenetreFinAt: Instant): Instant {
  return ajouterMoisParis(fenetreFinAt, SEUILS.PROLONGATION_DEVIS_MOIS.valeur);
}

/** L'instant où une attribution entre dans la liste « à décider » : l'avance de la SSOT avant le terme. */
export function ouvertureDeLaDecision(fenetreFinAt: Instant): Instant {
  return fenetreFinAt - SEUILS.PROLONGATION_DECISION_AVANCE_JOURS.valeur * MS_PAR_JOUR;
}

export type RefusDeLaDecision = 'deja_decidee' | 'terme_passe' | 'sans_objet';

/**
 * Une décision de la console (prolonger ou constater) est-elle ouverte ? Dans l'ordre : une décision
 * déjà posée, réputée comprise (`deja_decidee`) ; le terme atteint, où la prolongation est réputée
 * (`terme_passe`) ; une attribution sans terme, hors des états à terme, ou pas encore dans la liste
 * (`sans_objet`). `null` : la décision est ouverte.
 */
export function refusDeLaDecision(
  f: FaitsDeProlongation,
  maintenant: Instant
): RefusDeLaDecision | null {
  if (f.prolongeeAt !== null || f.prolongationRefuseeAt !== null) return 'deja_decidee';
  if (f.fenetreFinAt === null || !ETATS_A_TERME.includes(f.statut)) return 'sans_objet';
  if (maintenant >= f.fenetreFinAt) return 'terme_passe';
  if (maintenant < ouvertureDeLaDecision(f.fenetreFinAt)) return 'sans_objet';
  return null;
}

export type IssueAuTerme = 'pas_encore' | 'expirer' | 'reputer_prolongee';

/**
 * L'issue du passage au terme (appelée par DM-13, sous son verrou). Avant le terme : rien. Au terme :
 * EXPIRER si le constat est posé, ou si la prolongation l'est déjà (son terme reculé est atteint, il n'y
 * en a pas de seconde) ; sinon la prolongation est RÉPUTÉE (échec fermé du côté de l'Apporteur).
 */
export function issueAuTerme(
  f: Pick<FaitsDeProlongation, 'fenetreFinAt' | 'prolongeeAt' | 'prolongationRefuseeAt'>,
  maintenant: Instant
): IssueAuTerme {
  if (f.fenetreFinAt === null || maintenant < f.fenetreFinAt) return 'pas_encore';
  if (f.prolongationRefuseeAt !== null || f.prolongeeAt !== null) return 'expirer';
  return 'reputer_prolongee';
}
