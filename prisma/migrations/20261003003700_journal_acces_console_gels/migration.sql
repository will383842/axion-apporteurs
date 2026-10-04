-- SEC-61 : les lignes du journal des accès gelées pendant un incident ou un litige, épargnées par la purge jusqu'à
-- la levée du gel. Additive. Les deux valeurs d'enum du journal ne sont PAS employées dans cette migration.
-- Retour arrière (commentaire) : DROP TRIGGER journal_acces_console_gel_respecte, journal_acces_console_gels_garde,
-- journal_acces_console_gels_troncature ; DROP FUNCTION ×2 ; DROP TABLE "journal_acces_console_gels" ;
-- DROP TYPE "motif_gel_journal". Les deux valeurs ajoutées à `type_evenement_journal` et `agregat_journal` ne se
-- retirent pas (Postgres, et des lignes du journal chaîné les portent) : elles restent inertes.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'journal_acces_gel_modifie';
ALTER TYPE "agregat_journal" ADD VALUE IF NOT EXISTS 'journal_acces_gel';
CREATE TYPE "motif_gel_journal" AS ENUM ('incident', 'litige');
CREATE TABLE "journal_acces_console_gels" (
    "id" UUID NOT NULL,
    "motif" "motif_gel_journal" NOT NULL,
    -- La référence de l'incident ou du litige : opaque, en capitales, jamais un nom (forme de la sécurité).
    "reference" VARCHAR(40) NOT NULL,
    -- La PORTÉE : exactement l'une des deux.
    "utilisateur_vise_id" UUID,
    "cible_id" UUID,
    "depuis" TIMESTAMPTZ(3) NOT NULL,
    "jusqu_a" TIMESTAMPTZ(3),
    "pose_par_id" UUID NOT NULL,
    "pose_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "leve_par_id" UUID,
    "leve_at" TIMESTAMPTZ(3),
    CONSTRAINT "journal_acces_console_gels_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_utilisateur_vise_fkey"
  FOREIGN KEY ("utilisateur_vise_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_pose_par_id_fkey"
  FOREIGN KEY ("pose_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_leve_par_id_fkey"
  FOREIGN KEY ("leve_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_reference_forme"
  CHECK ("reference" ~ '^[A-Z0-9][A-Z0-9-]{2,39}$');
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_une_portee"
  CHECK (num_nonnulls("utilisateur_vise_id", "cible_id") = 1);
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_periode"
  CHECK ("jusqu_a" IS NULL OR "jusqu_a" >= "depuis");
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_levee_liee"
  CHECK (("leve_par_id" IS NULL) = ("leve_at" IS NULL));
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_levee_apres_pose"
  CHECK ("leve_at" IS NULL OR "leve_at" >= "pose_at");
-- Personne ne gèle ses propres traces ; la levée est faite par un AUTRE que l'auteur et que la personne visée.
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_pas_sur_soi"
  CHECK ("utilisateur_vise_id" IS NULL OR "pose_par_id" <> "utilisateur_vise_id");
ALTER TABLE "journal_acces_console_gels" ADD CONSTRAINT "journal_acces_console_gels_levee_quatre_yeux"
  CHECK ("leve_par_id" IS NULL OR ("leve_par_id" <> "pose_par_id"
         AND ("utilisateur_vise_id" IS NULL OR "leve_par_id" <> "utilisateur_vise_id")));
CREATE INDEX "journal_acces_console_gels_ouverts_utilisateur_idx" ON "journal_acces_console_gels" ("utilisateur_vise_id", "depuis")
  WHERE "leve_at" IS NULL AND "utilisateur_vise_id" IS NOT NULL;
CREATE INDEX "journal_acces_console_gels_ouverts_cible_idx" ON "journal_acces_console_gels" ("cible_id", "depuis")
  WHERE "leve_at" IS NULL AND "cible_id" IS NOT NULL;

-- « COUVERTE », une seule définition, écrite à l'identique dans la garde, le filet et la purge : une ligne de la
-- portée survenue à partir de `depuis` et, si `jusqu_a` est posé, jusqu'à `jusqu_a` INCLUS (à la milliseconde).
-- `jusqu_a` nul : l'incident est en cours, le gel couvre aussi les lignes à venir, jusqu'à sa levée.
-- (1) La garde du gel : un gel naît OUVERT ; la levée s'écrit une fois ; rien d'autre ne bouge, `jusqu_a` compris ;
--     un gel ne s'efface que LEVÉ et quand AUCUNE ligne qu'il a protégée n'est encore à purger, soit les lignes
--     couvertes survenues jusqu'à sa levée : [depuis, LEAST(jusqu_a, leve_at)] ; TRUNCATE refusé.
CREATE FUNCTION journal_acces_console_gels_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'journal_acces_console_gels_garde : TRUNCATE refusé';
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW."leve_at" IS NOT NULL OR NEW."leve_par_id" IS NOT NULL THEN
      RAISE EXCEPTION 'journal_acces_console_gels_garde : un gel naît ouvert';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."leve_at" IS NULL OR EXISTS (
      SELECT 1 FROM "journal_acces_console" j
      WHERE j."purge_at" IS NULL
        AND j."survenu_at" >= OLD."depuis" AND (OLD."jusqu_a" IS NULL OR j."survenu_at" <= OLD."jusqu_a")
        AND j."survenu_at" <= OLD."leve_at"
        AND (j."utilisateur_console_id" = OLD."utilisateur_vise_id" OR j."cible_id" = OLD."cible_id")
    ) THEN
      RAISE EXCEPTION 'journal_acces_console_gels_garde : un gel ne s''efface que levé, et ses lignes purgées';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE : seule la levée, de NULL vers une valeur, une fois.
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."motif" IS DISTINCT FROM OLD."motif"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."utilisateur_vise_id" IS DISTINCT FROM OLD."utilisateur_vise_id"
     OR NEW."cible_id" IS DISTINCT FROM OLD."cible_id" OR NEW."depuis" IS DISTINCT FROM OLD."depuis"
     OR NEW."jusqu_a" IS DISTINCT FROM OLD."jusqu_a" OR NEW."pose_par_id" IS DISTINCT FROM OLD."pose_par_id"
     OR NEW."pose_at" IS DISTINCT FROM OLD."pose_at" OR OLD."leve_at" IS NOT NULL THEN
    RAISE EXCEPTION 'journal_acces_console_gels_garde : seule la levée d''un gel ouvert est admise, une fois';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_acces_console_gels_garde BEFORE INSERT OR UPDATE OR DELETE ON "journal_acces_console_gels"
  FOR EACH ROW EXECUTE FUNCTION journal_acces_console_gels_garde();
CREATE TRIGGER journal_acces_console_gels_troncature BEFORE TRUNCATE ON "journal_acces_console_gels"
  FOR EACH STATEMENT EXECUTE FUNCTION journal_acces_console_gels_garde();

-- (2) Le FILET de la base : une ligne du journal couverte par un gel OUVERT ne se purge pas, même si le code
--     l'oubliait ; une ligne survenue après `jusqu_a` n'est pas couverte, et se purge à son échéance. Déclencheur NEUF, à côté du gabarit existant, qui n'est pas recréé.
CREATE FUNCTION journal_acces_console_gel_respecte() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."purge_at" IS NOT NULL AND OLD."purge_at" IS NULL AND EXISTS (
    SELECT 1 FROM "journal_acces_console_gels" g
    WHERE g."leve_at" IS NULL
      AND OLD."survenu_at" >= g."depuis" AND (g."jusqu_a" IS NULL OR OLD."survenu_at" <= g."jusqu_a")
      AND (g."utilisateur_vise_id" = OLD."utilisateur_console_id" OR g."cible_id" = OLD."cible_id")
  ) THEN
    RAISE EXCEPTION 'journal_acces_console_gel_respecte : une ligne gelée ne se purge pas avant la levée du gel';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_acces_console_gel_respecte BEFORE UPDATE OF "purge_at" ON "journal_acces_console"
  FOR EACH ROW EXECUTE FUNCTION journal_acces_console_gel_respecte();
