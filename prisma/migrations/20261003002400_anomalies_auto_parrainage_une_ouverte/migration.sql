-- SEC-18 (REQ-SEC-031) : une seule anomalie d'auto-parrainage OUVERTE par apporteur (le filleul),
-- dans la FORME D'A02 (2026-10-03, PR 601). Additive : un index unique partiel, rien d'autre.
-- L'index ferme la course de deux ouvertures simultanées : l'écrivain insère par
-- `INSERT … ON CONFLICT … DO NOTHING RETURNING`, et la base tranche. Il est limité à
-- `auto_parrainage` : une anomalie de sincérité vise une DÉCLARATION, et plusieurs peuvent être
-- ouvertes sur un même apporteur. Une anomalie anonymisée a `apporteur_id` NULL et n'est jamais
-- `ouverte` : l'index ne la voit pas.
-- Retour arrière : DROP INDEX "anomalies_auto_parrainage_une_ouverte".
CREATE UNIQUE INDEX "anomalies_auto_parrainage_une_ouverte" ON "anomalies" ("apporteur_id")
  WHERE "type" = 'auto_parrainage' AND "statut" = 'ouverte';
