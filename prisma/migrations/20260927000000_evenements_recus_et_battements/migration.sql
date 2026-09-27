-- CreateEnum
CREATE TYPE "source_evenement_recu" AS ENUM ('axionia', 'docuseal');

-- CreateEnum
CREATE TYPE "type_evenement_recu" AS ENUM ('client_cree', 'client_mis_a_jour', 'devis_signe', 'facture_emise', 'avoir_emis', 'paiement_recu', 'paiement_rembourse');

-- CreateEnum
CREATE TYPE "statut_evenement_recu" AS ENUM ('recu', 'traite', 'en_attente_dependance', 'held', 'en_erreur');

-- CreateTable
CREATE TABLE "evenements_recus" (
    "id" UUID NOT NULL,
    "source" "source_evenement_recu" NOT NULL,
    "event_id" VARCHAR(200) NOT NULL,
    "event_type" "type_evenement_recu" NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "sequence" BIGINT,
    "sujet_ref" VARCHAR(180),
    "cle_metier" VARCHAR(120),
    "dependance_ref" VARCHAR(180),
    "charge" JSONB NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "statut" "statut_evenement_recu" NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "survenu_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "error" VARCHAR(500),
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evenements_recus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battements" (
    "tache" VARCHAR(64) NOT NULL,
    "dernier_succes_at" TIMESTAMPTZ(3),
    "dernier_echec_at" TIMESTAMPTZ(3),
    "compteurs" JSONB,

    CONSTRAINT "battements_pkey" PRIMARY KEY ("tache")
);

-- CreateIndex
CREATE INDEX "evenements_recus_statut_received_at_idx" ON "evenements_recus"("statut", "received_at");

-- CreateIndex
CREATE INDEX "evenements_recus_sujet_ref_idx" ON "evenements_recus"("sujet_ref");

-- CreateIndex
CREATE UNIQUE INDEX "evenements_recus_source_event_id_key" ON "evenements_recus"("source", "event_id");


-- SQL brut : Prisma ne modélise ni index partiel, ni CHECK, ni fonction, ni déclencheur
-- (partners/ADR-0015, partners/ADR-0022). SEC-06 crée `evenements_recus` et `battements`.

-- REQ-ARG-002, REQ-SEC-011 : au plus UN événement par type et par `paymentId`. L'unicité est celle
-- de la BASE, jamais d'une lecture préalable : deux livraisons concurrentes du même paiement ne
-- peuvent pas s'inscrire toutes les deux. Le doublon rend 200 `{duplicate:true}` à l'émetteur.
-- L'unicité des lignes de commission appartient à DM-15 (phase 2).
CREATE UNIQUE INDEX "evenements_recus_cle_metier_unique" ON "evenements_recus" ("event_type", "cle_metier")
  WHERE "cle_metier" IS NOT NULL;

-- REQ-INT-011 : à l'arrivée d'un parent, ses enfants en attente se retrouvent par leur dépendance.
CREATE INDEX "evenements_recus_en_attente" ON "evenements_recus" ("dependance_ref")
  WHERE "statut" = 'en_attente_dependance';

-- REQ-DM-036 : l'empreinte est un SHA-256 hexadécimal du corps brut ; un compte de reprises ne
-- descend pas sous zéro.
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_payload_hash_hex"
  CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_retry_count_positif"
  CHECK ("retry_count" >= 0);
-- REQ-DM-036 : un événement est traité si et seulement s'il porte sa date de traitement.
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_traite_si_et_seulement_si_date"
  CHECK (("statut" = 'traite') = ("processed_at" IS NOT NULL));
-- REQ-INT-011 : un événement attend si et seulement s'il nomme le parent qu'il attend.
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_attente_si_et_seulement_si_dependance"
  CHECK (("statut" = 'en_attente_dependance') = ("dependance_ref" IS NOT NULL));
-- REQ-INT-012 : la séquence d'émission est celle d'axionia, et d'axionia seule.
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_sequence_si_et_seulement_si_axionia"
  CHECK (("source" = 'axionia') = ("sequence" IS NOT NULL));
-- REQ-INT-003 : l'identifiant d'un événement d'axionia est un uuid v4 (le motif du contrat).
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_event_id_uuid_v4_axionia"
  CHECK ("source" <> 'axionia' OR "event_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

-- REQ-QA-026 : la tâche d'un battement est une clé du registre des tâches (partners/ADR-0022,
-- point 9) ; le registre la valide à l'écriture, la base en tient la forme.
ALTER TABLE "battements" ADD CONSTRAINT "battements_tache_forme"
  CHECK ("tache" ~ '^[a-z][a-z0-9_]*$');

-- REQ-DM-036 : la réception est CONSERVÉE, tenue par la BASE contre un client qui passerait par du
-- SQL brut. Seules les cinq colonnes du traitement s'écrivent après l'inscription : `statut`,
-- `processed_at`, `error`, `retry_count` et `dependance_ref`. Tout le reste est l'événement tel
-- qu'il a été reçu. DELETE et TRUNCATE sont refusés : sans eux, le rejeu de REQ-ARG-003 n'aurait
-- plus de quoi rejouer.
CREATE FUNCTION evenements_recus_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'evenements_recus_reception_immuable : % refusé, la réception est conservée (REQ-DM-036)', TG_OP;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
     OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
     OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."sujet_ref" IS DISTINCT FROM OLD."sujet_ref"
     OR NEW."cle_metier" IS DISTINCT FROM OLD."cle_metier"
     OR NEW."charge" IS DISTINCT FROM OLD."charge"
     OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
     OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
     OR NEW."survenu_at" IS DISTINCT FROM OLD."survenu_at" THEN
    RAISE EXCEPTION 'evenements_recus_reception_immuable : seuls statut, processed_at, error, retry_count et dependance_ref s''écrivent (REQ-DM-036)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evenements_recus_reception_immuable BEFORE UPDATE OR DELETE ON "evenements_recus"
  FOR EACH ROW EXECUTE FUNCTION evenements_recus_refuser_modification();
CREATE TRIGGER evenements_recus_reception_immuable_troncature BEFORE TRUNCATE ON "evenements_recus"
  FOR EACH STATEMENT EXECUTE FUNCTION evenements_recus_refuser_modification();
