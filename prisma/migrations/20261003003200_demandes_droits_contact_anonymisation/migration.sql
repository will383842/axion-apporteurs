-- ADR: partners/ADR-0031
-- DM-60 (REQ-JUR-065) : la trace d'une demande de droit du contact s'anonymise CINQ ANS après sa
-- clôture (décision de Williams du 2026-10-03, `DROITS_CONTACT_TRACE_ANS` dans `retention.ts`). Une
-- tâche de fond vide `attribution_id` et pose `trace_anonymisee_at`, en une instruction ; la ligne
-- reste (droit, donnée visée, issue, dates), sans lien à une personne. Patron de DM-53
-- (partners/ADR-0030).

-- AlterTable : le lien devient nullable, et la date de l'anonymisation le rejoint. La clé étrangère
-- vers `attributions` reste en RESTRICT (une valeur NULL n'est pas vérifiée) ; l'index btree simple
-- `demandes_droits_contact_attribution_id_idx` admet les NULL, et l'index partiel
-- `demandes_droits_contact_a_traiter_idx` n'est pas touché.
ALTER TABLE "demandes_droits_contact" ALTER COLUMN "attribution_id" DROP NOT NULL,
ADD COLUMN     "trace_anonymisee_at" TIMESTAMPTZ(3);

-- SQL brut : Prisma ne modélise ni CHECK ni déclencheur (partners/ADR-0015).

-- La date est LIÉE au lien vidé : elle date l'anonymisation, sert d'idempotence et distingue une
-- anonymisation d'un NULL anormal. Les lignes existantes ont toutes leur lien et aucune date : la
-- validation passe de soi.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_trace_anonymisee_liee"
  CHECK (("attribution_id" IS NULL) = ("trace_anonymisee_at" IS NOT NULL));
-- Une trace anonymisée ne porte plus aucune valeur de rectification.
ALTER TABLE "demandes_droits_contact" ADD CONSTRAINT "demandes_droits_contact_anonymisee_sans_valeur"
  CHECK ("trace_anonymisee_at" IS NULL OR "valeur_chiffree" IS NULL);

-- Le gabarit d'ajout seul reçoit ses deux exceptions de plus : le lien se purge vers NULL, sa date
-- s'écrit UNE fois. Les arguments de DM-59 restent, dans leur ordre ; toute autre modification reste
-- refusée, DELETE et TRUNCATE aussi. `CREATE OR REPLACE TRIGGER` : le remplacement est atomique, il
-- n'y a aucun instant où la table serait sans garde. Les deux déclencheurs gardent leurs événements.
CREATE OR REPLACE TRIGGER demandes_droits_contact_ajout_seul BEFORE UPDATE OR DELETE ON "demandes_droits_contact"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('une_fois:traitee_at', 'une_fois:issue', 'purge:valeur_chiffree', 'une_fois:valeur_purgee_at', 'une_fois:prolongee_at', 'purge:attribution_id', 'une_fois:trace_anonymisee_at');
CREATE OR REPLACE TRIGGER demandes_droits_contact_troncature BEFORE TRUNCATE ON "demandes_droits_contact"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf('une_fois:traitee_at', 'une_fois:issue', 'purge:valeur_chiffree', 'une_fois:valeur_purgee_at', 'une_fois:prolongee_at', 'purge:attribution_id', 'une_fois:trace_anonymisee_at');

-- Retour arrière : recréer les deux déclencheurs avec les cinq arguments de DM-59, retirer les deux
-- contraintes et la colonne, puis `SET NOT NULL` sur `attribution_id`. Il ÉCHOUE dès qu'une trace a
-- été anonymisée : aucun lien ne se réinvente.
