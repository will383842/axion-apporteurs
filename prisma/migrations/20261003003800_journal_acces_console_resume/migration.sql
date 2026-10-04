-- SEC-59 (REQ-SEC-058) : le résumé quotidien du journal des accès à la console entre au journal
-- chaîné, sous un type à lui, sans agrégat. Condition (2) de la sécurité sur SEC-58, forme commune
-- d'A02 et de la sécurité : le nombre de lignes et deux empreintes, aucune donnée de personne. La
-- charge fermée vit dans `src/domain/evenement/charges.ts` ; rien ici ne l'emploie.
--
-- Retour arrière : une valeur ajoutée à un enum ne se retire pas (PostgreSQL), elle reste inemployée.

-- AlterEnum
ALTER TYPE "type_evenement_journal" ADD VALUE 'journal_acces_console_resume';
