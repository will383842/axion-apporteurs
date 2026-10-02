-- Le vocabulaire du dépôt — DM-07, M1 (partners/ADR-0022, points 1, 5 et 13).
-- Partie générée : `prisma migrate diff` du schéma de main vers celui de cette PR, enums seulement.
-- Aucune valeur créée ici n'est employée dans ce fichier : les tables qui les portent naissent en M2.

-- CreateEnum
CREATE TYPE "canal_depot" AS ENUM ('espace', 'lien_prive', 'console');

-- CreateEnum
CREATE TYPE "etat_administratif" AS ENUM ('actif', 'cesse');

-- CreateEnum
CREATE TYPE "categorie_entreprise" AS ENUM ('pme', 'eti', 'ge');

-- CreateEnum
CREATE TYPE "motif_refus_depot" AS ENUM ('anteriorite_client', 'anteriorite_devis', 'etablissement_cesse', 'entreprise_hors_perimetre', 'file_complete', 'opposition_demarchage', 'insincerite');

-- CreateEnum
CREATE TYPE "qualite_personne_declaree" AS ENUM ('associe', 'prepose', 'sous_traitant');

-- AlterEnum
-- La purge du contact d'une attribution (REQ-DM-031), au journal. AJOUT SEULEMENT, en fin d'enum.
ALTER TYPE "type_evenement_journal" ADD VALUE 'attribution_contact_purge';
