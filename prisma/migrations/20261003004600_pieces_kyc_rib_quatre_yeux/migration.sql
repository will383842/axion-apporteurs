-- CPL-T24 — préfixe RE-RÉSERVÉ 20261003004600 par A02 (#563, 5986766662), qui remplace 20261003003900.
-- Corps recopié de la forme d'A02 (rattrapage 105) ; la fonction et le déclencheur sont ceux de son
-- COMPLÉMENT (rattrapage 106), qui remplacent ceux de la forme.
-- CPL-T24 (REQ-UX-027, REQ-DM-027) : le RIB à quatre yeux. Additive.
-- Retour arrière (commentaire) : DROP TRIGGER pieces_kyc_rib_quatre_yeux_garde ; DROP FUNCTION pieces_kyc_rib_quatre_yeux() ;
-- DROP CONSTRAINT ×7 ; DROP COLUMN ×4.
ALTER TABLE "pieces_kyc"
  ADD COLUMN "rib_verifie_par_id" UUID,
  ADD COLUMN "rib_verifie_at" TIMESTAMPTZ(3),
  ADD COLUMN "rib_confirme_par_id" UUID,
  ADD COLUMN "rib_confirme_at" TIMESTAMPTZ(3);
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_verifie_par_id_fkey"
  FOREIGN KEY ("rib_verifie_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_confirme_par_id_fkey"
  FOREIGN KEY ("rib_confirme_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Les quatre colonnes ne vivent que sur une pièce `rib`.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_quatre_yeux_sur_rib"
  CHECK ("type" = 'rib' OR num_nulls("rib_verifie_par_id", "rib_verifie_at", "rib_confirme_par_id", "rib_confirme_at") = 4);
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_verification_liee"
  CHECK (("rib_verifie_par_id" IS NULL) = ("rib_verifie_at" IS NULL));
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_confirmation_liee"
  CHECK (("rib_confirme_par_id" IS NULL) = ("rib_confirme_at" IS NULL));
-- On confirme après une vérification, par une AUTRE personne, et pas avant elle.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_confirmation_apres_verification"
  CHECK ("rib_confirme_at" IS NULL OR ("rib_verifie_at" IS NOT NULL AND "rib_confirme_at" >= "rib_verifie_at"
         AND "rib_confirme_par_id" <> "rib_verifie_par_id"));
-- Un RIB n'est VALIDE que confirmé. NOT VALID : les lignes existantes ne sont pas rejugées (un RIB déjà valide d'une base
-- de recette garde son statut) ; toute ligne écrite ou mise à jour l'est.
ALTER TABLE "pieces_kyc" ADD CONSTRAINT "pieces_kyc_rib_valide_si_confirme"
  CHECK ("type" <> 'rib' OR "statut" <> 'valide' OR "rib_confirme_at" IS NOT NULL) NOT VALID;

-- La garde des deux regards, à l'INSERT ET à toute mise à jour.
CREATE FUNCTION pieces_kyc_rib_quatre_yeux() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u RECORD;
BEGIN
  -- (1) Une pièce NAÎT sans regard : les quatre colonnes sont nulles à l'INSERT.
  IF TG_OP = 'INSERT' THEN
    IF num_nonnulls(NEW."rib_verifie_par_id", NEW."rib_verifie_at", NEW."rib_confirme_par_id", NEW."rib_confirme_at") > 0 THEN
      RAISE EXCEPTION 'pieces_kyc_rib_quatre_yeux : une pièce naît sans vérification ni confirmation';
    END IF;
    RETURN NEW;
  END IF;
  -- (2) Un regard ne se réécrit pas.
  IF (OLD."rib_verifie_at" IS NOT NULL AND (NEW."rib_verifie_at" IS DISTINCT FROM OLD."rib_verifie_at"
        OR NEW."rib_verifie_par_id" IS DISTINCT FROM OLD."rib_verifie_par_id"))
     OR (OLD."rib_confirme_at" IS NOT NULL AND (NEW."rib_confirme_at" IS DISTINCT FROM OLD."rib_confirme_at"
        OR NEW."rib_confirme_par_id" IS DISTINCT FROM OLD."rib_confirme_par_id")) THEN
    RAISE EXCEPTION 'pieces_kyc_rib_quatre_yeux : une vérification ou une confirmation ne se réécrit pas';
  END IF;
  -- (3) Une pièce rib ne devient `valide` QUE dans l'écriture qui pose sa confirmation, une fois : elle ne revient
  --     jamais à `valide` depuis un autre statut (périmée, refusée…). Un nouveau RIB est une nouvelle pièce.
  IF NEW."type" = 'rib' AND NEW."statut" = 'valide' AND OLD."statut" IS DISTINCT FROM 'valide'
     AND NOT (OLD."rib_confirme_at" IS NULL AND NEW."rib_confirme_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'pieces_kyc_rib_quatre_yeux : un RIB ne devient valide que par sa confirmation, une fois';
  END IF;
  -- (4) Chaque regard est celui d'un administrateur ACTIF et VALIDÉ (SEC-30).
  IF NEW."rib_verifie_par_id" IS NOT NULL AND OLD."rib_verifie_par_id" IS NULL THEN
    SELECT "role", "desactive_at", "valide_at" INTO u FROM "utilisateurs_console" WHERE "id" = NEW."rib_verifie_par_id";
    IF NOT FOUND OR u."role" <> 'admin' OR u."desactive_at" IS NOT NULL OR u."valide_at" IS NULL THEN
      RAISE EXCEPTION 'pieces_kyc_rib_quatre_yeux : la vérification exige un administrateur actif et validé';
    END IF;
  END IF;
  IF NEW."rib_confirme_par_id" IS NOT NULL AND OLD."rib_confirme_par_id" IS NULL THEN
    SELECT "role", "desactive_at", "valide_at" INTO u FROM "utilisateurs_console" WHERE "id" = NEW."rib_confirme_par_id";
    IF NOT FOUND OR u."role" <> 'admin' OR u."desactive_at" IS NOT NULL OR u."valide_at" IS NULL THEN
      RAISE EXCEPTION 'pieces_kyc_rib_quatre_yeux : la confirmation exige un administrateur actif et validé';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Sur TOUTE mise à jour (le statut compris), et à l'INSERT. Il passe après `pieces_kyc_coordonnees_figees` dans l'ordre
-- alphabétique des déclencheurs BEFORE de la table (« coordonnees » < « rib »), ce qui est voulu : l'identité et l'IBAN
-- sont jugés d'abord.
CREATE TRIGGER pieces_kyc_rib_quatre_yeux_garde BEFORE INSERT OR UPDATE ON "pieces_kyc"
  FOR EACH ROW EXECUTE FUNCTION pieces_kyc_rib_quatre_yeux();
