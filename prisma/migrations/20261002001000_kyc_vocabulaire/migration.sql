-- DM-11 (REQ-DM-027) : le vocabulaire du KYC, dans sa propre migration. Une valeur
-- ajoutée à un enum (`ADD VALUE`) n'est utilisable qu'après la validation de sa transaction : la
-- table et le journal qui s'en servent viennent dans la migration suivante (patron de DM-07).

-- CreateEnum
CREATE TYPE "type_piece_kyc" AS ENUM ('siret', 'tva', 'rib', 'identite', 'vigilance', 'rc_pro');

-- CreateEnum
CREATE TYPE "statut_piece_kyc" AS ENUM ('manquante', 'a_verifier', 'valide', 'perimee', 'refusee');

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'piece_kyc_statut_modifie';
