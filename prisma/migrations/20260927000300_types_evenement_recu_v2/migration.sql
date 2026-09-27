-- AlterEnum
-- Les quatre types entrés au contrat d'événements en schema_version 2 (REQ-INT-004, REQ-INT-032 ;
-- partners/ADR-0008, partners/ADR-0023). AJOUT SEULEMENT : aucune valeur retirée ni renommée, aucune
-- ligne réécrite. Chaque valeur est placée en dernier, dans l'ordre de TYPES_EVENEMENT
-- (packages/contracts/events.ts), et porte le nom de fil dont le point devient un souligné, sans
-- @map (partners/ADR-0022, point 10). PostgreSQL 16 accepte plusieurs ADD VALUE dans une même
-- transaction ; aucune n'est utilisée par cette migration.
ALTER TYPE "type_evenement_recu" ADD VALUE 'candidature_recue';
ALTER TYPE "type_evenement_recu" ADD VALUE 'financement_mis_a_jour';
ALTER TYPE "type_evenement_recu" ADD VALUE 'facture_annulee';
ALTER TYPE "type_evenement_recu" ADD VALUE 'client_fusionne';
