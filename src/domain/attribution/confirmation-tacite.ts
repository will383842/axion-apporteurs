/**
 * DM-24 (REQ-DM-006, REQ-DM-008) — la confirmation tacite, sur le contrat v2, art. 3.2 (arbitrage
 * #319 6035632726 ; précisions de la juriste 6035645682 et 6036770037).
 *
 * LA RÈGLE. Une attribution provisoire est réputée confirmée `CONFIRMATION_TACITE_JOURS` jours
 * civils (heure de Paris) après le PREMIER message de la Société non retourné en erreur, pour TOUTE
 * attribution : aucun régime de vérification ne la retarde ni ne l'empêche.
 *   — Défaut de prise de contact : sans message dans `PRISE_DE_CONTACT_SOCIETE_JOURS` jours de
 *     l'enregistrement, le délai court de l'expiration de ce délai, même sans message. Un message
 *     envoyé plus tard ne le repousse pas : la Société ne tire pas avantage de son propre retard.
 *   — Message en erreur : tant qu'il revient en erreur sans adresse corrigée, le délai ne court pas
 *     (la fin à `LIBERATION_SIGNALEE_JOURS` de la déclaration relève de DM-72). Une adresse corrigée
 *     fait courir le délai DE SA COMMUNICATION, même si la Société tarde à renvoyer ; une nouvelle
 *     erreur le suspend de nouveau.
 *
 * LES DONNÉES (DM-40). Un message de la Société est une émission de la demande. Une correction après
 * erreur révoque l'émission active et en crée une autre dans la même transaction
 * (`emettreDeNouveau`) : l'instant de révocation est donc celui où l'adresse corrigée a été
 * communiquée. L'erreur EN COURS se lit sur l'état `rebond` de la demande.
 *
 * Ce module ne dit que QUAND. Ce qui précède la confirmation (une réponse, un rendez-vous ou un
 * échange la rend définitive aussitôt ; un démenti exprès l'éteint) relève d'autres transitions : le
 * passage ne promeut qu'une attribution encore provisoire.
 */
import { SEUILS } from '../seuils/ssot';
import type { EtatDemandeConfirmation } from '../confirmation/demande';
import type { Instant } from '../temps/horloge';
import { ajouterJoursCivilsParis } from '../temps/sla';

/** Un message de la Société : son envoi, et l'instant où une adresse corrigée l'a remplacé. */
export type MessageDeLaSociete = {
  readonly emiseAt: Instant;
  readonly revoqueeAt: Instant | null;
};

/** Les faits que la règle lit, et RIEN d'autre : ni raison de vérification, ni rythme. */
export type FaitsDeLaConfirmationTacite = {
  /** L'horodatage serveur de l'enregistrement de la déclaration (REQ-DM-005). */
  readonly deposeeAt: Instant;
  /** L'état de la demande ; `null` quand aucune demande n'existe encore. */
  readonly etatDeLaDemande: EtatDemandeConfirmation | null;
  readonly emissions: readonly MessageDeLaSociete[];
};

/**
 * Le départ du délai de confirmation, ou `null` s'il ne court pas (un message en erreur, non
 * corrigé). PURE.
 */
export function departDuDelaiDeConfirmation(f: FaitsDeLaConfirmationTacite): Instant | null {
  const finDeLaPriseDeContact = ajouterJoursCivilsParis(
    f.deposeeAt,
    SEUILS.PRISE_DE_CONTACT_SOCIETE_JOURS.valeur
  );
  const premier = Math.min(...f.emissions.map((e) => e.emiseAt));
  // Aucun message dans le délai de prise de contact : le délai court de son expiration.
  if (!(premier <= finDeLaPriseDeContact)) return finDeLaPriseDeContact;
  return departApresUnContactDansLeDelai(f);
}

/**
 * La Société a écrit dans le délai. Branche ISOLÉE (coordination, 6036770037) : un message en erreur
 * suspend ; la dernière adresse corrigée communiquée fait courir le délai ; sinon, le premier message.
 */
function departApresUnContactDansLeDelai(f: FaitsDeLaConfirmationTacite): Instant | null {
  if (f.etatDeLaDemande === 'rebond') return null;
  const corrections = f.emissions.flatMap((e) => (e.revoqueeAt === null ? [] : [e.revoqueeAt]));
  if (corrections.length > 0) return Math.max(...corrections);
  return Math.min(...f.emissions.map((e) => e.emiseAt));
}

/** L'échéance : le départ plus `CONFIRMATION_TACITE_JOURS` jours civils de Paris ; `null` sans départ. */
export function echeanceDeLaConfirmationTacite(f: FaitsDeLaConfirmationTacite): Instant | null {
  const depart = departDuDelaiDeConfirmation(f);
  return depart === null
    ? null
    : ajouterJoursCivilsParis(depart, SEUILS.CONFIRMATION_TACITE_JOURS.valeur);
}

/** Due à l'échéance, pas avant : le passage promeut « tout ce qui est dû à l'instant t ». */
export function confirmationTaciteDue(
  f: FaitsDeLaConfirmationTacite,
  maintenant: Instant
): boolean {
  const echeance = echeanceDeLaConfirmationTacite(f);
  return echeance !== null && maintenant >= echeance;
}
