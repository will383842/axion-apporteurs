-- La persistance du dépôt — DM-07, M2 (partners/ADR-0022, points 1, 2, 6, 11 et 12).
-- Partie générée : `prisma migrate diff` du schéma de main vers celui de cette PR, tables et
-- clés étrangères (toutes en Restrict, à la suppression comme à la mise à jour).

-- AlterTable
ALTER TABLE "courriels_envoyes" ADD COLUMN     "attribution_id" UUID;

-- CreateTable
CREATE TABLE "attributions" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID,
    "utilisateur_console_id" UUID,
    "statut" "etat_attribution" NOT NULL,
    "rang_attente" SMALLINT,
    "siren" CHAR(9) NOT NULL,
    "siret" CHAR(14),
    "grille_commission_id" UUID,
    "canal" "canal_depot" NOT NULL,
    "jeton_depot_id" UUID,
    "deposee_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "client_captured_at" TIMESTAMPTZ(3),
    "date_contact" DATE NOT NULL,
    "information_tiers_version" VARCHAR(32),
    "verification_prioritaire" BOOLEAN NOT NULL,
    "ip_hash" CHAR(16),
    "agent_hash" CHAR(64),
    "raison_sociale" VARCHAR(300),
    "nature_juridique" VARCHAR(4),
    "code_naf" VARCHAR(6),
    "tranche_effectif" VARCHAR(2),
    "etat_administratif" "etat_administratif",
    "categorie_entreprise" "categorie_entreprise",
    "code_postal_chiffre" BYTEA,
    "commune_siege" VARCHAR(100),
    "departement" VARCHAR(3),
    "region" VARCHAR(3),
    "latitude_microdeg" INTEGER,
    "longitude_microdeg" INTEGER,
    "dirigeants_json" JSONB,
    "entreprise_a_verifier" BOOLEAN NOT NULL,
    "nom_contact_chiffre" BYTEA,
    "prenom_contact_chiffre" BYTEA,
    "email_chiffre" BYTEA,
    "email_hash" CHAR(64),
    "telephone_chiffre" BYTEA,
    "phone_hash" CHAR(64),
    "fonction_contact_chiffre" BYTEA,
    "contexte_chiffre" BYTEA,
    "personne_declaree_id" UUID,
    "lien_interet_declare" BOOLEAN NOT NULL,
    "lien_interet_precision_chiffre" BYTEA,
    "a_qualifier_depuis_at" TIMESTAMPTZ(3),
    "premier_contact_at" TIMESTAMPTZ(3),
    "confirmee_at" TIMESTAMPTZ(3),
    "fenetre_fin_at" TIMESTAMPTZ(3),
    "peremption_at" TIMESTAMPTZ(3),
    "peremption_suspendue_at" TIMESTAMPTZ(3),
    "peremption_suspendue_par_id" UUID,
    "peremption_suspendue_justification" TEXT,
    "fenetre_redeclaration_fin_at" TIMESTAMPTZ(3),
    "purge_contact_at" TIMESTAMPTZ(3),
    "contact_purge_at" TIMESTAMPTZ(3),
    "version_qualification" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depots_refuses" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "siren" CHAR(9) NOT NULL,
    "motif" "motif_refus_depot" NOT NULL,
    "canal" "canal_depot" NOT NULL,
    "refuse_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "depots_refuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnes_declarees" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "nom_chiffre" BYTEA,
    "prenom_chiffre" BYTEA,
    "qualite" "qualite_personne_declaree" NOT NULL,
    "declaree_at" TIMESTAMPTZ(3) NOT NULL,
    "retiree_at" TIMESTAMPTZ(3),

    CONSTRAINT "personnes_declarees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attributions_apporteur_id_idx" ON "attributions"("apporteur_id");

-- CreateIndex
CREATE INDEX "attributions_utilisateur_console_id_idx" ON "attributions"("utilisateur_console_id");

-- CreateIndex
CREATE INDEX "attributions_grille_commission_id_idx" ON "attributions"("grille_commission_id");

-- CreateIndex
CREATE INDEX "attributions_jeton_depot_id_idx" ON "attributions"("jeton_depot_id");

-- CreateIndex
CREATE INDEX "attributions_personne_declaree_id_idx" ON "attributions"("personne_declaree_id");

-- CreateIndex
CREATE INDEX "attributions_peremption_suspendue_par_id_idx" ON "attributions"("peremption_suspendue_par_id");

-- CreateIndex
CREATE INDEX "attributions_email_hash_idx" ON "attributions"("email_hash");

-- CreateIndex
CREATE INDEX "attributions_phone_hash_idx" ON "attributions"("phone_hash");

-- CreateIndex
CREATE INDEX "depots_refuses_apporteur_id_idx" ON "depots_refuses"("apporteur_id");

-- CreateIndex
CREATE INDEX "depots_refuses_siren_idx" ON "depots_refuses"("siren");

-- CreateIndex
CREATE INDEX "personnes_declarees_apporteur_id_idx" ON "personnes_declarees"("apporteur_id");

-- CreateIndex
CREATE INDEX "courriels_envoyes_attribution_id_idx" ON "courriels_envoyes"("attribution_id");

-- AddForeignKey
ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_utilisateur_console_id_fkey" FOREIGN KEY ("utilisateur_console_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_grille_commission_id_fkey" FOREIGN KEY ("grille_commission_id") REFERENCES "grilles_commission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_jeton_depot_id_fkey" FOREIGN KEY ("jeton_depot_id") REFERENCES "jetons_depot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_personne_declaree_id_fkey" FOREIGN KEY ("personne_declaree_id") REFERENCES "personnes_declarees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_peremption_suspendue_par_id_fkey" FOREIGN KEY ("peremption_suspendue_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "depots_refuses" ADD CONSTRAINT "depots_refuses_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personnes_declarees" ADD CONSTRAINT "personnes_declarees_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══ SQL brut : Prisma ne modélise ni CHECK, ni index partiel, ni fonction, ni déclencheur ═══

-- ── attributions : les formes ───────────────────────────────────────────────────────────────
-- REQ-DM-002 : SIREN à 9 chiffres ; SIRET à 14 chiffres, dont les 9 premiers sont le SIREN.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_siren_forme"
  CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_siret_forme"
  CHECK ("siret" IS NULL OR ("siret" ~ '^[0-9]{14}$' AND left("siret", 9) = "siren"));
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_code_naf_forme"
  CHECK ("code_naf" IS NULL OR "code_naf" ~ '^[0-9]{2}\.[0-9]{2}[A-Z]$');
-- EXT-T08 : micro-degrés, bornés, présents ensemble.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_coordonnees"
  CHECK (
    ("latitude_microdeg" IS NULL) = ("longitude_microdeg" IS NULL)
    AND ("latitude_microdeg" IS NULL OR "latitude_microdeg" BETWEEN -90000000 AND 90000000)
    AND ("longitude_microdeg" IS NULL OR "longitude_microdeg" BETWEEN -180000000 AND 180000000)
  );
-- Empreintes hexadécimales ; le bloc et l'empreinte du courriel et du téléphone vont ensemble.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_empreintes_hex"
  CHECK (
    ("email_hash" IS NULL OR "email_hash" ~ '^[0-9a-f]{64}$')
    AND ("phone_hash" IS NULL OR "phone_hash" ~ '^[0-9a-f]{64}$')
    AND ("agent_hash" IS NULL OR "agent_hash" ~ '^[0-9a-f]{64}$')
    AND ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{16}$')
  );
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_courriel_bloc_et_empreinte"
  CHECK (("email_chiffre" IS NULL) = ("email_hash" IS NULL));
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_telephone_bloc_et_empreinte"
  CHECK (("telephone_chiffre" IS NULL) = ("phone_hash" IS NULL));
-- REQ-UX-039 : la précision du lien d'intérêt n'existe que si le lien est déclaré.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_lien_interet_precision"
  CHECK ("lien_interet_precision_chiffre" IS NULL OR "lien_interet_declare");
-- La suspension de péremption : les trois ensemble ou aucune ; une justification d'au moins
-- vingt caractères utiles (partners/ADR-0022, point 5).
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_suspension_de_peremption"
  CHECK (
    num_nonnulls("peremption_suspendue_at", "peremption_suspendue_par_id", "peremption_suspendue_justification") IN (0, 3)
    AND ("peremption_suspendue_justification" IS NULL OR char_length(btrim("peremption_suspendue_justification")) >= 20)
  );
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_version_qualification_positive"
  CHECK ("version_qualification" >= 0);

-- ── attributions : le porteur (W19, GOV-115) ────────────────────────────────────────────────
-- Exactement un porteur : un apporteur OU un conseiller salarié.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_un_seul_porteur"
  CHECK (num_nonnulls("apporteur_id", "utilisateur_console_id") = 1);
-- REQ-DM-014 : une version de grille si et seulement si le porteur est un apporteur.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_grille_de_l_apporteur"
  CHECK (("grille_commission_id" IS NOT NULL) = ("apporteur_id" IS NOT NULL));
-- Le canal `console` si et seulement si le porteur est un conseiller, et alors aucun jeton.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_canal_du_conseiller"
  CHECK (("canal" = 'console') = ("utilisateur_console_id" IS NOT NULL));
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_conseiller_sans_jeton"
  CHECK ("canal" <> 'console' OR "jeton_depot_id" IS NULL);
-- REQ-DM-003 : le rang d'attente, 1 ou 2, présent si et seulement si `en_attente`, réservé à
-- l'apporteur.
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_rang_attente"
  CHECK (
    ("rang_attente" IS NULL OR "rang_attente" IN (1, 2))
    AND (("statut" = 'en_attente') = ("rang_attente" IS NOT NULL))
    AND ("rang_attente" IS NULL OR "apporteur_id" IS NOT NULL)
  );

-- ── attributions : l'unicité (REQ-DM-003) ───────────────────────────────────────────────────
-- Au plus UN occupant par SIREN. La clause est EXACTEMENT `clauseEtatsOccupants()`
-- (`src/domain/attribution/etats.ts`), jamais retapée : `partners:schema:enums` et
-- `tests/integration/index-partiel.spec.ts` la confrontent, l'une au texte, l'autre à `pg_indexes`.
CREATE UNIQUE INDEX "attributions_un_occupant" ON "attributions" ("siren")
  WHERE "statut" IN ('provisoire', 'active', 'rdv_pris', 'proposition', 'signee', 'convertie', 'figee_resiliation');
-- La file : deux rangs au plus par SIREN, chacun une fois.
CREATE UNIQUE INDEX "attributions_en_attente" ON "attributions" ("siren", "rang_attente")
  WHERE "statut" = 'en_attente';

-- ── attributions : l'horloge du dépôt (REQ-DM-005, HYP-A02-PRECISION-DEPOT) ─────────────────
-- `clock_timestamp()`, pas `transaction_timestamp()` : lue APRÈS le verrou consultatif par SIREN,
-- elle suit l'ordre réel des dépôts sérialisés. Toute valeur fournie est ÉCRASÉE à l'insertion ;
-- une fois posée, elle ne se réécrit pas.
CREATE FUNCTION attributions_horloge_du_depot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."deposee_at" := clock_timestamp();
  ELSIF NEW."deposee_at" IS DISTINCT FROM OLD."deposee_at" THEN
    RAISE EXCEPTION 'attributions_horloge_du_depot : deposee_at ne se réécrit pas (REQ-DM-005)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attributions_horloge_du_depot BEFORE INSERT OR UPDATE OF "deposee_at" ON "attributions"
  FOR EACH ROW EXECUTE FUNCTION attributions_horloge_du_depot();

-- ── attributions : le conseiller salarié (W19, amendement GOV-132 A1-03) ────────────────────
-- Le porteur console est un utilisateur de rôle `conseiller_salarie`, non désactivé. Comparé en
-- TEXTE : la valeur n'existe pas encore dans `console_role` (SEC-31 l'ajoute) — d'ici là, aucune
-- prise en charge ne passe, et c'est voulu.
CREATE FUNCTION attributions_porteur_conseiller() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."utilisateur_console_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "utilisateurs_console" u
    WHERE u."id" = NEW."utilisateur_console_id"
      AND u."role"::text = 'conseiller_salarie'
      AND u."desactive_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'attributions_porteur_conseiller : le porteur console doit être un conseiller salarié actif (W19)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attributions_porteur_conseiller
  BEFORE INSERT OR UPDATE OF "utilisateur_console_id" ON "attributions"
  FOR EACH ROW EXECUTE FUNCTION attributions_porteur_conseiller();

-- ── depots_refuses : les formes ─────────────────────────────────────────────────────────────
ALTER TABLE "depots_refuses" ADD CONSTRAINT "depots_refuses_siren_forme"
  CHECK ("siren" ~ '^[0-9]{9}$');
-- Réservé aux apporteurs : un conseiller ne se voit pas refuser un dépôt (W19).
ALTER TABLE "depots_refuses" ADD CONSTRAINT "depots_refuses_canal_d_apporteur"
  CHECK ("canal" <> 'console');

-- ── le gabarit « ajout seul, sauf purge » (HYP-A02-GABARIT-AJOUT-SEUL, partners/ADR-0022 §12) ─
-- UNE fonction générique, sans EXECUTE. Elle compare la ligne avant et après, privées des
-- colonnes nommées en argument :
--   `purge:<colonne>`    — une valeur peut devenir NULL, jamais l'inverse ;
--   `une_fois:<colonne>` — NULL peut devenir une valeur, une fois, et plus jamais changer.
-- Un argument d'une autre forme, ou une colonne absente, lève. DELETE et TRUNCATE sont refusés.
-- On s'y branche par CREATE TRIGGER (ligne ET troncature), jamais en la remplaçant.
CREATE FUNCTION refuser_modification_sauf() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i integer;
  arg text;
  nature text;
  colonne text;
  avant jsonb;
  apres jsonb;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'refuser_modification_sauf : % refusé sur %, table en ajout seul', TG_OP, TG_TABLE_NAME;
  END IF;
  avant := to_jsonb(OLD);
  apres := to_jsonb(NEW);
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    arg := TG_ARGV[i];
    nature := split_part(arg, ':', 1);
    colonne := substr(arg, char_length(nature) + 2);
    IF nature NOT IN ('purge', 'une_fois') OR colonne = '' THEN
      RAISE EXCEPTION 'refuser_modification_sauf : argument « % » mal formé sur %', arg, TG_TABLE_NAME;
    END IF;
    IF NOT (avant ? colonne) THEN
      RAISE EXCEPTION 'refuser_modification_sauf : colonne « % » absente de %', colonne, TG_TABLE_NAME;
    END IF;
    IF (avant -> colonne) IS DISTINCT FROM (apres -> colonne) THEN
      IF NOT (
        (nature = 'purge' AND jsonb_typeof(apres -> colonne) = 'null')
        OR (nature = 'une_fois' AND jsonb_typeof(avant -> colonne) = 'null')
      ) THEN
        RAISE EXCEPTION 'refuser_modification_sauf : « % » (%) ne se réécrit pas sur %', colonne, nature, TG_TABLE_NAME;
      END IF;
    END IF;
    avant := avant - colonne;
    apres := apres - colonne;
  END LOOP;
  IF avant IS DISTINCT FROM apres THEN
    RAISE EXCEPTION 'refuser_modification_sauf : UPDATE refusé sur %, table en ajout seul', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

-- Premier usage : `depots_refuses`, sans aucune exception (REQ-DM-043).
CREATE TRIGGER depots_refuses_ajout_seul BEFORE UPDATE OR DELETE ON "depots_refuses"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf();
CREATE TRIGGER depots_refuses_troncature BEFORE TRUNCATE ON "depots_refuses"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf();

-- Second usage : `personnes_declarees` — la purge du nom et du prénom, le retrait écrit une fois.
CREATE TRIGGER personnes_declarees_ajout_seul BEFORE UPDATE OR DELETE ON "personnes_declarees"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:nom_chiffre', 'purge:prenom_chiffre', 'une_fois:retiree_at');
CREATE TRIGGER personnes_declarees_troncature BEFORE TRUNCATE ON "personnes_declarees"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:nom_chiffre', 'purge:prenom_chiffre', 'une_fois:retiree_at');
