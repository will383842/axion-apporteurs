/**
 * DM-59 (REQ-JUR-065) — les délais d'une demande de droit du contact (RGPD art. 12.3), en Instants.
 *
 * La SSOT est la SEULE source des durées : aucun intervalle littéral en SQL, et l'échéance se
 * DÉRIVE, elle ne se stocke pas (partners/ADR-0022 §8) :
 *   — la réponse est due un mois après la réception (`DROITS_CONTACT_DELAI_REPONSE_MOIS`) ;
 *   — une prolongation de deux mois (`DROITS_CONTACT_PROLONGATION_MOIS`) se pose DANS ce premier
 *     mois, jamais au-delà ;
 *   — la nouvelle valeur d'une rectification ne survit pas à l'échéance, prolongée ou non.
 * Les mois sont CIVILS, en heure de Paris (`ajouterMoisParis`).
 */
import { ajouterMoisParis } from '../attribution/machine';
import { SEUILS } from '../seuils/ssot';
import type { Instant } from '../temps/horloge';

/** La fin du premier mois : la réponse est due, et la prolongation n'est plus possible. */
export function finDuPremierMois(recueAt: Instant): Instant {
  return ajouterMoisParis(recueAt, SEUILS.DROITS_CONTACT_DELAI_REPONSE_MOIS.valeur);
}

/** L'échéance de la valeur : un mois après la réception, trois si le délai a été prolongé. */
export function echeanceDeLaValeur(recueAt: Instant, prolongeeAt: Instant | null): Instant {
  const mois =
    SEUILS.DROITS_CONTACT_DELAI_REPONSE_MOIS.valeur +
    (prolongeeAt === null ? 0 : SEUILS.DROITS_CONTACT_PROLONGATION_MOIS.valeur);
  return ajouterMoisParis(recueAt, mois);
}

/** Le refus nommé d'une prolongation posée hors du premier mois. */
export class ProlongationHorsDelai extends Error {
  readonly code = 'prolongation_hors_delai';
  constructor() {
    super(
      'prolongation_hors_delai : une prolongation se pose dans le premier mois (RGPD art. 12.3)'
    );
    this.name = 'ProlongationHorsDelai';
  }
}

/** Juge une prolongation : permise strictement avant la fin du premier mois, refusée ensuite. */
export function jugerProlongation(recueAt: Instant, maintenant: Instant): void {
  if (maintenant >= finDuPremierMois(recueAt)) throw new ProlongationHorsDelai();
}
