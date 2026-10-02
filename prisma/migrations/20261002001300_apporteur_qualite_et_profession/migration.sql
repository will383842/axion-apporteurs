-- DM-50 (REQ-JUR-022, partners/ADR-0022 §5 et §16) : les deux vocabulaires de conformité de
-- l'apporteur, en VRAIS enums, et leurs colonnes nullables. Additive : un apporteur existant n'a pas
-- encore déclaré sa qualité ni sa profession, et une colonne nullable sans défaut ne réécrit rien.
-- Retour arrière : DROP COLUMN "qualite_exercice" et "profession_reglementee" sur "apporteurs", puis
-- DROP TYPE "qualite_exercice" et "profession_reglementee" ; seules les qualités et professions
-- déclarées depuis sont perdues, le reste de la fiche de l'apporteur ne bouge pas.

-- CreateEnum
-- La liste FERMÉE d'A07 (2026-10-02) : « micro-entrepreneur » n'est pas une valeur (un régime, pas une
-- qualité). Les deux premières rendent applicable la clause attributive de juridiction (art. 48 CPC).
CREATE TYPE "qualite_exercice" AS ENUM ('commercant', 'societe_commerciale', 'artisan', 'profession_liberale');

-- CreateEnum
-- Une valeur par code NAF de REQ-JUR-022 (HYP-JUR-PROF-REGLEMENTEES) : 69.20Z, 66.19B, 66.22Z.
CREATE TYPE "profession_reglementee" AS ENUM ('expertise_comptable', 'auxiliaire_services_financiers', 'intermediaire_assurance');

-- AlterTable
ALTER TABLE "apporteurs" ADD COLUMN     "profession_reglementee" "profession_reglementee",
ADD COLUMN     "qualite_exercice" "qualite_exercice";
