-- SEC-59 : le résumé quotidien du journal des accès à la console, au journal chaîné. Additive : une valeur d'enum,
-- NON employée dans cette migration (partners/ADR-0022 §13).
-- Retour arrière (commentaire) : aucun retrait. Postgres ne retire pas une valeur d'enum, et les lignes du journal
-- chaîné qui la portent ne se réécrivent pas : la valeur reste inerte si le code cesse de l'écrire.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'journal_acces_console_resume';
