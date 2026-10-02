-- DM-44 (REQ-SEC-023, HYP-A02-RETENTION ; écart B-04 de la vérification V2) : l'adresse d'un
-- utilisateur de la console DÉSACTIVÉ peut être effacée. Relâcher les deux colonnes est additif ; le
-- CHECK est ce qui empêche le relâchement d'ouvrir un utilisateur ACTIF sans destinataire.

-- AlterTable
ALTER TABLE "utilisateurs_console" ALTER COLUMN "email_chiffre" DROP NOT NULL,
ALTER COLUMN "email_hash" DROP NOT NULL;

-- SQL brut : Prisma ne modélise pas de CHECK (partners/ADR-0015).

-- Le bloc chiffré et l'empreinte vont ENSEMBLE ; ils ne manquent que sur un utilisateur désactivé.
-- L'unicité de `email_hash` (index `utilisateurs_console_email_hash_key`) ne porte que sur les
-- valeurs non nulles : deux adresses effacées ne se gênent pas.
ALTER TABLE "utilisateurs_console" ADD CONSTRAINT "utilisateurs_console_adresse_si_actif"
  CHECK (
    ("email_chiffre" IS NULL) = ("email_hash" IS NULL)
    AND ("email_chiffre" IS NOT NULL OR "desactive_at" IS NOT NULL)
  );
