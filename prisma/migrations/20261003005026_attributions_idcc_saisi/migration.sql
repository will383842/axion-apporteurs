-- DM-49 (REQ-DM-064, D-OPCO-6) — `attributions.idcc_saisi` : l'IDCC facultatif de quatre chiffres, en clair,
-- sans aucun document. Forme d'A02, acceptée par la lentille sécurité (lot OPCO, rattrapage 54).
-- Préfixe : 20261003005026, donné par A02 (revue de la forme sur #838). ADDITIVE.
--
-- Colonne NULLABLE, `CHAR(4)` : un TEXTE, parce que les zéros de tête comptent (« 0044 ») ; EN CLAIR,
-- parce qu'un IDCC désigne la convention collective de l'entreprise, pas une personne. La base refuse
-- tout ce qui n'est pas quatre chiffres (« 44 », « 00A4 ») : le motif est testé sur le TEXTE de la valeur,
-- où le remplissage du `CHAR` ne compte pas. AUCUN champ de document, AUCUNE route de téléversement :
-- jamais de bulletin de paie. DM-07 n'est pas rouvert (partners/ADR-0022, Conséquences).
--
-- Retour arrière (commentaire) : ALTER TABLE attributions DROP CONSTRAINT attributions_idcc_saisi_quatre_chiffres,
-- DROP COLUMN idcc_saisi.

ALTER TABLE "attributions" ADD COLUMN "idcc_saisi" CHAR(4);

ALTER TABLE "attributions" ADD CONSTRAINT "attributions_idcc_saisi_quatre_chiffres"
  CHECK ("idcc_saisi" IS NULL OR "idcc_saisi"::text ~ '^[0-9]{4}$');
