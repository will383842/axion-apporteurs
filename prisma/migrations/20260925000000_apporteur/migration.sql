-- L'apporteur, ses jetons de dépôt et ses identités de facturation — DM-06.
-- Partie générée : `pnpm prisma migrate diff --from-schema-datamodel <schéma de main> --to-schema-datamodel
-- prisma/schema.prisma --script`, les valeurs de chaque CREATE TYPE reformatées UNE PAR LIGNE, comme
-- dans `schema.prisma`. Migration ADDITIVE : trois types, trois tables, aucun objet existant touché.

-- CreateEnum
CREATE TYPE "statut_apporteur" AS ENUM (
    'candidat',
    'retenu',
    'vivier',
    'refuse',
    'kyc_en_cours',
    'pret_a_signer',
    'signe',
    'suspendu',
    'resilie'
);

-- CreateEnum
CREATE TYPE "motif_resiliation" AS ENUM (
    'ordinaire_apporteur',
    'ordinaire_axion',
    'manquement_grave'
);

-- CreateEnum
CREATE TYPE "regime_tva" AS ENUM (
    'assujetti',
    'franchise_293b'
);

-- CreateTable
CREATE TABLE "apporteurs" (
    "id" UUID NOT NULL,
    "statut" "statut_apporteur" NOT NULL,
    "resiliation_motif" "motif_resiliation",
    "code_parrainage" CHAR(8) NOT NULL,
    "is_test" BOOLEAN NOT NULL,
    "seuil_verification_prioritaire" INTEGER,
    "seuil_verification_prioritaire_at" TIMESTAMPTZ(3),
    "candidature_id" UUID NOT NULL,
    "reponses_json" JSONB NOT NULL,
    "score_initial" INTEGER NOT NULL,
    "score_parts_json" JSONB NOT NULL,
    "score_bareme_version" TEXT NOT NULL,
    "source_canal" VARCHAR(512),
    "parrain_code_capture" TEXT,
    "cree_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "apporteurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jetons_depot" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL,
    "revoque_at" TIMESTAMPTZ(3),
    "dernier_usage_at" TIMESTAMPTZ(3),

    CONSTRAINT "jetons_depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identites_facturation" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "siren" CHAR(9) NOT NULL,
    "regime_tva" "regime_tva" NOT NULL,
    "debut_at" TIMESTAMPTZ(3) NOT NULL,
    "fin_at" TIMESTAMPTZ(3),

    CONSTRAINT "identites_facturation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apporteurs_code_parrainage_key" ON "apporteurs"("code_parrainage");

-- CreateIndex
CREATE UNIQUE INDEX "apporteurs_candidature_id_key" ON "apporteurs"("candidature_id");

-- CreateIndex
CREATE UNIQUE INDEX "jetons_depot_token_hash_key" ON "jetons_depot"("token_hash");

-- CreateIndex
CREATE INDEX "jetons_depot_apporteur_id_idx" ON "jetons_depot"("apporteur_id");

-- CreateIndex
CREATE INDEX "identites_facturation_apporteur_id_idx" ON "identites_facturation"("apporteur_id");

-- AddForeignKey
ALTER TABLE "jetons_depot" ADD CONSTRAINT "jetons_depot_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identites_facturation" ADD CONSTRAINT "identites_facturation_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur (partners/ADR-0015).

-- REQ-DM-012 : le code de parrainage a la forme `AX` + 6 caractères Crockford base32 (sans I, L, O, U).
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_code_parrainage_format"
  CHECK ("code_parrainage" ~ '^AX[0-9A-HJKMNP-TV-Z]{6}$');
-- REQ-DM-011 : un motif de résiliation si et seulement si l'apporteur est résilié.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_motif_si_resilie"
  CHECK (("statut" = 'resilie') = ("resiliation_motif" IS NOT NULL));
-- REQ-DM-010 : une surcharge est strictement positive, et tracée par son horodatage — l'un sans l'autre est refusé.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_seuil_surcharge_tracee"
  CHECK (("seuil_verification_prioritaire" IS NULL) = ("seuil_verification_prioritaire_at" IS NULL)
     AND ("seuil_verification_prioritaire" IS NULL OR "seuil_verification_prioritaire" > 0));

-- REQ-DM-012 : l'empreinte d'un jeton est un SHA-256 hexadécimal — jamais un jeton en clair.
ALTER TABLE "jetons_depot" ADD CONSTRAINT "jetons_depot_token_hash_hex"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

-- REQ-CPL-005 : une identité est datée, sur une période non vide, et son SIREN a neuf chiffres.
ALTER TABLE "identites_facturation" ADD CONSTRAINT "identites_facturation_siren_format"
  CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "identites_facturation" ADD CONSTRAINT "identites_facturation_periode"
  CHECK ("fin_at" IS NULL OR "fin_at" > "debut_at");

-- REQ-DM-012 : un jeton révoqué ne se réactive pas. Le refus est celui de la BASE : un client qui
-- passe par du SQL brut s'y heurte aussi. Remettre `revoque_at` à nul ou le déplacer est refusé ;
-- SUPPRIMER un jeton révoqué aussi, sans quoi « supprimer puis réinsérer la même empreinte » le
-- réactiverait par un autre chemin. Révoquer un jeton actif et noter son dernier usage passent.
CREATE FUNCTION jetons_depot_refuser_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."revoque_at" IS NOT NULL AND (TG_OP = 'DELETE' OR NEW."revoque_at" IS DISTINCT FROM OLD."revoque_at") THEN
    RAISE EXCEPTION 'jetons_depot_revocation_definitive : % refusé, un jeton révoqué ne se réactive pas (REQ-DM-012)', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER jetons_depot_revocation_definitive BEFORE UPDATE OR DELETE ON "jetons_depot"
  FOR EACH ROW EXECUTE FUNCTION jetons_depot_refuser_reactivation();
