-- DM-44 (REQ-SEC-023, HYP-A02-RETENTION ; écart B-04 de la vérification V2) : l'adresse d'un
-- utilisateur de la console DÉSACTIVÉ peut être effacée. Relâcher les deux colonnes est un
-- ASSOUPLISSEMENT, non destructif au sens de REQ-DM-037 : la migration ne touche aucune donnée. Le
-- CHECK est ce qui empêche le relâchement d'ouvrir un utilisateur ACTIF sans destinataire.

-- AlterTable
ALTER TABLE "utilisateurs_console" ALTER COLUMN "email_chiffre" DROP NOT NULL,
ALTER COLUMN "email_hash" DROP NOT NULL;

-- SQL brut : Prisma ne modélise pas de CHECK (partners/ADR-0015).

-- Deux clauses, chacune témoignée (`tests/integration/utilisateur-console-desactive.spec.ts`) :
--   1. le bloc chiffré et l'empreinte vont ENSEMBLE ;
--   2. ils ne manquent que sur un utilisateur désactivé.
-- La validation sur les lignes existantes passe de soi : toutes portent leur adresse à cette date.
-- L'index unique `utilisateurs_console_email_hash_key` est CONSERVÉ : il admet plusieurs NULL, et
-- c'est voulu — deux adresses effacées ne se gênent pas.
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_adresse_si_actif"
  CHECK (
    ("email_chiffre" IS NULL) = ("email_hash" IS NULL)
    AND ("email_chiffre" IS NOT NULL OR "desactive_at" IS NOT NULL)
  );

-- Retour arrière : DROP CONSTRAINT "utilisateurs_console_adresse_si_actif", puis SET NOT NULL sur les
-- deux colonnes. Il ÉCHOUE dès qu'une adresse a été effacée : il faudrait d'abord décider quoi écrire
-- à sa place, et aucune valeur inventée n'est admise.
