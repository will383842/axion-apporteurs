-- SEC-58 : le journal des accès à la console, par identifiants seuls. Ajout seul ; seule la purge
-- planifiée supprime, sous un marqueur de transaction (patron de partners/ADR-0029). Additive.
-- Retour arrière : DROP TABLE "journal_acces_console" ; DROP FUNCTION journal_acces_console_refuser() ;
-- DROP TYPE "nature_acces_console".

CREATE TYPE "nature_acces_console" AS ENUM ('connexion', 'lecture_coordonnees_apporteur', 'lecture_coordonnees_contact');

CREATE TABLE "journal_acces_console" (
    "id" UUID NOT NULL,
    "utilisateur_console_id" UUID NOT NULL,
    "nature" "nature_acces_console" NOT NULL,
    "cible_id" UUID,
    "survenu_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "journal_acces_console_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Une connexion n'a pas de cible ; une lecture de coordonnées en a toujours une.
ALTER TABLE "journal_acces_console" ADD CONSTRAINT "journal_acces_console_cible"
  CHECK (("nature" = 'connexion') = ("cible_id" IS NULL));
-- La purge lit par date ; la consultation lit par utilisateur, dans l'ordre.
CREATE INDEX "journal_acces_console_survenu_at_idx" ON "journal_acces_console"("survenu_at");
CREATE INDEX "journal_acces_console_utilisateur_survenu_idx" ON "journal_acces_console"("utilisateur_console_id", "survenu_at");

-- Une fonction DÉDIÉE, sans EXECUTE. UPDATE et TRUNCATE sont toujours refusés. DELETE n'est admis
-- que sous le marqueur `partners.purge_journal_acces`, posé par la seule tâche de purge, en local à
-- sa transaction : un marqueur jamais posé vaut '' (COALESCE), donc refus.
CREATE FUNCTION journal_acces_console_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('partners.purge_journal_acces', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'journal_acces_console_refuser : % refusé, le journal des accès est en ajout seul ; seule la purge planifiée supprime (SEC-58)', TG_OP;
END;
$$;
CREATE TRIGGER journal_acces_console_ajout_seul BEFORE UPDATE OR DELETE ON "journal_acces_console"
  FOR EACH ROW EXECUTE FUNCTION journal_acces_console_refuser();
CREATE TRIGGER journal_acces_console_troncature BEFORE TRUNCATE ON "journal_acces_console"
  FOR EACH STATEMENT EXECUTE FUNCTION journal_acces_console_refuser();
