-- Socle du schéma Partners et journal Evenement — DM-01 (partners/ADR-0015).
-- Partie générée : `pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`,
-- les valeurs de chaque CREATE TYPE reformatées UNE PAR LIGNE, comme dans `schema.prisma` (c'est la
-- projection de l'enum complet, pas une liste d'états recopiée : `partners:schema:enums`).

-- CreateEnum
CREATE TYPE "etat_attribution" AS ENUM (
    'en_attente',
    'provisoire',
    'active',
    'rdv_pris',
    'proposition',
    'signee',
    'convertie',
    'figee_resiliation',
    'invalidee',
    'perdue',
    'perimee',
    'expiree',
    'annulee'
);

-- CreateEnum
CREATE TYPE "console_role" AS ENUM (
    'admin',
    'qualifieur',
    'comptable',
    'lecteur'
);

-- CreateEnum
CREATE TYPE "type_evenement_journal" AS ENUM (
    'journal_ouvert'
);

-- CreateEnum
CREATE TYPE "agregat_journal" AS ENUM (
    'attribution',
    'apporteur',
    'ligne_commission',
    'releve',
    'piece_kyc',
    'contrat'
);

-- CreateTable
CREATE TABLE "evenements" (
    "id" BIGSERIAL NOT NULL,
    "type" "type_evenement_journal" NOT NULL,
    "agregat" "agregat_journal",
    "agregat_id" UUID,
    "survenu_at" TIMESTAMPTZ(3) NOT NULL,
    "charge" JSONB NOT NULL,
    "prev_hash" CHAR(64) NOT NULL,
    "self_hash" CHAR(64) NOT NULL,

    CONSTRAINT "evenements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evenements_prev_hash_key" ON "evenements"("prev_hash");

-- CreateIndex
CREATE UNIQUE INDEX "evenements_self_hash_key" ON "evenements"("self_hash");

-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur (partners/ADR-0015).
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_hashes_hex"
  CHECK ("prev_hash" ~ '^[0-9a-f]{64}$' AND "self_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_agregat_complet"
  CHECK (("agregat" IS NULL) = ("agregat_id" IS NULL));

-- Le refus est celui de la BASE (REQ-DM-024) : un client qui passe par du SQL brut s'y heurte aussi.
CREATE FUNCTION evenements_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'evenements_append_only : % refusé, le journal est append-only (REQ-DM-024)', TG_OP;
END;
$$;
CREATE TRIGGER evenements_append_only BEFORE UPDATE OR DELETE ON "evenements"
  FOR EACH ROW EXECUTE FUNCTION evenements_refuser_modification();
-- Un déclencheur de ligne ne voit pas TRUNCATE : sans celui d'instruction, `TRUNCATE evenements` passe.
CREATE TRIGGER evenements_append_only_troncature BEFORE TRUNCATE ON "evenements"
  FOR EACH STATEMENT EXECUTE FUNCTION evenements_refuser_modification();

-- Genèse (décision 2) : la seule ligne dont prev_hash vaut 64 zéros. Son self_hash est GENESE.selfHash,
-- calculé par `src/domain/evenement/journal.ts` ; `tests/unit/domaine/journal-chaine.spec.ts` tient
-- les deux copies égales.
INSERT INTO "evenements" ("type", "agregat", "agregat_id", "survenu_at", "charge", "prev_hash", "self_hash")
VALUES ('journal_ouvert', NULL, NULL, '2026-09-19T00:00:00.000Z', '{"algorithme":"sha256-jcs-v1"}',
        '0000000000000000000000000000000000000000000000000000000000000000', '44c2b394d7fd4e8cab20e92d7011c1db8a13c8e4e1dc972363c2e6bf190ac197');
