-- SEC-19 (REQ-JUR-006, art. 11.2) — la mise en demeure datée, forme d'A02 (#703, 5980982895 §2).
-- Préfixe réservé : 20261003004200. ADDITIVE : une valeur du type de journal, aucune colonne.
--
-- Un fait daté PAR ARTICLE, en ajout seul : la résiliation `manquement_grave` lit celui de l'article
-- en cause. Sa charge est fermée `{ article, acteur }` : NI les faits NI aucun texte libre, qui ne
-- vivent que dans le courriel `mise_en_demeure`. Ce n'est pas un antécédent : rien ne compte ces
-- événements (art. 11.2).
--
-- Retour arrière (commentaire) : aucun. La valeur d'enum ne se retire pas (Postgres) ; elle reste
-- inerte, sans emploi.

-- La valeur n'est pas employée dans cette migration (partners/ADR-0022 §13).
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'apporteur_mis_en_demeure';
