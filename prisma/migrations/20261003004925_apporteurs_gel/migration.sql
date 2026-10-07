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

-- SEC-15, voie (a) (A02, #794, 6036131730) : la suspension est une décision de contrat.
-- La mise en demeure vise un article et n'a pas de dates ; la résiliation n'a pas d'article et a ses deux
-- dates ; la SUSPENSION (art. 3.7 al. 3) cite l'article 3.7 et n'a pas de dates (amendement d'A02, 6036174464,
-- d'après la juriste, 6036161128) : son instant est celui de sa ligne
-- (`cree_at`), et sa levée se lit sur l'apporteur et au journal.
ALTER TABLE "decisions_de_contrat" DROP CONSTRAINT "decisions_de_contrat_forme_du_geste";
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_forme_du_geste"
  CHECK (CASE "geste"
           WHEN 'mise_en_demeure' THEN "article" IS NOT NULL AND "date_reception" IS NULL AND "date_effet" IS NULL
           WHEN 'resiliation'     THEN "article" IS NULL AND "date_reception" IS NOT NULL AND "date_effet" IS NOT NULL
           WHEN 'suspension'      THEN "article" = '3.7' AND "date_reception" IS NULL AND "date_effet" IS NULL
         END) NOT VALID;

-- La suspension NAÎT avec ses faits (« notifiée avec les faits qui la motivent ») ; seule la purge les retire.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_faits_de_la_suspension"
  CHECK ("geste" <> 'suspension' OR "texte_chiffre" IS NOT NULL OR "texte_purge_at" IS NOT NULL) NOT VALID;
-- Elle porte TOUJOURS sa clé d'idempotence : le rendu est celui de la mise en demeure.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_cle_de_la_suspension"
  CHECK ("geste" <> 'suspension' OR "cle_idempotence" IS NOT NULL) NOT VALID;
-- L'empreinte vit et meurt avec le texte d'une mise en demeure OU d'une suspension ; une résiliation n'en a jamais.
ALTER TABLE "decisions_de_contrat" DROP CONSTRAINT "decisions_de_contrat_empreinte_liee_au_texte";
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_empreinte_liee_au_texte"
  CHECK (CASE WHEN "geste" IN ('mise_en_demeure', 'suspension')
              THEN ("faits_empreinte" IS NULL) = ("texte_chiffre" IS NULL)
              ELSE "faits_empreinte" IS NULL END) NOT VALID;

-- La notification qui cite une décision : la mise en demeure, la résiliation, ou la suspension.
ALTER TABLE "notifications_espace" DROP CONSTRAINT "notifications_espace_decision_contrat_cle";
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_decision_contrat_cle"
  CHECK ("decision_contrat_id" IS NULL OR "cle" IN ('mise_en_demeure', 'resiliation', 'suspension_declarations')) NOT VALID;

-- Le gel cite sa décision : posé avec le gel, remis à NULL à la levée (l'historique est au journal).
ALTER TABLE "apporteurs" ADD COLUMN "gel_decision_contrat_id" UUID;
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_decision_contrat_id_fkey"
  FOREIGN KEY ("gel_decision_contrat_id") REFERENCES "decisions_de_contrat"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_gel_decision_liee"
  CHECK (("etat_gel" = 'libre') = ("gel_decision_contrat_id" IS NULL)) NOT VALID;

ALTER TABLE "decisions_de_contrat" VALIDATE CONSTRAINT "decisions_de_contrat_forme_du_geste";
ALTER TABLE "decisions_de_contrat" VALIDATE CONSTRAINT "decisions_de_contrat_faits_de_la_suspension";
ALTER TABLE "decisions_de_contrat" VALIDATE CONSTRAINT "decisions_de_contrat_cle_de_la_suspension";
ALTER TABLE "decisions_de_contrat" VALIDATE CONSTRAINT "decisions_de_contrat_empreinte_liee_au_texte";
ALTER TABLE "notifications_espace" VALIDATE CONSTRAINT "notifications_espace_decision_contrat_cle";
ALTER TABLE "apporteurs" VALIDATE CONSTRAINT "apporteurs_gel_decision_liee";

-- La garde DÉDIÉE du gel (A02, #794, 6035951154, question 2), sans EXECUTE : elle n'admet que la POSE
-- (`libre` vers un gel, la date, l'auteur et, pour la fraude, l'anomalie posés ensemble) et la LEVÉE
-- (un gel vers `libre`, les trois remis à NULL ensemble). Un gel vers un autre gel est refusé : il faut
-- lever puis poser, deux faits au journal. Pendant le gel, rien ne bouge : l'horloge des quinze jours ne
-- se remonte pas en silence. Les CHECK tiennent les liaisons ; la garde tient le passage.
-- La pose cite une décision `suspension` du MÊME apporteur (A02, 6036131730), lue sans EXECUTE.
-- Retour arrière (commentaire) : DROP TRIGGER apporteurs_gel_garde ON apporteurs ;
-- DROP FUNCTION apporteurs_gel_garde() ; DROP INDEX apporteurs_gel_pose_idx ; DROP CONSTRAINT ×7 sur
-- apporteurs, dont la clé de gel_decision_contrat_id ; DROP COLUMN ×5 ; DROP TYPE "etat_gel" ; sur
-- decisions_de_contrat, DROP des deux CHECK neufs et RECRÉATION à l'identique de forme_du_geste et
-- empreinte_liee_au_texte (004300) ; sur notifications_espace, RECRÉATION à l'identique de
-- decision_contrat_cle (004300).
CREATE FUNCTION apporteurs_gel_garde() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d RECORD;
BEGIN
  IF NEW."etat_gel" IS NOT DISTINCT FROM OLD."etat_gel" THEN
    IF NEW."depots_geles_depuis" IS DISTINCT FROM OLD."depots_geles_depuis"
       OR NEW."gel_anomalie_id" IS DISTINCT FROM OLD."gel_anomalie_id"
       OR NEW."gel_pose_par_id" IS DISTINCT FROM OLD."gel_pose_par_id"
       OR NEW."gel_decision_contrat_id" IS DISTINCT FROM OLD."gel_decision_contrat_id" THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : le gel ne se modifie pas en place ; il se pose ou se lève';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."etat_gel" = 'libre' THEN
    -- La POSE : la date et l'auteur sont posés ; les CHECK tiennent l'anomalie de la fraude.
    IF NEW."depots_geles_depuis" IS NULL OR NEW."gel_pose_par_id" IS NULL
       OR NEW."gel_decision_contrat_id" IS NULL THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : une pose porte sa date, son auteur et sa décision';
    END IF;
    SELECT "geste", "apporteur_id" INTO d FROM "decisions_de_contrat" WHERE "id" = NEW."gel_decision_contrat_id";
    IF NOT FOUND OR d."geste" <> 'suspension' OR d."apporteur_id" <> NEW."id" THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : la décision citée est une suspension du même apporteur';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."etat_gel" = 'libre' THEN
    -- La LEVÉE : les trois colonnes reviennent à NULL ensemble.
    IF NEW."depots_geles_depuis" IS NOT NULL OR NEW."gel_anomalie_id" IS NOT NULL
       OR NEW."gel_pose_par_id" IS NOT NULL OR NEW."gel_decision_contrat_id" IS NOT NULL THEN
      RAISE EXCEPTION 'apporteurs_gel_garde : une levée remet la date, l''anomalie, l''auteur et la décision à NULL';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'apporteurs_gel_garde : un gel ne devient pas un autre gel ; il se lève, puis se pose';
END;
$$;
CREATE TRIGGER apporteurs_gel_garde BEFORE UPDATE OF "etat_gel", "depots_geles_depuis", "gel_anomalie_id", "gel_pose_par_id", "gel_decision_contrat_id" ON "apporteurs"
  FOR EACH ROW EXECUTE FUNCTION apporteurs_gel_garde();
