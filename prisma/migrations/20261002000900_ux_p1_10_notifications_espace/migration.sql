-- UX-P1-10 (REQ-UX-016, REQ-JUR-039, partners/ADR-0022 exception E3) : les notifications de l'espace
-- de l'apporteur et ses préférences. Migration ADDITIVE : deux tables neuves, aucune donnée touchée.
-- `cle` est une clé de la table des notifications (`src/server/notifications/table-ssot.ts`) : la base
-- en tient la FORME, le code la VALEUR (validée par Zod à l'écriture, confrontée par un test
-- d'intégration). Une clé nouvelle est une ligne de code, jamais une migration.

-- CreateTable
CREATE TABLE "notifications_espace" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "cle" VARCHAR(64) NOT NULL,
    "attribution_id" UUID,
    "cree_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lue_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_espace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences_notification" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "cle" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL,
    "modifiee_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferences_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_espace_apporteur_id_cree_at_idx" ON "notifications_espace"("apporteur_id", "cree_at");

-- CreateIndex
CREATE INDEX "notifications_espace_attribution_id_idx" ON "notifications_espace"("attribution_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_notification_apporteur_cle_unique" ON "preferences_notification"("apporteur_id", "cle");

-- AddForeignKey
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "attributions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "preferences_notification" ADD CONSTRAINT "preferences_notification_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- SQL brut : Prisma ne modélise pas de CHECK (partners/ADR-0015).
-- Exception E3 de partners/ADR-0022 : la forme de la clé, des deux côtés.
ALTER TABLE "notifications_espace" ADD CONSTRAINT "notifications_espace_cle_forme"
  CHECK ("cle" ~ '^[a-z][a-z0-9_]*$');
ALTER TABLE "preferences_notification" ADD CONSTRAINT "preferences_notification_cle_forme"
  CHECK ("cle" ~ '^[a-z][a-z0-9_]*$');

-- Retour arrière : DROP TABLE "preferences_notification" ; DROP TABLE "notifications_espace" (les
-- contraintes et index partent avec elles). Il perd les notifications et préférences écrites depuis :
-- à ne jouer qu'avant toute donnée réelle.
