-- DM-40 (REQ-DM-060) : le vocabulaire de la demande de confirmation par e-mail, dans sa propre
-- migration. Une valeur ajoutée à un enum (`ADD VALUE`) n'est utilisable qu'après la validation de
-- sa transaction : les tables et le journal qui s'en servent viennent dans la migration suivante
-- (patron de DM-07 et de DM-11). Les deux ADD VALUE sont en fin, et rien ici ne les emploie.
--
-- Retour arrière : DROP TYPE "etat_demande_confirmation" (après la migration suivante) ; une valeur
-- ajoutée à un enum ne se retire pas (PostgreSQL), elle reste inemployée.

-- CreateEnum
CREATE TYPE "etat_demande_confirmation" AS ENUM ('planifiee', 'annulee', 'envoyee', 'retenue', 'rebond', 'repondue_oui', 'repondue_non', 'clic_non_retenu', 'opposee', 'expiree');

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'demande_confirmation_etat_modifie';

-- AlterEnum
ALTER TYPE "agregat_journal" ADD VALUE 'demande_confirmation';
