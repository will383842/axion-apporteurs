-- La grille de commission publiée par axionia — DM-03-P (REQ-DM-014, partners/ADR-0022).
-- Partie générée : `prisma migrate diff` du schéma de main vers celui de cette PR.

-- CreateTable
CREATE TABLE "grilles_commission" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "contenu_json" JSONB NOT NULL,
    "publiee_at" TIMESTAMPTZ(3) NOT NULL,
    "importee_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grilles_commission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grilles_commission_version_key" ON "grilles_commission"("version");

-- CreateIndex
CREATE UNIQUE INDEX "grilles_commission_hash_key" ON "grilles_commission"("hash");


-- SQL brut : Prisma ne modélise ni CHECK, ni fonction, ni déclencheur (partners/ADR-0015).
ALTER TABLE "grilles_commission" ADD CONSTRAINT "grilles_commission_version_positive"
  CHECK ("version" > 0);
ALTER TABLE "grilles_commission" ADD CONSTRAINT "grilles_commission_hash_hex"
  CHECK ("hash" ~ '^[0-9a-f]{64}$');

-- Une version importée n'est JAMAIS réécrite (acceptation 4) : une grille republiée ne change
-- rétroactivement aucun droit déjà né. Le refus est celui de la BASE, même forme que le journal.
CREATE FUNCTION grilles_commission_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'grilles_commission_immuable : % refusé, une version de grille importée ne se réécrit pas (REQ-DM-014)', TG_OP;
END;
$$;
CREATE TRIGGER grilles_commission_immuable BEFORE UPDATE OR DELETE ON "grilles_commission"
  FOR EACH ROW EXECUTE FUNCTION grilles_commission_refuser_modification();
-- Un déclencheur de ligne ne voit pas TRUNCATE : sans celui d'instruction, `TRUNCATE` passe.
CREATE TRIGGER grilles_commission_troncature BEFORE TRUNCATE ON "grilles_commission"
  FOR EACH STATEMENT EXECUTE FUNCTION grilles_commission_refuser_modification();
