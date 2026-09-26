-- CreateEnum
CREATE TYPE "statut_courriel" AS ENUM ('envoye', 'retenu_adresse_supprimee', 'retenu_dmarc_non_verifie', 'echec');

-- CreateEnum
CREATE TYPE "motif_suppression_courriel" AS ENUM ('rebond_definitif');

-- CreateTable
CREATE TABLE "courriels_envoyes" (
    "id" UUID NOT NULL,
    "gabarit" VARCHAR(64) NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "apporteur_id" UUID,
    "statut" "statut_courriel" NOT NULL,
    "demande_at" TIMESTAMPTZ(3) NOT NULL,
    "envoye_at" TIMESTAMPTZ(3),
    "fournisseur_message_id" VARCHAR(200),
    "erreur" VARCHAR(300),

    CONSTRAINT "courriels_envoyes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions_courriel" (
    "id" UUID NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "motif" "motif_suppression_courriel" NOT NULL,
    "survenu_at" TIMESTAMPTZ(3) NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppressions_courriel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courriels_envoyes_email_hash_idx" ON "courriels_envoyes"("email_hash");

-- CreateIndex
CREATE INDEX "courriels_envoyes_apporteur_id_gabarit_idx" ON "courriels_envoyes"("apporteur_id", "gabarit");

-- CreateIndex
CREATE INDEX "courriels_envoyes_statut_demande_at_idx" ON "courriels_envoyes"("statut", "demande_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_courriel_email_hash_key" ON "suppressions_courriel"("email_hash");

-- AddForeignKey
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL brut : Prisma ne modélise pas les CHECK (partners/ADR-0015, partners/ADR-0022). INT-T10 crée
-- `courriels_envoyes` et `suppressions_courriel`.

-- REQ-INT-023 : aucune adresse n'est stockée ; les deux tables ne portent que l'empreinte de
-- recherche HMAC hexadécimale du courriel (`empreinteRecherche`, partners/ADR-0013).
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_email_hash_hex"
  CHECK ("email_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "suppressions_courriel" ADD CONSTRAINT "suppressions_courriel_email_hash_hex"
  CHECK ("email_hash" ~ '^[0-9a-f]{64}$');

-- REQ-INT-022, REQ-UX-016 : un courriel est envoyé si et seulement s'il porte sa date d'envoi — la
-- date qui fait courir un délai. Une demande retenue ou en échec n'en a pas.
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_envoye_si_et_seulement_si_date"
  CHECK (("statut" = 'envoye') = ("envoye_at" IS NOT NULL));

-- partners/ADR-0022, point 9 (exception E2) : le gabarit est une clé de la table des
-- notifications ; le code la valide à l'écriture, la base en tient la forme.
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_gabarit_forme"
  CHECK ("gabarit" ~ '^[a-z][a-z0-9_]*$');
