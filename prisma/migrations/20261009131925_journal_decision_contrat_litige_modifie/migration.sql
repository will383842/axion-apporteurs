-- JUR-T64 — l'ouverture et la clôture d'un litige sur une décision de contrat. ADDITIVE, non employée ici.
-- Retour arrière (commentaire) : aucun ; la valeur d'enum ne se retire pas, elle reste inerte.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'decision_contrat_litige_modifie';
