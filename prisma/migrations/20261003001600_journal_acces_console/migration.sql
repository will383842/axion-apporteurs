-- SEC-58 : le journal des accès à la console, par identifiants seuls. Ajout seul par le gabarit
-- commun : la purge vide les identifiants et pose sa date, une fois ; la ligne nue (nature, date) reste.
-- Retour arrière : DROP TABLE "journal_acces_console" ; DROP TYPE "nature_acces_console".
CREATE TYPE "nature_acces_console" AS ENUM ('connexion', 'lecture_coordonnees_apporteur', 'lecture_coordonnees_contact');
CREATE TABLE "journal_acces_console" (
    "id" UUID NOT NULL,
    "utilisateur_console_id" UUID,
    "nature" "nature_acces_console" NOT NULL,
    "cible_id" UUID,
    "ip_hash" CHAR(16),
    "survenu_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "purge_at" TIMESTAMPTZ(3),
    CONSTRAINT "journal_acces_console_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_ip_hash_hex"
  CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{16}$');
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_cible"
  CHECK ("purge_at" IS NOT NULL OR ("nature" = 'connexion') = ("cible_id" IS NULL));
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_purge_liee"
  CHECK (("purge_at" IS NULL) = ("utilisateur_console_id" IS NOT NULL)
         AND ("purge_at" IS NULL OR ("cible_id" IS NULL AND "ip_hash" IS NULL)));
CREATE INDEX "journal_acces_console_survenu_at_idx" ON "journal_acces_console"("survenu_at");
CREATE INDEX "journal_acces_console_utilisateur_survenu_idx" ON "journal_acces_console"("utilisateur_console_id", "survenu_at");
CREATE TRIGGER journal_acces_console_ajout_seul BEFORE UPDATE OR DELETE ON "journal_acces_console"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:utilisateur_console_id', 'purge:cible_id', 'purge:ip_hash', 'une_fois:purge_at');
CREATE TRIGGER journal_acces_console_troncature BEFORE TRUNCATE ON "journal_acces_console"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:utilisateur_console_id', 'purge:cible_id', 'purge:ip_hash', 'une_fois:purge_at');
