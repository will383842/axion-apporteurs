-- EXT-T07 — le fait de la prolongation (art. 3.4 al. 3). ADDITIVE, non employée ici (partners/ADR-0022 §13).
-- Retour arrière (commentaire) : aucun ; la valeur d'enum ne se retire pas, elle reste inerte.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'attribution_prolongee';
