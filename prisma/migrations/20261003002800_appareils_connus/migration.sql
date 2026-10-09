-- SEC-55 (REQ-SEC-003) : l'appareil inconnu est un signal de sécurité du COMPTE, jamais une anomalie.
-- Une table neuve ; rien d'existant n'est touché. Elle ne garde, par apporteur, que l'EMPREINTE des
-- appareils sur lesquels une confirmation renforcée a eu lieu — un HMAC tronqué à 128 bits, sous une
-- clé dédiée, de l'identifiant que l'appareil présente ; jamais l'adresse réseau, jamais l'identifiant
-- en clair. Une ligne vit au plus la durée d'une session après sa dernière vue : la tâche
-- `appareils_purger` l'efface (registre de l'article 30, TRT-APPORTEURS).
--
-- Ce n'est PAS une table en ajout seul : la dernière vue avance, et la purge supprime la ligne.
--
-- Retour arrière : DROP TABLE "appareils_connus" (ses index et contraintes avec elle). Les appareils
-- connus sont oubliés : chacun redevient inconnu, et la prochaine action sensible redemande une
-- confirmation renforcée. Rien d'autre n'est perdu.

-- CreateTable
CREATE TABLE "appareils_connus" (
    "id" UUID NOT NULL,
    "apporteur_id" UUID NOT NULL,
    "empreinte" CHAR(32) NOT NULL,
    "kid" CHAR(8) NOT NULL,
    "confirme_at" TIMESTAMPTZ(3) NOT NULL,
    "derniere_vue_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appareils_connus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appareils_connus_apporteur_id_empreinte_kid_key" ON "appareils_connus"("apporteur_id", "empreinte", "kid");

-- CreateIndex
CREATE INDEX "appareils_connus_derniere_vue_at_idx" ON "appareils_connus"("derniere_vue_at");

-- AddForeignKey
ALTER TABLE "appareils_connus" ADD CONSTRAINT "appareils_connus_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- SQL brut : Prisma ne modélise pas les CHECK (partners/ADR-0015).

-- L'empreinte est la forme que produit `empreinteDAppareil` : 32 hexadécimaux minuscules, rien d'autre.
-- Une adresse réseau, un identifiant en clair ou une empreinte entière n'y entrent pas.
ALTER TABLE "appareils_connus" ADD CONSTRAINT "appareils_connus_empreinte_forme"
  CHECK ("empreinte" ~ '^[0-9a-f]{32}$');

-- Le `kid` de la clé des appareils, celui de `kidDe` : 8 hexadécimaux minuscules.
ALTER TABLE "appareils_connus" ADD CONSTRAINT "appareils_connus_kid_forme"
  CHECK ("kid" ~ '^[0-9a-f]{8}$');

-- Un appareil est vu au plus tôt quand il est confirmé.
ALTER TABLE "appareils_connus" ADD CONSTRAINT "appareils_connus_vue_apres_confirmation"
  CHECK ("derniere_vue_at" >= "confirme_at");
