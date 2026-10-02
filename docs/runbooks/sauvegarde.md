# Runbook — la sauvegarde de Partners, et l'exercice qui la prouve

> Livré par QA-T12 (REQ-QA-023). Perte de données acceptable et délai de remise en service : une heure
> chacun. **Une sauvegarde qu'on ne restaure pas n'est pas une sauvegarde** : ce runbook décrit la
> chaîne entière, et le seul fait qui la prouve est le dernier verdict d'exercice sous
> `partners/exercices/`.

## ⛔ Condition de mise en service

**Aucune donnée réelle en production avant que le chiffrement côté client ait tourné.** Le chiffrement
natif de Cloudflare R2 au repos et un jeton restreint au bucket et au préfixe `partners/` suffisent tant que la base
ne porte que des données d'essai. Avant la première donnée réelle, chaque vidage doit être chiffré par
Partners, avec une clé propre à Partners — le secret `PARTNERS_BACKUP_PASSPHRASE`, **jamais** la clé
d'un autre produit (arbitrage -d7 sur délégation de Williams du 2026-09-29). La preuve est un exercice
réussi sur un vidage lu sous `partners/chiffres/` : l'exercice **refuse** tout vidage non chiffré.

**Et trois conditions de plus, avant la première donnée réelle** (lentille `securite`, PR 280) :

1. **Aucun vidage en clair au-delà du seuil de la SSOT.** La plateforme dépose le vidage EN CLAIR sous `partners/` ; le
   rechiffrement horaire le chiffre puis l'efface. Ce n'est pas la cadence qui tient la fenêtre : un
   planificateur sauté, une relecture en échec ou un run retardé laissent un clair vivre. C'est la
   garde `pnpm sauvegarde:clairs` qui la tient : tout vidage en clair plus vieux que
   `CLAIR_EN_DEPOT_MAX_MINUTES` (SSOT : l'heure du rechiffrement plus le retard d'un run), ou dont la
   date est illisible, est nommé, et le geste sort en 1. Elle tourne après chaque rechiffrement, même
   en échec, et chaque nuit. Tout échec de `rechiffrer`, et tout clair que la garde nomme, émettent
   l'alerte Telegram close `rechiffrement_echoue` (QA-T53) : la catégorie et un identifiant technique,
   jamais la clé du vidage. Sauvegarde activée, un canal absent (`TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`) est une alarme éteinte : le run rougit en le nommant. Les colonnes de données personnelles sont déjà chiffrées dans la base, ce qui borne le
   risque de cette fenêtre.
2. **Aucune gestion des versions ni rétention d'objets** sur le préfixe `partners/` du bucket : sinon,
   le clair effacé survivrait en version antérieure. À vérifier dans le tableau de bord du bucket.
3. **Le chiffré est relu avant l'effacement du clair** : `rechiffrer` relit l'objet chiffré qu'il vient
   d'écrire, le déchiffre et le compare au clair ; au moindre écart, le clair est GARDÉ et le geste
   échoue en le nommant.

## La chaîne

| Quand | Qui | Quoi | Où |
| --- | --- | --- | --- |
| Chaque heure | la plateforme | vidage de la base, déposé en clair | `partners/` du bucket `axion-ia-backups` |
| Chaque heure, à :23 | la forge, `Sauvegarde` / `rechiffrer` | chiffrement côté client (AES-256-GCM), puis effacement du clair | `partners/chiffres/` |
| Juste après, même en échec | la forge, `Sauvegarde` / `rechiffrer`, étape `sauvegarde:clairs` | rouge si un clair a plus de `CLAIR_EN_DEPOT_MAX_MINUTES` (SSOT) ou une date illisible, chacun nommé | — |
| Le 1er du mois, 04:41 UTC | la forge, `Sauvegarde` / `exercice` | restauration du dernier vidage chiffré sur un Postgres 16 éphémère ; migrations propres ; au moins une ligne dans la table témoin ; verdict daté ; alerte sur échec | `partners/exercices/AAAA-MM-JJ.json` |
| Chaque nuit, 03:17 UTC | la forge, `Nightly` / `sauvegarde-fraicheur` | rouge si le dernier exercice réussi est plus vieux que `EXERCICE_DE_RESTAURATION_MAX_JOURS` (SSOT), en échec, ou absent ; puis, même en échec, la garde `sauvegarde:clairs`, filet d'un planificateur horaire arrêté | — |

La **table témoin** est dérivée du schéma : la table d'attribution dès que le modèle existe, sinon
`_prisma_migrations`, et le verdict écrit alors « témoin de substitution ». Rien de la base restaurée ne
sort de l'exercice : ni ligne, ni sortie brute de `pg_restore` ou de `prisma`. Le motif d'un échec nomme
l'étape et le code de sortie.

## Mise en place — une fois

1. Créer l'**environnement GitHub `production`**, avec la règle de branche « main seulement », et y
   poser les secrets — **jamais au niveau du dépôt** : un secret de dépôt est servi à tout workflow
   d'une PR de branche, avec le fichier de la PR, avant toute relecture (lentille `securite`, refus
   des PR 268 et 272). Les secrets : `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
   `PARTNERS_BACKUP_PASSPHRASE` (au moins 32 caractères, tirée au hasard, conservée hors de la forge dans
   le coffre de Williams), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (un robot ou un salon **dédié** à
   Partners), `COOLIFY_URL`, `COOLIFY_API_TOKEN`.
2. Déclarer Cloudflare R2 comme stockage S3 dans la plateforme, puis poser les variables de dépôt
   `COOLIFY_S3_STORAGE_UUID` et `COOLIFY_DB_UUID` (rendu par le provisionnement).
3. **Poser la variable de dépôt `PARTNERS_SAUVEGARDE_ACTIVEE` à `oui`, AVANT le pas suivant. C'est une
   condition de mise en service** (arbitrage -a2 du 2026-09-30, lentille `securite`, PR 280). Une fois
   la variable posée, un secret de lecture du bucket qui manque fait rougir la garde des clairs, même
   sous le planificateur : l'alarme ne s'éteint plus en silence. Sans elle, `configurer` refuse de
   programmer la sauvegarde, en le disant.
4. Lancer `Sauvegarde` à la main, geste `configurer` : la sauvegarde horaire est programmée ; relancé, il
   dit « existe déjà ».
5. Attendre un vidage, lancer `Sauvegarde` / `rechiffrer`, puis `Sauvegarde` / `exercice`. **Le verdict
   réussi de cet exercice est la condition de mise en service.**

Tant qu'un secret manque, chaque geste **planifié** est sauté et nomme chaque absent en avertissement :
rien n'est lu ni écrit. Exception : la garde des clairs, une fois `PARTNERS_SAUVEGARDE_ACTIVEE` posée,
échoue au lieu de sauter. Les secrets de lecture présents, elle juge toujours, activée ou non. Un geste lancé **à la main** sans ses secrets échoue, en nommant chaque absent
(arbitrage -d7 du 2026-09-30) : un vert vide ne prouve rien.

## Restaurer pour de vrai — la base est perdue

1. Télécharger le dernier fichier de `partners/chiffres/`.
2. Le restaurer sur la base de remplacement : `pnpm sauvegarde:exercice-local -- --vidage <fichier>`
   prouve d'abord qu'il se déchiffre et se restaure sur un Postgres éphémère ; la même clé déchiffre
   ensuite pour la restauration réelle.
   **Trois temps** (DM-45, décision A02) — l'exercice les joue tels quels, en lisant le schéma du
   vidage (`pg_restore --schema-only -f -`) :
   1. **Les rôles d'abord.** Un rôle est un objet global du serveur, que le vidage n'emporte pas. Ceux
      que nomment ses droits et sa propriété, de la forme `partners_*` et d'elle seule, sont créés
      en `NOLOGIN`, sans mot de passe, s'ils n'existent pas. Un droit donné à un rôle hors de cette
      forme fait échouer, le rôle nommé.
   2. **La restauration, avec les droits** : `--no-owner`, jamais `--no-acl`.
   3. **La propriété rejouée.** `--no-owner` a jeté chaque `ALTER … OWNER TO`, et avec lui le
      propriétaire du journal : ne sont rejouées, une par une, que les instructions de la forme
      ancrée `ALTER TABLE|SEQUENCE <objet> OWNER TO partners_*;`. Toute autre ligne qui donne la
      propriété à un rôle `partners_*` fait échouer, et rien n'est rejoué.

   Le rôle LOGIN de l'exécution (QA-T62) n'est **pas** restauré : il se reprovisionne, avec son
   secret, comme à la mise en service.

   **La restauration tourne sous le rôle de migration ou d'administration**, jamais sous le rôle
   LOGIN d'exécution ni sous `partners_execution` : aucune table ni séquence ne doit leur appartenir,
   sans quoi la propriété contournerait les droits. L'exercice le vérifie après chaque restauration.

   Un `ALTER FUNCTION … OWNER TO partners_*` tombe en piège : échec fermé, et c'est voulu. Le jour où
   une fonction `SECURITY DEFINER` appartiendra à un rôle `partners_*`, la forme ancrée s'ÉTEND pour
   la nommer, elle ne s'assouplit jamais.
3. Vérifier `GET /api/readyz` (200, `enDefaut` vide) et l'en-tête `x-partners-build-sha`.

Aucune commande manuelle contre la base de production hors de ce geste (`docs/CONVENTIONS.md` §7).

## Si l'exercice échoue

L'alerte ne porte que sa catégorie et un identifiant technique : jamais de coordonnée ni de lien. Lire le
verdict sous `partners/exercices/`, dont le motif nomme l'étape :

| Motif | Cause probable |
| --- | --- |
| `vidage non chiffré côté client` | le rechiffrement horaire n'a pas tourné ou n'a pas ses secrets |
| `déchiffrement` | vidage altéré, ou `PARTNERS_BACKUP_PASSPHRASE` changée sans rechiffrer l'historique |
| `restauration : rôle hors de la forme…` ou `… propriété(s) hors de la forme ancrée` | le vidage nomme un rôle étranger à Partners, ou une propriété qui n'a pas la forme attendue : rien n'est rejoué, à examiner avant toute restauration réelle |
| `restauration : pg_restore sort en …` | vidage incomplet, ou format de la plateforme non lisible par `pg_restore` |
| `migrations` | la base sauvegardée n'est pas au niveau des migrations du dépôt |
| `témoin : … est vide` | la base sauvegardée est vide |
| `aucun vidage chiffré` | ni la plateforme ni le rechiffrement n'ont rien déposé |

## Si un vidage reste en clair

`sauvegarde:clairs` nomme chaque clair en souffrance par sa clé et sa date de dépôt. Lire d'abord le
run `rechiffrer` de la même heure :

| Ce qu'on lit | Cause probable | Geste |
| --- | --- | --- |
| `relu ne restitue pas … : le clair est GARDÉ` | le dépôt altère ce qu'il écrit | ne rien effacer à la main ; relancer `rechiffrer` ; si l'écart persiste, vérifier le jeton et le bucket |
| aucun run `rechiffrer` à l'heure | planificateur arrêté ou désactivé | relancer `Sauvegarde` / `rechiffrer` à la main, puis réactiver le planificateur |
| run sauté, secrets absents | environnement `production` incomplet | poser les secrets (Mise en place, pas 1) |
| date illisible | objet déposé hors de la plateforme | l'identifier avant tout effacement : ce n'est peut-être pas un vidage |

Le clair n'est jamais effacé à la main avant qu'un chiffré relu existe sous `partners/chiffres/`.

## Exécuté le

Exécuté le : — · environnement : — · SHA : — · résultat : **jamais exécuté**, attend les clés Cloudflare R2 et la
plateforme (arbitrage -d7 du 2026-09-29 : la tâche n'est pas déclarée livrée avant).
