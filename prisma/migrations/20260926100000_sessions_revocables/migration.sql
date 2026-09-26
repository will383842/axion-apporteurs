-- AlterTable
ALTER TABLE "apporteurs" ADD COLUMN     "confidentialite_acceptee_at" TIMESTAMPTZ(3),
ADD COLUMN     "confidentialite_version" VARCHAR(32),
ADD COLUMN     "nom_chiffre" BYTEA,
ADD COLUMN     "phone_hash" CHAR(64),
ADD COLUMN     "prenom_chiffre" BYTEA,
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "telephone_chiffre" BYTEA;

-- AlterTable
ALTER TABLE "liens_magiques" ADD COLUMN     "code_hash" CHAR(64),
ADD COLUMN     "tentatives_code" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sessions_espace" ADD COLUMN     "derniere_vue_at" TIMESTAMPTZ(3),
ADD COLUMN     "revoque_at" TIMESTAMPTZ(3),
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "changements_courriel" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "email_chiffre" BYTEA NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "kid" CHAR(8) NOT NULL,
    "demande_at" TIMESTAMPTZ(3) NOT NULL,
    "confirme_at" TIMESTAMPTZ(3),
    "annule_at" TIMESTAMPTZ(3),

    CONSTRAINT "changements_courriel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "changements_courriel_token_hash_key" ON "changements_courriel"("token_hash");

-- CreateIndex
CREATE INDEX "changements_courriel_apporteur_id_idx" ON "changements_courriel"("apporteur_id");

-- CreateIndex
CREATE INDEX "apporteurs_phone_hash_idx" ON "apporteurs"("phone_hash");

-- AddForeignKey
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur, ni index partiel
-- (partners/ADR-0015).

-- ── apporteurs ───────────────────────────────────────────────────────────────────────────────────

-- REQ-SEC-003 : la version de session est un compteur, jamais négatif.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_session_version_positive"
  CHECK ("session_version" >= 0);
-- REQ-SEC-024 (partners/ADR-0013, décisions 11 à 13 ; partners/ADR-0022, point 6) : le téléphone
-- n'existe qu'en bloc chiffré et en empreinte HMAC hexadécimale, les deux ensemble ou aucun — sur le
-- modèle du courriel. Le nom et le prénom n'ont que leur bloc : aucune empreinte.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_phone_hash_hex"
  CHECK ("phone_hash" IS NULL OR "phone_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_telephone_complet"
  CHECK (("telephone_chiffre" IS NULL) = ("phone_hash" IS NULL));
-- REQ-JUR-025 : une acceptation de la politique de confidentialité a une date ET une version.
ALTER TABLE "apporteurs" ADD CONSTRAINT "apporteurs_confidentialite_complete"
  CHECK (("confidentialite_acceptee_at" IS NULL) = ("confidentialite_version" IS NULL));

-- REQ-SEC-003 : la BASE incrémente la version de session — un seul cran — à la résiliation et à tout
-- changement de l'empreinte du courriel, quel que soit l'écrivain : aucun appelant futur ne peut
-- l'oublier. Un écrivain qui incrémente lui-même dans la même écriture n'obtient pas un second cran.
-- La suspension ne l'incrémente pas (REQ-SEC-032, REQ-SEC-019). La version ne descend jamais : une
-- ligne restaurée à une version inférieure rouvrirait des sessions révoquées.
CREATE FUNCTION apporteurs_incrementer_version_de_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."session_version" < OLD."session_version" THEN
    RAISE EXCEPTION 'apporteurs_session_version_monotone : la version de session ne descend jamais (REQ-SEC-003)';
  END IF;
  IF (NEW."statut" = 'resilie' AND OLD."statut" <> 'resilie')
     OR NEW."email_hash" IS DISTINCT FROM OLD."email_hash" THEN
    NEW."session_version" := GREATEST(NEW."session_version", OLD."session_version" + 1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER apporteurs_version_de_session BEFORE UPDATE ON "apporteurs"
  FOR EACH ROW EXECUTE FUNCTION apporteurs_incrementer_version_de_session();

-- ── sessions_espace ──────────────────────────────────────────────────────────────────────────────

-- REQ-SEC-003 : une session n'est pas révoquée avant d'exister.
ALTER TABLE "sessions_espace" ADD CONSTRAINT "sessions_espace_revoque_apres_creation"
  CHECK ("revoque_at" IS NULL OR "revoque_at" >= "cree_at");

-- REQ-SEC-003 : la version d'une session est celle de son apporteur À L'OUVERTURE, lue par la base ;
-- l'écrivain ne la choisit pas. Les sessions ouvertes avant cette migration valent 0, la version de
-- leur apporteur : elles restent valides.
CREATE FUNCTION sessions_espace_copier_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT "session_version" INTO NEW."session_version" FROM "apporteurs" WHERE "id" = NEW."apporteur_id";
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_espace_version_copiee BEFORE INSERT ON "sessions_espace"
  FOR EACH ROW EXECUTE FUNCTION sessions_espace_copier_version();

-- REQ-SEC-003 : une révocation est définitive — ni annulée, ni déplacée ; seules `revoque_at` et
-- `derniere_vue_at` s'écrivent, la version d'une session ne se réécrit pas. DELETE et TRUNCATE
-- restent permis : une session effacée ne s'ouvre plus.
CREATE FUNCTION sessions_espace_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."revoque_at" IS NOT NULL AND NEW."revoque_at" IS DISTINCT FROM OLD."revoque_at" THEN
    RAISE EXCEPTION 'sessions_espace_revocation_definitive : une révocation ne s''annule pas (REQ-SEC-003)';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
     OR NEW."lien_magique_id" IS DISTINCT FROM OLD."lien_magique_id"
     OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
     OR NEW."kid" IS DISTINCT FROM OLD."kid"
     OR NEW."ip_hash" IS DISTINCT FROM OLD."ip_hash"
     OR NEW."cree_at" IS DISTINCT FROM OLD."cree_at"
     OR NEW."expire_at" IS DISTINCT FROM OLD."expire_at"
     OR NEW."session_version" IS DISTINCT FROM OLD."session_version" THEN
    RAISE EXCEPTION 'sessions_espace_revocation_definitive : seules revoque_at et derniere_vue_at s''écrivent (REQ-SEC-003)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_espace_revocation_definitive BEFORE UPDATE ON "sessions_espace"
  FOR EACH ROW EXECUTE FUNCTION sessions_espace_refuser_modification();

-- ── liens_magiques ───────────────────────────────────────────────────────────────────────────────

-- REQ-UX-015 (partners/ADR-0013, décision 14) : l'empreinte du code est un HMAC-SHA-256 hexadécimal ;
-- au plus cinq essais.
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_code_hash_hex"
  CHECK ("code_hash" IS NULL OR "code_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "liens_magiques" ADD CONSTRAINT "liens_magiques_tentatives_code_bornees"
  CHECK ("tentatives_code" BETWEEN 0 AND 5);

-- REQ-UX-015 : une empreinte de code posée ne change plus, et le compte des essais ne redescend
-- jamais — sinon cinq essais de plus s'achèteraient en remettant le compte à zéro.
CREATE FUNCTION liens_magiques_figer_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."code_hash" IS NOT NULL AND NEW."code_hash" IS DISTINCT FROM OLD."code_hash" THEN
    RAISE EXCEPTION 'liens_magiques_code_fige : une empreinte de code posée ne change plus (REQ-UX-015)';
  END IF;
  IF NEW."tentatives_code" < OLD."tentatives_code" THEN
    RAISE EXCEPTION 'liens_magiques_code_fige : le compte des essais ne redescend jamais (REQ-UX-015)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER liens_magiques_code_fige BEFORE UPDATE ON "liens_magiques"
  FOR EACH ROW EXECUTE FUNCTION liens_magiques_figer_code();

-- ── changements_courriel ─────────────────────────────────────────────────────────────────────────

-- REQ-CPL-019, REQ-SEC-004 : la nouvelle adresse n'existe qu'en bloc chiffré et en empreinte ; le
-- jeton de confirmation qu'en empreinte HMAC, avec le `kid` de son secret.
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_email_hash_hex"
  CHECK ("email_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_token_hash_hex"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_kid_hex"
  CHECK ("kid" ~ '^[0-9a-f]{8}$');
-- Jamais confirmé ET annulé ; ni l'un ni l'autre avant la demande.
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_confirme_ou_annule"
  CHECK (NOT ("confirme_at" IS NOT NULL AND "annule_at" IS NOT NULL));
ALTER TABLE "changements_courriel" ADD CONSTRAINT "changements_courriel_apres_demande"
  CHECK (("confirme_at" IS NULL OR "confirme_at" >= "demande_at")
     AND ("annule_at" IS NULL OR "annule_at" >= "demande_at"));
-- Un seul changement en cours par apporteur.
CREATE UNIQUE INDEX "changements_courriel_un_en_cours" ON "changements_courriel"("apporteur_id")
  WHERE "confirme_at" IS NULL AND "annule_at" IS NULL;
