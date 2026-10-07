-- EXT-T07 — le constat qu'aucune condition de l'art. 3.4 al. 3 n'est remplie (amendement d'A02, #809
-- 6039970008). ADDITIVE, non employée ici (partners/ADR-0022 §13).
-- Retour arrière (commentaire) : aucun ; la valeur d'enum ne se retire pas, elle reste inerte.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'attribution_prolongation_refusee';
