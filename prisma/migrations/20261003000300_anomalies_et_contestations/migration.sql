-- DM-12 (REQ-DM-032, REQ-DM-033, REQ-DM-034, REQ-DM-043) : vérifications, alertes de libération,
-- anomalies, rattachements manuels et contestations, dans la FORME D'A02 (2026-10-03). Additive :
-- quatre enums, cinq tables neuves, leurs fonctions et déclencheurs, trois valeurs de journal en fin.
-- Retour arrière : DROP TABLE "contestations", "rattachements_manuels", "anomalies",
-- "alertes_liberation", "verifications" ; DROP FUNCTION refuser_acteur_conseiller(),
-- anomalies_refuser_substitution(), contestations_refuser_substitution(), rattachement_lien_anterieur(),
-- verifications_porteur_conseiller() ;
-- DROP TYPE "objet_contestation", "source_lien_controle", "statut_anomalie", "type_anomalie",
-- "resultat_verification". Les
-- trois valeurs de `type_evenement_journal` et la valeur `anomalie` de `agregat_journal` restent (un
-- ADD VALUE ne se retire pas) : elles ne sont alors plus émises.

-- CreateEnum
CREATE TYPE "resultat_verification" AS ENUM ('libre', 'suivie', 'cliente', 'liste_noire', 'fermee');

-- CreateEnum
-- La DÉCLARATION seule, jamais le nombre, le rythme, l'heure, le lieu, la zone, le secteur ni la
-- méthode de l'apporteur (REQ-SEC-017, REQ-JUR-031, arbitrage de la juriste du 2026-10-03).
CREATE TYPE "type_anomalie" AS ENUM ('sincerite', 'auto_parrainage');

-- CreateEnum
CREATE TYPE "statut_anomalie" AS ENUM ('ouverte', 'levee', 'confirmee');

-- CreateEnum
-- Ce qui prouve le lien de contrôle (contrat art. 3.6) : une pièce PUBLIQUE de l'entreprise, jamais
-- un texte libre (restriction de la sécurité, forme d'A02).
-- Liste arrêtée par la juriste : le registre des bénéficiaires effectifs n'en est pas (fermé au public
-- depuis l'arrêt de la CJUE du 22/11/2022).
CREATE TYPE "source_lien_controle" AS ENUM ('rne', 'kbis', 'statuts', 'bodacc', 'comptes_annuels');

-- CreateEnum
CREATE TYPE "objet_contestation" AS ENUM ('refus_depot', 'annulation_attribution', 'demande_rattachement');

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID,
    "utilisateur_console_id" UUID,
    "siren" CHAR(9) NOT NULL,
    "resultat" "resultat_verification" NOT NULL,
    "ip_hash" CHAR(16),
    "empreinte_reseau_purgee_at" TIMESTAMPTZ(3),
    "porteur_purge_at" TIMESTAMPTZ(3),
    "verifiee_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertes_liberation" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID,
    "siren" CHAR(9) NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyee_at" TIMESTAMPTZ(3),
    "apporteur_purge_at" TIMESTAMPTZ(3),

    CONSTRAINT "alertes_liberation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" UUID NOT NULL,
    "type" "type_anomalie" NOT NULL,
    "score" SMALLINT,
    "apporteur_id" UUID,
    "attribution_id" UUID,
    "statut" "statut_anomalie" NOT NULL DEFAULT 'ouverte',
    "ouverte_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traite_par_id" UUID,
    "traite_at" TIMESTAMPTZ(3),
    "justification_chiffre" BYTEA,
    "justification_purgee_at" TIMESTAMPTZ(3),
    "anonymisee_at" TIMESTAMPTZ(3),
    "mesure_terminee_at" TIMESTAMPTZ(3),
    "gel_litige_at" TIMESTAMPTZ(3),
    "gel_litige_leve_at" TIMESTAMPTZ(3),
    "gel_litige_ref" VARCHAR(64),

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rattachements_manuels" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "siren_commande" CHAR(9) NOT NULL,
    "justification_chiffre" BYTEA,
    "justification_purgee_at" TIMESTAMPTZ(3),
    "lien_controle_etabli_at" TIMESTAMPTZ(3) NOT NULL,
    "lien_controle_source_type" "source_lien_controle" NOT NULL,
    "lien_controle_source_ref" VARCHAR(64) NOT NULL,
    "decide_par_id" UUID NOT NULL,
    "decide_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoque_at" TIMESTAMPTZ(3),

    CONSTRAINT "rattachements_manuels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- L'échéance de réponse est `recue_at` plus la durée de la SSOT : aucune colonne ne la stocke.
CREATE TABLE "contestations" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "objet" "objet_contestation" NOT NULL,
    "depot_refuse_id" UUID,
    "attribution_id" UUID,
    "texte_chiffre" BYTEA,
    "recue_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reponse_chiffre" BYTEA,
    "repondue_par_id" UUID,
    "repondue_at" TIMESTAMPTZ(3),
    "purgee_at" TIMESTAMPTZ(3),
    "gel_litige_at" TIMESTAMPTZ(3),
    "gel_litige_leve_at" TIMESTAMPTZ(3),
    "gel_litige_ref" VARCHAR(64),

    CONSTRAINT "contestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verifications_apporteur_id_idx" ON "verifications"("apporteur_id");

-- CreateIndex
CREATE INDEX "verifications_utilisateur_console_id_idx" ON "verifications"("utilisateur_console_id");

-- CreateIndex
CREATE INDEX "verifications_siren_idx" ON "verifications"("siren");

-- CreateIndex
CREATE INDEX "alertes_liberation_apporteur_id_idx" ON "alertes_liberation"("apporteur_id");

-- CreateIndex
CREATE INDEX "anomalies_apporteur_id_idx" ON "anomalies"("apporteur_id");

-- CreateIndex
CREATE INDEX "anomalies_attribution_id_idx" ON "anomalies"("attribution_id");

-- CreateIndex
CREATE INDEX "anomalies_traite_par_id_idx" ON "anomalies"("traite_par_id");

-- CreateIndex
CREATE INDEX "rattachements_manuels_attribution_id_idx" ON "rattachements_manuels"("attribution_id");

-- CreateIndex
CREATE INDEX "rattachements_manuels_decide_par_id_idx" ON "rattachements_manuels"("decide_par_id");

-- CreateIndex
CREATE INDEX "contestations_apporteur_id_idx" ON "contestations"("apporteur_id");

-- CreateIndex
CREATE INDEX "contestations_depot_refuse_id_idx" ON "contestations"("depot_refuse_id");

-- CreateIndex
CREATE INDEX "contestations_attribution_id_idx" ON "contestations"("attribution_id");

-- CreateIndex
CREATE INDEX "contestations_repondue_par_id_idx" ON "contestations"("repondue_par_id");

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alertes_liberation" ADD CONSTRAINT "alertes_liberation_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_traite_par_id_fkey" FOREIGN KEY ("traite_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_decide_par_id_fkey" FOREIGN KEY ("decide_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_depot_refuse_id_fkey" FOREIGN KEY ("depot_refuse_id") REFERENCES "depots_refuses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_repondue_par_id_fkey" FOREIGN KEY ("repondue_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL brut : Prisma ne modélise ni CHECK, ni index partiel, ni fonction, ni déclencheur
-- (partners/ADR-0015).

-- ── verifications : les formes, le porteur, l'empreinte purgeable une fois ──────────────────
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_siren_forme"
  CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_ip_hash_hex"
  CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{16}$');
-- W19 : un porteur et un seul, l'apporteur ou le conseiller salarié (patron de DM-07) ; à l'échéance
-- du registre, la purge le vide avec sa date, et la ligne nue (SIREN, résultat, date) reste.
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_porteur_unique"
  CHECK (num_nonnulls("apporteur_id", "utilisateur_console_id") = CASE WHEN "porteur_purge_at" IS NULL THEN 1 ELSE 0 END);
-- Toute vérification naît avec son empreinte d'adresse réseau ; elle ne la perd que par la purge,
-- qui pose sa date dans la MÊME écriture. Égalité, et non implication : une empreinte vidée sans
-- date serait indiscernable d'une empreinte jamais posée.
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_ip_hash_purge_liee"
  CHECK (("ip_hash" IS NULL) = ("empreinte_reseau_purgee_at" IS NOT NULL));

-- Le porteur console est un utilisateur de rôle `conseiller_salarie`, non désactivé. Comparé en
-- TEXTE : la valeur n'existe pas encore dans `console_role` (SEC-31 l'ajoute).
CREATE FUNCTION verifications_porteur_conseiller() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."utilisateur_console_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "utilisateurs_console" u
    WHERE u."id" = NEW."utilisateur_console_id"
      AND u."role"::text = 'conseiller_salarie'
      AND u."desactive_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'verifications_porteur_conseiller : le porteur console doit être un conseiller salarié actif (W19)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verifications_porteur_conseiller
  BEFORE INSERT OR UPDATE OF "utilisateur_console_id" ON "verifications"
  FOR EACH ROW EXECUTE FUNCTION verifications_porteur_conseiller();
-- Ajout seul : l'empreinte, puis le porteur, se purgent, chacun une fois, avec sa date posée une fois.
CREATE TRIGGER verifications_ajout_seul BEFORE UPDATE OR DELETE ON "verifications"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:ip_hash', 'une_fois:empreinte_reseau_purgee_at', 'purge:apporteur_id', 'purge:utilisateur_console_id', 'une_fois:porteur_purge_at');
CREATE TRIGGER verifications_troncature BEFORE TRUNCATE ON "verifications"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:ip_hash', 'une_fois:empreinte_reseau_purgee_at', 'purge:apporteur_id', 'purge:utilisateur_console_id', 'une_fois:porteur_purge_at');

-- ── alertes_liberation : une seule en attente, l'envoi posé une fois ────────────────────────
ALTER TABLE "alertes_liberation" ADD CONSTRAINT "alertes_liberation_siren_forme"
  CHECK ("siren" ~ '^[0-9]{9}$');
CREATE UNIQUE INDEX "alertes_liberation_une_en_attente" ON "alertes_liberation" ("apporteur_id", "siren")
  WHERE "envoyee_at" IS NULL;
-- À l'échéance du registre, l'apporteur se purge avec sa date : la ligne nue reste.
ALTER TABLE "alertes_liberation" ADD CONSTRAINT "alertes_liberation_apporteur_purge_liee"
  CHECK (("apporteur_purge_at" IS NULL) = ("apporteur_id" IS NOT NULL));
CREATE TRIGGER alertes_liberation_ajout_seul BEFORE UPDATE OR DELETE ON "alertes_liberation"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('une_fois:envoyee_at', 'purge:apporteur_id', 'une_fois:apporteur_purge_at');
CREATE TRIGGER alertes_liberation_troncature BEFORE TRUNCATE ON "alertes_liberation"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('une_fois:envoyee_at', 'purge:apporteur_id', 'une_fois:apporteur_purge_at');

-- ── anomalies : la forme, et une clôture une seule fois, sans retour ────────────────────────
-- Le score existe si et seulement si l'anomalie est de sincérité, entier de 0 à 100 ; l'anonymisation
-- l'efface.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_score_sincerite"
  CHECK (("anonymisee_at" IS NOT NULL OR ("score" IS NOT NULL) = ("type" = 'sincerite'))
         AND ("score" IS NULL OR "score" BETWEEN 0 AND 100));
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_statut_traite"
  CHECK (("statut" = 'ouverte') = ("traite_at" IS NULL));
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_traite_par"
  CHECK ("anonymisee_at" IS NOT NULL OR ("traite_at" IS NULL) = ("traite_par_id" IS NULL));
-- L'apporteur est présent tant que l'anomalie n'est pas anonymisée.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_apporteur_present"
  CHECK ("anonymisee_at" IS NOT NULL OR "apporteur_id" IS NOT NULL);
-- L'ANONYMISATION (forme d'A02) : une anomalie close, dont plus rien ne désigne une personne ; ne
-- restent que l'id, le type, le statut et les MOIS d'ouverture et de traitement, tronqués en UTC.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_anonymisation_liee"
  CHECK ("anonymisee_at" IS NULL OR (
    "statut" <> 'ouverte'
    AND num_nonnulls("score", "apporteur_id", "attribution_id", "traite_par_id", "justification_chiffre", "justification_purgee_at",
                     "mesure_terminee_at", "gel_litige_at", "gel_litige_leve_at", "gel_litige_ref") = 0
    AND date_trunc('month', "ouverte_at" AT TIME ZONE 'UTC') = ("ouverte_at" AT TIME ZONE 'UTC')
    AND date_trunc('month', "traite_at" AT TIME ZONE 'UTC') = ("traite_at" AT TIME ZONE 'UTC')));
-- La justification porte un soupçon sur une personne : CHIFFRÉE (`colonnesPii`), jamais en clair, ni
-- copie, ni empreinte, ni extrait. Elle naît à la clôture, et seule la purge la vide (forme d'A02).
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_justification_a_la_cloture"
  CHECK (("statut" = 'ouverte') = ("justification_chiffre" IS NULL AND "justification_purgee_at" IS NULL AND "anonymisee_at" IS NULL));
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_justification_purge_liee"
  CHECK ("justification_purgee_at" IS NULL OR "justification_chiffre" IS NULL);
-- Un chiffré vide n'est pas une justification.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_justification_non_vide"
  CHECK ("justification_chiffre" IS NULL OR octet_length("justification_chiffre") > 0);
-- LE GEL POUR LITIGE (exigence de la juriste, forme d'A02) : posé une fois avec sa référence, levé
-- une fois, après. Aucun identifiant de la personne de la console n'est stocké : le geste est journalisé.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_gel_litige_forme"
  CHECK (("gel_litige_at" IS NULL) = ("gel_litige_ref" IS NULL)
         AND ("gel_litige_leve_at" IS NULL OR "gel_litige_at" IS NOT NULL)
         AND ("gel_litige_leve_at" IS NULL OR "gel_litige_leve_at" >= "gel_litige_at"));
-- La référence du litige : le motif unique de la référence de source, un numéro de rôle ou de
-- dossier, jamais un nom ; VARCHAR(64) borne la longueur.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_gel_litige_ref_forme"
  CHECK ("gel_litige_ref" IS NULL OR "gel_litige_ref" ~ '^[A-Za-z0-9._/-]*[0-9][A-Za-z0-9._/-]*$');
-- LA FIN RÉELLE DE LA MESURE (exigence de la juriste, forme d'A02) : elle n'existe que sur une anomalie
-- confirmée, jamais avant sa clôture ; une anomalie levée n'en a pas, rien ne la retient.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_mesure_terminee"
  CHECK ("mesure_terminee_at" IS NULL OR ("statut" = 'confirmee' AND "mesure_terminee_at" >= "traite_at"));
-- Seule une anomalie CONFIRMÉE se gèle : une anomalie levée n'est jamais gelée.
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_gel_litige_confirmee"
  CHECK ("gel_litige_at" IS NULL OR "statut" = 'confirmee');

-- Une fonction DÉDIÉE, et non le gabarit : `statut` passe d'une valeur à une autre, ce que `purge:`
-- et `une_fois:` ne savent pas dire (forme d'A02, patron de SEC-49). Sans EXECUTE. Sont FIGÉS :
-- l'identité, le type, le score, l'apporteur, l'attribution et l'ouverture. `statut` ne quitte
-- `ouverte` qu'une fois, sans retour, dans la MÊME écriture qui pose `traite_at`, `traite_par_id`
-- et la justification chiffrée. Une anomalie close ne change plus, sauf la PURGE de sa justification
-- (le texte va à NULL, `justification_purgee_at` posée, une fois) ; après la purge, plus rien ne
-- bouge. L'ANONYMISATION d'une anomalie close vide d'un coup tout ce qui désigne une personne et
-- tronque ses dates au mois (UTC) ; après elle, plus rien ne bouge. DELETE et TRUNCATE sont refusés.
-- LE GEL POUR LITIGE (forme d'A02) : posé une fois (date et référence ensemble, sans levée), levé une
-- fois, sans second gel ; le geste s'écrit seul, sur une anomalie close, purgée ou non. Tant qu'il est
-- ACTIF, l'anonymisation et la purge de la justification sont refusées ; l'anonymisation le vide.
-- LA FIN DE LA MESURE (forme d'A02) : posée à la clôture (une mesure sans durée, elle vaut alors
-- `traite_at`) ou plus tard, une fois, sur une anomalie close, purgée ou non ; aucun événement.
-- Une anomalie confirmée ne s'anonymise qu'avec une mesure terminée et un gel inactif.
CREATE FUNCTION anomalies_refuser_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : % refusé, une anomalie ne disparaît pas (REQ-DM-033)', TG_OP;
  END IF;
  IF OLD."anonymisee_at" IS NOT NULL THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : une anomalie anonymisée ne change plus (REQ-DM-033)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."anonymisee_at" IS NOT NULL THEN
    IF OLD."gel_litige_at" IS NOT NULL AND OLD."gel_litige_leve_at" IS NULL THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : gel pour litige actif, l''anonymisation est refusée (REQ-DM-033)';
    END IF;
    IF OLD."statut" = 'confirmee' AND OLD."mesure_terminee_at" IS NULL THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : mesure non terminée, l''anonymisation est refusée (REQ-DM-033)';
    END IF;
    IF OLD."statut" = 'ouverte'
       OR NEW."id" IS DISTINCT FROM OLD."id" OR NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."statut" IS DISTINCT FROM OLD."statut"
       OR NEW."ouverte_at" IS DISTINCT FROM (date_trunc('month', OLD."ouverte_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
       OR NEW."traite_at" IS DISTINCT FROM (date_trunc('month', OLD."traite_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : l''anonymisation garde l''id, le type, le statut et les mois, en une écriture, sur une anomalie close (REQ-DM-033)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."score" IS DISTINCT FROM OLD."score"
     OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
     OR NEW."attribution_id" IS DISTINCT FROM OLD."attribution_id"
     OR NEW."ouverte_at" IS DISTINCT FROM OLD."ouverte_at" THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : l''identité d''une anomalie est figée (REQ-DM-033)';
  END IF;
  IF NEW."gel_litige_at" IS DISTINCT FROM OLD."gel_litige_at"
     OR NEW."gel_litige_leve_at" IS DISTINCT FROM OLD."gel_litige_leve_at"
     OR NEW."gel_litige_ref" IS DISTINCT FROM OLD."gel_litige_ref" THEN
    IF NEW."statut" IS DISTINCT FROM OLD."statut"
       OR NEW."traite_at" IS DISTINCT FROM OLD."traite_at"
       OR NEW."traite_par_id" IS DISTINCT FROM OLD."traite_par_id"
       OR NEW."justification_chiffre" IS DISTINCT FROM OLD."justification_chiffre"
       OR NEW."justification_purgee_at" IS DISTINCT FROM OLD."justification_purgee_at"
       OR NEW."mesure_terminee_at" IS DISTINCT FROM OLD."mesure_terminee_at" THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : le geste du gel pour litige s''écrit seul (REQ-DM-033)';
    END IF;
    IF OLD."gel_litige_at" IS NOT NULL
       AND (NEW."gel_litige_at" IS DISTINCT FROM OLD."gel_litige_at"
            OR NEW."gel_litige_ref" IS DISTINCT FROM OLD."gel_litige_ref") THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : le gel pour litige se pose une fois, sa référence ne se réécrit pas (REQ-DM-033)';
    END IF;
    IF OLD."gel_litige_leve_at" IS NOT NULL
       AND NEW."gel_litige_leve_at" IS DISTINCT FROM OLD."gel_litige_leve_at" THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : la levée du gel pour litige s''écrit une fois (REQ-DM-033)';
    END IF;
    IF OLD."gel_litige_at" IS NULL AND NEW."gel_litige_at" IS NOT NULL
       AND NEW."gel_litige_leve_at" IS NOT NULL THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : le gel pour litige se pose sans sa levée (REQ-DM-033)';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."gel_litige_at" IS NOT NULL AND OLD."gel_litige_leve_at" IS NULL
     AND (NEW."justification_chiffre" IS DISTINCT FROM OLD."justification_chiffre"
          OR NEW."justification_purgee_at" IS DISTINCT FROM OLD."justification_purgee_at") THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : gel pour litige actif, la purge de la justification est refusée (REQ-DM-033)';
  END IF;
  IF OLD."mesure_terminee_at" IS NOT NULL
     AND NEW."mesure_terminee_at" IS DISTINCT FROM OLD."mesure_terminee_at" THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : la fin de la mesure se pose une fois (REQ-DM-033)';
  END IF;
  IF OLD."justification_purgee_at" IS NOT NULL THEN
    IF NEW."statut" IS DISTINCT FROM OLD."statut"
       OR NEW."traite_at" IS DISTINCT FROM OLD."traite_at"
       OR NEW."traite_par_id" IS DISTINCT FROM OLD."traite_par_id"
       OR NEW."justification_chiffre" IS DISTINCT FROM OLD."justification_chiffre"
       OR NEW."justification_purgee_at" IS DISTINCT FROM OLD."justification_purgee_at" THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : une anomalie purgée ne change plus (REQ-DM-033)';
    END IF;
  ELSIF OLD."statut" <> 'ouverte' THEN
    IF NEW."statut" IS DISTINCT FROM OLD."statut"
       OR NEW."traite_at" IS DISTINCT FROM OLD."traite_at"
       OR NEW."traite_par_id" IS DISTINCT FROM OLD."traite_par_id" THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : une anomalie close ne change plus (REQ-DM-033)';
    END IF;
    IF (NEW."justification_chiffre" IS DISTINCT FROM OLD."justification_chiffre"
        OR NEW."justification_purgee_at" IS DISTINCT FROM OLD."justification_purgee_at")
       AND NOT (NEW."justification_chiffre" IS NULL AND NEW."justification_purgee_at" IS NOT NULL) THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : la justification ne se réécrit pas ; seule la purge la vide, avec sa date (REQ-DM-033)';
    END IF;
  ELSIF NEW."statut" = 'ouverte' THEN
    IF num_nonnulls(NEW."traite_at", NEW."traite_par_id", NEW."justification_chiffre", NEW."justification_purgee_at", NEW."mesure_terminee_at") > 0 THEN
      RAISE EXCEPTION 'anomalies_refuser_substitution : le traitement ne se pose qu''avec la clôture (REQ-DM-033)';
    END IF;
  ELSIF num_nonnulls(NEW."traite_at", NEW."traite_par_id", NEW."justification_chiffre") < 3
        OR NEW."justification_purgee_at" IS NOT NULL THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : la clôture pose statut, traite_at, traite_par_id et la justification ensemble (REQ-DM-033)';
  ELSIF NEW."mesure_terminee_at" IS DISTINCT FROM NEW."traite_at" AND NEW."mesure_terminee_at" IS NOT NULL THEN
    RAISE EXCEPTION 'anomalies_refuser_substitution : à la clôture, la fin de la mesure vaut traite_at, ou se pose plus tard (REQ-DM-033)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER anomalies_trace BEFORE UPDATE OR DELETE ON "anomalies"
  FOR EACH ROW EXECUTE FUNCTION anomalies_refuser_substitution();
CREATE TRIGGER anomalies_troncature BEFORE TRUNCATE ON "anomalies"
  FOR EACH STATEMENT EXECUTE FUNCTION anomalies_refuser_substitution();

-- ── rattachements_manuels : justifiés, antérieurs au dépôt, un actif par SIREN ──────────────
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_siren_forme"
  CHECK ("siren_commande" ~ '^[0-9]{9}$');
-- La justification, CHIFFRÉE (`colonnesPii`) : elle peut nommer une personne. Le plancher de vingt
-- caractères utiles se juge dans le DOMAINE, avant le chiffrement ; on ne mesure pas un chiffré. Elle
-- existe dès la décision, et seule la purge à l'échéance la vide, avec sa date (forme d'A02).
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_justification_purge_liee"
  CHECK (("justification_purgee_at" IS NULL) = ("justification_chiffre" IS NOT NULL));
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_justification_non_vide"
  CHECK ("justification_chiffre" IS NULL OR octet_length("justification_chiffre") > 0);
-- La référence de la pièce : un identifiant court, sans espace ni lettre accentuée, et qui porte un
-- chiffre (numéro d'annonce, date d'extrait, millésime, numéro d'inscription) : ni phrase, ni nom.
ALTER TABLE "rattachements_manuels" ADD CONSTRAINT "rattachements_manuels_source_ref_forme"
  CHECK ("lien_controle_source_ref" ~ '^[A-Za-z0-9._/-]*[0-9][A-Za-z0-9._/-]*$' AND char_length("lien_controle_source_ref") <= 64);
CREATE UNIQUE INDEX "rattachements_manuels_un_actif_par_siren" ON "rattachements_manuels" ("siren_commande")
  WHERE "revoque_at" IS NULL;

-- Le lien de contrôle est établi au plus tard au dépôt de l'attribution rattachée : un lien né après
-- n'ouvre aucun droit. `lien_controle_etabli_at` est la DATE DE LA PIÈCE qui établit le lien, posée
-- par le domaine au début de son jour à Paris ; la date du dépôt vit dans `attributions`, et ce
-- déclencheur la lit, sans copie qui pourrait diverger.
CREATE FUNCTION rattachement_lien_anterieur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."lien_controle_etabli_at" > (
    SELECT a."deposee_at" FROM "attributions" a WHERE a."id" = NEW."attribution_id"
  ) THEN
    RAISE EXCEPTION 'rattachement_lien_anterieur : le lien de contrôle est postérieur au dépôt (REQ-DM-034)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rattachement_lien_anterieur
  BEFORE INSERT OR UPDATE OF "lien_controle_etabli_at", "attribution_id" ON "rattachements_manuels"
  FOR EACH ROW EXECUTE FUNCTION rattachement_lien_anterieur();
CREATE TRIGGER rattachements_manuels_ajout_seul BEFORE UPDATE OR DELETE ON "rattachements_manuels"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('une_fois:revoque_at', 'purge:justification_chiffre', 'une_fois:justification_purgee_at');
CREATE TRIGGER rattachements_manuels_troncature BEFORE TRUNCATE ON "rattachements_manuels"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('une_fois:revoque_at', 'purge:justification_chiffre', 'une_fois:justification_purgee_at');

-- ── contestations : un objet, une cible, une réponse posée une fois, une purge tracée ───────
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_objet_cible"
  CHECK (CASE WHEN "objet" = 'refus_depot'
              THEN "depot_refuse_id" IS NOT NULL AND "attribution_id" IS NULL
              ELSE "attribution_id" IS NOT NULL AND "depot_refuse_id" IS NULL END);
-- L'auteur et la date de la réponse vont ensemble ; avant la purge, la réponse va avec eux. Après
-- la purge, l'auteur et la date restent seuls, comme trace.
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_reponse_ensemble"
  CHECK (num_nonnulls("repondue_par_id", "repondue_at") IN (0, 2)
         AND ("purgee_at" IS NOT NULL OR ("reponse_chiffre" IS NULL) = ("repondue_at" IS NULL)));
-- La purge vide le texte et la réponse, et pose sa date : l'un ne va jamais sans l'autre.
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_purge_liee"
  CHECK (("purgee_at" IS NULL) = ("texte_chiffre" IS NOT NULL)
         AND ("purgee_at" IS NULL OR "reponse_chiffre" IS NULL));
-- LE GEL POUR LITIGE (exigence de la juriste, forme d'A02) : posé une fois avec sa référence, levé
-- une fois, après. Aucun identifiant de la personne de la console n'est stocké : le geste est journalisé.
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_gel_litige_forme"
  CHECK (("gel_litige_at" IS NULL) = ("gel_litige_ref" IS NULL)
         AND ("gel_litige_leve_at" IS NULL OR "gel_litige_at" IS NOT NULL)
         AND ("gel_litige_leve_at" IS NULL OR "gel_litige_leve_at" >= "gel_litige_at"));
-- La référence du litige : le motif unique de la référence de source, un numéro de rôle ou de
-- dossier, jamais un nom ; VARCHAR(64) borne la longueur.
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_gel_litige_ref_forme"
  CHECK ("gel_litige_ref" IS NULL OR "gel_litige_ref" ~ '^[A-Za-z0-9._/-]*[0-9][A-Za-z0-9._/-]*$');

-- Une fonction DÉDIÉE, et non le gabarit : la réponse va de NULL à une valeur, PUIS à NULL par la
-- purge, ce que le gabarit ne sait pas dire sur une même colonne (forme d'A02, patron de SEC-49).
-- Sans EXECUTE. Sont FIGÉS : l'identité, l'apporteur, l'objet, la cible et la réception. Un texte
-- ou une réponse ne passe jamais d'une valeur à une autre. La réponse (réponse, auteur, date) se
-- pose une fois, ensemble, sur une contestation non purgée. La purge pose `purgee_at` une fois,
-- avec le texte et la réponse vidés ; après elle, plus rien ne bouge. DELETE et TRUNCATE refusés.
-- LE GEL POUR LITIGE (forme d'A02) : posé une fois (date et référence ensemble, sans levée), levé une
-- fois, sans second gel ; le geste s'écrit seul, avant la purge. Tant qu'il est ACTIF, la purge est refusée.
CREATE FUNCTION contestations_refuser_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : % refusé, une contestation ne disparaît pas (REQ-DM-043)', TG_OP;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
     OR NEW."objet" IS DISTINCT FROM OLD."objet"
     OR NEW."depot_refuse_id" IS DISTINCT FROM OLD."depot_refuse_id"
     OR NEW."attribution_id" IS DISTINCT FROM OLD."attribution_id"
     OR NEW."recue_at" IS DISTINCT FROM OLD."recue_at" THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : l''identité d''une contestation est figée (REQ-DM-043)';
  END IF;
  IF OLD."purgee_at" IS NOT NULL THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'contestations_refuser_substitution : une contestation purgée ne change plus (REQ-DM-043)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."gel_litige_at" IS DISTINCT FROM OLD."gel_litige_at"
     OR NEW."gel_litige_leve_at" IS DISTINCT FROM OLD."gel_litige_leve_at"
     OR NEW."gel_litige_ref" IS DISTINCT FROM OLD."gel_litige_ref" THEN
    IF NEW."texte_chiffre" IS DISTINCT FROM OLD."texte_chiffre"
       OR NEW."reponse_chiffre" IS DISTINCT FROM OLD."reponse_chiffre"
       OR NEW."repondue_par_id" IS DISTINCT FROM OLD."repondue_par_id"
       OR NEW."repondue_at" IS DISTINCT FROM OLD."repondue_at"
       OR NEW."purgee_at" IS DISTINCT FROM OLD."purgee_at" THEN
      RAISE EXCEPTION 'contestations_refuser_substitution : le geste du gel pour litige s''écrit seul (REQ-DM-043)';
    END IF;
    IF OLD."gel_litige_at" IS NOT NULL
       AND (NEW."gel_litige_at" IS DISTINCT FROM OLD."gel_litige_at"
            OR NEW."gel_litige_ref" IS DISTINCT FROM OLD."gel_litige_ref") THEN
      RAISE EXCEPTION 'contestations_refuser_substitution : le gel pour litige se pose une fois, sa référence ne se réécrit pas (REQ-DM-043)';
    END IF;
    IF OLD."gel_litige_leve_at" IS NOT NULL
       AND NEW."gel_litige_leve_at" IS DISTINCT FROM OLD."gel_litige_leve_at" THEN
      RAISE EXCEPTION 'contestations_refuser_substitution : la levée du gel pour litige s''écrit une fois (REQ-DM-043)';
    END IF;
    IF OLD."gel_litige_at" IS NULL AND NEW."gel_litige_at" IS NOT NULL
       AND NEW."gel_litige_leve_at" IS NOT NULL THEN
      RAISE EXCEPTION 'contestations_refuser_substitution : le gel pour litige se pose sans sa levée (REQ-DM-043)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."purgee_at" IS NOT NULL AND OLD."gel_litige_at" IS NOT NULL AND OLD."gel_litige_leve_at" IS NULL THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : gel pour litige actif, la purge est refusée (REQ-DM-043)';
  END IF;
  -- Une valeur ne devient jamais une autre valeur : seulement NULL vers valeur, ou valeur vers NULL.
  IF (OLD."texte_chiffre" IS NOT NULL AND NEW."texte_chiffre" IS NOT NULL
        AND NEW."texte_chiffre" IS DISTINCT FROM OLD."texte_chiffre")
     OR (OLD."reponse_chiffre" IS NOT NULL AND NEW."reponse_chiffre" IS NOT NULL
        AND NEW."reponse_chiffre" IS DISTINCT FROM OLD."reponse_chiffre")
     OR (OLD."repondue_par_id" IS NOT NULL AND NEW."repondue_par_id" IS DISTINCT FROM OLD."repondue_par_id")
     OR (OLD."repondue_at" IS NOT NULL AND NEW."repondue_at" IS DISTINCT FROM OLD."repondue_at")
     OR (OLD."texte_chiffre" IS NULL AND NEW."texte_chiffre" IS NOT NULL) THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : un texte, une réponse, son auteur ou sa date ne se réécrit pas (REQ-DM-043)';
  END IF;
  -- La réponse se pose ENSEMBLE : réponse, auteur et date dans la même écriture.
  IF OLD."repondue_at" IS NULL AND NEW."purgee_at" IS NULL
     AND num_nonnulls(NEW."reponse_chiffre", NEW."repondue_par_id", NEW."repondue_at") NOT IN (0, 3) THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : la réponse pose texte, auteur et date ensemble (REQ-DM-043)';
  END IF;
  -- La purge ne fabrique pas la trace d'une réponse : sur une contestation jamais répondue, elle ne
  -- pose ni l'auteur ni la date d'une réponse (la date fait courir le délai de quinze jours).
  IF NEW."purgee_at" IS NOT NULL AND OLD."repondue_at" IS NULL AND NEW."repondue_at" IS NOT NULL THEN
    RAISE EXCEPTION 'contestations_refuser_substitution : la purge ne pose pas de réponse (REQ-DM-043)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contestations_trace BEFORE UPDATE OR DELETE ON "contestations"
  FOR EACH ROW EXECUTE FUNCTION contestations_refuser_substitution();
CREATE TRIGGER contestations_troncature BEFORE TRUNCATE ON "contestations"
  FOR EACH STATEMENT EXECUTE FUNCTION contestations_refuser_substitution();

-- ── W19 : jamais un conseiller pour traiter, décider ou répondre ─────────────────────────────
-- UNE fonction partagée (forme d'A02), sans EXECUTE : la colonne est lue par `to_jsonb(NEW)`, et
-- un argument qui ne nomme pas une colonne de la table fait échouer. Comparé en TEXTE, comme le
-- porteur des attributions.
CREATE FUNCTION refuser_acteur_conseiller() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ligne jsonb := to_jsonb(NEW);
BEGIN
  IF TG_NARGS <> 1 OR NOT (ligne ? TG_ARGV[0]) THEN
    RAISE EXCEPTION 'refuser_acteur_conseiller : argument « % » absent de %', TG_ARGV[0], TG_TABLE_NAME;
  END IF;
  IF ligne ->> TG_ARGV[0] IS NOT NULL AND EXISTS (
    SELECT 1 FROM "utilisateurs_console" u
    WHERE u."id" = (ligne ->> TG_ARGV[0])::uuid AND u."role"::text = 'conseiller_salarie'
  ) THEN
    RAISE EXCEPTION 'refuser_acteur_conseiller : % ne désigne jamais un conseiller salarié sur % (W19)', TG_ARGV[0], TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER anomalies_traite_par_pas_conseiller
  BEFORE INSERT OR UPDATE OF "traite_par_id" ON "anomalies"
  FOR EACH ROW EXECUTE FUNCTION refuser_acteur_conseiller('traite_par_id');
CREATE TRIGGER rattachements_manuels_decide_par_pas_conseiller
  BEFORE INSERT OR UPDATE OF "decide_par_id" ON "rattachements_manuels"
  FOR EACH ROW EXECUTE FUNCTION refuser_acteur_conseiller('decide_par_id');
CREATE TRIGGER contestations_repondue_par_pas_conseiller
  BEFORE INSERT OR UPDATE OF "repondue_par_id" ON "contestations"
  FOR EACH ROW EXECUTE FUNCTION refuser_acteur_conseiller('repondue_par_id');

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'anomalie_statut_modifie';

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'contestation_modifiee';

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'rattachement_manuel_modifie';

-- AlterEnum
-- Décision (d) de la juriste : les événements de cycle de vie d'une anomalie ont pour agrégat l'ANOMALIE.
ALTER TYPE "agregat_journal" ADD VALUE 'anomalie';

-- AlterEnum
-- Le gel pour litige d'une anomalie, posé ou levé, sur l'agrégat ANOMALIE, sans la référence.
ALTER TYPE "type_evenement_journal" ADD VALUE 'anomalie_gel_modifie';
