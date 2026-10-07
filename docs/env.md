# Variables d'environnement — Axion Partners

> VUE GÉNÉRÉE depuis le schéma de `src/lib/env.ts` par `pnpm env:doc` — ne pas éditer à la main.
> `tests/unit/qualite/env-fail-fast.spec.ts` rougit si ce fichier diffère du rendu.

Toute variable requise absente, et toute valeur hors règle, fait refuser le démarrage en code
non nul (`register()` de `src/instrumentation.ts`) ; le refus nomme la variable et un motif,
jamais la valeur. Aucune variable requise n'a de valeur par défaut. Une variable facultative
posée est jugée comme les autres.

## Secrets

| Variable | Présence | Règle | Rôle |
| --- | --- | --- | --- |
| `SESSION_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | signe les sessions de la console et de l'espace |
| `MAGIC_LINK_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | signe les liens de connexion envoyés par courriel |
| `DEPOSIT_TOKEN_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | signe les jetons de dépôt d'un contact |
| `AXIONIA_WEBHOOK_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | authentifie les webhooks reçus d'axionia |
| `AXIONIA_API_TOKEN` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | authentifie les appels de l'API entrante d'axionia |
| `DOCUSEAL_WEBHOOK_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | authentifie les webhooks reçus de DocuSeal |
| `PII_ENCRYPTION_KEY` | requise | exactement 64 caractères hexadécimaux | chiffre les données personnelles (AES-256-GCM) |
| `IP_HASH_SALT` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | sale l'empreinte des adresses réseau |
| `PII_HASH_KEY` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | clé des empreintes de recherche des données personnelles |
| `PARTNERS_MCP_SHARED_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | serrure de la porte MCP `POST /api/mcp`, en-tête `x-mcp-secret` |
| `ZEPTOMAIL_WEBHOOK_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | authentifie les webhooks de rebonds du relais de courriel, en-tête `Producer-Signature` |
| `AXIONIA_RELECTURE_SECRET` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | signe les lectures de Partners chez axionia (coordonnées d'un candidat), en-tête `x-partners-signature` |
| `APPORTEUR_REF_KEY` | requise | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | dérive la référence pseudonyme d'un porteur transmise à axion-ia (`apporteurRef`) ; clé stable, hors rotation |
| `ZEPTOMAIL_SEND_TOKEN` | facultative, requise si l’envoi réel est allumé | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | jeton d'envoi du relais de courriels ; exigé quand l'envoi réel est allumé (`PARTNERS_EMAIL_DMARC_VERIFIE`) |
| `TELEGRAM_BOT_TOKEN` | facultative, jamais requise au démarrage | au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production | jeton du canal d'alerte du serveur ; une alerte due sans lui fait échouer le passage en le nommant |
| `TELEGRAM_CHAT_ID` | facultative, jamais requise au démarrage | entier signé, au plus 20 chiffres | salon du canal d'alerte du serveur ; voir TELEGRAM_BOT_TOKEN |
| `PARTNERS_SINCERITE_REGLAGE` | facultative, jamais requise au démarrage | paires `clé=entier` séparées par `;`, clés de la liste fermée de `src/server/anomalie/sincerite.ts` | réglage des signaux de sincérité (poids, seuil, paramètres), hors dépôt ; absent, aucun dépôt n'est jugé |

## Configuration

| Variable | Présence | Règle | Rôle |
| --- | --- | --- | --- |
| `DATABASE_URL` | requise | URL `postgresql:` ou `postgres:` | la base Postgres, sous le rôle d'exécution du serveur (jamais superutilisateur, jamais membre de `partners_journal`) ; `readyz` la sonde |
| `DATABASE_MIGRATION_URL` | requise en production, par l'entrée de l'image | URL `postgresql:` ou `postgres:` | la base sous le rôle propriétaire : migration et provisionnement du rôle d'exécution, par l'entrée de l'image seulement ; exigée en production, retirée avant le serveur |
| `REDIS_URL` | requise | URL `redis:` ou `rediss:` | le cache Redis ; `readyz` le sonde |
| `NOTIFY_SINK` | requise hors production | `true` exigé hors production (REQ-CPL-021) | retient toute notification dans le journal au lieu de l'envoyer |
| `PARTNERS_ENV` | facultative | non vide, sans espace en bordure | nom de l'environnement ; `production` avec `NODE_ENV=production` vaut production |
| `LOG_LEVEL` | facultative | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | niveau du journal (pino), `info` si absente |
| `SENTRY_DSN` | facultative | URL `https:` | adresse de collecte des erreurs ; absente, rien ne part |
| `PARTNERS_EMAIL_DMARC_VERIFIE` | facultative | `true`, `false` | ouvre l'envoi automatique des courriels ; absente ou `false`, aucun courriel ne part (REQ-INT-022) |
| `PARTNERS_EMAIL_EXPEDITEUR` | facultative | non vide, sans espace en bordure | adresse humaine d'expédition, du sous-domaine d'envoi ; jamais une adresse sans réponse |
| `AXIONIA_BASE_URL` | facultative | URL `https:` | adresse d'axionia pour les lectures de Partners ; absente, aucune coordonnée n'est tirée |
| `AXIONIA_API_ALLOWLIST` | facultative | non vide, sans espace en bordure | adresses d'où axionia appelle l'API entrante, séparées par des virgules ; absente, personne n'entre |
| `ZEPTOMAIL_API_URL` | facultative, requise si l’envoi réel est allumé | URL `https:`, hôte de la liste fermée du relais, chemin `/v1.1/email` | URL d'envoi du relais de courriels, d'un hôte de la liste fermée ; exigée quand l'envoi réel est allumé |

## Rotation à double clé (REQ-QA-030)

Pendant une rotation, l'ancienne valeur d'un secret reste acceptée jusqu'à son échéance, au plus
24 h. Le `kid` présenté dans l'en-tête, dérivé de la valeur (`kidDe`), choisit la clé : un `kid`
absent ou inconnu est refusé. Partners émet toujours sous la clé courante. Les deux variables d'une
paire se posent ensemble ; procédure : `docs/runbooks/secret-desynchronise.md`.

| Variable | Présence | Règle | Rôle |
| --- | --- | --- | --- |
| `AXIONIA_WEBHOOK_SECRET_PRECEDENT` | facultative, avec son échéance | au moins 32 octets, distincte de tous les secrets | ancienne valeur de `AXIONIA_WEBHOOK_SECRET`, acceptée jusqu'à l'échéance |
| `AXIONIA_WEBHOOK_SECRET_PRECEDENT_ECHEANCE` | facultative, avec sa clé | instant ISO 8601 UTC, au plus 24 h après le démarrage | fin d'acceptation de `AXIONIA_WEBHOOK_SECRET_PRECEDENT` |
| `AXIONIA_API_TOKEN_PRECEDENT` | facultative, avec son échéance | au moins 32 octets, distincte de tous les secrets | ancienne valeur de `AXIONIA_API_TOKEN`, acceptée jusqu'à l'échéance |
| `AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE` | facultative, avec sa clé | instant ISO 8601 UTC, au plus 24 h après le démarrage | fin d'acceptation de `AXIONIA_API_TOKEN_PRECEDENT` |
