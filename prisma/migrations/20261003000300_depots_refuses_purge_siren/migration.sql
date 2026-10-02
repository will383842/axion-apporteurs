-- ADR: partners/ADR-0031
-- DM-53 (REQ-DM-043, HYP-A02-RETENTION) : le SIREN d'un dépôt refusé s'efface douze mois après le
-- refus ; la ligne reste comme trace du refus (apporteur, motif, canal, date), sans lui. Jamais une
-- empreinte à sa place : un SIREN se retrouve par force brute sur ses 10⁹ valeurs.

-- AlterTable : le SIREN devient nullable (`depots_refuses_siren_forme` reste vrai sur NULL), et la
-- date de la purge le rejoint.
ALTER TABLE "depots_refuses" ALTER COLUMN "siren" DROP NOT NULL,
ADD COLUMN     "siren_purge_at" TIMESTAMPTZ(3);

-- SQL brut : Prisma ne modélise ni CHECK ni déclencheur (partners/ADR-0015).

-- La date de purge est LIÉE au SIREN (précision d'A02) : elle date la purge, sert d'idempotence et
-- distingue une purge d'un NULL anormal. Les lignes existantes ont toutes leur SIREN : la validation
-- passe de soi.
ALTER TABLE "depots_refuses" ADD CONSTRAINT "depots_refuses_siren_purge_liee"
  CHECK (("siren" IS NULL) = ("siren_purge_at" IS NOT NULL));

-- Le gabarit d'ajout seul reçoit ses deux exceptions : le SIREN se purge vers NULL, sa date s'écrit
-- UNE fois. Toute autre modification reste refusée ; le déclencheur de troncature est inchangé.
-- `CREATE OR REPLACE TRIGGER` (condition de la lentille sécurité) : le remplacement est atomique,
-- il n'y a aucun instant où la table serait sans garde.
CREATE OR REPLACE TRIGGER depots_refuses_ajout_seul BEFORE UPDATE OR DELETE ON "depots_refuses"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:siren', 'une_fois:siren_purge_at');

-- Retour arrière : recréer le déclencheur sans argument, retirer la contrainte et la colonne, puis
-- `SET NOT NULL` sur le SIREN. Il ÉCHOUE dès qu'un SIREN a été purgé : aucune valeur ne s'invente.
