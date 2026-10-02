#!/bin/sh
# Entrée de l'image d'Axion Partners — QA-T04 (REQ-QA-019).
#
# La migration passe AVANT le serveur, et elle BLOQUE : `prisma migrate deploy` en échec fait sortir
# ce script en code non nul, le serveur n'est jamais lancé, l'instance ne devient jamais saine
# (`HEALTHCHECK` sur `readyz`) et la plateforme continue de servir l'ancien conteneur.
# Le délai borne une migration qui attendrait un verrou : sortie en moins de 60 s dans tous les cas.
#
# L'échappatoire `SKIP_MIGRATE=1` — cette valeur exactement — n'est employée que par le runbook de
# retour arrière (`docs/runbooks/retour-arriere.md`) : redémarrer l'image précédente sur un schéma
# déjà migré. `tests/integration/sondes-de-vie.spec.ts` refuse qu'un autre fichier qui s'exécute ou
# se déploie l'écrive.
set -eu

ICI=$(cd "$(dirname "$0")" && pwd)
PRISMA="$ICI/node_modules/prisma/build/index.js"
DELAI_MIGRATION_S=55

if [ "${SKIP_MIGRATE:-}" = "1" ]; then
  echo "SKIP_MIGRATE=1 : migration sautee (runbook de retour arriere seulement)." >&2
else
  # `-k 5` : une migration qui ignore SIGTERM reçoit SIGKILL cinq secondes après — 60 s au plus.
  # QA-T62 (REQ-DM-024) : la migration passe sous le rôle PROPRIÉTAIRE (`DATABASE_MIGRATION_URL`) ; le
  # serveur, lui, ne connaîtra que `DATABASE_URL`, son rôle d'exécution. Hors production, sans URL de
  # migration, la seule URL sert aux deux.
  if ! DATABASE_URL="${DATABASE_MIGRATION_URL:-${DATABASE_URL:-}}" timeout -k 5 "$DELAI_MIGRATION_S" node "$PRISMA" migrate deploy --schema prisma/schema.prisma; then
    echo "Demarrage refuse : la migration a echoue ou depasse ${DELAI_MIGRATION_S} s. Le serveur n'est pas lance." >&2
    exit 1
  fi
fi

# QA-T06 (REQ-QA-015) : une preview est SEMÉE, jamais copiée. Le semeur (`prisma/seed.ts`) ne tourne
# que si un instant de semis est posé, et SEULEMENT en preview : ailleurs, le démarrage est refusé —
# un semis en production écrirait des données d'essai à côté des données réelles. Le semeur est
# idempotent : un redémarrage ne sème rien de plus.
if [ -n "${SEMEUR_INSTANT:-}" ]; then
  if [ "${PARTNERS_ENV:-}" != "preview" ]; then
    echo "Demarrage refuse : SEMEUR_INSTANT n'est admise qu'en preview (PARTNERS_ENV=preview)." >&2
    exit 1
  fi
  if ! node "$ICI/node_modules/tsx/dist/cli.mjs" prisma/seed.ts; then
    echo "Demarrage refuse : le semis de la preview a echoue. Le serveur n'est pas lance." >&2
    exit 1
  fi
fi

# QA-T62 (REQ-DM-024) : le rôle d'exécution est provisionné (hors migration, avec l'URL de migration)
# puis CONSTATÉ connecté comme le serveur : ni superutilisateur, ni membre de `partners_journal`, ni
# propriétaire d'une table. Sinon, le serveur n'est pas lancé.
# Sous SKIP_MIGRATE=1 aussi : le module ne provisionne alors pas, mais il CONSTATE (échec fermé).
if ! node "$ICI/node_modules/tsx/dist/cli.mjs" "$ICI/src/server/deploiement/role-d-execution.ts"; then
  exit 1
fi

# Le serveur ne garde pas l'URL du rôle propriétaire (QA-T62).
unset DATABASE_MIGRATION_URL

exec "$@"
