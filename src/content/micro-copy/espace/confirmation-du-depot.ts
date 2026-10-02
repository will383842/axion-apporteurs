/**
 * La confirmation d'un dépôt par e-mail, côté apporteur (W20 : REQ-UX-060, REQ-UX-061, REQ-UX-062,
 * REQ-JUR-039). Textes de `docs/chantiers/W20-confirmation-par-email.md` §1 et §4, repris mot pour
 * mot ; les variables sont entre accolades et remplies par l'écran.
 *
 * Rien ici n'est une consigne : le message avant le bouton INFORME (REQ-JUR-039). Un champ exigé
 * n'est jamais marqué ; seul le facultatif le dit (REQ-JUR-037). Le délai tacite n'est jamais retapé :
 * `{delaiTacite}` est lu dans la SSOT (`CONFIRMATION_TACITE_JOURS`) par l'écran.
 */

/** Le formulaire de dépôt : le contact rencontré, le message avant le bouton, le bouton. */
export const FORMULAIRE_DU_CONTACT = {
  titre: 'Qui avez-vous rencontré ?',
  nom: 'Nom et prénom',
  fonction: 'Fonction',
  courriel: 'E-mail',
  telephone: 'Téléphone',
  contexte: 'Contexte (facultatif)',
  // La fin « Axion-IA pourra aussi l'appeler. » : question 15 du plan, valeur par défaut confirmée
  // par Williams le 2026-09-29.
  messageAvantLeBouton:
    "{prenomContact} {nomContact} ({entreprise}) va recevoir un e-mail d'Axion-IA dans les {delaiAvantEnvoi} pour confirmer votre échange. Axion-IA pourra aussi l'appeler.",
  bouton: 'Déposer et prévenir {prenomContact} {nomContact}',
  /** Le repli du bouton tant que le nom est vide, ou trop long pour 320 px. */
  boutonCourt: 'Déposer et prévenir',
} as const;

/** La carte du dépôt, avant et après l'envoi (UX-P1-43). */
export const CARTE_DU_DEPOT = {
  avantEnvoi:
    "L'e-mail partira vers {heure}. Vous pouvez encore annuler ou corriger ce dépôt jusque-là.",
  annuler: 'Annuler',
  corriger: 'Corriger',
  envoye: 'E-mail envoyé à {prenomContact} {nomContact}',
  confirme: '{prenomContact} {nomContact} a confirmé votre échange',
  rebond:
    "L'e-mail n'a pas pu être remis à {adresse}. Si vous avez une autre adresse pour {prenomContact} {nomContact}, vous pouvez la corriger ici. Axion-IA pourra aussi l'appeler.",
  corrigerLAdresse: "Corriger l'adresse",
} as const;

/**
 * Le badge unique de chaque dépôt (REQ-UX-062, HYP-W20-BADGE). La pastille est décorative : le
 * libellé porte seul le sens (REQ-UX-017). Le 🟡 daté : libellé choisi par Williams le 2026-10-01
 * (option A). `{date}` est le jour de l'échéance en toutes lettres, dans le fuseau de l'apporteur.
 */
export const BADGES_DU_DEPOT = {
  confirmee: 'Confirmée',
  enAttenteDatee: 'En attente · confirmée automatiquement le {date}',
  enAttente: 'En attente',
  enAttenteSignalee: 'En attente de confirmation — Axion-IA va appeler votre contact',
  courrielNonRecu: 'E-mail non reçu par le contact',
  nonConfirmee: 'Non confirmée par le contact',
  reservationTerminee: "Réservation terminée · l'entreprise est de nouveau disponible",
} as const;

/**
 * PROPOSITION, à valider par Williams en séance (point 7 du 2026-10-02) : la phrase d'aide unique,
 * sous le 🟡 daté et sous 🔴, jamais sous la demande signalée.
 */
export const AIDE_DU_BADGE =
  'Sans réponse de votre contact, votre dépôt est confirmé {delaiTacite} après la réception de notre e-mail.';

/** Pendant la carence après une libération (question 20) : sans consigne, sans « Déposer ». */
export const CARENCE_DU_REDEPOT =
  'Vous pourrez déposer cette entreprise à nouveau à partir du {date}.';
