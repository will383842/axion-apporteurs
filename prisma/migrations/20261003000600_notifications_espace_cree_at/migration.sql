-- DM-61 (REQ-UX-016) : l'index de la purge des notifications de l'espace, sur `cree_at` seul. Additive :
-- un index neuf, aucune colonne ni contrainte touchée.
-- Retour arrière : DROP INDEX "notifications_espace_cree_at_idx" ; la purge relit alors la table entière.

-- CreateIndex
CREATE INDEX "notifications_espace_cree_at_idx" ON "notifications_espace"("cree_at");
