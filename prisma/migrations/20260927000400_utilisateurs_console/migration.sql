-- AlterTable
ALTER TABLE "liens_magiques" ADD COLUMN     "utilisateur_console_id" UUID,
ALTER COLUMN "apporteur_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sessions_espace" ADD COLUMN     "utilisateur_console_id" UUID,
ALTER COLUMN "apporteur_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "utilisateurs_console" (
    "id" UUID NOT NULL,
    "role" "console_role" NOT NULL,
    "nom_chiffre" BYTEA,
    "email_chiffre" BYTEA NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL,
    "desactive_at" TIMESTAMPTZ(3),

    CONSTRAINT "utilisateurs_console_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_console_email_hash_key" ON "utilisateurs_console"("email_hash");

-- CreateIndex
CREATE INDEX "liens_magiques_utilisateur_console_id_idx" ON "liens_magiques"("utilisateur_console_id");

-- CreateIndex
CREATE INDEX "sessions_espace_utilisateur_console_id_idx" ON "sessions_espace"("utilisateur_console_id");

-- AddForeignKey
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur (partners/ADR-0015).

-- ── utilisateurs_console ─────────────────────────────────────────────────────────────────────────

-- REQ-SEC-024 (partners/ADR-0013) : l'empreinte du courriel est un HMAC-SHA-256 hexadécimal, jamais un
-- clair ; le bloc chiffré est écrit par `colonnesPii`, lié à la ligne.
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_email_hash_hex"
  CHECK ("email_hash" ~ '^[0-9a-f]{64}$');
-- REQ-SEC-023 : un utilisateur n'est pas désactivé avant d'exister.
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_desactive_apres_creation"
  CHECK ("desactive_at" IS NULL OR "desactive_at" >= "cree_at");

-- ── la population d'un lien et d'une session ─────────────────────────────────────────────────────

-- REQ-SEC-023 (partners/ADR-0022) : la console se connecte par le MÊME lien magique que l'apporteur.
-- Un lien et une session appartiennent à UNE population : un apporteur OU un utilisateur de la
-- console, jamais les deux, jamais aucun. Relâcher `apporteur_id` est additif ; ce CHECK est ce qui
-- empêche le relâchement d'ouvrir une ligne orpheline.
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_une_population"
  CHECK (("apporteur_id" IS NULL) <> ("utilisateur_console_id" IS NULL));
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_une_population"
  CHECK (("apporteur_id" IS NULL) <> ("utilisateur_console_id" IS NULL));

-- REQ-SEC-023 : la population d'un lien ou d'une session ne change pas après coup. Les déclencheurs
-- de SEC-03 et SEC-04 figent déjà `apporteur_id` ; ceux-ci figent `utilisateur_console_id`. Ils
-- s'AJOUTENT aux premiers au lieu de les remplacer : une fonction de protection ne se réécrit pas
-- (`partners:migrations:additive`, famille `journal_desarme`).
CREATE FUNCTION liens_magiques_figer_population() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."utilisateur_console_id" IS DISTINCT FROM OLD."utilisateur_console_id" THEN
    RAISE EXCEPTION 'liens_magiques_population_figee : la population d''un lien ne change pas (REQ-SEC-023)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER liens_magiques_population_figee BEFORE UPDATE ON "liens_magiques"
  FOR EACH ROW EXECUTE FUNCTION liens_magiques_figer_population();

CREATE FUNCTION sessions_espace_figer_population() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."utilisateur_console_id" IS DISTINCT FROM OLD."utilisateur_console_id" THEN
    RAISE EXCEPTION 'sessions_espace_population_figee : la population d''une session ne change pas (REQ-SEC-023)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_espace_population_figee BEFORE UPDATE ON "sessions_espace"
  FOR EACH ROW EXECUTE FUNCTION sessions_espace_figer_population();

-- REQ-SEC-003 : une session de la console n'a pas d'apporteur dont copier la version. Le déclencheur
-- `sessions_espace_version_copiee` (SEC-04) lit la version de l'apporteur : sans apporteur, sa
-- lecture ne rend aucune ligne et pose NULL, que le NOT NULL refuserait. Postgres enchaîne les
-- déclencheurs BEFORE d'une même table dans l'ORDRE ALPHABÉTIQUE de leurs noms : celui-ci
-- (`…_version_de_console`) passe APRÈS `…_version_copiee` et rend 0 à une session de la console.
-- La version d'une session d'apporteur n'est pas touchée.
CREATE FUNCTION sessions_espace_version_console() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."apporteur_id" IS NULL THEN
    NEW."session_version" := 0;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_espace_version_de_console BEFORE INSERT ON "sessions_espace"
  FOR EACH ROW EXECUTE FUNCTION sessions_espace_version_console();
