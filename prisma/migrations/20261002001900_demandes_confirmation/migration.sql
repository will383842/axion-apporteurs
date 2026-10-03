-- DM-40 (REQ-DM-060, HYP-W20-LIEN, HYP-W20-ANNULATION, HYP-W20-REBOND) : la demande de confirmation
-- d'un dépôt, UNE par attribution ; ses ÉMISSIONS, une ligne par envoi, qui portent les jetons ; et
-- les révisions du contact pendant le délai avant envoi. Additive : trois tables neuves, leurs
-- contraintes, leurs fonctions et leurs déclencheurs ; rien d'existant n'est touché. L'échéance
-- d'envoi se DÉRIVE de `deposee_at` et de la SSOT : aucune colonne ne la stocke (ADR-0022 §8).
--
-- Retour arrière : DROP TABLE "revisions_demande_confirmation", "emissions_demande_confirmation",
-- puis "demandes_confirmation" (leurs index, contraintes et déclencheurs avec elles), puis DROP
-- FUNCTION "demandes_confirmation_refuser_substitution" et
-- "emissions_demande_confirmation_refuser_substitution". Les demandes, émissions et révisions écrites
-- depuis sont perdues, rien d'autre.

-- CreateTable
CREATE TABLE "demandes_confirmation" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "etat" "etat_demande_confirmation" NOT NULL DEFAULT 'planifiee',
    "creee_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "envoyee_at" TIMESTAMPTZ(3),
    "repondu_at" TIMESTAMPTZ(3),

    CONSTRAINT "demandes_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emissions_demande_confirmation" (
    "id" UUID NOT NULL,
    "demande_id" UUID NOT NULL,
    "emise_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "jeton_oui_hash" CHAR(64),
    "jeton_non_hash" CHAR(64),
    "revoquee_at" TIMESTAMPTZ(3),
    "clic_ip_hash" CHAR(16),

    CONSTRAINT "emissions_demande_confirmation_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "emissions_demande_confirmation_demande_id_idx" ON "emissions_demande_confirmation"("demande_id");

-- CreateIndex
CREATE INDEX "revisions_demande_confirmation_demande_id_idx" ON "revisions_demande_confirmation"("demande_id");

-- AddForeignKey
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demandes_confirmation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revisions_demande_confirmation" ADD CONSTRAINT "revisions_demande_confirmation_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demandes_confirmation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL brut : Prisma ne modélise ni CHECK, ni index partiel, ni déclencheur (partners/ADR-0015).

-- ── la demande : une trace, mutable pour son état et ses dates seulement (A02) ─────────────────
-- Une fonction DÉDIÉE, sans EXECUTE (patron de SEC-49), et non le gabarit générique, qui figerait
-- aussi l'état. `id`, `attribution_id` et `creee_at` sont figés ; DELETE et TRUNCATE sont refusés.
CREATE FUNCTION demandes_confirmation_refuser_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION '% : % refusé, une demande de confirmation ne disparaît pas (REQ-DM-060)', TG_NAME, TG_OP;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.attribution_id IS DISTINCT FROM OLD.attribution_id
     OR NEW.creee_at IS DISTINCT FROM OLD.creee_at THEN
    RAISE EXCEPTION '% : l''identité de la demande ne change pas (REQ-DM-060)', TG_NAME;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER demandes_confirmation_trace BEFORE UPDATE OR DELETE ON "demandes_confirmation"
  FOR EACH ROW EXECUTE FUNCTION demandes_confirmation_refuser_substitution();
-- Un déclencheur de ligne ne voit pas TRUNCATE : sans celui d'instruction, `TRUNCATE` passe.
CREATE TRIGGER demandes_confirmation_troncature BEFORE TRUNCATE ON "demandes_confirmation"
  FOR EACH STATEMENT EXECUTE FUNCTION demandes_confirmation_refuser_substitution();

-- ── les émissions : les jetons, en empreinte, une seule émission active par demande ────────────
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_jeton_oui_hex"
  CHECK ("jeton_oui_hash" IS NULL OR "jeton_oui_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_jeton_non_hex"
  CHECK ("jeton_non_hash" IS NULL OR "jeton_non_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_jetons_ensemble"
  CHECK (("jeton_oui_hash" IS NULL) = ("jeton_non_hash" IS NULL));
-- Un jeton n'est vidé qu'à la révocation.
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_jetons_vides_si_revoquee"
  CHECK ("revoquee_at" IS NOT NULL OR "jeton_oui_hash" IS NOT NULL);
-- Le « Oui » et le « Non » d'une émission ne sont jamais le même jeton (condition de la sécurité).
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_oui_ne_non"
  CHECK ("jeton_oui_hash" IS NULL OR "jeton_oui_hash" <> "jeton_non_hash");
-- L'empreinte d'IP du clic : tronquée et salée (REQ-SEC-024), jamais l'adresse.
ALTER TABLE "emissions_demande_confirmation" ADD CONSTRAINT "emissions_demande_confirmation_clic_ip_hash_hex"
  CHECK ("clic_ip_hash" IS NULL OR "clic_ip_hash" ~ '^[0-9a-f]{16}$');
CREATE UNIQUE INDEX "emissions_demande_confirmation_jeton_oui_hash_key" ON "emissions_demande_confirmation" ("jeton_oui_hash")
  WHERE "jeton_oui_hash" IS NOT NULL;
CREATE UNIQUE INDEX "emissions_demande_confirmation_jeton_non_hash_key" ON "emissions_demande_confirmation" ("jeton_non_hash")
  WHERE "jeton_non_hash" IS NOT NULL;
-- Une seule émission active par demande : tenue par la base, pas par le code seul.
CREATE UNIQUE INDEX "emissions_demande_confirmation_une_active" ON "emissions_demande_confirmation" ("demande_id")
  WHERE "revoquee_at" IS NULL;

-- Une fonction DÉDIÉE, sans EXECUTE : le gabarit générique ne sait pas qu'une empreinte d'IP se
-- pose UNE fois au clic puis s'efface à la purge (arbitrage de la coordination, voie (i)).
--   INSERT : l'émission NAÎT avec ses deux jetons, sans clic, sans révocation, à l'heure de la base.
--   UPDATE : `id`, `demande_id`, `emise_at` figés ; un jeton ne va QUE de sa valeur à NULL, et
--            seulement avec la révocation (jamais une autre valeur, jamais NULL → valeur) ;
--            `revoquee_at` s'écrit une fois ; `clic_ip_hash` passe de NULL à une valeur UNE fois,
--            sur une émission non révoquée, et de sa valeur à NULL seulement avec la révocation.
--   DELETE et TRUNCATE : refusés.
CREATE FUNCTION emissions_demande_confirmation_refuser_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION '% : % refusé, une émission ne disparaît pas (REQ-DM-060)', TG_NAME, TG_OP;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.jeton_oui_hash IS NULL OR NEW.jeton_non_hash IS NULL
       OR NEW.clic_ip_hash IS NOT NULL OR NEW.revoquee_at IS NOT NULL THEN
      RAISE EXCEPTION '% : une émission naît avec ses deux jetons, sans clic ni révocation (REQ-SEC-061)', TG_NAME;
    END IF;
    NEW.emise_at := clock_timestamp();
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.demande_id IS DISTINCT FROM OLD.demande_id
     OR NEW.emise_at IS DISTINCT FROM OLD.emise_at THEN
    RAISE EXCEPTION '% : l''identité de l''émission ne change pas (REQ-DM-060)', TG_NAME;
  END IF;
  IF OLD.revoquee_at IS NOT NULL AND NEW.revoquee_at IS DISTINCT FROM OLD.revoquee_at THEN
    RAISE EXCEPTION '% : la révocation s''écrit une fois (REQ-SEC-061)', TG_NAME;
  END IF;
  IF (NEW.jeton_oui_hash IS DISTINCT FROM OLD.jeton_oui_hash
      AND NOT (NEW.jeton_oui_hash IS NULL AND NEW.revoquee_at IS NOT NULL))
     OR (NEW.jeton_non_hash IS DISTINCT FROM OLD.jeton_non_hash
      AND NOT (NEW.jeton_non_hash IS NULL AND NEW.revoquee_at IS NOT NULL)) THEN
    RAISE EXCEPTION '% : un jeton ne va que de sa valeur à NULL, avec la révocation (REQ-SEC-061)', TG_NAME;
  END IF;
  IF NEW.clic_ip_hash IS DISTINCT FROM OLD.clic_ip_hash
     AND NOT (OLD.clic_ip_hash IS NULL AND OLD.revoquee_at IS NULL AND NEW.revoquee_at IS NULL)
     AND NOT (NEW.clic_ip_hash IS NULL AND NEW.revoquee_at IS NOT NULL) THEN
    RAISE EXCEPTION '% : l''empreinte du clic se pose une fois, et ne s''efface qu''à la révocation (REQ-SEC-024)', TG_NAME;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER emissions_demande_confirmation_naissance BEFORE INSERT ON "emissions_demande_confirmation"
  FOR EACH ROW EXECUTE FUNCTION emissions_demande_confirmation_refuser_substitution();
CREATE TRIGGER emissions_demande_confirmation_trace BEFORE UPDATE OR DELETE ON "emissions_demande_confirmation"
  FOR EACH ROW EXECUTE FUNCTION emissions_demande_confirmation_refuser_substitution();
CREATE TRIGGER emissions_demande_confirmation_troncature BEFORE TRUNCATE ON "emissions_demande_confirmation"
  FOR EACH STATEMENT EXECUTE FUNCTION emissions_demande_confirmation_refuser_substitution();

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
