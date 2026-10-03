/**
 * prisma/seed/11-qualifications.ts — le module du semeur pour les qualifications (DM-09,
 * partners/ADR-0022 point 14).
 *
 * IL NE SÈME AUCUNE LIGNE PAR DÉFAUT, ET C'EST LA CHAÎNE QUI L'IMPOSE. Une qualification est liée à
 * une attribution, et le semeur n'en sème aucune tant qu'aucune grille d'axionia n'est fixée dans le
 * dépôt (`10-attributions.ts`) : il n'y a rien à qualifier.
 *
 * Le chemin d'une qualification est `enregistrerUneQualification` (`src/server/qualification/`), et
 * jamais ce module : il porte le verrou optimiste, le chiffrement des données du tiers et l'effet sur
 * l'attribution, dans une seule transaction. Semer une ligne à la main contournerait les trois.
 */

/** Le module par défaut du chargeur (`prisma/seed.ts`) : rien à semer sans attribution. */
export default async function semerParDefaut(): Promise<void> {
  // Rien à semer : voir ci-dessus.
}
