-- DM-45 (REQ-DM-024) — le journal chaîné a son premier écrivain, et le rôle d'exécution n'en est
-- plus propriétaire. Migration ADDITIVE ; forme arrêtée par A02 sur la note de conception de DM-45.

-- (1) Le type `apporteur_statut_modifie` (un type par GENRE de transition, ADR-0022 §4 : la naissance
-- y est `de` nul). Valeur AJOUTÉE, jamais utilisée dans cette migration : une valeur
-- d'enum ajoutée n'est utilisable qu'après la validation de sa transaction.
ALTER TYPE "type_evenement_journal" ADD VALUE IF NOT EXISTS 'apporteur_statut_modifie';

-- (3) Deux rôles NOLOGIN, créés de façon IDEMPOTENTE : un rôle est GLOBAL à la grappe, et la base
-- fantôme comme les bases de test le trouvent peut-être déjà.
--   partners_journal   : le PROPRIÉTAIRE des tables du journal ; personne ne s'y connecte.
--   partners_execution : ce que le rôle d'exécution reçoit (QA-T62 le provisionne, LOGIN, membre de
--                        partners_execution et JAMAIS de partners_journal).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partners_journal') THEN
    CREATE ROLE partners_journal NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partners_execution') THEN
    CREATE ROLE partners_execution NOLOGIN;
  END IF;
END
$$;

-- Le propriétaire seul peut désactiver un déclencheur : le rôle d'exécution ne l'est plus.
ALTER TABLE "evenements" OWNER TO partners_journal;
ALTER SEQUENCE "evenements_id_seq" OWNER TO partners_journal;

-- Lire et AJOUTER, rien d'autre : aucun UPDATE, DELETE ni TRUNCATE. Ni PUBLIC, ni current_user (un
-- leurre sous superutilisateur).
GRANT SELECT, INSERT ON "evenements" TO partners_execution;
GRANT USAGE ON SEQUENCE "evenements_id_seq" TO partners_execution;

-- RETOUR ARRIÈRE (manuel, jamais exécuté ici ; les rôles ne sont PAS supprimés, ils sont globaux) :
--   REVOKE SELECT, INSERT ON "evenements" FROM partners_execution;
--   REVOKE USAGE ON SEQUENCE "evenements_id_seq" FROM partners_execution;
--   ALTER TABLE "evenements" OWNER TO <propriétaire d'origine>;
--   ALTER SEQUENCE "evenements_id_seq" OWNER TO <propriétaire d'origine>;
-- La valeur d'enum `apporteur_statut_modifie` reste : Postgres ne retire pas une valeur d'enum.
