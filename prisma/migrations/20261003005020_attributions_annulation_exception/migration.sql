-- DM-71 (contrat v2, art. 3.3) — après la confirmation, une attribution ne s'annule plus pour antériorité :
-- seul un geste HUMAIN, pour erreur d'identification ou pour fraude, l'annule, et il le DIT en base.
-- Retour arrière (commentaire) : DROP TRIGGER attributions_annulation_apres_confirmation ; DROP FUNCTION
-- attributions_annulation_apres_confirmation() ; DROP CONSTRAINT ×3 ; DROP COLUMN ×2 ; DROP TYPE "exception_annulation".
-- Complément d'A02 (#806, 6039777605) : la troisième valeur, posée au rétablissement d'un apporteur
-- (UX-P1-61), entre dans le CREATE TYPE : la migration n'est pas encore fusionnée.
CREATE TYPE "exception_annulation" AS ENUM ('erreur_identification', 'fraude', 'retablissement_apporteur');
ALTER TABLE "attributions"
  ADD COLUMN "annulation_exception" "exception_annulation",
  ADD COLUMN "annulation_par_id" UUID;
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_annulation_par_id_fkey"
  FOREIGN KEY ("annulation_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- L'exception et son auteur vont ensemble, et seulement sur une attribution annulée.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_annulation_exception_liee"
  CHECK (("annulation_exception" IS NULL) = ("annulation_par_id" IS NULL)) NOT VALID;
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_annulation_exception_si_annulee"
  CHECK ("annulation_exception" IS NULL OR "statut" = 'annulee') NOT VALID;
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_annulation_exception_liee";
ALTER TABLE "attributions" VALIDATE CONSTRAINT "attributions_annulation_exception_si_annulee";

-- La garde : vers `annulee`, depuis une attribution CONFIRMÉE, seule une exception humaine passe ; le
-- marqueur ne se pose qu'avec cette arrivée, et ne se réécrit jamais.
CREATE FUNCTION attributions_annulation_apres_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."annulation_exception" IS DISTINCT FROM OLD."annulation_exception"
     OR NEW."annulation_par_id" IS DISTINCT FROM OLD."annulation_par_id" THEN
    IF OLD."annulation_exception" IS NOT NULL THEN
      RAISE EXCEPTION 'attributions_annulation_apres_confirmation : l''exception d''annulation ne se réécrit pas';
    END IF;
    IF NOT (OLD."statut" <> 'annulee' AND NEW."statut" = 'annulee') THEN
      RAISE EXCEPTION 'attributions_annulation_apres_confirmation : l''exception se pose avec l''annulation, dans la même écriture';
    END IF;
  END IF;
  IF NEW."statut" = 'annulee' AND OLD."statut" <> 'annulee' AND OLD."confirmee_at" IS NOT NULL
     AND NEW."annulation_exception" IS NULL THEN
    RAISE EXCEPTION 'attributions_annulation_apres_confirmation : après la confirmation, seule une exception humaine annule (contrat art. 3.3)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attributions_annulation_apres_confirmation
  BEFORE UPDATE OF "statut", "annulation_exception", "annulation_par_id" ON "attributions"
  FOR EACH ROW EXECUTE FUNCTION attributions_annulation_apres_confirmation();
