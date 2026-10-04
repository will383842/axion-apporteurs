-- SEC-60 : lire le journal des accès est lui-même un accès journalisé. Additive : une valeur d'enum.
-- La valeur n'est PAS employée dans cette migration (une valeur ajoutée ne s'emploie pas dans la transaction
-- qui l'ajoute ; partners/ADR-0022 §13).
-- Retour arrière (commentaire) : AUCUN retrait automatique. Postgres ne retire pas une valeur d'enum, et les
-- lignes du journal qui la portent sont en AJOUT SEUL (gabarit commun) : la valeur reste, inerte, si le code
-- cesse de l'écrire. Un retrait réel exigerait de recréer le type, donc de réécrire des lignes protégées :
-- c'est un acte sous ADR, jamais un retour arrière ordinaire.
ALTER TYPE "nature_acces_console" ADD VALUE IF NOT EXISTS 'lecture_journal_acces';
