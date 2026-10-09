-- AlterEnum
-- Le type entré au contrat d'événements en schema_version 4 (INT-T76-P, REQ-INT-004 ; forme d'A02,
-- #656 et #737). AJOUT SEULEMENT : aucune valeur retirée ni renommée, aucune ligne réécrite, et la
-- valeur n'est pas employée dans cette migration. Elle est placée en dernier, dans l'ordre de
-- TYPES_EVENEMENT (packages/contracts/events.ts), sous le nom de fil dont le point devient un
-- souligné, sans @map (partners/ADR-0022, point 10). Aucun modèle neuf : la charge est conservée telle
-- que reçue dans evenements_recus.
--
-- Retour arrière : Postgres ne retire pas une valeur d'enum. La valeur reste INERTE : sans contrat v4
-- publié côté axion-ia, aucune ligne ne la porte.
ALTER TYPE "type_evenement_recu" ADD VALUE 'financement_etape';

-- CreateIndex
-- La première réception de la version courante (départ de la fenêtre de bascule de la v3 à la v4)
-- se lit par cet index, jamais par un parcours de la table (recommandation d'A02, #743). Retour
-- arrière : DROP INDEX "evenements_recus_source_schema_version_received_at_idx".
CREATE INDEX "evenements_recus_source_schema_version_received_at_idx" ON "evenements_recus"("source", "schema_version", "received_at");
