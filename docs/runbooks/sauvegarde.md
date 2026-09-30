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

## La chaîne

| Quand | Qui | Quoi | Où |
| --- | --- | --- | --- |
| Chaque heure | la plateforme | vidage de la base, déposé en clair | `partners/` du bucket `axion-ia-backups` |
| Chaque heure, à :23 | la forge, `Sauvegarde` / `rechiffrer` | chiffrement côté client (AES-256-GCM), puis effacement du clair | `partners/chiffres/` |
| Le 1er du mois, 04:41 UTC | la forge, `Sauvegarde` / `exercice` | restauration du dernier vidage chiffré sur un Postgres 16 éphémère ; migrations propres ; au moins une ligne dans la table témoin ; verdict daté ; alerte sur échec | `partners/exercices/AAAA-MM-JJ.json` |
| Chaque nuit, 03:17 UTC | la forge, `Nightly` / `sauvegarde-fraicheur` | rouge si le dernier exercice réussi est plus vieux que `EXERCICE_DE_RESTAURATION_MAX_JOURS` (SSOT), en échec, ou absent | — |

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
3. Lancer `Sauvegarde` à la main, geste `configurer` : la sauvegarde horaire est programmée ; relancé, il
   dit « existe déjà ».
4. Attendre un vidage, lancer `Sauvegarde` / `rechiffrer`, puis `Sauvegarde` / `exercice`. **Le verdict
   réussi de cet exercice est la condition de mise en service.**

Tant qu'un secret manque, chaque geste est **sauté** et nomme chaque absent en avertissement : rien n'est
lu ni écrit.

## Restaurer pour de vrai — la base est perdue

1. Télécharger le dernier fichier de `partners/chiffres/`.
2. Le restaurer sur la base de remplacement : `pnpm sauvegarde:exercice-local -- --vidage <fichier>`
   prouve d'abord qu'il se déchiffre et se restaure sur un Postgres éphémère ; la même clé déchiffre
   ensuite pour la restauration réelle.
3. Vérifier `GET /api/readyz` (200, `enDefaut` vide) et l'en-tête `x-partners-build-sha`.

Aucune commande manuelle contre la base de production hors de ce geste (`docs/CONVENTIONS.md` §7).

## Si l'exercice échoue

L'alerte ne porte que sa catégorie et un identifiant technique : jamais de coordonnée ni de lien. Lire le
verdict sous `partners/exercices/`, dont le motif nomme l'étape :

| Motif | Cause probable |
| --- | --- |
| `vidage non chiffré côté client` | le rechiffrement horaire n'a pas tourné ou n'a pas ses secrets |
| `déchiffrement` | vidage altéré, ou `PARTNERS_BACKUP_PASSPHRASE` changée sans rechiffrer l'historique |
| `restauration : pg_restore sort en …` | vidage incomplet, ou format de la plateforme non lisible par `pg_restore` |
| `migrations` | la base sauvegardée n'est pas au niveau des migrations du dépôt |
| `témoin : … est vide` | la base sauvegardée est vide |
| `aucun vidage chiffré` | ni la plateforme ni le rechiffrement n'ont rien déposé |

## Exécuté le

Exécuté le : — · environnement : — · SHA : — · résultat : **jamais exécuté**, attend les clés Cloudflare R2 et la
plateforme (arbitrage -d7 du 2026-09-29 : la tâche n'est pas déclarée livrée avant).
