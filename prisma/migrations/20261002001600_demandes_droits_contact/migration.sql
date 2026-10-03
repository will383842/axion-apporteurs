-- DM-59 (REQ-JUR-065) : chaque demande de droit du contact est une ligne tracée, sans donnée de
-- personne en clair. La date de réception fait courir le délai d'un mois (art. 12.3 RGPD). Forme
-- d'A02, mot pour mot ; la rectification porte des champs structurés (voie (c) d'A07), jamais de
-- texte libre. Additive : trois enums neufs, une table neuve, une colonne nullable sur
-- `attributions`, des contraintes et des déclencheurs neufs. Aucun ADD VALUE : une seule migration.
--
-- Retour arrière : DROP TABLE "demandes_droits_contact" (ses déclencheurs et sa fonction d'horloge
-- avec elle, DROP FUNCTION "demandes_droits_contact_horloge"), DROP TYPE des trois enums ; puis
-- DROP INDEX "attributions_jeton_droits_hash_key", DROP CONSTRAINT des deux CHECK du jeton, et DROP
-- COLUMN "jeton_droits_hash". Les demandes tracées depuis sont perdues, rien d'autre.

-- CreateEnum
CREATE TYPE "droit_contact" AS ENUM ('acces', 'rectification', 'effacement', 'limitation', 'opposition');

-- CreateEnum
CREATE TYPE "donnee_contact" AS ENUM ('nom', 'prenom', 'fonction', 'telephone', 'email');

-- CreateEnum
CREATE TYPE "issue_demande_droit" AS ENUM ('appliquee', 'refusee');

-- CreateTable
CREATE TABLE "demandes_droits_contact" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "droit" "droit_contact" NOT NULL,
    "recue_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "traitee_at" TIMESTAMPTZ(3),
    "issue" "issue_demande_droit",
    "donnee_visee" "donnee_contact",
    "valeur_chiffree" BYTEA,
    "valeur_purgee_at" TIMESTAMPTZ(3),
    "prolongee_at" TIMESTAMPTZ(3),

    CONSTRAINT "demandes_droits_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_droits_contact_attribution_id_idx" ON "demandes_droits_contact"("attribution_id");

-- AddForeignKey
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL brut : Prisma ne modélise ni CHECK, ni index partiel, ni déclencheur (partners/ADR-0015).

-- La file des demandes à traiter, et leur échéance.
CREATE INDEX "demandes_droits_contact_a_traiter_idx" ON "demandes_droits_contact" ("recue_at")
  WHERE "traitee_at" IS NULL;

-- Un traitement porte son issue, et une issue son traitement.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_traitement"
  CHECK (("traitee_at" IS NULL) = ("issue" IS NULL));
-- La donnée visée n'existe que pour une rectification, et une rectification la porte.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_donnee_si_rectification"
  CHECK (("droit" = 'rectification') = ("donnee_visee" IS NOT NULL));
-- Une rectification porte sa valeur chiffrée OU sa date d'effacement, jamais les deux ni aucune ;
-- un autre droit ne porte ni l'une ni l'autre.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_valeur_purge_liee"
  CHECK (
    ("droit" = 'rectification' AND ("valeur_chiffree" IS NULL) = ("valeur_purgee_at" IS NOT NULL))
    OR ("droit" <> 'rectification' AND "valeur_chiffree" IS NULL AND "valeur_purgee_at" IS NULL)
  );
-- Une prolongation (art. 12.3) précède le traitement. La borne « dans le premier mois » se juge
-- dans le CODE, contre la SSOT, jamais par un intervalle littéral ici.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_prolongation_avant_traitement"
  CHECK ("prolongee_at" IS NULL OR "traitee_at" IS NULL OR "prolongee_at" <= "traitee_at");

-- L'heure de réception est celle de la BASE (patron de `deposee_at`) : une valeur fournie par
-- l'appelant est écrasée. Après l'insertion, le gabarit refuse toute réécriture.
CREATE FUNCTION demandes_droits_contact_horloge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."recue_at" := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER demandes_droits_contact_horloge BEFORE INSERT ON "demandes_droits_contact"
  FOR EACH ROW EXECUTE FUNCTION demandes_droits_contact_horloge();

-- La trace ne change pas après l'insertion, sauf : le traitement, l'issue et la prolongation,
-- écrits une fois ; la valeur, effacée sans retour, et sa date d'effacement, écrite une fois. Le
-- gabarit générique (HYP-A02-GABARIT-AJOUT-SEUL) est branché, jamais recréé ; DELETE et TRUNCATE
-- sont refusés.
CREATE TRIGGER demandes_droits_contact_ajout_seul BEFORE UPDATE OR DELETE ON "demandes_droits_contact"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('une_fois:traitee_at', 'une_fois:issue', 'purge:valeur_chiffree', 'une_fois:valeur_purgee_at', 'une_fois:prolongee_at');
CREATE TRIGGER demandes_droits_contact_troncature BEFORE TRUNCATE ON "demandes_droits_contact"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('une_fois:traitee_at', 'une_fois:issue', 'purge:valeur_chiffree', 'une_fois:valeur_purgee_at', 'une_fois:prolongee_at');

-- ── le jeton des droits (condition de la lentille sécurité, UX-P1-48) ──────────────────────
-- L'empreinte HMAC du jeton, jamais le jeton. Unique quand posée ; effacée par la purge du
-- contact (DM-48) dans la même instruction, ce qui l'invalide à l'effacement des données.

-- AlterTable
ALTER TABLE "attributions" ADD COLUMN     "jeton_droits_hash" CHAR(64);

ALTER TABLE "attributions" ADD CONSTRAINT "attributions_jeton_droits_hex"
  CHECK ("jeton_droits_hash" IS NULL OR "jeton_droits_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_jeton_droits_purge"
  CHECK ("contact_purge_at" IS NULL OR "jeton_droits_hash" IS NULL);
CREATE UNIQUE INDEX "attributions_jeton_droits_hash_key" ON "attributions" ("jeton_droits_hash")
  WHERE "jeton_droits_hash" IS NOT NULL;
