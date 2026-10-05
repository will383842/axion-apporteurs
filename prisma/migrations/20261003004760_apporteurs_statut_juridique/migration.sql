-- DM-56 (REQ-DM-065, partners/ADR-0022 §5 et §8) : le statut juridique de l'apporteur, une liste
-- FERMÉE en VRAI enum, sa colonne nullable, et le CHECK qui la range dans la qualité d'exercice.
-- Une seule migration (forme d'A02) : le type et la colonne ensemble, sans ADD VALUE. Additive : un
-- apporteur existant n'a pas de statut saisi, et une colonne nullable sans défaut ne réécrit rien.
-- Les motifs de refus de l'admission (`siren_inactif`, `lien_avec_la_societe`, `statut_hors_liste`,
-- `profession_exclue`) sont des codes du domaine, NON persistés : aucune migration pour eux.
-- Retour arrière : DROP CONSTRAINT "apporteurs_qualite_suit_le_statut", puis DROP COLUMN
-- "statut_juridique" sur "apporteurs", puis DROP TYPE "statut_juridique" ; seuls les statuts déclarés
-- depuis sont perdus, le reste de la fiche de l'apporteur ne bouge pas.

-- CreateEnum
-- Le portage salarial et l'entrepreneur-salarié de coopérative ne sont pas des valeurs : ils changent
-- qui signe et qui facture, et relèvent de la phase 2.
CREATE TYPE "statut_juridique" AS ENUM ('micro_entrepreneur', 'entrepreneur_individuel', 'sarl', 'eurl', 'sas', 'sasu', 'sa', 'snc');

-- AlterTable
ALTER TABLE "apporteurs" ADD COLUMN     "statut_juridique" "statut_juridique";

-- Le garde-fou de la correspondance d'écriture (`qualiteDuStatut`, src/domain/kyc/statut-juridique.ts) :
-- les six sociétés vont en `societe_commerciale`, et elles seules. Un des deux côtés nul passe : le
-- statut ou la qualité n'est pas encore déclaré.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_qualite_suit_le_statut" CHECK (
  "statut_juridique" IS NULL
  OR "qualite_exercice" IS NULL
  OR (("statut_juridique" IN ('sarl', 'eurl', 'sas', 'sasu', 'sa', 'snc')) = ("qualite_exercice" = 'societe_commerciale'))
);
