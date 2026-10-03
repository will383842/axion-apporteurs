-- AlterEnum
-- Le type entré au contrat d'événements en schema_version 3 (INT-T46-P, REQ-INT-004 ; décision D2
-- de Williams du 2026-10-01, option A). AJOUT SEULEMENT : aucune valeur retirée ni renommée, aucune
-- ligne réécrite. La valeur est placée en dernier, dans l'ordre de TYPES_EVENEMENT
-- (packages/contracts/events.ts), sous le nom de fil dont le point devient un souligné, sans @map
-- (partners/ADR-0022, point 10).
ALTER TYPE "type_evenement_recu" ADD VALUE 'devis_emis';
