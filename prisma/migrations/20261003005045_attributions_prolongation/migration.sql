-- EXT-T07 (contrat v2, art. 3.4 al. 3) — une prolongation, UNE fois, sur une condition de la Société, ou
-- RÉPUTÉE faute de décision au terme ; ou le constat qu'aucune condition n'est remplie. Forme d'A02 (#809
-- 6039895839), amendée (6039970008) : la 4e valeur `reputee`, l'auteur de la prolongation, le refus.
-- La durée (PROLONGATION_MOIS) vit dans la SSOT, jamais ici : la base tient l'UNICITÉ, l'exclusion du refus
-- et de la prolongation, et le lien entre le fait et la fin de fenêtre, pas l'arithmétique.
-- Retour arrière (commentaire) : DROP TRIGGER attributions_prolongation_garde ; DROP FUNCTION
-- attributions_prolongation_garde() ; DROP CONSTRAINT ×5 et les deux clés étrangères ; DROP COLUMN ×5 ;
-- DROP TYPE "condition_prolongation".
CREATE TYPE "condition_prolongation" AS ENUM (
  'devis_en_cours', 'echange_recent', 'financement_en_instruction', 'reputee'
);
ALTER TABLE "attributions"
  ADD COLUMN "prolongee_at" TIMESTAMPTZ(3),
  ADD COLUMN "prolongation_condition" "condition_prolongation",
  ADD COLUMN "prolongee_par_id" UUID,
  ADD COLUMN "prolongation_refusee_at" TIMESTAMPTZ(3),
  ADD COLUMN "prolongation_refusee_par_id" UUID;
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongee_par_id_fkey"
  FOREIGN KEY ("prolongee_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongation_refusee_par_id_fkey"
  FOREIGN KEY ("prolongation_refusee_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "attributions_prolongee_par_id_idx" ON "attributions"("prolongee_par_id");
CREATE INDEX "attributions_prolongation_refusee_par_id_idx" ON "attributions"("prolongation_refusee_par_id");

ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongation_liee"
  CHECK (("prolongee_at" IS NULL) = ("prolongation_condition" IS NULL)) NOT VALID;
-- Seule une attribution CONFIRMÉE, qui a une fenêtre, se prolonge.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongation_si_confirmee"
  CHECK ("prolongee_at" IS NULL OR ("confirmee_at" IS NOT NULL AND "fenetre_fin_at" IS NOT NULL)) NOT VALID;
-- La réputée vient du système (aucun auteur) ; un geste de la console a son auteur.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongation_auteur"
  CHECK ("prolongee_at" IS NULL OR (("prolongation_condition" = 'reputee') = ("prolongee_par_id" IS NULL))) NOT VALID;
-- Le refus pose son instant et son auteur ensemble ; il exclut la prolongation.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_refus_prolongation_lie"
  CHECK (("prolongation_refusee_at" IS NULL) = ("prolongation_refusee_par_id" IS NULL)) NOT VALID;
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_prolongation_ou_refus"
  CHECK ("prolongee_at" IS NULL OR "prolongation_refusee_at" IS NULL) NOT VALID;
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_prolongation_liee";
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_prolongation_si_confirmee";
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_prolongation_auteur";
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_refus_prolongation_lie";
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_prolongation_ou_refus";

-- La garde. Le REFUS se pose une fois, ne se réécrit jamais, ne touche pas la fin de fenêtre, et il est
-- refusé après une prolongation ou après le terme. La PROLONGATION se pose une fois, refusée après un
-- refus, avec une fin de fenêtre qui RECULE dans la même écriture ; ensuite, rien ne bouge plus. Sans
-- prolongation, la fin de fenêtre ne se pose qu'une fois (à la confirmation), jamais ne se réécrit.
CREATE FUNCTION attributions_prolongation_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."prolongation_refusee_at" IS NOT NULL THEN
    IF NEW."prolongation_refusee_at" IS DISTINCT FROM OLD."prolongation_refusee_at"
       OR NEW."prolongation_refusee_par_id" IS DISTINCT FROM OLD."prolongation_refusee_par_id" THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : le constat est unique, il ne se réécrit pas (art. 3.4 al. 3)';
    END IF;
    IF NEW."prolongee_at" IS NOT NULL THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : une prolongation est refusée après le constat qu''aucune condition n''est remplie';
    END IF;
  ELSIF NEW."prolongation_refusee_at" IS NOT NULL THEN
    IF OLD."prolongee_at" IS NOT NULL THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : le constat ne revient pas sur une prolongation, réputée ou non';
    END IF;
    IF OLD."fenetre_fin_at" IS NOT NULL AND clock_timestamp() > OLD."fenetre_fin_at" THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : passé le terme, la prolongation est réputée, et le constat est refusé';
    END IF;
    IF NEW."fenetre_fin_at" IS DISTINCT FROM OLD."fenetre_fin_at" THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : le constat ne touche pas la fin de fenêtre';
    END IF;
  END IF;
  IF OLD."prolongee_at" IS NOT NULL THEN
    IF NEW."prolongee_at" IS DISTINCT FROM OLD."prolongee_at"
       OR NEW."prolongation_condition" IS DISTINCT FROM OLD."prolongation_condition"
       OR NEW."prolongee_par_id" IS DISTINCT FROM OLD."prolongee_par_id"
       OR NEW."fenetre_fin_at" IS DISTINCT FROM OLD."fenetre_fin_at" THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : une prolongation est unique, et la fenêtre prolongée ne bouge plus (art. 3.4 al. 3)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."prolongee_at" IS NOT NULL THEN
    IF OLD."fenetre_fin_at" IS NULL OR NEW."fenetre_fin_at" IS NULL OR NEW."fenetre_fin_at" <= OLD."fenetre_fin_at" THEN
      RAISE EXCEPTION 'attributions_prolongation_garde : la prolongation recule la fin de fenêtre, dans la même écriture';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."fenetre_fin_at" IS NOT NULL AND NEW."fenetre_fin_at" IS DISTINCT FROM OLD."fenetre_fin_at" THEN
    RAISE EXCEPTION 'attributions_prolongation_garde : la fin de fenêtre ne se réécrit que par la prolongation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attributions_prolongation_garde
  BEFORE UPDATE OF "prolongee_at", "prolongation_condition", "prolongee_par_id",
    "prolongation_refusee_at", "prolongation_refusee_par_id", "fenetre_fin_at" ON "attributions"
  FOR EACH ROW EXECUTE FUNCTION attributions_prolongation_garde();
