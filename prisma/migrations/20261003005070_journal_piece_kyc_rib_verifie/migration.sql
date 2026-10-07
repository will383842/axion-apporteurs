-- SEC-69 (REQ-UX-027) — le premier regard d'un RIB a son événement chaîné propre (la sécurité, #747, 5986810177 §2).
-- Préfixe PROVISOIRE : 20261003005070 (le prochain libre annoncé sur #831), à confirmer par A02. ADDITIVE : une valeur du type de journal, aucune colonne.
--
-- Un fait daté, en ajout seul, sur l'agrégat `piece_kyc` : la vérification hors bande d'un RIB, par un
-- utilisateur de la console. Sa charge est fermée `{ type, acteur }` : ni IBAN, ni empreinte, ni fichier.
-- Ce n'est pas un changement de statut : la pièce reste `a_verifier` jusqu'à la confirmation, qui écrit
-- `piece_kyc_statut_modifie`.
--
-- Retour arrière (commentaire) : aucun. La valeur d'enum ne se retire pas (Postgres) ; elle reste
-- inerte, sans emploi.

-- La valeur n'est pas employée dans cette migration (partners/ADR-0022 §13).
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'piece_kyc_rib_verifie';
