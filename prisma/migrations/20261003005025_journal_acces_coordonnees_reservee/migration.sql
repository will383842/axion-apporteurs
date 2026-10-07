-- SEC-52 : un accès de la console aux coordonnées du contact d'une entreprise réservée s'écrit au journal chaîné,
-- par identifiants seuls (forme d'A02 sur #786). Additive : une seule valeur d'enum, sur l'agrégat `attribution`
-- qui existe déjà. Elle n'est PAS employée dans cette migration.
-- Préfixe réservé par A02 : 20261003005025 (004930 avant le renommage : après DM-71, #815, et SEC-15).
-- Retour arrière (commentaire) : aucun. La valeur ajoutée à `type_evenement_journal` ne se retire pas (Postgres,
-- et des lignes du journal chaîné la porteront) : elle reste inerte.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'acces_coordonnees_reservee';
