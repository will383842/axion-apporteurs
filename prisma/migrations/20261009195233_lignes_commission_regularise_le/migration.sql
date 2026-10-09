-- T-ARG-045 (REQ-ARG-016, REQ-ARG-018 ; contrat v2, art. 5.4) — la date de régularisation d'une ligne
-- de commission. Une somme différée n'est ni facturée ni versée avant la régularisation ; à la réception
-- de la dernière pièce ou information manquante, l'autofacture est datée de la régularisation, et son
-- échéance en court. `constate_le` est le jour du constat de l'encaissement intégral : il ne peut pas
-- porter cette date sans antidater l'autofacture. Migration ADDITIVE : une colonne nullable, son CHECK
-- et son gel ; rien d'existant n'est modifié, aucune ligne existante n'est réécrite (nul = jamais
-- régularisée).
--
-- Retour arrière (commentaire) : DROP TRIGGER lignes_commission_regularisation_figee ON
-- "lignes_commission" ; DROP FUNCTION lignes_commission_regularisation_figee() ; ALTER TABLE
-- "lignes_commission" DROP CONSTRAINT "lignes_commission_regularisation_apres_constat" ; puis DROP
-- COLUMN "regularise_le", une fois le code qui la lit retiré (expand/contract).

-- AlterTable
ALTER TABLE "lignes_commission" ADD COLUMN "regularise_le" DATE;

-- La régularisation ne précède jamais le constat de l'encaissement intégral.
ALTER TABLE "lignes_commission" ADD CONSTRAINT "lignes_commission_regularisation_apres_constat"
  CHECK ("regularise_le" IS NULL OR "regularise_le" >= "constate_le");

-- Une ligne facturée ne change plus de régularisation, ni ne la reçoit (de nul vers une date) : son
-- autofacture en tire sa date d'émission et son échéance, et ne change plus. Déclencheur DISTINCT de
-- lignes_commission_facturee_figee (20261009183517), qui reste en place tel quel.
CREATE FUNCTION lignes_commission_regularisation_figee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."autofacture_id" IS NOT NULL
     AND NEW."regularise_le" IS DISTINCT FROM OLD."regularise_le" THEN
    RAISE EXCEPTION 'lignes_commission_regularisation_figee : une ligne facturée ne change plus de date de régularisation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lignes_commission_regularisation_figee BEFORE UPDATE ON "lignes_commission"
  FOR EACH ROW EXECUTE FUNCTION lignes_commission_regularisation_figee();
