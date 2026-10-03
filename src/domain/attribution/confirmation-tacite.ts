/**
 * DM-24 (REQ-DM-042, HYP-W20-TACITE, HYP-C1) — les règles PURES de la confirmation tacite.
 *
 * LA RÈGLE, tranchée par Williams le 2026-09-29 (question 2). Au bout de `CONFIRMATION_TACITE_JOURS`
 * jours sans réponse du contact et sans appel concluant, l'attribution `provisoire` est réputée
 * confirmée. Le délai court de la RÉCEPTION de l'e-mail : un envoi auquel aucun rebond n'est
 * rattaché. Tant que la demande est planifiée, retenue ou en rebond non corrigé, il ne commence
 * pas ; une correction fait repartir l'e-mail, et le délai court de ce nouvel envoi.
 *
 * LA RÉCEPTION. Une demande est REÇUE quand elle est `envoyee` : ni rebond, ni réponse, ni clic non
 * retenu, ni opposition. `envoyeeAt` est l'instant de son DERNIER envoi — l'envoi le réécrit à
 * chaque émission ; un rebond rattaché après coup fait passer la demande en `rebond`, et lui retire
 * ainsi sa qualité de réception. Un clic « Oui » retenu (`repondue_oui`) ou un « Non » confirmé
 * empêchent la promotion comme une Qualification.
 *
 * LA DEMANDE SIGNALÉE (question 18). Une demande qui porte une raison de vérification à l'échéance
 * n'est JAMAIS promue par le seul silence : le prédicat est celui de SEC-41, lu par l'appelant et
 * reçu ici, jamais recopié. Sans appel concluant, c'est la libération qui la clôt (question 19).
 *
 * LE PORTEUR. Un conseiller ne déclenche jamais la confirmation tacite (W19) : il n'est pas
 * sélectionné, et la machine refuserait sa transition.
 */
import { SEUILS } from '../seuils/ssot';
import type { Instant } from '../temps/horloge';
import { ajouterJoursCivilsParis } from '../temps/sla';
import type { EtatDemandeConfirmation } from '../confirmation/demande';
import type { EtatAttribution, TypePorteur } from './machine';

/** Les états d'une demande REÇUE : envoyée, sans rebond, sans réponse. */
export const ETATS_DE_DEMANDE_RECUE = [
  'envoyee',
] as const satisfies readonly EtatDemandeConfirmation[];

/** L'instant de la réception, ou `null` : aucune échéance ne court. */
export function recueAt(demande: {
  readonly etat: EtatDemandeConfirmation;
  readonly envoyeeAt: Instant | null;
}): Instant | null {
  return (ETATS_DE_DEMANDE_RECUE as readonly EtatDemandeConfirmation[]).includes(demande.etat)
    ? demande.envoyeeAt
    : null;
}

/** L'échéance : la réception plus `CONFIRMATION_TACITE_JOURS` jours civils, à la même heure de Paris. */
export function echeanceTacite(recue: Instant): Instant {
  return ajouterJoursCivilsParis(recue, SEUILS.CONFIRMATION_TACITE_JOURS.valeur);
}

/**
 * La promotion est-elle due à l'instant `maintenant` ? « Tout ce qui est dû à l'instant t »
 * (REQ-QA-027) : l'échéance atteinte, pas un jour de passage.
 */
export function promotionTaciteDue(p: {
  readonly statut: EtatAttribution;
  readonly porteur: TypePorteur;
  readonly demande: {
    readonly etat: EtatDemandeConfirmation;
    readonly envoyeeAt: Instant | null;
  } | null;
  readonly signalee: boolean;
  readonly maintenant: Instant;
}): boolean {
  if (p.statut !== 'provisoire' || p.porteur !== 'apporteur' || p.demande === null) return false;
  if (p.signalee) return false;
  const recue = recueAt(p.demande);
  return recue !== null && p.maintenant >= echeanceTacite(recue);
}
