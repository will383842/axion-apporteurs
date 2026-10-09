-- DM-55 (REQ-DM-004, REQ-DM-006, REQ-UX-016) : l'émission de decision_attribution et de premier_rang_libere.
-- Forme d'A02. Additive. Retour arrière : DROP INDEX ×2 ; DROP CONSTRAINT ×5 ; DROP COLUMN ×3.

-- (1) La notification nomme l'ÉVÉNEMENT du journal qui l'a produite : l'idempotence tient au fait, pas à l'attribution.
-- Une même attribution peut porter plusieurs décisions dans sa vie : (cle, attribution_id) refuserait la deuxième.
ALTER TABLE "notifications_espace" ADD COLUMN "evenement_id" BIGINT;
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_evenement_id_fkey"
  FOREIGN KEY ("evenement_id") REFERENCES "evenements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "notifications_espace_une_par_evenement" ON "notifications_espace" ("cle", "evenement_id")
  WHERE "evenement_id" IS NOT NULL;
-- Les deux clés de la machine portent TOUJOURS leur événement (aucune ligne n'existe encore : DM-55 est leur seule émettrice).
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_machine_a_son_evenement"
  CHECK ("cle" NOT IN ('decision_attribution', 'premier_rang_libere') OR "evenement_id" IS NOT NULL);

-- (2) Le courriel nomme la notification qu'il porte. Une tentative = une ligne ; AU PLUS UN courriel non échoué par notification.
ALTER TABLE "courriels_envoyes" ADD COLUMN "notification_espace_id" UUID;
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_notification_espace_id_fkey"
  FOREIGN KEY ("notification_espace_id") REFERENCES "notifications_espace"("id") ON DELETE SET NULL ON UPDATE RESTRICT;
-- SET NULL, et non RESTRICT : DM-61 SUPPRIME la notification douze mois après son inscription
-- (`notifications_espace_purger`). Le courriel, preuve du délai (REQ-UX-016), reste ; seul son lien d'affichage tombe.
CREATE UNIQUE INDEX "courriels_envoyes_un_par_notification" ON "courriels_envoyes" ("notification_espace_id")
  WHERE "notification_espace_id" IS NOT NULL AND "statut" <> 'echec';

-- (3) La notification d'une décision fondée sur une anomalie confirmée nomme CETTE anomalie : ses faits,
-- texte libre chiffré, restent dans sa ligne et se lisent au rendu. Pas dans la charge du journal chaîné
-- (décision (d) de la juriste pour DM-12). Aucun index : la lecture va de la notification vers l'anomalie,
-- et une anomalie ne se supprime pas, elle s'anonymise.
ALTER TABLE "notifications_espace" ADD COLUMN "anomalie_id" UUID;
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_anomalie_id_fkey"
  FOREIGN KEY ("anomalie_id") REFERENCES "anomalies"("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_anomalie_decision_seule"
  CHECK ("anomalie_id" IS NULL OR "cle" = 'decision_attribution');
