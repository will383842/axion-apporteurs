-- SEC-11 (REQ-SEC-005, HYP-C6) : un seul jeton de dépôt ACTIF par apporteur, tenu par la base.
-- Cadrage de l'architecte du 2026-09-26 (partners/ADR-0022). Additive : un index neuf, rien d'autre ;
-- aucune colonne, contrainte ni ligne touchée. Aucune colonne d'expiration : l'échéance se dérive de
-- `cree_at` et de la SSOT (`JETON_DEPOT_DUREE_MOIS`).
--
-- Si une base portait déjà deux jetons actifs pour un même apporteur, la création ÉCHOUE et le dit :
-- choisir lequel révoquer n'appartient pas à une migration. Aucun chemin d'émission n'existait avant
-- cette tâche.
--
-- Retour arrière : DROP INDEX "jetons_depot_un_actif_par_apporteur" ; l'unicité du jeton actif n'est plus tenue par la base.
CREATE UNIQUE INDEX "jetons_depot_un_actif_par_apporteur" ON "jetons_depot"("apporteur_id")
  WHERE "revoque_at" IS NULL;
