-- SEC-15 — la valeur du journal du gel (REQ-SEC-019, REQ-SEC-038). ADDITIVE, non employée ici (partners/ADR-0022 §13).
-- Retour arrière (commentaire) : aucun ; la valeur d'enum ne se retire pas, elle reste inerte.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'apporteur_gel_modifie';
