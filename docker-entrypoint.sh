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
  if ! timeout "$DELAI_MIGRATION_S" node "$PRISMA" migrate deploy --schema prisma/schema.prisma; then
    echo "Demarrage refuse : la migration a echoue ou depasse ${DELAI_MIGRATION_S} s. Le serveur n'est pas lance." >&2
    exit 1
  fi
fi

exec "$@"
