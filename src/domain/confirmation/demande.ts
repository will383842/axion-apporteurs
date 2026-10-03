/**
 * DM-40 (REQ-DM-060) — la demande de confirmation par e-mail, dans le domaine : ses états fermés,
 * l'échéance d'envoi et la fenêtre où l'apporteur peut annuler ou corriger son dépôt.
 *
 * L'échéance se DÉRIVE de l'horodatage serveur du dépôt (`deposeeAt`, REQ-DM-005) et de la SSOT
 * (`DELAI_AVANT_ENVOI_CONFIRMATION_MINUTES`) : elle ne se stocke pas (partners/ADR-0022 §8). Le
 * domaine compte en instants ; l'écrivain (`src/server/confirmation/demandes.ts`) porte la base.
 */
import { SEUILS } from '../seuils/ssot';
import type { Instant } from '../temps/horloge';

/** Les états de la demande, liste fermée (REQ-DM-060), dans l'ordre de l'enum. */
export const ETATS_DEMANDE_CONFIRMATION = [
  'planifiee',
  'annulee',
  'envoyee',
  'retenue',
  'rebond',
  'repondue_oui',
  'repondue_non',
  'clic_non_retenu',
  'opposee',
  'expiree',
] as const;
export type EtatDemandeConfirmation = (typeof ETATS_DEMANDE_CONFIRMATION)[number];

/** La forme de l'empreinte d'IP du clic : tronquée, comme les autres empreintes (REQ-SEC-024). */
export const FORME_EMPREINTE_IP_DU_CLIC = /^[0-9a-f]{16}$/;

const MS_PAR_MINUTE = 60_000;

/** L'instant où l'envoi est dû : l'horodatage du dépôt, plus le délai de la SSOT. */
export function echeanceDEnvoi(deposeeAt: Instant): Instant {
  return deposeeAt + SEUILS.DELAI_AVANT_ENVOI_CONFIRMATION_MINUTES.valeur * MS_PAR_MINUTE;
}

/** La fenêtre d'annulation et de correction : ouverte strictement avant l'échéance d'envoi. */
export function fenetreDeCorrectionOuverte(deposeeAt: Instant, maintenant: Instant): boolean {
  return maintenant < echeanceDEnvoi(deposeeAt);
}

/** Le refus nommé d'une correction hors de la fenêtre (HYP-W20-ANNULATION). */
export class CorrectionHorsDelai extends Error {
  readonly code = 'correction_hors_delai';
  constructor() {
    super('correction_hors_delai : la correction libre se fait pendant le délai avant envoi');
    this.name = 'CorrectionHorsDelai';
  }
}

/** Juge une correction du contact ou du contexte : permise dans la fenêtre, refusée ensuite. */
export function jugerCorrection(deposeeAt: Instant, maintenant: Instant): void {
  if (!fenetreDeCorrectionOuverte(deposeeAt, maintenant)) throw new CorrectionHorsDelai();
}

/** Le refus nommé de l'annulation d'une demande qui n'est plus planifiée. */
export class DemandeNonAnnulable extends Error {
  readonly code = 'demande_non_annulable';
  constructor(etat: EtatDemandeConfirmation) {
    super(`demande_non_annulable : ${etat}`);
    this.name = 'DemandeNonAnnulable';
  }
}

/** Seule une demande `planifiee` s'annule : envoyée, elle ne se rattrape plus. */
export function jugerAnnulation(etat: EtatDemandeConfirmation): void {
  if (etat !== 'planifiee') throw new DemandeNonAnnulable(etat);
}
