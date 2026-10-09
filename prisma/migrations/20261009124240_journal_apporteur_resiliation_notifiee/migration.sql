-- SEC-66 (REQ-JUR-015, art. 11.1) — la résiliation par la Société, notifiée ; forme (b) d'A02 (#703,
-- 5983008261). Préfixe : 20261009124240, l'horodatage UTC d'écriture (règle du grand ménage, GOV-160). ADDITIVE : une valeur du
-- type de journal, aucune colonne, aucun changement de `decisions_de_contrat` ni de sa garde.
--
-- Le fait daté de la DÉCISION de résilier (`ordinaire_axion`), sur l'agrégat `apporteur`, à la charge
-- fermée `{ motif, dateEffet, acteur }`. Ce n'est PAS un changement de statut : l'apporteur reste
-- `signe` pendant le préavis, et le passage à `resilie` est écrit à la date d'effet, par la tâche
-- planifiée, en citant ce fait (`decisionContratId`, A02, 5988205180).
--
-- Retour arrière (commentaire) : aucun. La valeur d'enum ne se retire pas (Postgres) ; elle reste
-- inerte, sans emploi.

-- La valeur n'est pas employée dans cette migration (partners/ADR-0022 §13).
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'apporteur_resiliation_notifiee';
