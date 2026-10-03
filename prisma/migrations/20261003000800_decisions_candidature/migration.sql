-- CPL-T06 (REQ-CPL-006) — l'étape 3 du cycle : la décision sur une candidature. Cadrage de
-- l'architecte du 2026-09-26 (partners/ADR-0022). AJOUT SEULEMENT : un type et une table neufs, aucune
-- colonne existante touchée.

-- CreateEnum
CREATE TYPE "resultat_decision_candidature" AS ENUM ('retenu', 'vivier', 'refuse');

-- CreateTable
CREATE TABLE "decisions_candidature" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "resultat" "resultat_decision_candidature" NOT NULL,
    "justification" TEXT,
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

-- Le motif de la décision est exigé (REQ-CPL-006) : jamais vide, blancs compris. Il se PURGE
-- (rattrapage 81, forme d'A02) : NULL avec sa date de purge, ensemble ou pas du tout — donc exigé à
-- l'insertion, où aucune date de purge n'est posée.
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_justification_non_vide"
  CHECK ("justification" IS NULL OR btrim("justification") <> '');
ALTER TABLE "decisions_candidature" ADD CONSTRAINT "decisions_candidature_justification_purge_liee"
  CHECK (("justification" IS NULL) = ("justification_purgee_at" IS NOT NULL));

-- EN AJOUT SEUL : une nouvelle décision est une nouvelle ligne. Le trio des tables en ajout seul —
-- mise à jour, suppression, troncature — par la fonction commune `refuser_modification_sauf`
-- (migration `20261002000300_depot_persistance`), sauf la purge du motif : `purge:justification`
-- (NULL seulement) et `une_fois:justification_purgee_at` (posée une fois, jamais réécrite).
CREATE TRIGGER decisions_candidature_ajout_seul BEFORE UPDATE OR DELETE ON "decisions_candidature"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:justification', 'une_fois:justification_purgee_at');
CREATE TRIGGER decisions_candidature_troncature BEFORE TRUNCATE ON "decisions_candidature"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:justification', 'une_fois:justification_purgee_at');
