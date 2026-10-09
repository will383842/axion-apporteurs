-- JUR-T64 (code civil art. 2241 et 2231 ; juriste #703 6041829569) — un litige OUVERT sur une décision de
-- contrat gèle la purge de son texte ; à la clôture, le départ de la conservation devient le plus tardif
-- (la durée vit dans la SSOT : la base tient le gel, l'application l'échéance).
-- Retour arrière (commentaire) : DROP TRIGGER decisions_de_contrat_gel_litige ON decisions_de_contrat ;
-- DROP FUNCTION decisions_de_contrat_gel_litige() ; DROP TRIGGER litiges_decisions_de_contrat_naissance,
-- litiges_decisions_de_contrat_ajout_seul, litiges_decisions_de_contrat_troncature ;
-- DROP FUNCTION litiges_decisions_de_contrat_naissance() ; DROP TABLE "litiges_decisions_de_contrat" ;
-- DROP TYPE "motif_cloture_litige", "motif_ouverture_litige".
CREATE TYPE "motif_ouverture_litige" AS ENUM ('contestation_ecrite', 'reclamation_formelle', 'mediation', 'action_en_justice');
CREATE TYPE "motif_cloture_litige" AS ENUM ('reponse_donnee', 'accord', 'decision_definitive', 'desistement');
CREATE TABLE "litiges_decisions_de_contrat" (
    "id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "motif_ouverture" "motif_ouverture_litige" NOT NULL,
    "ouvert_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "ouvert_par_id" UUID NOT NULL,
    "motif_cloture" "motif_cloture_litige",
    "clos_at" TIMESTAMPTZ(3),
    "clos_par_id" UUID,
    CONSTRAINT "litiges_decisions_de_contrat_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "litiges_decisions_de_contrat" ADD CONSTRAINT "litiges_decisions_de_contrat_decision_id_fkey"
  FOREIGN KEY ("decision_id") REFERENCES "decisions_de_contrat"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "litiges_decisions_de_contrat" ADD CONSTRAINT "litiges_decisions_de_contrat_ouvert_par_id_fkey"
  FOREIGN KEY ("ouvert_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "litiges_decisions_de_contrat" ADD CONSTRAINT "litiges_decisions_de_contrat_clos_par_id_fkey"
  FOREIGN KEY ("clos_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- La clôture pose son motif, sa date et son auteur ensemble, jamais avant l'ouverture.
ALTER TABLE "litiges_decisions_de_contrat" ADD CONSTRAINT "litiges_decisions_de_contrat_cloture_liee"
  CHECK (num_nonnulls("motif_cloture", "clos_at", "clos_par_id") IN (0, 3));
ALTER TABLE "litiges_decisions_de_contrat" ADD CONSTRAINT "litiges_decisions_de_contrat_cloture_apres_ouverture"
  CHECK ("clos_at" IS NULL OR "clos_at" >= "ouvert_at");
-- Un seul litige OUVERT par décision ; des litiges successifs restent possibles (juriste).
CREATE UNIQUE INDEX "litiges_decisions_de_contrat_un_ouvert" ON "litiges_decisions_de_contrat" ("decision_id") WHERE "clos_at" IS NULL;
-- La purge applicative lit la DERNIÈRE clôture d'une décision.
CREATE INDEX "litiges_decisions_de_contrat_decision_clos_idx" ON "litiges_decisions_de_contrat" ("decision_id", "clos_at");

-- La NAISSANCE : un litige naît OUVERT, à l'heure de la BASE, sur une décision dont le texte existe encore.
CREATE FUNCTION litiges_decisions_de_contrat_naissance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."ouvert_at" := clock_timestamp();
  IF NEW."motif_cloture" IS NOT NULL OR NEW."clos_at" IS NOT NULL OR NEW."clos_par_id" IS NOT NULL THEN
    RAISE EXCEPTION 'litiges_decisions_de_contrat_naissance : un litige naît ouvert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "decisions_de_contrat" d WHERE d."id" = NEW."decision_id" AND d."texte_chiffre" IS NOT NULL) THEN
    RAISE EXCEPTION 'litiges_decisions_de_contrat_naissance : le texte de la décision est effacé, ou n''a jamais existé : rien à garder';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER litiges_decisions_de_contrat_naissance BEFORE INSERT ON "litiges_decisions_de_contrat"
  FOR EACH ROW EXECUTE FUNCTION litiges_decisions_de_contrat_naissance();
-- Ajout seul (gabarit) : seule la clôture s'écrit, une fois ; DELETE et TRUNCATE refusés.
CREATE TRIGGER litiges_decisions_de_contrat_ajout_seul BEFORE UPDATE OR DELETE ON "litiges_decisions_de_contrat"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('une_fois:motif_cloture', 'une_fois:clos_at', 'une_fois:clos_par_id');
CREATE TRIGGER litiges_decisions_de_contrat_troncature BEFORE TRUNCATE ON "litiges_decisions_de_contrat"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('une_fois:motif_cloture', 'une_fois:clos_at', 'une_fois:clos_par_id');

-- LE FILET, déclencheur NEUF à côté de decisions_de_contrat_garde (contrainte d'A02, 5982994151) : la purge
-- du texte est refusée tant qu'un litige de CETTE décision est ouvert.
CREATE FUNCTION decisions_de_contrat_gel_litige() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."texte_chiffre" IS NOT NULL AND NEW."texte_chiffre" IS NULL AND EXISTS (
    SELECT 1 FROM "litiges_decisions_de_contrat" l WHERE l."decision_id" = OLD."id" AND l."clos_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'decisions_de_contrat_gel_litige : un litige est ouvert sur cette décision, le texte est gardé (code civil art. 2241)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decisions_de_contrat_gel_litige BEFORE UPDATE OF "texte_chiffre" ON "decisions_de_contrat"
  FOR EACH ROW EXECUTE FUNCTION decisions_de_contrat_gel_litige();
