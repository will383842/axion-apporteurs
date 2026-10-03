-- DM-10-P (REQ-DM-028, REQ-DM-029, REQ-SEC-022) : la liste tenue par la Société et la projection
-- locale de l'antériorité. Additive : deux enums, trois tables neuves.
-- Retour arrière : DROP TABLE "devis_connus", "entreprises_connues", "sirens_liste_noire" ;
-- DROP TYPE "origine_entreprise_connue", "motif_liste_noire".

-- Les valeurs du GLOSSAIRE, mot pour mot (partners:schema:enums).
CREATE TYPE "origine_entreprise_connue" AS ENUM ('client', 'devis', 'financeur');
CREATE TYPE "motif_liste_noire" AS ENUM ('opco', 'france_travail', 'region', 'of_partenaire', 'autre');

-- La liste tenue par la Société (REQ-DM-028) : un SIREN d'ORGANISME, ce n'est pas une donnée de personne.
CREATE TABLE "sirens_liste_noire" (
    "siren" CHAR(9) NOT NULL,
    "motif" "motif_liste_noire" NOT NULL,
    "ajoute_par_id" UUID NOT NULL,
    "ajoute_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "sirens_liste_noire_pkey" PRIMARY KEY ("siren")
);
ALTER TABLE "sirens_liste_noire" ADD CONSTRAINT "sirens_liste_noire_siren_forme" CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "sirens_liste_noire" ADD CONSTRAINT "sirens_liste_noire_ajoute_par_id_fkey" FOREIGN KEY ("ajoute_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La projection (REQ-DM-029) : une ligne par SIREN et par origine, alimentée par les seuls webhooks
-- d'axionia (client, devis) et par la liste ci-dessus (financeur).
CREATE TABLE "entreprises_connues" (
    "siren" CHAR(9) NOT NULL,
    "origine" "origine_entreprise_connue" NOT NULL,
    "connue_depuis_at" TIMESTAMPTZ(3) NOT NULL,
    "dernier_contact_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "entreprises_connues_pkey" PRIMARY KEY ("siren", "origine")
);
ALTER TABLE "entreprises_connues" ADD CONSTRAINT "entreprises_connues_siren_forme" CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "entreprises_connues" ADD CONSTRAINT "entreprises_connues_ordre" CHECK ("dernier_contact_at" >= "connue_depuis_at");

-- « Entièrement facturé » (art. 3.3, écart B-11) se juge DEVIS PAR DEVIS : la somme HT facturée, avoirs
-- déduits, comparée au montant HT du devis. Une ligne par devis d'axionia, sans aucune donnée de personne.
CREATE TABLE "devis_connus" (
    "devis_ref" TEXT NOT NULL,
    "siren" CHAR(9) NOT NULL,
    "emis_at" TIMESTAMPTZ(3) NOT NULL,
    "signe_at" TIMESTAMPTZ(3),
    "montant_total_ht_cents" INTEGER NOT NULL,
    "facture_ht_cents" INTEGER NOT NULL DEFAULT 0,
    "maj_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "devis_connus_pkey" PRIMARY KEY ("devis_ref")
);
ALTER TABLE "devis_connus" ADD CONSTRAINT "devis_connus_siren_forme" CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "devis_connus" ADD CONSTRAINT "devis_connus_ref_non_vide" CHECK ("devis_ref" ~ '\S');
ALTER TABLE "devis_connus" ADD CONSTRAINT "devis_connus_montant_positif" CHECK ("montant_total_ht_cents" >= 0);
ALTER TABLE "devis_connus" ADD CONSTRAINT "devis_connus_signature_apres_emission" CHECK ("signe_at" IS NULL OR "signe_at" >= "emis_at");
CREATE INDEX "devis_connus_siren_idx" ON "devis_connus"("siren");
