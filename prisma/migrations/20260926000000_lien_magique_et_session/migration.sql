-- CreateTable
CREATE TABLE "liens_magiques" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "kid" CHAR(8) NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL,
    "expire_at" TIMESTAMPTZ(3) NOT NULL,
    "consomme_at" TIMESTAMPTZ(3),
    "annule_at" TIMESTAMPTZ(3),

    CONSTRAINT "liens_magiques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions_espace" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "lien_magique_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "kid" CHAR(8) NOT NULL,
    "ip_hash" CHAR(16),
    "cree_at" TIMESTAMPTZ(3) NOT NULL,
    "expire_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_espace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liens_magiques_token_hash_key" ON "liens_magiques"("token_hash");

-- CreateIndex
CREATE INDEX "liens_magiques_apporteur_id_idx" ON "liens_magiques"("apporteur_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_espace_lien_magique_id_key" ON "sessions_espace"("lien_magique_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_espace_token_hash_key" ON "sessions_espace"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_espace_apporteur_id_idx" ON "sessions_espace"("apporteur_id");

-- AddForeignKey
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_lien_magique_id_fkey" FOREIGN KEY ("lien_magique_id") REFERENCES "liens_magiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur (partners/ADR-0015).
-- Aucune durée n'est écrite ici : les 15 minutes du lien et les 30 jours de la session vivent dans
-- `src/server/auth/durees.ts`, et la base ne tient que l'ordre des instants.

-- REQ-SEC-001 : l'empreinte d'un lien est un HMAC-SHA-256 hexadécimal, jamais un jeton en clair,
-- et son `kid` est celui d'un secret (`kidDe`, huit caractères hexadécimaux, partners/ADR-0013).
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_token_hash_hex"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_kid_hex"
  CHECK ("kid" ~ '^[0-9a-f]{8}$');
-- REQ-SEC-001 : un lien expire après sa création, n'est consommé que dans sa durée de vie, n'est
-- pas annulé avant d'exister, et n'est jamais à la fois consommé et annulé.
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_expire_apres_creation"
  CHECK ("expire_at" > "cree_at");
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_consomme_avant_expiration"
  CHECK ("consomme_at" IS NULL OR ("consomme_at" >= "cree_at" AND "consomme_at" < "expire_at"));
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_annule_apres_creation"
  CHECK ("annule_at" IS NULL OR "annule_at" >= "cree_at");
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_consomme_ou_annule"
  CHECK ("consomme_at" IS NULL OR "annule_at" IS NULL);

-- REQ-SEC-001, REQ-SEC-003 : la session ne garde que l'empreinte de son jeton (HMAC-SHA-256 sous
-- SESSION_SECRET), le `kid` de ce secret, et l'empreinte d'adresse réseau de la frontière (16 hex).
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_token_hash_hex"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_kid_hex"
  CHECK ("kid" ~ '^[0-9a-f]{8}$');
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_expire_apres_creation"
  CHECK ("expire_at" > "cree_at");
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_ip_hash_hex"
  CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{16}$');

-- REQ-SEC-001 : usage unique, tenu par la BASE contre un client qui passerait par du SQL brut.
--   — une ligne consommée ou annulée est GELÉE : remettre `consomme_at` à nul, la ré-annuler, la
--     déplacer, tout UPDATE est refusé ;
--   — sur un lien actif, seules `consomme_at` et `annule_at` s'écrivent : l'empreinte, le `kid`,
--     l'apporteur, la création et l'échéance ne changent jamais (une échéance ne se prolonge pas).
-- DELETE et TRUNCATE restent permis : un lien effacé ne peut plus ouvrir de session.
-- Consommer ou annuler un lien actif passent.
CREATE FUNCTION liens_magiques_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."consomme_at" IS NOT NULL OR OLD."annule_at" IS NOT NULL THEN
    RAISE EXCEPTION 'liens_magiques_usage_unique : un lien consommé ou annulé est gelé (REQ-SEC-001)';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
     OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
     OR NEW."kid" IS DISTINCT FROM OLD."kid"
     OR NEW."cree_at" IS DISTINCT FROM OLD."cree_at"
     OR NEW."expire_at" IS DISTINCT FROM OLD."expire_at" THEN
    RAISE EXCEPTION 'liens_magiques_usage_unique : seules consomme_at et annule_at s''écrivent (REQ-SEC-001)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER liens_magiques_usage_unique BEFORE UPDATE ON "liens_magiques"
  FOR EACH ROW EXECUTE FUNCTION liens_magiques_refuser_modification();
