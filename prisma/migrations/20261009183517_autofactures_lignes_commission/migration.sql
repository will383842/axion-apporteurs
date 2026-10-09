-- T-ARG-045 (REQ-ARG-014, REQ-ARG-018 ; conditions de la sécurité sur ALN-03, point 1) — la ligne de
-- commission, son autofacture, et la séquence sans trou des numéros. Migration ADDITIVE : trois tables,
-- deux types, leurs gardes ; rien d'existant n'est touché.
--
-- Ce que la BASE garantit, quel que soit l'appelant :
--   1. une ligne entre dans AU PLUS UNE autofacture — `autofacture_id` est une colonne de la ligne ;
--      l'émission l'affecte par `UPDATE … WHERE autofacture_id IS NULL` et, une fois posée, la base
--      refuse de la changer (lignes_commission_facturee_figee) ;
--   2. l'autofacture est celle du même apporteur (clé étrangère composite, DIFFÉRÉE : l'émission
--      affecte les lignes avant d'insérer l'autofacture) ;
--   3. à la validation, une autofacture porte au moins une ligne et son montant en est la somme exacte ;
--      une ligne ajoutée à une autofacture déjà émise rompt la somme : la transaction est refusée ;
--   4. le numéro est posé par la base, propre à l'apporteur, continu et sans trou : le compteur naît à 1,
--      ne monte que d'un, n'est écrit que par la numérotation, et une transaction annulée rend son
--      numéro ; une autofacture n'est ni modifiée, ni supprimée.
--
-- Retour arrière (commentaire) : DROP TRIGGER des déclencheurs ci-dessous ; DROP FUNCTION
-- autofactures_numerotation(), compteurs_autofacture_monotone(), autofactures_somme_juste(),
-- lignes_commission_facturee_figee(), lignes_commission_troncature() ; DROP TABLE "lignes_commission",
-- "autofactures", "compteurs_autofacture" ; DROP TYPE "statut_ligne_commission", "type_ligne_commission".

-- CreateEnum
CREATE TYPE "type_ligne_commission" AS ENUM ('commission', 'reprise', 'parrainage', 'bonus_filleul');

-- CreateEnum
CREATE TYPE "statut_ligne_commission" AS ENUM ('prevue', 'acquise', 'bloquee', 'a_payer', 'payee', 'annulee', 'contestee');

-- CreateTable
CREATE TABLE "lignes_commission" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "type" "type_ligne_commission" NOT NULL,
    "statut" "statut_ligne_commission" NOT NULL,
    "commission_cents" INTEGER NOT NULL,
    "encaissement_integral_le" DATE NOT NULL,
    "constate_le" DATE NOT NULL,
    "commande_ref" VARCHAR(64),
    "prix_facture_cents" INTEGER,
    "prix_public_cents" INTEGER,
    "autofacture_id" UUID,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "lignes_commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autofactures" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT 0,
    "emise_le" DATE NOT NULL,
    "echeance_le" DATE NOT NULL,
    "montant_cents" INTEGER NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "autofactures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteurs_autofacture" (
    "apporteur_id" UUID NOT NULL,
    "dernier_numero" INTEGER NOT NULL,

    CONSTRAINT "compteurs_autofacture_pkey" PRIMARY KEY ("apporteur_id")
);

-- CreateIndex
CREATE INDEX "lignes_commission_apporteur_id_idx" ON "lignes_commission"("apporteur_id");

-- CreateIndex
CREATE INDEX "lignes_commission_autofacture_id_idx" ON "lignes_commission"("autofacture_id");

-- CreateIndex
CREATE UNIQUE INDEX "autofactures_apporteur_numero_key" ON "autofactures"("apporteur_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "autofactures_id_apporteur_key" ON "autofactures"("id", "apporteur_id");

-- AddForeignKey
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey — DIFFÉRÉE (garantie 2) : l'émission affecte les lignes, puis insère l'autofacture,
-- dans la même transaction (port `TransactionAutofactures`).
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_autofacture_fkey" FOREIGN KEY ("autofacture_id", "apporteur_id") REFERENCES "autofactures"("id", "apporteur_id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "autofactures" ADD CONSTRAINT "autofactures_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "compteurs_autofacture" ADD CONSTRAINT "compteurs_autofacture_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── les CHECK ────────────────────────────────────────────────────────────────────────────────────
-- Des centimes entiers, jamais négatifs ; une commission minime reste facturée (art. 5.1).
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_centimes_positifs"
  CHECK ("commission_cents" >= 0 AND coalesce("prix_facture_cents", 0) >= 0 AND coalesce("prix_public_cents", 0) >= 0);
-- Le constat ne précède jamais l'encaissement intégral.
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_constat_apres_encaissement"
  CHECK ("constate_le" >= "encaissement_integral_le");
-- Le décompte (REQ-ARG-018) : une ligne `commission` porte sa commande et ses deux prix ; le parrainage
-- et le bonus de filleul n'en portent aucun (ni commande, ni somme du filleul).
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_decompte_par_type"
  CHECK (
    ("type" <> 'commission' OR num_nonnulls("commande_ref", "prix_facture_cents", "prix_public_cents") = 3)
    AND ("type" NOT IN ('parrainage', 'bonus_filleul') OR num_nonnulls("commande_ref", "prix_facture_cents", "prix_public_cents") = 0)
  );
-- Ni une ligne `prevue` ou `annulee` (GLOSSAIRE §3, REQ-DM-020), ni une `reprise` (REQ-ARG-010 : elle
-- passe par un avoir) n'entrent dans une autofacture.
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_facturable"
  CHECK ("autofacture_id" IS NULL OR ("statut" NOT IN ('prevue', 'annulee') AND "type" <> 'reprise'));

ALTER TABLE "autofactures" ADD CONSTRAINT "autofactures_numero_positif" CHECK ("numero" >= 1);
ALTER TABLE "autofactures" ADD CONSTRAINT "autofactures_montant_positif" CHECK ("montant_cents" >= 0);
-- Art. 5.3 : l'échéance suit l'émission (la durée vit dans la SSOT, la base tient l'ordre).
ALTER TABLE "autofactures" ADD CONSTRAINT "autofactures_echeance_apres_emission" CHECK ("echeance_le" > "emise_le");
ALTER TABLE "compteurs_autofacture" ADD CONSTRAINT "compteurs_autofacture_dernier_positif" CHECK ("dernier_numero" >= 1);

-- ── garantie 4 : la numérotation sans trou ───────────────────────────────────────────────────────
-- À l'insertion d'une autofacture, la base prend le numéro suivant de l'apporteur sous le verrou de la
-- ligne du compteur (INSERT … ON CONFLICT DO UPDATE) : deux émissions concurrentes se sérialisent, et
-- une transaction annulée annule aussi l'incrément. Toute valeur fournie pour `numero` est remplacée.
CREATE FUNCTION autofactures_numerotation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "compteurs_autofacture" AS c ("apporteur_id", "dernier_numero") VALUES (NEW."apporteur_id", 1)
    ON CONFLICT ("apporteur_id") DO UPDATE SET "dernier_numero" = c."dernier_numero" + 1
    RETURNING c."dernier_numero" INTO NEW."numero";
  NEW."cree_at" := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER autofactures_numerotation BEFORE INSERT ON "autofactures"
  FOR EACH ROW EXECUTE FUNCTION autofactures_numerotation();

-- Le compteur n'est écrit QUE par la numérotation (profondeur de déclencheur ≥ 2) : il naît à 1, ne
-- monte que d'un, ne change pas d'apporteur ; DELETE et TRUNCATE refusés. Un UPDATE direct, qui
-- ouvrirait un trou, est refusé.
CREATE FUNCTION compteurs_autofacture_monotone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'compteurs_autofacture_monotone : % refusé, la séquence des autofactures est sans trou', TG_OP;
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'compteurs_autofacture_monotone : le compteur ne s''écrit que par la numérotation d''une autofacture';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."dernier_numero" <> 1 THEN
    RAISE EXCEPTION 'compteurs_autofacture_monotone : la séquence d''un apporteur commence à 1';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."apporteur_id" <> OLD."apporteur_id" OR NEW."dernier_numero" <> OLD."dernier_numero" + 1) THEN
    RAISE EXCEPTION 'compteurs_autofacture_monotone : le compteur ne monte que d''un';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compteurs_autofacture_monotone BEFORE INSERT OR UPDATE OR DELETE ON "compteurs_autofacture"
  FOR EACH ROW EXECUTE FUNCTION compteurs_autofacture_monotone();
CREATE TRIGGER compteurs_autofacture_troncature BEFORE TRUNCATE ON "compteurs_autofacture"
  FOR EACH STATEMENT EXECUTE FUNCTION compteurs_autofacture_monotone();

-- Une autofacture émise n'est jamais réouverte, ni modifiée, ni supprimée (gabarit, sans exception).
CREATE TRIGGER autofactures_ajout_seul BEFORE UPDATE OR DELETE ON "autofactures"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf();
CREATE TRIGGER autofactures_troncature BEFORE TRUNCATE ON "autofactures"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf();

-- ── garantie 1 : une ligne facturée est figée ────────────────────────────────────────────────────
-- `autofacture_id` passe de NULL à une valeur, une fois ; ensuite ni elle, ni ce que l'autofacture
-- a facturé (apporteur, type, montant, dates, commande, prix) ne change, et la ligne ne se supprime
-- plus. Le statut, lui, poursuit sa vie (a_payer, payee, contestee : T-ARG-010 et suivantes).
-- Et une ligne ne s'affecte qu'à une autofacture qui N'EXISTE PAS ENCORE : l'émission affecte, PUIS
-- insère (port `TransactionAutofactures`) ; une autofacture émise ne reçoit donc plus aucune ligne,
-- même d'un montant nul qui laisserait sa somme intacte.
CREATE FUNCTION lignes_commission_facturee_figee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."autofacture_id" IS NOT NULL THEN
      RAISE EXCEPTION 'lignes_commission_facturee_figee : une ligne facturée ne se supprime pas';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."autofacture_id" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."autofacture_id" IS NULL)
     AND EXISTS (SELECT 1 FROM "autofactures" a WHERE a."id" = NEW."autofacture_id") THEN
    RAISE EXCEPTION 'lignes_commission_facturee_figee : une autofacture émise ne reçoit plus de ligne ; l''émission affecte les lignes, puis insère l''autofacture';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD."autofacture_id" IS NOT NULL AND (
       NEW."autofacture_id" IS DISTINCT FROM OLD."autofacture_id"
    OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."commission_cents" IS DISTINCT FROM OLD."commission_cents"
    OR NEW."encaissement_integral_le" IS DISTINCT FROM OLD."encaissement_integral_le"
    OR NEW."constate_le" IS DISTINCT FROM OLD."constate_le"
    OR NEW."commande_ref" IS DISTINCT FROM OLD."commande_ref"
    OR NEW."prix_facture_cents" IS DISTINCT FROM OLD."prix_facture_cents"
    OR NEW."prix_public_cents" IS DISTINCT FROM OLD."prix_public_cents"
  ) THEN
    RAISE EXCEPTION 'lignes_commission_facturee_figee : une ligne facturée appartient à une seule autofacture, et ce qu''elle facture ne change plus';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lignes_commission_facturee_figee BEFORE INSERT OR UPDATE OR DELETE ON "lignes_commission"
  FOR EACH ROW EXECUTE FUNCTION lignes_commission_facturee_figee();
CREATE FUNCTION lignes_commission_troncature() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "lignes_commission" WHERE "autofacture_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'lignes_commission_troncature : des lignes facturées ne se suppriment pas';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER lignes_commission_troncature BEFORE TRUNCATE ON "lignes_commission"
  FOR EACH STATEMENT EXECUTE FUNCTION lignes_commission_troncature();

-- ── garantie 3 : la somme juste, jugée à la validation ───────────────────────────────────────────
-- Différé : dans la transaction d'émission, les lignes sont affectées avant l'insertion. À la
-- validation, toute autofacture insérée, et toute autofacture qui a reçu une ligne, porte au moins
-- une ligne et un montant égal à leur somme (sur bigint : aucun débordement).
CREATE FUNCTION autofactures_somme_juste() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  af uuid;
  montant integer;
  nombre integer;
  somme bigint;
BEGIN
  IF TG_TABLE_NAME = 'autofactures' THEN
    af := NEW."id";
  ELSE
    af := NEW."autofacture_id";
  END IF;
  SELECT a."montant_cents" INTO montant FROM "autofactures" a WHERE a."id" = af;
  IF NOT FOUND THEN
    RETURN NULL; -- la clé étrangère différée lève à sa place
  END IF;
  SELECT count(*), coalesce(sum(l."commission_cents"::bigint), 0) INTO nombre, somme
    FROM "lignes_commission" l WHERE l."autofacture_id" = af;
  IF nombre = 0 THEN
    RAISE EXCEPTION 'autofactures_somme_juste : une autofacture porte au moins une ligne';
  END IF;
  IF somme <> montant THEN
    RAISE EXCEPTION 'autofactures_somme_juste : le montant d''une autofacture est la somme de ses lignes, et une autofacture émise ne reçoit plus de ligne';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER autofactures_somme_juste AFTER INSERT ON "autofactures"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION autofactures_somme_juste();
CREATE CONSTRAINT TRIGGER lignes_commission_somme_juste AFTER INSERT OR UPDATE OF "autofacture_id" ON "lignes_commission"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."autofacture_id" IS NOT NULL)
  EXECUTE FUNCTION autofactures_somme_juste();
