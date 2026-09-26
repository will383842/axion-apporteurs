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

## Configuration

| Variable | Présence | Règle | Rôle |
| --- | --- | --- | --- |
| `DATABASE_URL` | requise | URL `postgresql:` ou `postgres:` | la base Postgres ; `readyz` la sonde |
| `REDIS_URL` | requise | URL `redis:` ou `rediss:` | le cache Redis ; `readyz` le sonde |
| `NOTIFY_SINK` | requise hors production | `true` exigé hors production (REQ-CPL-021) | retient toute notification dans le journal au lieu de l'envoyer |
| `PARTNERS_ENV` | facultative | non vide, sans espace en bordure | nom de l'environnement ; `production` avec `NODE_ENV=production` vaut production |
| `LOG_LEVEL` | facultative | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | niveau du journal (pino), `info` si absente |
| `SENTRY_DSN` | facultative | URL `https:` | adresse de collecte des erreurs ; absente, rien ne part |
