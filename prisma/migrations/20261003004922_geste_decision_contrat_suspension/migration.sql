-- SEC-15 — le geste de la suspension (art. 3.7 al. 3), une décision de contrat. ADDITIVE, non employée ici
-- (partners/ADR-0022 §13) ; 004925 l'emploie dans ses CHECK.
-- Retour arrière (commentaire) : aucun ; la valeur d'enum ne se retire pas, elle reste inerte.
ALTER TYPE "geste_decision_contrat" ADD VALUE IF NOT EXISTS 'suspension';
