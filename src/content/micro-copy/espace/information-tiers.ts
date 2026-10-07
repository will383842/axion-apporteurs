/**
 * La case d'information du contact au dépôt (REQ-JUR-008, W20 : `docs/chantiers/W20-confirmation-
 * par-email.md` §6, décision de Williams du 2026-09-29). Le texte est repris MOT POUR MOT.
 *
 * Sa VERSION n'est pas écrite ici : le serveur la DÉRIVE du texte (`versionDeLInformationDesTiers`,
 * `src/server/depot/deposer.ts`) et l'enregistre à chaque dépôt. Changer le texte
 * change donc la version, sans que personne n'ait à s'en souvenir.
 */

/** Le texte de la case, cochée par l'apporteur avant le dépôt (e-mail et téléphone). */
export const CASE_INFORMATION_TIERS = "Cette personne sait qu'Axion-IA va la contacter.";
