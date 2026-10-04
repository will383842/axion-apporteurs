-- ADR: partners/ADR-0032
-- DM-68 (REQ-JUR-065) : à l'anonymisation de la trace d'une demande de droit du contact (DM-60,
-- partners/ADR-0031), dans la même instruction, les dates de la trace (réception, traitement,
-- prolongation, effacement de la valeur) sont ramenées au premier jour de LEUR mois, à minuit UTC,
-- et `trace_anonymisee_at` au premier du mois UTC de l'instant d'anonymisation. C'est la BASE qui
-- tronque (forme (ii) d'A02) : aucun appelant ne peut l'oublier. Aucune table, colonne ni contrainte
-- ne change ; seule la fonction des deux déclencheurs de protection est remplacée.

-- SQL brut : Prisma ne modélise ni fonction ni déclencheur (partners/ADR-0015).

-- La fonction DÉDIÉE, sans argument : le gabarit commun `refuser_modification_sauf` n'a pas de mode
-- « tronquer ». Son nom et ses refus gardent le préfixe du gabarit. Les sept règles
-- d'ADR-0031 y sont écrites en dur, à l'identique ; elles sont jugées APRÈS la troncature, sur la
-- ligne telle qu'elle sera écrite. Le seul écart au gabarit : dans l'écriture d'anonymisation
-- (`trace_anonymisee_at` de NULL à une valeur), et dans elle seule, la fonction ÉCRIT dans NEW les
-- cinq dates (décision 6 de partners/ADR-0032 ; précédent : `utilisateurs_console_quatre_yeux`).
CREATE FUNCTION refuser_modification_sauf_droits_contact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  anonymisation boolean;
  au_mois timestamptz;
  regle text;
  nature text;
  colonne text;
  avant jsonb;
  apres jsonb;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'refuser_modification_sauf : % refusé sur %, table en ajout seul', TG_OP, TG_TABLE_NAME;
  END IF;
  anonymisation := OLD."trace_anonymisee_at" IS NULL AND NEW."trace_anonymisee_at" IS NOT NULL;

  IF anonymisation THEN
    -- La cinquième date : le début du mois UTC de l'instant d'anonymisation.
    NEW."trace_anonymisee_at" := date_trunc('month', NEW."trace_anonymisee_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    -- Les quatre dates de la trace : chacune au début de SON PROPRE mois UTC, une date NULL reste
    -- NULL. Une valeur FOURNIE doit être l'ancienne (la base tronque) ou ce début de mois (déjà
    -- tronquée) ; toute autre, y compris le début d'un autre mois, est refusée (condition de la
    -- sécurité, rattrapage 109).
    au_mois := date_trunc('month', OLD."recue_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF NEW."recue_at" IS DISTINCT FROM OLD."recue_at" AND NEW."recue_at" IS DISTINCT FROM au_mois THEN
      RAISE EXCEPTION 'refuser_modification_sauf : « recue_at » ne prend à l''anonymisation que le début de son propre mois UTC sur %', TG_TABLE_NAME;
    END IF;
    NEW."recue_at" := au_mois;

    au_mois := date_trunc('month', OLD."traitee_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF NEW."traitee_at" IS DISTINCT FROM OLD."traitee_at" AND NEW."traitee_at" IS DISTINCT FROM au_mois THEN
      RAISE EXCEPTION 'refuser_modification_sauf : « traitee_at » ne prend à l''anonymisation que le début de son propre mois UTC sur %', TG_TABLE_NAME;
    END IF;
    NEW."traitee_at" := au_mois;

    au_mois := date_trunc('month', OLD."prolongee_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF NEW."prolongee_at" IS DISTINCT FROM OLD."prolongee_at" AND NEW."prolongee_at" IS DISTINCT FROM au_mois THEN
      RAISE EXCEPTION 'refuser_modification_sauf : « prolongee_at » ne prend à l''anonymisation que le début de son propre mois UTC sur %', TG_TABLE_NAME;
    END IF;
    NEW."prolongee_at" := au_mois;

    au_mois := date_trunc('month', OLD."valeur_purgee_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF NEW."valeur_purgee_at" IS DISTINCT FROM OLD."valeur_purgee_at" AND NEW."valeur_purgee_at" IS DISTINCT FROM au_mois THEN
      RAISE EXCEPTION 'refuser_modification_sauf : « valeur_purgee_at » ne prend à l''anonymisation que le début de son propre mois UTC sur %', TG_TABLE_NAME;
    END IF;
    NEW."valeur_purgee_at" := au_mois;
  END IF;

  -- Les sept règles d'ADR-0031, dans leur ordre, comme le gabarit les juge. Dans l'écriture
  -- d'anonymisation, les quatre dates sont déjà jugées ci-dessus : elles sortent de la comparaison.
  avant := to_jsonb(OLD);
  apres := to_jsonb(NEW);
  IF anonymisation THEN
    avant := avant - ARRAY['recue_at', 'traitee_at', 'prolongee_at', 'valeur_purgee_at'];
    apres := apres - ARRAY['recue_at', 'traitee_at', 'prolongee_at', 'valeur_purgee_at'];
  END IF;
  FOREACH regle IN ARRAY ARRAY['une_fois:traitee_at', 'une_fois:issue', 'purge:valeur_chiffree',
    'une_fois:valeur_purgee_at', 'une_fois:prolongee_at', 'purge:attribution_id',
    'une_fois:trace_anonymisee_at'] LOOP
    nature := split_part(regle, ':', 1);
    colonne := split_part(regle, ':', 2);
    IF (avant -> colonne) IS DISTINCT FROM (apres -> colonne) THEN
      IF NOT (
        (nature = 'purge' AND jsonb_typeof(apres -> colonne) = 'null')
        OR (nature = 'une_fois' AND jsonb_typeof(avant -> colonne) = 'null')
      ) THEN
        RAISE EXCEPTION 'refuser_modification_sauf : « % » (%) ne se réécrit pas sur %', colonne, nature, TG_TABLE_NAME;
      END IF;
    END IF;
    avant := avant - colonne;
    apres := apres - colonne;
  END LOOP;
  IF avant IS DISTINCT FROM apres THEN
    RAISE EXCEPTION 'refuser_modification_sauf : UPDATE refusé sur %, table en ajout seul', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

-- Les deux déclencheurs passent sur la fonction dédiée. `CREATE OR REPLACE TRIGGER` : le
-- remplacement est atomique, il n'y a aucun instant où la table serait sans garde. Ils gardent
-- leurs noms et leurs événements.
CREATE OR REPLACE TRIGGER demandes_droits_contact_ajout_seul BEFORE UPDATE OR DELETE ON "demandes_droits_contact"
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf_droits_contact();
CREATE OR REPLACE TRIGGER demandes_droits_contact_troncature BEFORE TRUNCATE ON "demandes_droits_contact"
  FOR EACH STATEMENT EXECUTE FUNCTION refuser_modification_sauf_droits_contact();

-- Retour arrière : recréer les deux déclencheurs sur `refuser_modification_sauf(…)` avec les sept
-- arguments de 20261003003200, dans leur ordre, puis retirer la fonction dédiée. Les dates déjà
-- tronquées ne se restaurent pas : aucune précision ne se réinvente.
