-- SEC-45 (REQ-SEC-003) : un changement d'IBAN révoque les sessions de l'apporteur. Additive : une
-- fonction neuve et un déclencheur neuf, aucune colonne ni contrainte touchée.
-- Retour arrière : DROP TRIGGER "pieces_kyc_rib_revoque_les_sessions" ON "pieces_kyc", puis
-- DROP FUNCTION pieces_kyc_revoquer_sessions_au_changement_de_rib() ; les sessions ne sont plus
-- révoquées à un nouveau RIB, rien d'autre ne bouge.
--
-- L'IBAN d'une pièce est figé : un changement de RIB est TOUJOURS une nouvelle pièce `rib`. La base
-- incrémente donc `apporteurs.session_version` à l'INSERTION d'une pièce `rib` quand une AUTRE pièce
-- `rib` existe déjà pour le même apporteur, QUEL QUE SOIT son statut : un premier RIB refusé ou
-- remplacé ne rouvre pas la fenêtre, et le doute va à la révocation. Le premier RIB ne déconnecte
-- personne. La session qui dépose est révoquée comme les autres. Le déclencheur de monotonie
-- (`apporteurs_version_de_session`) reste juge de l'écriture.
-- Une fonction DÉDIÉE, plpgsql, sans EXECUTE, SECURITY INVOKER (le défaut) ; elle juge
-- `NEW.apporteur_id`, jamais l'acteur.
-- LA COURSE (A02 et la sécurité) : sous READ COMMITTED, deux PREMIERS RIB insérés en même temps ne se
-- verraient pas, et aucun ne révoquerait. La ligne de l'apporteur est donc VERROUILLÉE avant l'EXISTS :
-- la seconde insertion attend la première, puis la voit, et révoque.
CREATE FUNCTION pieces_kyc_revoquer_sessions_au_changement_de_rib() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" <> 'rib' THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "apporteurs" WHERE "id" = NEW."apporteur_id" FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM "pieces_kyc"
    WHERE "apporteur_id" = NEW."apporteur_id" AND "type" = 'rib' AND "id" <> NEW."id"
  ) THEN
    UPDATE "apporteurs" SET "session_version" = "session_version" + 1 WHERE "id" = NEW."apporteur_id";
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "pieces_kyc_rib_revoque_les_sessions" AFTER INSERT ON "pieces_kyc"
  FOR EACH ROW EXECUTE FUNCTION pieces_kyc_revoquer_sessions_au_changement_de_rib();
