-- CPL-T06 (REQ-CPL-006) — l'étape 3 du cycle : la décision sur une candidature. Cadrage de
-- l'architecte du 2026-09-26 (partners/ADR-0022). AJOUT SEULEMENT : un type et une table neufs, aucune
-- colonne existante touchée.
-- Retour arrière : DROP TABLE "decisions_candidature" (ses index, contraintes et déclencheurs avec
-- elle), puis DROP TYPE "resultat_decision_candidature". Les décisions écrites depuis sont perdues.

-- CreateEnum
CREATE TYPE "resultat_decision_candidature" AS ENUM ('retenu', 'vivier', 'refuse');

-- CreateTable
CREATE TABLE "decisions_candidature" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID,
    "apporteur_purge_at" TIMESTAMPTZ(3),
    "resultat" "resultat_decision_candidature" NOT NULL,
    "justification_chiffre" BYTEA,
    "justification_purgee_at" TIMESTAMPTZ(3),
    "webinaire_suivi" BOOLEAN,
    "auteur_id" UUID NOT NULL,
    "decidee_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "decisions_candidature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisions_candidature_apporteur_id_decidee_at_idx" ON "decisions_candidature"("apporteur_id", "decidee_at");

-- AddForeignKey
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL brut : Prisma ne modélise ni CHECK ni déclencheur (partners/ADR-0015).

-- Le motif est exigé (REQ-CPL-006) et peut nommer une personne : CHIFFRÉ (`colonnesPii`, AAD = le
-- modèle, l'id et le champ, sous les SECRETS des PII), sans empreinte ni extrait. « Jamais vide,
-- blancs compris » se juge dans le DOMAINE, avant le chiffrement ; la base refuse un chiffré vide.
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_justification_non_vide"
  CHECK ("justification_chiffre" IS NULL OR octet_length("justification_chiffre") > 0);
-- Le motif se PURGE avec sa date, ensemble ou pas du tout : il est donc exigé à l'insertion.
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_justification_purge_liee"
  CHECK (("justification_chiffre" IS NULL) = ("justification_purgee_at" IS NOT NULL));
-- La décision suit la fiche de l'apporteur : quand celle-ci est supprimée à l'échéance (candidat
-- refusé, ou fiche effacée plus tard), le lien se vide avec sa date, et la clé RESTRICT ne bloque plus.
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_apporteur_purge_liee"
  CHECK (("apporteur_purge_at" IS NULL) = ("apporteur_id" IS NOT NULL));
-- Le motif part AU PLUS TARD avec le lien : un motif sans lien peut encore nommer la personne.
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_purge_ordre"
  CHECK ("apporteur_purge_at" IS NULL OR "justification_purgee_at" IS NOT NULL);

-- EN AJOUT SEUL : une nouvelle décision est une nouvelle ligne. Le gabarit commun
-- `refuser_modification_sauf` (migration `20261002000300_depot_persistance`) refuse mise à jour,
-- suppression et troncature, sauf les deux purges : le motif et le lien passent à NULL seulement,
-- chacun avec sa date posée une fois, jamais réécrite.
CREATE TRIGGER decisions_candidature_ajout_seul BEFORE UPDATE OR DELETE ON "decisions_candidature"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:justification_chiffre', 'une_fois:justification_purgee_at', 'purge:apporteur_id', 'une_fois:apporteur_purge_at');
CREATE TRIGGER decisions_candidature_troncature BEFORE TRUNCATE ON "decisions_candidature"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:justification_chiffre', 'une_fois:justification_purgee_at', 'purge:apporteur_id', 'une_fois:apporteur_purge_at');
