-- SEC-15 (REQ-SEC-019, REQ-SEC-038, REQ-JUR-006) — le gel des dépôts d'un apporteur : la suspension de
-- vérification du contrat v2, art. 3.7 al. 3. Préfixe RÉSERVÉ par A02, forme recopiée de #794 (6035951154).
-- POINT DUR (A02) : AUCUNE ligne de reprise. Aucun code de main ne pose `suspendu` ; si la production en
-- contenait, le VALIDATE de `apporteurs_suspendu_si_gele` ferait échouer le déploiement, en échec fermé.
-- L'exploitation compte `SELECT count(*) FROM apporteurs WHERE statut = 'suspendu'` AVANT de déployer.
CREATE TYPE "etat_gel" AS ENUM ('libre', 'gele_non_confirmation', 'gele_fraude');

ALTER TABLE "apporteurs"
  ADD COLUMN "etat_gel" "etat_gel" NOT NULL DEFAULT 'libre',
  ADD COLUMN "depots_geles_depuis" TIMESTAMPTZ(3),
  ADD COLUMN "gel_anomalie_id" UUID,
  ADD COLUMN "gel_pose_par_id" UUID;

ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_anomalie_id_fkey"
  FOREIGN KEY ("gel_anomalie_id") REFERENCES "anomalies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_pose_par_id_fkey"
  FOREIGN KEY ("gel_pose_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Un gel posé a son instant et son auteur ; un gel levé n'en a plus (l'historique est au journal).
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_date_liee"
  CHECK (("etat_gel" = 'libre') = ("depots_geles_depuis" IS NULL)) NOT VALID;
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_auteur_lie"
  CHECK (("etat_gel" = 'libre') = ("gel_pose_par_id" IS NULL)) NOT VALID;
-- La fraude cite son anomalie, et seule la fraude en cite une.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_fraude_anomalie"
  CHECK (("etat_gel" = 'gele_fraude') = ("gel_anomalie_id" IS NOT NULL)) NOT VALID;
-- GLOSSAIRE l. 164 : le statut vaut `suspendu` si et seulement si le gel n'est pas `libre`.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_suspendu_si_gele"
  CHECK (("statut" = 'suspendu') = ("etat_gel" <> 'libre')) NOT VALID;

ALTER TABLE "apporteurs" VALIDATE CONSTRAINT "apporteurs_gel_date_liee";
ALTER TABLE "apporteurs" VALIDATE CONSTRAINT "apporteurs_gel_auteur_lie";
ALTER TABLE "apporteurs" VALIDATE CONSTRAINT "apporteurs_gel_fraude_anomalie";
ALTER TABLE "apporteurs" VALIDATE CONSTRAINT "apporteurs_suspendu_si_gele";

-- Le cron de levée de plein droit lit les gels posés par leur instant.
CREATE INDEX "apporteurs_gel_pose_idx" ON "apporteurs" ("depots_geles_depuis") WHERE "etat_gel" <> 'libre';

-- La garde DÉDIÉE du gel (A02, #794, 6035951154, question 2), sans EXECUTE : elle n'admet que la POSE
-- (`libre` vers un gel, la date, l'auteur et, pour la fraude, l'anomalie posés ensemble) et la LEVÉE
-- (un gel vers `libre`, les trois remis à NULL ensemble). Un gel vers un autre gel est refusé : il faut
-- lever puis poser, deux faits au journal. Pendant le gel, rien ne bouge : l'horloge des quinze jours ne
-- se remonte pas en silence. Les CHECK tiennent les liaisons ; la garde tient le passage.
-- Retour arrière (commentaire) : DROP TRIGGER apporteurs_gel_garde ON apporteurs ;
-- DROP FUNCTION apporteurs_gel_garde() ; DROP INDEX apporteurs_gel_pose_idx ; DROP CONSTRAINT ×6 ;
-- DROP COLUMN ×4 ; DROP TYPE "etat_gel".
CREATE FUNCTION apporteurs_gel_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."etat_gel" IS NOT DISTINCT FROM OLD."etat_gel" THEN
    IF NEW."depots_geles_depuis" IS DISTINCT FROM OLD."depots_geles_depuis"
       OR NEW."gel_anomalie_id" IS DISTINCT FROM OLD."gel_anomalie_id"
       OR NEW."gel_pose_par_id" IS DISTINCT FROM OLD."gel_pose_par_id" THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : le gel ne se modifie pas en place ; il se pose ou se lève';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."etat_gel" = 'libre' THEN
    -- La POSE : la date et l'auteur sont posés ; les CHECK tiennent l'anomalie de la fraude.
    IF NEW."depots_geles_depuis" IS NULL OR NEW."gel_pose_par_id" IS NULL THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : une pose porte sa date et son auteur';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."etat_gel" = 'libre' THEN
    -- La LEVÉE : les trois colonnes reviennent à NULL ensemble.
    IF NEW."depots_geles_depuis" IS NOT NULL OR NEW."gel_anomalie_id" IS NOT NULL
       OR NEW."gel_pose_par_id" IS NOT NULL THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : une levée remet la date, l''anomalie et l''auteur à NULL';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'apporteurs_gel_garde : un gel ne devient pas un autre gel ; il se lève, puis se pose';
END;
$$;
CREATE TRIGGER apporteurs_gel_garde BEFORE UPDATE OF "etat_gel", "depots_geles_depuis", "gel_anomalie_id", "gel_pose_par_id" ON "apporteurs"
  FOR EACH ROW EXECUTE FUNCTION apporteurs_gel_garde();
