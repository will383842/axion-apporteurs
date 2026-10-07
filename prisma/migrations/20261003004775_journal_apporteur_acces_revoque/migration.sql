-- SEC-71 (contrat v2, art. 3.8) — la révocation de l'accès d'un apporteur, forme d'A02 (#779, 6034508311).
-- Préfixe réservé : 20261003004775. ADDITIVE : une valeur du type de journal, aucune colonne.
--
-- Un fait daté par geste de la console, à l'instant du GESTE : sa charge est fermée `{ motif, acteur }`,
-- le motif parmi `signalement_apporteur` et `securite`, l'acteur un utilisateur de la console. Ni
-- adresse, ni appareil, ni session, ni jeton.
--
-- Retour arrière (commentaire) : aucun. La valeur d'enum ne se retire pas (Postgres) ; elle reste
-- inerte, sans emploi.

-- La valeur n'est pas employée dans cette migration (partners/ADR-0022 §13).
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'apporteur_acces_revoque';
