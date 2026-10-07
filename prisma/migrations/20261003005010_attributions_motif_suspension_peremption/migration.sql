-- UX-P1-61 (contrat v2) — la suspension de la péremption pour une absence d'échange IMPUTABLE à la Société :
-- un motif FERMÉ, jamais un texte libre (juriste). La justification libre de 000300 n'est plus admise.
-- Retour arrière (commentaire) : DROP CONSTRAINT attributions_suspension_peremption_motif ; recréation de
-- attributions_suspension_de_peremption (000300) à l'identique ; DROP COLUMN "peremption_suspendue_motif" ;
-- DROP TYPE "motif_suspension_peremption".
CREATE TYPE "motif_suspension_peremption" AS ENUM (
  'rdv_annule_par_la_societe', 'absence_de_reponse_de_la_societe', 'devis_non_emis_par_la_societe'
);
ALTER TABLE "attributions" ADD COLUMN "peremption_suspendue_motif" "motif_suspension_peremption";
-- La suspension pose ensemble son instant, son auteur et son MOTIF ; aucune justification libre.
ALTER TABLE "attributions" DROP CONSTRAINT "attributions_suspension_de_peremption";
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_suspension_peremption_motif"
  CHECK (num_nonnulls("peremption_suspendue_at", "peremption_suspendue_par_id", "peremption_suspendue_motif") IN (0, 3)
         AND "peremption_suspendue_justification" IS NULL) NOT VALID;
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_suspension_peremption_motif";
