-- SEC-49 (REQ-UX-027, REQ-DM-027) : l'IBAN d'une pièce du KYC est figé par la base. Additive : une
-- fonction neuve et deux déclencheurs neufs, aucune colonne ni contrainte touchée.
--
-- Sans ce verrou, un UPDATE de `iban_chiffre` et `iban_hash` sur le RIB courant et validé changerait
-- le compte de versement sans nouvelle pièce `a_verifier`, sans vérification hors bande et sans deux
-- personnes. Un changement de RIB est TOUJOURS une nouvelle pièce ; l'ancienne reçoit `remplacee_at`.
--
-- Une fonction DÉDIÉE plutôt que le gabarit `refuser_modification_sauf()`, qui figerait aussi le
-- statut et les dates (forme d'A02) ; sans EXECUTE. Sont FIGÉS : `id`, `apporteur_id`, `type`,
-- `iban_chiffre`, `iban_hash`, `fichier_ref`, avec une seule exception, la purge de la pièce
-- (REQ-JUR-029) : `fichier_ref` passe à NULL, sans retour, dans la mise à jour qui pose
-- `fichier_purge_at`. Sont en ÉCRITURE UNIQUE : `remplacee_at` et `fichier_purge_at` (de NULL à une
-- valeur, une fois) : un ancien RIB ne peut pas être remis en service. Restent LIBRES : `statut`,
-- `verifiee_at`, `expire_at`. Aucune purge d'IBAN en phase 1 : elle viendra avec sa colonne, et
-- assouplira cette fonction pour elle seule, avec un ADR.
CREATE FUNCTION pieces_kyc_refuser_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION '% : % refusé, une pièce du KYC ne disparaît pas (REQ-DM-027)', TG_NAME, TG_OP;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.apporteur_id IS DISTINCT FROM OLD.apporteur_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.iban_chiffre IS DISTINCT FROM OLD.iban_chiffre
     OR NEW.iban_hash IS DISTINCT FROM OLD.iban_hash THEN
    RAISE EXCEPTION '% : l''identité et l''IBAN d''une pièce sont figés ; un changement de RIB est une nouvelle pièce (REQ-UX-027)', TG_NAME;
  END IF;
  IF NEW.fichier_ref IS DISTINCT FROM OLD.fichier_ref
     AND NOT (NEW.fichier_ref IS NULL
              AND OLD.fichier_purge_at IS NULL
              AND NEW.fichier_purge_at IS NOT NULL) THEN
    RAISE EXCEPTION '% : le fichier d''une pièce ne change pas ; il ne s''efface qu''avec sa date de purge (REQ-JUR-029)', TG_NAME;
  END IF;
  IF OLD.remplacee_at IS NOT NULL AND NEW.remplacee_at IS DISTINCT FROM OLD.remplacee_at THEN
    RAISE EXCEPTION '% : remplacee_at s''écrit une fois ; un ancien RIB ne revient pas en service (REQ-UX-027)', TG_NAME;
  END IF;
  IF OLD.fichier_purge_at IS NOT NULL AND NEW.fichier_purge_at IS DISTINCT FROM OLD.fichier_purge_at THEN
    RAISE EXCEPTION '% : fichier_purge_at s''écrit une fois (REQ-JUR-029)', TG_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pieces_kyc_coordonnees_figees BEFORE UPDATE OR DELETE ON "pieces_kyc"
  FOR EACH ROW EXECUTE FUNCTION pieces_kyc_refuser_substitution();
-- Un déclencheur de ligne ne voit pas TRUNCATE : sans celui d'instruction, `TRUNCATE` passe.
CREATE TRIGGER pieces_kyc_troncature BEFORE TRUNCATE ON "pieces_kyc"
  FOR EACH STATEMENT EXECUTE FUNCTION pieces_kyc_refuser_substitution();
