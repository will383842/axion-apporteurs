#!/bin/sh
# Porte C d'Axion Partners — QA-T05 (REQ-QA-018).
#
# L'image démarre avec une base et un cache ÉPHÉMÈRES, et `/api/readyz` rend 200, zéro migration
# en attente, en moins de trois minutes. C'est la seule preuve qu'une image publiée sait servir :
# une image qui se construit ne dit rien de sa migration ni de son environnement.
#
# USAGE : sh scripts/gates/gate-c.sh <image> [<dossier de migration a ajouter>]
#   — le second argument monte une migration EN PLUS de celles de l'image : c'est le témoin rouge
#     (une migration cassée fait sortir la porte en code non nul, avec le compte des migrations en
#     attente). Il n'a pas d'autre usage.
#
# LES VARIABLES REQUISES SE DÉRIVENT de `docs/env.md` (lignes « requise »), jamais d'une liste
# tapée ici : une variable ajoutée au contrat d'environnement entre d'elle-même dans la porte. Les
# secrets sont tirés au hasard à chaque passage (64 caractères hexadécimaux, ce qui satisfait aussi
# la règle de `PII_ENCRYPTION_KEY`). Base, cache et `NOTIFY_SINK` ont leur valeur propre.
#
# Ce qu'elle ne voit pas : le comportement de l'image sous charge, et tout ce qui dépend d'un
# service tiers réel (courriel, signature, axionia) — la porte ne parle à aucun.
set -eu

IMAGE=${1:?usage: sh scripts/gates/gate-c.sh <image> [<dossier de migration a ajouter>]}
EN_PLUS=${2:-}
DELAI_S=180
ID="gate-c-$$"
ENV_MD="docs/env.md"

nettoyer() {
  docker rm -f "$ID-app" "$ID-base" "$ID-cache" >/dev/null 2>&1 || true
  docker network rm "$ID" >/dev/null 2>&1 || true
}
trap nettoyer EXIT INT TERM

echouer() {
  echo "❌ porte C — $1" >&2
  exit 1
}

secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

[ -f "$ENV_MD" ] || echouer "$ENV_MD introuvable : la liste des variables requises ne se tape pas ici."
REQUISES=$(sed -n 's/^| `\([A-Z0-9_]*\)` | requise |.*/\1/p' "$ENV_MD")
[ -n "$REQUISES" ] || echouer "$ENV_MD ne déclare aucune variable requise : la lecture a échoué."

docker network create "$ID" >/dev/null
docker run -d --name "$ID-base" --network "$ID" \
  -e POSTGRES_USER=porte -e POSTGRES_PASSWORD=porte -e POSTGRES_DB=porte postgres:16-alpine >/dev/null
docker run -d --name "$ID-cache" --network "$ID" redis:7-alpine >/dev/null

i=0
until docker exec "$ID-base" pg_isready -U porte -d porte >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || echouer "la base éphémère ne démarre pas en 60 s."
  sleep 1
done

# Le secret du rôle d'exécution : 64 hexadécimaux, dans l'alphabet que le provisionnement admet.
SECRET_EXECUTION=$(secret)
# Masqué AVANT tout usage, dans les journaux de la forge (aucun `set -x` dans ce script).
echo "::add-mask::$SECRET_EXECUTION"
FICHIER_ENV="$(mktemp)"
for v in $REQUISES; do
  case "$v" in
    # QA-T62 (REQ-DM-024) : comme la production, DEUX URL. La migration et le provisionnement passent
    # sous le superutilisateur ÉPHÉMÈRE ; le serveur, sous son rôle d'exécution, dont le secret est
    # tiré ici, puis CONSTATÉ par l'entrée de l'image (échec fermé).
    DATABASE_URL)
      echo "DATABASE_MIGRATION_URL=postgresql://porte:porte@$ID-base:5432/porte"
      echo "DATABASE_URL=postgresql://partners_app:$SECRET_EXECUTION@$ID-base:5432/porte"
      ;;
    REDIS_URL) echo "REDIS_URL=redis://$ID-cache:6379" ;;
    *) echo "$v=$(secret)" ;;
  esac
done >"$FICHIER_ENV"
# La porte tourne HORS production : `docs/env.md` y exige `NOTIFY_SINK=true` (ligne « requise
# hors production », que le motif ci-dessus ne lit pas), et aucune notification ne part (REQ-CPL-021).
echo "NOTIFY_SINK=true" >>"$FICHIER_ENV"
echo "PARTNERS_ENV=porte-c" >>"$FICHIER_ENV"

set -- run -d --name "$ID-app" --network "$ID" --env-file "$FICHIER_ENV"
if [ -n "$EN_PLUS" ]; then
  [ -f "$EN_PLUS/migration.sql" ] || echouer "$EN_PLUS ne porte pas de migration.sql."
  set -- "$@" -v "$(cd "$EN_PLUS" && pwd):/app/prisma/migrations/$(basename "$EN_PLUS"):ro"
fi
debut=$(date +%s)
docker "$@" "$IMAGE" >/dev/null
rm -f "$FICHIER_ENV"

# Les migrations que l'instance doit porter : celles de l'image, plus celle du témoin.
attendues=$(docker run --rm --entrypoint sh "$IMAGE" -c \
  'for d in /app/prisma/migrations/*/; do [ -f "$d/migration.sql" ] && echo x; done' | wc -l)
[ -n "$EN_PLUS" ] && attendues=$((attendues + 1))

appliquees() {
  docker exec "$ID-base" psql -U porte -d porte -tAc \
    "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" \
    2>/dev/null | tr -d ' ' || echo 0
}

diagnostic() {
  n=$(appliquees)
  [ -n "$n" ] || n=0
  echo "   $((attendues - n)) migration(s) en attente sur $attendues." >&2
  echo "   readyz : ${1:-(aucune réponse)}" >&2
  echo "   fin du journal de l'instance :" >&2
  docker logs --tail 20 "$ID-app" 2>&1 | sed 's/^/     /' >&2
}

while :; do
  ecoule=$(($(date +%s) - debut))
  if [ "$(docker inspect -f '{{.State.Running}}' "$ID-app" 2>/dev/null)" != "true" ]; then
    diagnostic ""
    echouer "l'instance s'est arrêtée après ${ecoule} s (migration refusée ou environnement en défaut)."
  fi
  reponse=$(docker exec "$ID-app" node -e \
    "fetch('http://127.0.0.1:3000/api/readyz').then(async (r) => console.log(r.status + ' ' + (await r.text())), () => console.log('000'))" \
    2>/dev/null || echo 000)
  case "$reponse" in
    200\ *)
      case "$reponse" in
        *'"migrations":"ok"'*) ;;
        *) diagnostic "$reponse"; echouer "readyz rend 200 sans déclarer les migrations saines." ;;
      esac
      n=$(appliquees)
      [ "$n" = "$attendues" ] || { diagnostic "$reponse"; echouer "readyz rend 200, mais la base ne porte pas les $attendues migration(s) de l'image."; }
      echo "✅ porte C — $IMAGE : readyz 200 en ${ecoule} s, $n migration(s) appliquée(s) sur $attendues, 0 en attente ; $(echo "$REQUISES" | wc -w | tr -d ' ') variable(s) requise(s) lue(s) dans $ENV_MD."
      exit 0
      ;;
  esac
  [ "$ecoule" -lt "$DELAI_S" ] || { diagnostic "$reponse"; echouer "readyz n'a pas rendu 200 en ${DELAI_S} s."; }
  sleep 3
done
