-- DM-08 (REQ-DM-006, REQ-QA-004, partners/ADR-0022 §4) : les trois types de journal de la machine à
-- états d'attribution, AJOUTÉS EN FIN et jamais employés dans cette migration. Un type par GENRE de
-- transition : ajouter une flèche à la matrice modifie une charge Zod (`charges.ts`), jamais ce type.
ALTER TYPE "type_evenement_journal" ADD VALUE 'attribution_etat_modifie';
ALTER TYPE "type_evenement_journal" ADD VALUE 'attribution_peremption_suspendue';
ALTER TYPE "type_evenement_journal" ADD VALUE 'attribution_porteur_reaffecte';

-- Écart B-10 de l'audit du plan de la Phase 1 : l'histoire d'un agrégat se lit par cet index.
-- CreateIndex
CREATE INDEX "evenements_agregat_agregat_id_idx" ON "evenements"("agregat", "agregat_id");

-- Retour arrière : DROP INDEX ; un ADD VALUE ne se retire pas (PostgreSQL), il reste inemployé.
