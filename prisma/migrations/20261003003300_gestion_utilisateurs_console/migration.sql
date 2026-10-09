-- SEC-30 (REQ-SEC-003, REQ-SEC-023, REQ-DM-024) — la gestion des utilisateurs de la console.
-- Préfixe réservé : 20261003003300 (002300 avant le renommage, sous 002700 fusionnée). ADDITIVE, SAUF deux points acceptés par A02 :
--   — le corps de `sessions_espace_version_console()` est remplacé (CREATE OR REPLACE) : c'est une
--     fonction d'INSERT, non protectrice ; son déclencheur n'est pas recréé ;
--   — DEUX lignes de données : (a) le REPORT des comptes existants, activés depuis leur création
--     (`activee_at = cree_at`), jamais invités ; (b) en fin de migration, le plus ancien admin actif
--     est validé premier administrateur. Les autres admins existants restent EN ATTENTE, et c'est
--     voulu : le premier les valide.
--
-- Retour arrière (commentaire) : DROP TRIGGER
-- utilisateurs_console_quatre_yeux_garde, utilisateurs_console_version_de_session ; DROP FUNCTION
-- utilisateurs_console_quatre_yeux(), utilisateurs_console_incrementer_version_de_session() ;
-- restaurer l'ancien corps de sessions_espace_version_console() (il rendait 0) ; DROP CONSTRAINT ×6
-- (dont utilisateurs_console_invitee_ou_activee et utilisateurs_console_activee_apres_invitation) ;
-- DROP COLUMN ×5 (le report et la validation du premier administrateur disparaissent avec leurs
-- colonnes). Valeurs d'enum inertes, ×2 : celles d'`agregat_journal` et de `type_evenement_journal`
-- ne se retirent pas (Postgres), elles restent sans emploi.

-- ── 1. le journal nomme l'agrégat ────────────────────────────────────────────────────────────────
ALTER TYPE "agregat_journal" ADD VALUE IF NOT EXISTS 'utilisateur_console';
-- L'événement de tout changement d'un utilisateur de la console, dans la même transaction que lui.
-- Ni l'un ni l'autre n'est employé dans cette migration (partners/ADR-0022 §13).
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'utilisateur_console_modifie';

-- ── 2. la version de session de l'utilisateur ────────────────────────────────────────────────────
ALTER TABLE "utilisateurs_console" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- REQ-SEC-003 : la BASE incrémente la version — un seul cran — à tout changement de rôle et à toute
-- désactivation, quel que soit l'écrivain ; elle ne descend jamais. Calque d'apporteurs (SEC-04).
CREATE FUNCTION utilisateurs_console_incrementer_version_de_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."session_version" < OLD."session_version" THEN
    RAISE EXCEPTION 'utilisateurs_console_session_version_monotone : la version de session ne descend jamais (REQ-SEC-003)';
  END IF;
  IF NEW."role" IS DISTINCT FROM OLD."role"
     OR (NEW."desactive_at" IS NOT NULL AND OLD."desactive_at" IS NULL) THEN
    NEW."session_version" := GREATEST(NEW."session_version", OLD."session_version" + 1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER utilisateurs_console_version_de_session BEFORE UPDATE ON "utilisateurs_console"
  FOR EACH ROW EXECUTE FUNCTION utilisateurs_console_incrementer_version_de_session();

-- La session de la console COPIE la version de son utilisateur à l'ouverture (elle rendait 0).
-- Même nom de fonction, même déclencheur `sessions_espace_version_de_console`, ordre inchangé.
-- Une session SANS population (ni apporteur ni utilisateur) n'est pas lue ici : sa version vaut 0,
-- comme avant SEC-30, et le CHECK `sessions_espace_une_population` la refuse en se nommant, au lieu
-- d'un « no rows » ou d'un NOT NULL anonymes.
CREATE OR REPLACE FUNCTION sessions_espace_version_console() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."apporteur_id" IS NULL AND NEW."utilisateur_console_id" IS NOT NULL THEN
    SELECT u."session_version" INTO STRICT NEW."session_version"
      FROM "utilisateurs_console" u WHERE u."id" = NEW."utilisateur_console_id";
  ELSIF NEW."apporteur_id" IS NULL THEN
    NEW."session_version" := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. l'invitation ──────────────────────────────────────────────────────────────────────────────
-- L'échéance se DÉRIVE d'invitee_at et de DUREES_AUTH.invitationConsoleMs : aucune colonne d'échéance.
ALTER TABLE "utilisateurs_console"
  ADD COLUMN "invitee_at" TIMESTAMPTZ(3),
  ADD COLUMN "activee_at" TIMESTAMPTZ(3);
-- (a) REPORT des comptes existants (seed, production) : ACTIVÉS depuis leur création, jamais invités.
-- L'ordre compte : un ADD COLUMN avec défaut leur donnerait la date de la migration.
UPDATE "utilisateurs_console" SET "activee_at" = "cree_at";
-- Un compte créé HORS invitation (seed, fixtures) est activé à sa création. L'invitation est le SEUL
-- chemin d'un compte non activé : elle écrit "activee_at" = NULL EXPLICITEMENT.
ALTER TABLE "utilisateurs_console" ALTER COLUMN "activee_at" SET DEFAULT clock_timestamp();
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_activee_apres_invitation"
  CHECK ("activee_at" IS NULL OR "invitee_at" IS NULL OR "activee_at" >= "invitee_at");
-- Échec fermé : invité, activé, ou les deux ; jamais aucun des deux (il échapperait à l'échéance).
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_invitee_ou_activee"
  CHECK ("invitee_at" IS NOT NULL OR "activee_at" IS NOT NULL);

-- ── 4. les quatre yeux (forme d'A02, HYP-W19-QUATRE-YEUX) ────────────────────────────────────────
ALTER TABLE "utilisateurs_console"
  ADD COLUMN "valide_par_id" UUID,
  ADD COLUMN "valide_at" TIMESTAMPTZ(3);
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_valide_par_id_fkey"
  FOREIGN KEY ("valide_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_validation_liee"
  CHECK ("valide_par_id" IS NULL OR "valide_at" IS NOT NULL);
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_pas_d_auto_validation"
  CHECK ("valide_par_id" IS NULL OR "valide_par_id" <> "id");
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_validation_admin"
  CHECK ("role" = 'admin' OR ("valide_at" IS NULL AND "valide_par_id" IS NULL));

CREATE FUNCTION utilisateurs_console_quatre_yeux() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  validateur RECORD;
BEGIN
  -- (e) un administrateur RÉACTIVÉ repart en attente : un départ ou un compte suspect ne redevient
  -- pas administrateur par un seul regard. La réactivation n'incrémente pas la version : la
  -- désactivation l'a déjà fait.
  IF TG_OP = 'UPDATE' AND OLD."desactive_at" IS NOT NULL AND NEW."desactive_at" IS NULL
     AND NEW."role" = 'admin' THEN
    IF NEW."valide_at" IS DISTINCT FROM OLD."valide_at" OR NEW."valide_par_id" IS DISTINCT FROM OLD."valide_par_id" THEN
      RAISE EXCEPTION 'utilisateurs_console_quatre_yeux : une réactivation d''administrateur repart en attente';
    END IF;
    NEW."valide_at" := NULL;
    NEW."valide_par_id" := NULL;
    RETURN NEW;
  END IF;
  -- (d) passer VERS admin remet en attente ; quitter admin efface la validation.
  IF TG_OP = 'UPDATE' AND NEW."role" IS DISTINCT FROM OLD."role" THEN
    IF NEW."role" = 'admin' AND (NEW."valide_at" IS NOT NULL OR NEW."valide_par_id" IS NOT NULL) THEN
      RAISE EXCEPTION 'utilisateurs_console_quatre_yeux : un passage vers admin repart en attente';
    END IF;
    IF OLD."role" = 'admin' THEN
      NEW."valide_at" := NULL;
      NEW."valide_par_id" := NULL;
    END IF;
  -- (c) une validation posée ne se réécrit pas.
  ELSIF TG_OP = 'UPDATE' AND OLD."valide_at" IS NOT NULL
     AND (NEW."valide_at" IS DISTINCT FROM OLD."valide_at"
          OR NEW."valide_par_id" IS DISTINCT FROM OLD."valide_par_id") THEN
    RAISE EXCEPTION 'utilisateurs_console_quatre_yeux : une validation posée ne se réécrit pas';
  END IF;

  IF NEW."valide_at" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."valide_at" IS NULL) THEN
    IF NEW."valide_par_id" IS NULL THEN
      -- (b) le premier administrateur : seulement si aucun autre admin actif et validé n'existe.
      PERFORM pg_advisory_xact_lock(hashtext('console:premier_admin'));
      IF EXISTS (
        SELECT 1 FROM "utilisateurs_console" u
        WHERE u."id" <> NEW."id" AND u."role" = 'admin'
          AND u."desactive_at" IS NULL AND u."valide_at" IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'utilisateurs_console_quatre_yeux : un administrateur validé existe, la validation exige un validateur';
      END IF;
    ELSE
      -- (a) le validateur : admin, actif, validé, distinct.
      SELECT u."role", u."desactive_at", u."valide_at" INTO validateur
        FROM "utilisateurs_console" u WHERE u."id" = NEW."valide_par_id";
      IF NOT FOUND OR validateur."role" <> 'admin' OR validateur."desactive_at" IS NOT NULL
         OR validateur."valide_at" IS NULL OR NEW."valide_par_id" = NEW."id" THEN
        RAISE EXCEPTION 'utilisateurs_console_quatre_yeux : le validateur doit être un autre administrateur actif et validé';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER utilisateurs_console_quatre_yeux_garde
  BEFORE INSERT OR UPDATE OF "role", "valide_par_id", "valide_at", "desactive_at" ON "utilisateurs_console"
  FOR EACH ROW EXECUTE FUNCTION utilisateurs_console_quatre_yeux();


-- ── 5. le premier administrateur (forme fermée d'A02) ────────────────────────────────────────────
-- APRÈS le déclencheur, pour passer par sa branche du premier administrateur : un seul admin validé,
-- le plus ancien actif.
UPDATE "utilisateurs_console" SET "valide_at" = clock_timestamp()
WHERE "id" = (
  SELECT "id" FROM "utilisateurs_console"
  WHERE "role" = 'admin' AND "desactive_at" IS NULL
  ORDER BY "cree_at", "id" LIMIT 1
);
