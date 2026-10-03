-- DM-09 (REQ-DM-008, REQ-DM-031, HYP-A02-VOCABULAIRE-QUALIFICATION) : la qualification d'un appel, en
-- AJOUT SEUL. Quatre types neufs et une table neuve, ses contraintes et ses déclencheurs ; rien
-- d'existant n'est touché. Aucun type de journal n'est ajouté (GLOSSAIRE §4.1 : DM-09 n'en crée pas),
-- donc aucun ADD VALUE, et un seul fichier suffit. Le nombre d'« injoignable » est DÉRIVÉ du compte des
-- qualifications, jamais stocké.
--
-- Retour arrière : DROP TABLE "qualifications" (ses index, contraintes et déclencheurs avec elle),
-- puis DROP TYPE "motif_perte", "prochaine_etape", "interet_contact" et "resultat_contact". Les
-- qualifications écrites depuis sont perdues, rien d'autre.

-- CreateEnum
CREATE TYPE "resultat_contact" AS ENUM ('confirme', 'non_confirme', 'injoignable', 'ne_se_souvient_pas');

-- CreateEnum
CREATE TYPE "interet_contact" AS ENUM ('eleve', 'moyen', 'faible', 'nul');

-- CreateEnum
CREATE TYPE "prochaine_etape" AS ENUM ('rdv', 'rappeler', 'proposition', 'perdue', 'aucune');

-- CreateEnum
CREATE TYPE "motif_perte" AS ENUM ('pas_de_besoin', 'deja_equipe', 'hors_cible', 'injoignable_definitif', 'autre');

-- CreateTable
CREATE TABLE "qualifications" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "resultat_contact" "resultat_contact" NOT NULL,
    "interet" "interet_contact",
    "prochaine_etape" "prochaine_etape" NOT NULL,
    "motif_perte" "motif_perte",
    "rdv_at" TIMESTAMPTZ(3),
    "rappeler_at" TIMESTAMPTZ(3),
    "personne_interrogee_chiffre" BYTEA,
    "termes_reponse_chiffre" BYTEA,
    "contact_purge_at" TIMESTAMPTZ(3),
    "auteur_id" UUID NOT NULL,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qualifications_attribution_id_cree_at_idx" ON "qualifications"("attribution_id", "cree_at");

-- CreateIndex
CREATE INDEX "qualifications_auteur_id_idx" ON "qualifications"("auteur_id");

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- SQL brut : Prisma ne modélise ni CHECK, ni déclencheur (partners/ADR-0015).

-- L'étape et ses données vont ensemble, dans les deux sens (A02, 2026-10-03).
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_perte_motivee"
  CHECK (("prochaine_etape" = 'perdue') = ("motif_perte" IS NOT NULL));
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_rdv_date"
  CHECK (("prochaine_etape" = 'rdv') = ("rdv_at" IS NOT NULL));
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_rappel_date"
  CHECK (("prochaine_etape" = 'rappeler') = ("rappeler_at" IS NOT NULL));
-- Un bloc chiffré n'est jamais vide.
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_personne_non_vide"
  CHECK ("personne_interrogee_chiffre" IS NULL OR octet_length("personne_interrogee_chiffre") > 0);
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_termes_non_vides"
  CHECK ("termes_reponse_chiffre" IS NULL OR octet_length("termes_reponse_chiffre") > 0);
-- La purge est datée : une fois la date posée, les deux blocs du tiers sont vides (REQ-DM-031).
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_purge_liee"
  CHECK ("contact_purge_at" IS NULL OR ("personne_interrogee_chiffre" IS NULL AND "termes_reponse_chiffre" IS NULL));
-- Et l'autre sens (sécurité, 2026-10-03) : un contact JOINT porte ses deux blocs tant que la purge n'est
-- pas datée. Vider la personne et les termes sans date effacerait en silence la preuve d'un démenti.
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_reponse_presente"
  CHECK ("resultat_contact" = 'injoignable' OR "contact_purge_at" IS NOT NULL OR ("personne_interrogee_chiffre" IS NOT NULL AND "termes_reponse_chiffre" IS NOT NULL));

-- Le gabarit générique (HYP-A02-GABARIT-AJOUT-SEUL), branché, jamais recréé : les deux blocs du tiers
-- peuvent s'effacer, la date de purge s'écrit une fois, rien d'autre ne change ; DELETE et TRUNCATE
-- refusés.
CREATE TRIGGER qualifications_ajout_seul BEFORE UPDATE OR DELETE ON "qualifications"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:personne_interrogee_chiffre', 'purge:termes_reponse_chiffre', 'une_fois:contact_purge_at');
CREATE TRIGGER qualifications_troncature BEFORE TRUNCATE ON "qualifications"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('purge:personne_interrogee_chiffre', 'purge:termes_reponse_chiffre', 'une_fois:contact_purge_at');

-- Le démenti (Williams, 2026-10-03 : « oui 5 ans ») : le nom et les termes d'une qualification
-- `non_confirme` qui a éteint l'attribution sont gardés, chiffrés, au-delà de la purge du contact ;
-- leur purge dédiée (DM-62) pose `contact_purge_at` plus tard. L'index partiel sert cette purge, qui
-- lit PAR DATE (`cree_at` + 5 ans, forme d'A02 du 2026-10-03).
CREATE INDEX "qualifications_dementi_a_purger_idx" ON "qualifications"("cree_at")
  WHERE "resultat_contact" = 'non_confirme' AND "contact_purge_at" IS NULL;
