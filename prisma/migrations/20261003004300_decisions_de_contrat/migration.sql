-- SEC-19 (REQ-JUR-006, art. 11 et 12) — les décisions de contrat, forme d'A02 (#703, 5982083436 §1).
-- Préfixe RÉSERVÉ : 20261003004300, après 004200 (même tâche). ADDITIVE.
--
-- Le texte d'une mise en demeure (`{faits}`) ou d'une résiliation motivée (`{motif}`) ne vit JAMAIS au
-- journal chaîné : il vit ici, CHIFFRÉ, dans une ligne propre et purgeable, que le passage des
-- notifications lit au rendu — le précédent de l'anomalie de DM-55. La ligne nue (geste, article,
-- dates, événement) reste comme preuve du fait daté ; seul le texte est purgé.
--
-- L'IDEMPOTENCE de la mise en demeure (sécurité, #703, 5982535417 ; forme d'A02, 5982552283) : une clé
-- tirée par le serveur au rendu du formulaire, UNIQUE et immuable, et l'empreinte HMAC des faits, qui
-- vit et meurt avec le texte. Le rejeu d'une clé ne lit que la ligne de CETTE clé, jamais l'historique.
--
-- Retour arrière (commentaire) : DROP CONSTRAINT notifications_espace_decision_contrat_cle,
-- notifications_espace_decision_contrat_id_fkey ; DROP INDEX notifications_espace_decision_contrat_id_idx ;
-- DROP INDEX decisions_de_contrat_cle_idempotence_key ;
-- ALTER TABLE notifications_espace DROP COLUMN decision_contrat_id ; DROP TABLE decisions_de_contrat
-- (ses déclencheurs et contraintes avec elle) ; DROP FUNCTION decisions_de_contrat_garde() ;
-- DROP TYPE geste_decision_contrat.

CREATE TYPE "geste_decision_contrat" AS ENUM ('mise_en_demeure', 'resiliation');

CREATE TABLE "decisions_de_contrat" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "geste" "geste_decision_contrat" NOT NULL,
    "article" VARCHAR(4),
    "texte_chiffre" BYTEA,
    "date_reception" DATE,
    "date_effet" DATE,
    "evenement_id" BIGINT NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "texte_purge_at" TIMESTAMPTZ(3),
    "cle_idempotence" UUID,
    "faits_empreinte" CHAR(64),

    CONSTRAINT "decisions_de_contrat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "decisions_de_contrat_evenement_id_key" ON "decisions_de_contrat"("evenement_id");
CREATE INDEX "decisions_de_contrat_apporteur_id_idx" ON "decisions_de_contrat"("apporteur_id");
-- La clé d'idempotence : UNIQUE (les NULL restent distincts), tirée par le serveur au rendu ; ce n'est
-- pas une donnée personnelle, elle n'est jamais purgée.
CREATE UNIQUE INDEX "decisions_de_contrat_cle_idempotence_key" ON "decisions_de_contrat"("cle_idempotence");
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_apporteur_id_fkey"
  FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- L'événement qui fonde la décision : `apporteur_mis_en_demeure`, ou `apporteur_statut_modifie` vers
-- `resilie`. BIGINT : l'identifiant du journal chaîné.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_evenement_id_fkey"
  FOREIGN KEY ("evenement_id") REFERENCES "evenements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La liste FERMÉE des articles de l'art. 11.2 (`ARTICLES_MISE_EN_DEMEURE`, confrontée par un témoin).
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_article_ferme"
  CHECK ("article" IS NULL OR "article" IN ('3.7', '6', '7', '8', '9', '23'));
-- La mise en demeure vise un article et n'a pas de dates ; la résiliation n'a pas d'article et a ses
-- deux dates (jours civils de Paris ; hors `ordinaire_axion`, la date d'effet est le jour du geste).
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_forme_du_geste"
  CHECK (CASE WHEN "geste" = 'mise_en_demeure'
              THEN "article" IS NOT NULL AND "date_reception" IS NULL AND "date_effet" IS NULL
              ELSE "article" IS NULL AND "date_reception" IS NOT NULL AND "date_effet" IS NOT NULL END);
-- La purge est LIÉE : une date de purge va avec un texte vidé.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_purge_liee"
  CHECK ("texte_purge_at" IS NULL OR "texte_chiffre" IS NULL);
-- Une mise en demeure naît avec ses faits ; seule la purge les retire. Une résiliation sans décision
-- motivée (motifs ordinaires, fin de plein droit) n'a pas de texte.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_faits_de_la_mise_en_demeure"
  CHECK ("geste" <> 'mise_en_demeure' OR "texte_chiffre" IS NOT NULL OR "texte_purge_at" IS NOT NULL);
-- Une mise en demeure porte TOUJOURS sa clé ; une résiliation peut en porter une.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_cle_de_la_mise_en_demeure"
  CHECK ("geste" <> 'mise_en_demeure' OR "cle_idempotence" IS NOT NULL);
-- L'empreinte des faits : 64 hexadécimaux, comme `email_hash` et `token_hash`.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_faits_empreinte_forme"
  CHECK ("faits_empreinte" IS NULL OR "faits_empreinte" ~ '^[0-9a-f]{64}$');
-- L'empreinte VIT et MEURT avec le texte de la mise en demeure ; une résiliation n'en a jamais.
ALTER TABLE "decisions_de_contrat" ADD CONSTRAINT "decisions_de_contrat_empreinte_liee_au_texte"
  CHECK (CASE WHEN "geste" = 'mise_en_demeure'
              THEN ("faits_empreinte" IS NULL) = ("texte_chiffre" IS NULL)
              ELSE "faits_empreinte" IS NULL END);

-- Une garde DÉDIÉE (forme d'A02), sans EXECUTE : la ligne naît sans purge ; ensuite, la SEULE écriture
-- admise est la purge — le texte ET son empreinte vidés, sa date posée, une fois, rien d'autre ; la clé
-- d'idempotence ne bouge jamais. DELETE et TRUNCATE sont refusés : la ligne nue reste comme preuve.
CREATE FUNCTION decisions_de_contrat_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'decisions_de_contrat_garde : % refusé, une décision de contrat ne disparaît pas (REQ-JUR-006)', TG_OP;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."texte_purge_at" IS NOT NULL THEN
      RAISE EXCEPTION 'decisions_de_contrat_garde : une décision naît sans purge (REQ-JUR-006)';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."texte_purge_at" IS NOT NULL OR OLD."texte_chiffre" IS NULL
     OR NEW."texte_chiffre" IS NOT NULL OR NEW."texte_purge_at" IS NULL
     OR NEW."faits_empreinte" IS NOT NULL
     OR NEW."cle_idempotence" IS DISTINCT FROM OLD."cle_idempotence"
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."apporteur_id" IS DISTINCT FROM OLD."apporteur_id"
     OR NEW."geste" IS DISTINCT FROM OLD."geste"
     OR NEW."article" IS DISTINCT FROM OLD."article"
     OR NEW."date_reception" IS DISTINCT FROM OLD."date_reception"
     OR NEW."date_effet" IS DISTINCT FROM OLD."date_effet"
     OR NEW."evenement_id" IS DISTINCT FROM OLD."evenement_id"
     OR NEW."cree_at" IS DISTINCT FROM OLD."cree_at" THEN
    RAISE EXCEPTION 'decisions_de_contrat_garde : seule la purge du texte s''écrit, une fois (REQ-JUR-006)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decisions_de_contrat_garde BEFORE INSERT OR UPDATE OR DELETE ON "decisions_de_contrat"
  FOR EACH ROW EXECUTE FUNCTION decisions_de_contrat_garde();
CREATE TRIGGER decisions_de_contrat_troncature BEFORE TRUNCATE ON "decisions_de_contrat"
  FOR EACH STATEMENT EXECUTE FUNCTION decisions_de_contrat_garde();

-- La notification lit sa décision au rendu. SET NULL : rien ne bloque la purge de DM-61.
ALTER TABLE "notifications_espace" ADD COLUMN "decision_contrat_id" UUID;
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_decision_contrat_id_fkey"
  FOREIGN KEY ("decision_contrat_id") REFERENCES "decisions_de_contrat"("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_decision_contrat_cle"
  CHECK ("decision_contrat_id" IS NULL OR "cle" IN ('mise_en_demeure', 'resiliation'));
CREATE INDEX "notifications_espace_decision_contrat_id_idx" ON "notifications_espace"("decision_contrat_id");
