/**
 * La case d'information du contact au dépôt (REQ-JUR-008, W20 : `docs/chantiers/W20-confirmation-
 * par-email.md` §6, décision de Williams du 2026-09-29). Le texte est repris MOT POUR MOT ; sa
 * version est enregistrée sur chaque attribution déposée (`information_tiers_version`), pour que le
 * texte accepté reste opposable après une réécriture.
 *
 * Changer le texte, c'est changer la version : jamais l'un sans l'autre.
 */

/** La version du texte, enregistrée au dépôt (32 caractères au plus, colonne de la base). */
export const VERSION_INFORMATION_TIERS = 'w20-2026-09-29';

/** Le texte de la case, cochée par l'apporteur avant le dépôt (e-mail et téléphone). */
export const CASE_INFORMATION_TIERS = "Cette personne sait qu'Axion-IA va la contacter.";
