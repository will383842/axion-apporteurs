-- L'écrit reçu d'un apporteur (arbitrage #319 6038136969 ; condition de la juriste #474 6038112933) :
-- sa date de RÉCEPTION est posée par la BASE, jamais par la console ni par le client. Table en ajout
-- seul : un écrit ne se réécrit pas, seul son texte se purge, une fois, avec sa date.
-- Retour arrière (commentaire) : DROP TRIGGER ecrits_apporteur_ajout_seul, ecrits_apporteur_troncature,
-- ecrits_apporteur_recu_par_la_base ; DROP FUNCTION ecrits_apporteur_recu_par_la_base() ; DROP TABLE "ecrits_apporteur".
CREATE TABLE "ecrits_apporteur" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "recu_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "texte_chiffre" BYTEA,
    "texte_purge_at" TIMESTAMPTZ(3),
    "cle_idempotence" UUID NOT NULL,
    CONSTRAINT "ecrits_apporteur_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ecrits_apporteur" ADD CONSTRAINT "ecrits_apporteur_apporteur_id_fkey"
  FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- La clé composite que `contestations` cite (écrit + apporteur).
CREATE UNIQUE INDEX "ecrits_apporteur_id_apporteur_key" ON "ecrits_apporteur" ("id", "apporteur_id");
CREATE INDEX "ecrits_apporteur_apporteur_id_idx" ON "ecrits_apporteur" ("apporteur_id");
-- La clé d'idempotence (amendement d'A02, #319 6039339072, condition e de la sécurité) : tirée par le
-- serveur au rendu de /aide, distincte de l'id, GLOBALE (une même clé chez deux apporteurs est un rejeu),
-- immuable (le gabarit ne l'admet pas), jamais purgée, jamais rendue.
CREATE UNIQUE INDEX "ecrits_apporteur_cle_idempotence_key" ON "ecrits_apporteur" ("cle_idempotence");
-- La purge lit les écrits non purgés par date de réception.
CREATE INDEX "ecrits_apporteur_recu_at_idx" ON "ecrits_apporteur" ("recu_at") WHERE "texte_purge_at" IS NULL;
-- Un écrit naît avec son texte ; seule la purge le retire, et elle pose sa date dans la même écriture.
ALTER TABLE "ecrits_apporteur" ADD CONSTRAINT "ecrits_apporteur_texte_ou_purge"
  CHECK (("texte_chiffre" IS NULL) = ("texte_purge_at" IS NOT NULL));
-- Un chiffré vide n'est pas un écrit.
ALTER TABLE "ecrits_apporteur" ADD CONSTRAINT "ecrits_apporteur_texte_non_vide"
  CHECK ("texte_chiffre" IS NULL OR octet_length("texte_chiffre") > 0);

-- La date de réception est CELLE DE LA BASE : toute valeur fournie est remplacée à l'insertion.
CREATE FUNCTION ecrits_apporteur_recu_par_la_base() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."recu_at" := clock_timestamp();
  IF NEW."texte_purge_at" IS NOT NULL THEN
    RAISE EXCEPTION 'ecrits_apporteur : un écrit naît avec son texte, sans purge';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ecrits_apporteur_recu_par_la_base BEFORE INSERT ON "ecrits_apporteur"
  FOR EACH ROW EXECUTE FUNCTION ecrits_apporteur_recu_par_la_base();
-- Ajout seul, par le gabarit du dépôt (refuser_modification_sauf, ADR-0031) : DELETE et TRUNCATE refusés,
-- seule la purge du texte, une fois, avec sa date.
CREATE TRIGGER ecrits_apporteur_ajout_seul BEFORE UPDATE OR DELETE ON "ecrits_apporteur"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:texte_chiffre', 'une_fois:texte_purge_at');
CREATE TRIGGER ecrits_apporteur_troncature BEFORE TRUNCATE ON "ecrits_apporteur"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:texte_chiffre', 'une_fois:texte_purge_at');
