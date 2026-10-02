-- DM-11 (REQ-DM-027, HYP-DM06-IBAN) : les pièces du KYC et la référence de l'identité de
-- facturation vers sa pièce `rib`. Additive : une table neuve, des colonnes nullables ou à défaut
-- constant (partners/ADR-0022 §11). La profession réglementée et la qualité d'exercice viennent avec
-- leurs enums dans DM-50.

-- AlterTable
ALTER TABLE "identites_facturation" ADD COLUMN     "piece_kyc_id" UUID,
ADD COLUMN     "piece_kyc_type" "type_piece_kyc" NOT NULL DEFAULT 'rib';

-- CreateTable
CREATE TABLE "pieces_kyc" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "type" "type_piece_kyc" NOT NULL,
    "statut" "statut_piece_kyc" NOT NULL,
    "verifiee_at" TIMESTAMPTZ(3),
    "expire_at" TIMESTAMPTZ(3),
    "fichier_ref" VARCHAR(300),
    "fichier_purge_at" TIMESTAMPTZ(3),
    "remplacee_at" TIMESTAMPTZ(3),
    "iban_chiffre" BYTEA,
    "iban_hash" CHAR(64),

    CONSTRAINT "pieces_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pieces_kyc_apporteur_id_idx" ON "pieces_kyc"("apporteur_id");

-- CreateIndex
CREATE INDEX "pieces_kyc_iban_hash_idx" ON "pieces_kyc"("iban_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_kyc_id_type_key" ON "pieces_kyc"("id", "type");

-- CreateIndex
CREATE INDEX "identites_facturation_piece_kyc_id_idx" ON "identites_facturation"("piece_kyc_id");

-- AddForeignKey
ALTER TABLE "identites_facturation" ADD CONSTRAINT "identites_facturation_piece_rib_fkey" FOREIGN KEY ("piece_kyc_id", "piece_kyc_type") REFERENCES "pieces_kyc"("id", "type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- SQL brut : Prisma ne modélise ni CHECK, ni index partiel (partners/ADR-0015).

-- ── identites_facturation : la pièce référencée est une pièce `rib` (décision A02) ──────────────

-- La clé étrangère composite (piece_kyc_id, piece_kyc_type) → pieces_kyc (id, type) refuse une pièce
-- d'un autre type ; la colonne constante ne peut valoir que `rib`. En MATCH SIMPLE, une référence
-- nulle n'est pas vérifiée : c'est voulu, l'identité peut précéder sa pièce.
ALTER TABLE "identites_facturation" ADD CONSTRAINT "identites_facturation_piece_kyc_est_un_rib"
  CHECK ("piece_kyc_type" = 'rib');

-- ── pieces_kyc ───────────────────────────────────────────────────────────────────────────────────

-- HYP-DM06-IBAN : l'IBAN n'existe que sur une pièce `rib`, bloc et empreinte ensemble.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_iban_sur_rib"
  CHECK ("type" = 'rib' OR ("iban_chiffre" IS NULL AND "iban_hash" IS NULL));
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_iban_ensemble"
  CHECK (("iban_chiffre" IS NULL) = ("iban_hash" IS NULL));
-- REQ-SEC-024 : l'empreinte est un HMAC-SHA-256 hexadécimal, jamais un clair.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_iban_hash_hex"
  CHECK ("iban_hash" IS NULL OR "iban_hash" ~ '^[0-9a-f]{64}$');
-- REQ-DM-027 : l'échéance est obligatoire pour l'attestation de vigilance et pour la RC pro.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_echeance_requise"
  CHECK ("type" NOT IN ('vigilance', 'rc_pro') OR "expire_at" IS NOT NULL);

-- REQ-DM-027 : au plus une pièce COURANTE par (apporteur, type)…
CREATE UNIQUE INDEX "pieces_kyc_une_courante" ON "pieces_kyc" ("apporteur_id", "type")
  WHERE "remplacee_at" IS NULL AND "statut" <> 'a_verifier';
-- … et au plus une EN VÉRIFICATION : un changement de RIB crée une pièce `a_verifier` pendant que
-- l'ancienne reste courante (REQ-UX-027).
CREATE UNIQUE INDEX "pieces_kyc_une_en_verification" ON "pieces_kyc" ("apporteur_id", "type")
  WHERE "statut" = 'a_verifier';
