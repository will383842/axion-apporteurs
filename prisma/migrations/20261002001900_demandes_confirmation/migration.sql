-- DM-40 (REQ-DM-060, HYP-W20-LIEN, HYP-W20-ANNULATION) : la demande de confirmation d'un dépôt, UNE
-- par attribution, et les révisions du contact pendant le délai avant envoi. Additive : deux tables
-- neuves, leurs contraintes et leurs déclencheurs ; rien d'existant n'est touché. L'échéance d'envoi
-- se DÉRIVE de `deposee_at` et de la SSOT : aucune colonne ne la stocke (partners/ADR-0022 §8).
--
-- Retour arrière : DROP TABLE "revisions_demande_confirmation", puis DROP TABLE
-- "demandes_confirmation" (leurs index, contraintes et déclencheurs avec elles). Les demandes et
-- révisions écrites depuis sont perdues, rien d'autre.

-- CreateTable
CREATE TABLE "demandes_confirmation" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "etat" "etat_demande_confirmation" NOT NULL DEFAULT 'planifiee',
    "creee_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "envoyee_at" TIMESTAMPTZ(3),
    "repondu_at" TIMESTAMPTZ(3),
    "jeton_oui_hash" CHAR(64),
    "jeton_non_hash" CHAR(64),
    "jetons_revoques_at" TIMESTAMPTZ(3),
    "clic_ip_hash" CHAR(16),

    CONSTRAINT "demandes_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revisions_demande_confirmation" (
    "id" UUID NOT NULL,
    "demande_id" UUID NOT NULL,
    "revisee_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "nom_contact_chiffre" BYTEA,
    "prenom_contact_chiffre" BYTEA,
    "email_chiffre" BYTEA,
    "email_hash" CHAR(64),
    "telephone_chiffre" BYTEA,
    "phone_hash" CHAR(64),
    "fonction_contact_chiffre" BYTEA,
    "contexte_chiffre" BYTEA,
    "purgee_at" TIMESTAMPTZ(3),

    CONSTRAINT "revisions_demande_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demandes_confirmation_attribution_id_key" ON "demandes_confirmation"("attribution_id");

-- CreateIndex
CREATE INDEX "revisions_demande_confirmation_demande_id_idx" ON "revisions_demande_confirmation"("demande_id");

-- AddForeignKey
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revisions_demande_confirmation" ADD CONSTRAINT "revisions_demande_confirmation_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demandes_confirmation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL brut : Prisma ne modélise ni CHECK, ni index partiel, ni déclencheur (partners/ADR-0015).

-- ── les jetons : des empreintes seulement, uniques, révoquées ensemble ─────────────────────────
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_jeton_oui_hex"
  CHECK ("jeton_oui_hash" IS NULL OR "jeton_oui_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_jeton_non_hex"
  CHECK ("jeton_non_hash" IS NULL OR "jeton_non_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_jetons_ensemble"
  CHECK (("jeton_oui_hash" IS NULL) = ("jeton_non_hash" IS NULL));
-- Des jetons présents n'ont pas de date de révocation ; des jetons révoqués n'existent plus.
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_jetons_revocation_liee"
  CHECK (("jetons_revoques_at" IS NULL) = ("jeton_oui_hash" IS NOT NULL));
CREATE UNIQUE INDEX "demandes_confirmation_jeton_oui_hash_key" ON "demandes_confirmation" ("jeton_oui_hash")
  WHERE "jeton_oui_hash" IS NOT NULL;
CREATE UNIQUE INDEX "demandes_confirmation_jeton_non_hash_key" ON "demandes_confirmation" ("jeton_non_hash")
  WHERE "jeton_non_hash" IS NOT NULL;

-- ── l'empreinte d'IP du clic : tronquée et salée (REQ-SEC-024), jamais l'adresse ───────────────
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_clic_ip_hash_hex"
  CHECK ("clic_ip_hash" IS NULL OR "clic_ip_hash" ~ '^[0-9a-f]{16}$');

-- ── les révisions : en ajout seul, purgées avec le contact ─────────────────────────────────────
ALTER TABLE "revisions_demande_confirmation" ADD CONSTRAINT "revisions_demande_confirmation_email_hash_hex"
  CHECK ("email_hash" IS NULL OR "email_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "revisions_demande_confirmation" ADD CONSTRAINT "revisions_demande_confirmation_phone_hash_hex"
  CHECK ("phone_hash" IS NULL OR "phone_hash" ~ '^[0-9a-f]{64}$');
-- Une révision purgée ne garde aucun bloc.
ALTER TABLE "revisions_demande_confirmation" ADD CONSTRAINT "revisions_demande_confirmation_purge_liee"
  CHECK ("purgee_at" IS NULL OR (
    "nom_contact_chiffre" IS NULL AND "prenom_contact_chiffre" IS NULL AND "email_chiffre" IS NULL
    AND "email_hash" IS NULL AND "telephone_chiffre" IS NULL AND "phone_hash" IS NULL
    AND "fonction_contact_chiffre" IS NULL AND "contexte_chiffre" IS NULL
  ));
-- Le gabarit générique (HYP-A02-GABARIT-AJOUT-SEUL), branché, jamais recréé : chaque bloc peut
-- s'effacer, la date de purge s'écrit une fois, rien d'autre ne change ; DELETE et TRUNCATE refusés.
CREATE TRIGGER revisions_demande_confirmation_ajout_seul BEFORE UPDATE OR DELETE ON "revisions_demande_confirmation"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:nom_contact_chiffre', 'purge:prenom_contact_chiffre', 'purge:email_chiffre', 'purge:email_hash', 'purge:telephone_chiffre', 'purge:phone_hash', 'purge:fonction_contact_chiffre', 'purge:contexte_chiffre', 'une_fois:purgee_at');
CREATE TRIGGER revisions_demande_confirmation_troncature BEFORE TRUNCATE ON "revisions_demande_confirmation"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:nom_contact_chiffre', 'purge:prenom_contact_chiffre', 'purge:email_chiffre', 'purge:email_hash', 'purge:telephone_chiffre', 'purge:phone_hash', 'purge:fonction_contact_chiffre', 'purge:contexte_chiffre', 'une_fois:purgee_at');
