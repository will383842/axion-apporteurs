-- ADR: partners/ADR-0029
-- INT-T56 (REQ-DM-036, REQ-JUR-029) — la charge d'une candidature reçue minimisée UNE fois.
--
-- `evenements_recus.charge` est conservée dix ans et ne doit porter aucune donnée personnelle une fois
-- la candidature écrite. Le déclencheur d'immutabilité admet désormais EXACTEMENT deux réécritures de
-- `charge`, et aucune autre (note de conception validée par A02 le 2026-10-02) :
--   (i)  le traitant : passage à `traite`, HORS du marqueur du fond ;
--   (ii) le fond : statut INCHANGÉ et différent de `traite`, SOUS le marqueur
--        `partners.minimisation_de_fond` (`set_config(…, true)`, local à la transaction).
-- Dans les deux cas : `OLD.charge ? 'reponsesJson'` et `NEW.charge = OLD.charge - 'reponsesJson'`
-- EXACTEMENT. `payload_hash` et les dix autres colonnes restent refusés tels quels ; DELETE et
-- TRUNCATE aussi. Les deux déclencheurs ne sont pas recréés : seule la fonction change.

-- 1. LA GARDE, AVANT tout changement : une candidature déjà `traite` qui porterait encore
--    `reponsesJson` ne serait atteinte ni par (i) ni par (ii), et garderait ses réponses dix ans. On
--    REFUSE la migration plutôt que de la minimiser en silence. Aucune n'existe tant que
--    `PARTNERS_SYNC_ENABLED` est éteint (runbook de mise en service).
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM "evenements_recus"
    WHERE "event_type" = 'candidature_recue' AND "statut" = 'traite' AND "charge" ? 'reponsesJson';
  IF n > 0 THEN
    RAISE EXCEPTION 'INT-T56 : % candidature(s) déjà traitée(s) portent encore reponsesJson ; migration refusée (runbook de mise en service, INT-T56)', n;
  END IF;
END
$$;

-- 2. La fonction, corps ENTIER : seule la clause `charge` change.
CREATE OR REPLACE FUNCTION evenements_recus_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'evenements_recus_reception_immuable : % refusé, la réception est conservée (REQ-DM-036)', TG_OP;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
     OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
     OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."sujet_ref" IS DISTINCT FROM OLD."sujet_ref"
     OR NEW."cle_metier" IS DISTINCT FROM OLD."cle_metier"
     OR (NEW."charge" IS DISTINCT FROM OLD."charge" AND NOT (
           OLD."event_type" = 'candidature_recue'
           AND OLD."charge" ? 'reponsesJson'
           AND NEW."charge" = OLD."charge" - 'reponsesJson'
           AND (
             -- (i) le traitant : passage à traite, HORS du fond
             (OLD."statut" <> 'traite' AND NEW."statut" = 'traite'
               AND current_setting('partners.minimisation_de_fond', true) IS DISTINCT FROM 'oui')
             -- (ii) le fond : statut inchangé et différent de traite, SOUS le marqueur
             OR (NEW."statut" = OLD."statut" AND OLD."statut" <> 'traite'
               AND current_setting('partners.minimisation_de_fond', true) = 'oui')
           )
         ))
     OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
     OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
     OR NEW."survenu_at" IS DISTINCT FROM OLD."survenu_at" THEN
    RAISE EXCEPTION 'evenements_recus_reception_immuable : seuls statut, processed_at, error, retry_count et dependance_ref s''écrivent, et la charge d''une candidature une seule fois sans reponsesJson (REQ-DM-036, INT-T56)';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. L'INVARIANT TENU PAR LA BASE (C4 d'A02) : le déclencheur ADMET la réécriture, il ne l'IMPOSE pas.
--    Une candidature traitée ne peut pas porter `reponsesJson` : un passage à `traite` qui oublierait
--    la charge est refusé. Contrainte VALIDÉE à l'ajout (sans NOT VALID) : elle refuse d'elle-même
--    toute ligne héritée fautive ; aucune n'est réécrite.
ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_candidature_traitee_minimisee"
  CHECK (NOT ("event_type" = 'candidature_recue' AND "statut" = 'traite' AND "charge" ? 'reponsesJson'));

-- 4. RETOUR ARRIÈRE (C3 et C4 d'A02) : une migration suivante retire la contrainte, puis repose
--    l'ANCIEN corps ci-dessous, à l'identique (20260927000000_evenements_recus_et_battements), par
--    copier-coller :
--
-- ALTER TABLE "evenements_recus" DROP CONSTRAINT "evenements_recus_candidature_traitee_minimisee";
--
-- CREATE OR REPLACE FUNCTION evenements_recus_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
-- BEGIN
--   IF TG_OP <> 'UPDATE' THEN
--     RAISE EXCEPTION 'evenements_recus_reception_immuable : % refusé, la réception est conservée (REQ-DM-036)', TG_OP;
--   END IF;
--   IF NEW."id" IS DISTINCT FROM OLD."id"
--      OR NEW."source" IS DISTINCT FROM OLD."source"
--      OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
--      OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
--      OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
--      OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
--      OR NEW."sujet_ref" IS DISTINCT FROM OLD."sujet_ref"
--      OR NEW."cle_metier" IS DISTINCT FROM OLD."cle_metier"
--      OR NEW."charge" IS DISTINCT FROM OLD."charge"
--      OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
--      OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
--      OR NEW."survenu_at" IS DISTINCT FROM OLD."survenu_at" THEN
--     RAISE EXCEPTION 'evenements_recus_reception_immuable : seuls statut, processed_at, error, retry_count et dependance_ref s''écrivent (REQ-DM-036)';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
