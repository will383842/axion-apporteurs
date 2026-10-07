-- DM-65 (REQ-DM-028) : la trace de chaque ajout et de chaque retrait de la liste, conservée cinq ans après le retrait
-- (DM-65, registre de l'article 30), puis effacée par la tâche de purge ; la durée vit dans la SSOT, jamais ici.
-- Retour arrière (commentaire) : DROP TRIGGER sirens_liste_noire_tracer_ajout, sirens_liste_noire_retrait_trace,
-- sirens_liste_noire_troncature, sirens_liste_noire_trace_garde, sirens_liste_noire_trace_troncature ;
-- DROP FUNCTION ×4 ; DROP TABLE "sirens_liste_noire_trace".
CREATE TABLE "sirens_liste_noire_trace" (
    "id" UUID NOT NULL,
    "siren" CHAR(9) NOT NULL,
    "motif" "motif_liste_noire" NOT NULL,
    "ajoute_par_id" UUID NOT NULL,
    "ajoute_at" TIMESTAMPTZ(3) NOT NULL,
    "retire_par_id" UUID,
    "retire_at" TIMESTAMPTZ(3),
    CONSTRAINT "sirens_liste_noire_trace_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "sirens_liste_noire_trace" ADD CONSTRAINT "sirens_liste_noire_trace_siren_forme" CHECK ("siren" ~ '^[0-9]{9}$');
ALTER TABLE "sirens_liste_noire_trace" ADD CONSTRAINT "sirens_liste_noire_trace_retrait_lie"
  CHECK (("retire_par_id" IS NULL) = ("retire_at" IS NULL));
ALTER TABLE "sirens_liste_noire_trace" ADD CONSTRAINT "sirens_liste_noire_trace_retrait_apres_ajout"
  CHECK ("retire_at" IS NULL OR "retire_at" >= "ajoute_at");
ALTER TABLE "sirens_liste_noire_trace" ADD CONSTRAINT "sirens_liste_noire_trace_ajoute_par_id_fkey"
  FOREIGN KEY ("ajoute_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sirens_liste_noire_trace" ADD CONSTRAINT "sirens_liste_noire_trace_retire_par_id_fkey"
  FOREIGN KEY ("retire_par_id") REFERENCES "utilisateurs_console"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Une seule période OUVERTE par SIREN (miroir de la PK de la liste).
CREATE UNIQUE INDEX "sirens_liste_noire_trace_une_ouverte" ON "sirens_liste_noire_trace" ("siren") WHERE "retire_at" IS NULL;
-- La purge lit les périodes fermées par date de retrait.
CREATE INDEX "sirens_liste_noire_trace_retire_at_idx" ON "sirens_liste_noire_trace" ("retire_at") WHERE "retire_at" IS NOT NULL;

-- (1) L'AJOUT ouvre la trace, dans la même transaction, par la base.
CREATE FUNCTION sirens_liste_noire_tracer_ajout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "sirens_liste_noire_trace" ("id", "siren", "motif", "ajoute_par_id", "ajoute_at")
  VALUES (gen_random_uuid(), NEW."siren", NEW."motif", NEW."ajoute_par_id", NEW."ajoute_at");
  RETURN NEW;
END;
$$;
CREATE TRIGGER sirens_liste_noire_tracer_ajout AFTER INSERT ON "sirens_liste_noire"
  FOR EACH ROW EXECUTE FUNCTION sirens_liste_noire_tracer_ajout();

-- (2) Le RETRAIT n'est admis que TRACÉ : le code ferme d'abord la période (auteur, date), puis supprime la ligne.
--     Une ligne de la liste ne se modifie pas : changer de catégorie, c'est retirer puis ajouter.
CREATE FUNCTION sirens_liste_noire_retrait_trace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sirens_liste_noire_immuable : une inscription ne se modifie pas, elle se retire puis s''ajoute';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "sirens_liste_noire_trace" t
    WHERE t."siren" = OLD."siren" AND t."ajoute_at" = OLD."ajoute_at" AND t."retire_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'sirens_liste_noire_retrait_sans_trace : fermer la période de trace avant le retrait';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER sirens_liste_noire_retrait_trace BEFORE UPDATE OR DELETE ON "sirens_liste_noire"
  FOR EACH ROW EXECUTE FUNCTION sirens_liste_noire_retrait_trace();

-- (2 bis) TRUNCATE, qu'aucun déclencheur de ligne ne voit, est refusé : il retirerait toute la liste sans
--         fermer une seule période (DM-65 ; note de la sécurité sur #793).
CREATE FUNCTION sirens_liste_noire_troncature_refusee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sirens_liste_noire_troncature : TRUNCATE refusé, un retrait se trace ligne à ligne';
END;
$$;
CREATE TRIGGER sirens_liste_noire_troncature BEFORE TRUNCATE ON "sirens_liste_noire"
  FOR EACH STATEMENT EXECUTE FUNCTION sirens_liste_noire_troncature_refusee();

-- (3) La trace : ajout seul, sauf la fermeture (une fois) et l'effacement d'une période FERMÉE (la purge).
CREATE FUNCTION sirens_liste_noire_trace_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'sirens_liste_noire_trace_garde : TRUNCATE refusé';
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."retire_at" IS NULL THEN
      RAISE EXCEPTION 'sirens_liste_noire_trace_garde : une période ouverte ne s''efface pas';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE : seule la fermeture, de NULL vers une valeur, une fois ; rien d'autre ne bouge.
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."siren" IS DISTINCT FROM OLD."siren"
     OR NEW."motif" IS DISTINCT FROM OLD."motif" OR NEW."ajoute_par_id" IS DISTINCT FROM OLD."ajoute_par_id"
     OR NEW."ajoute_at" IS DISTINCT FROM OLD."ajoute_at" OR OLD."retire_at" IS NOT NULL THEN
    RAISE EXCEPTION 'sirens_liste_noire_trace_garde : seule la fermeture d''une période ouverte est admise, une fois';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sirens_liste_noire_trace_garde BEFORE UPDATE OR DELETE ON "sirens_liste_noire_trace"
  FOR EACH ROW EXECUTE FUNCTION sirens_liste_noire_trace_garde();
CREATE TRIGGER sirens_liste_noire_trace_troncature BEFORE TRUNCATE ON "sirens_liste_noire_trace"
  FOR EACH STATEMENT EXECUTE FUNCTION sirens_liste_noire_trace_garde();

-- (4) REPORT : chaque inscription existante reçoit sa période ouverte (seule ligne de données).
INSERT INTO "sirens_liste_noire_trace" ("id", "siren", "motif", "ajoute_par_id", "ajoute_at")
SELECT gen_random_uuid(), "siren", "motif", "ajoute_par_id", "ajoute_at" FROM "sirens_liste_noire";
