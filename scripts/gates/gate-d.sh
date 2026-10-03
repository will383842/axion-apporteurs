#!/bin/sh
# Porte D d'Axion Partners — QA-T11 (REQ-QA-021) : les migrations, en EXPAND PUIS CONTRACT.
#
# Une migration fusionnée se joue sur une base qui porte des données, pendant que la version N−1
# du code tourne encore. La porte le rejoue, dans cet ordre, et s'arrête au premier refus :
#   1. EXPAND/CONTRACT — les migrations de la PR (diff base..HEAD, pas le schéma final) sont
#      confrontées au code DÉPLOYÉ, l'arbre de la base : une suppression, un renommage ou une
#      non-nullité sans défaut sur une colonne encore lue rougit en nommant la colonne et le
#      fichier qui la lit (`migrations-additive.ts --pr`). Aucun conteneur n'est encore lancé ;
#   2. BASE VIERGE — toutes les migrations sur une base neuve, puis `prisma migrate diff` VIDE
#      entre la base et `prisma/schema.prisma` ;
#   3. VIDAGE N−1 SEMÉ — la base migrée par les migrations de la base, SEMÉE (une migration additive
#      passe trivialement sur une table vide : c'est le faux vert de cette famille), vidée par
#      `pg_dump`, restaurée, migrée par les migrations de la PR, `migrate diff` VIDE, aucune ligne
#      perdue. Une table que la PR modifie et que le semeur n'a pas pu semer fait rougir ;
#   4. IMAGE N−1 SUR LE SCHÉMA N — l'image de la base, construite ici, démarre contre ce vidage
#      migré : `readyz` 200, migrations saines. Sans migration dans la PR, le schéma est celui que
#      la porte C prouve déjà : l'étape est sautée, et le vert le DIT.
#
# USAGE : sh scripts/gates/gate-d.sh [--en-plus <dossier de migration>] [<base>]
#         sh scripts/gates/gate-d.sh --prove
#   — la base est, par défaut, le point de divergence avec `origin/main` ; sur `main` même, le
#     premier parent de HEAD (le commit fusionné précédent) ;
#   — `--en-plus` ajoute une migration aux migrations de la PR : c'est le bac d'essai du témoin ;
#   — `--prove` joue le témoin : une migration qui supprime une colonne encore lue doit faire
#     sortir la porte en code non nul, en nommant la colonne et le fichier qui la lit.
#
# Ce qu'elle ne voit pas : une lecture de colonne que le code assemble à l'exécution (le nom n'est
# écrit nulle part), et une table que le semeur ne sait pas semer et que la PR ne touche pas —
# nommée dans le vert, jamais tue.
set -eu

echouer() {
  echo "❌ porte D — $1" >&2
  exit 1
}

if [ "${1:-}" = "--prove" ]; then
  TEMOIN=$(mktemp -d)
  trap 'rm -rf "$TEMOIN"' EXIT INT TERM
  BAC="$TEMOIN/99999999999999_temoin_porte_d"
  mkdir -p "$BAC"
  # La colonne du témoin est lue par `src/server/auth/session.ts` du code déployé. Le jour où elle
  # ne l'est plus, ce témoin rougit en le disant : on en choisit une autre, on ne l'éteint pas.
  printf 'ALTER TABLE "sessions_espace" DROP COLUMN "revoque_at";\n' >"$BAC/migration.sql"
  if sh "$0" --en-plus "$BAC" >"$TEMOIN/sortie.txt" 2>&1; then
    cat "$TEMOIN/sortie.txt" >&2
    echouer "le bac d'essai qui supprime une colonne encore lue est resté vert."
  fi
  grep -q 'sessions_espace.revoque_at, encore lue par le code déployé : src/' "$TEMOIN/sortie.txt" || {
    cat "$TEMOIN/sortie.txt" >&2
    echouer "le bac d'essai a rougi sans nommer la colonne et le fichier qui la lit."
  }
  echo "✅ porte D — le bac d'essai sort en non nul, colonne et lecteur nommés :"
  grep 'lue_par_le_code_deploye' "$TEMOIN/sortie.txt"
  exit 0
fi

EN_PLUS=""
if [ "${1:-}" = "--en-plus" ]; then
  EN_PLUS=${2:?usage: sh scripts/gates/gate-d.sh --en-plus <dossier de migration>}
  shift 2
  [ -f "$EN_PLUS/migration.sql" ] || echouer "$EN_PLUS ne porte pas de migration.sql."
fi
BASE=${1:-}
if [ -z "$BASE" ]; then
  git rev-parse --verify -q origin/main >/dev/null ||
    echouer "origin/main introuvable : la version N−1 ne se devine pas (checkout avec fetch-depth: 0)."
  BASE=$(git merge-base HEAD origin/main)
  [ "$BASE" != "$(git rev-parse HEAD)" ] || BASE=$(git rev-parse HEAD^1)
fi
BASE=$(git rev-parse "$BASE")
COURT=$(echo "$BASE" | cut -c1-7)

ID="gate-d-$$"
IMAGE="partners-n-1:$ID"
TEMP=$(mktemp -d)
nettoyer() {
  docker rm -f "$ID-app" "$ID-base" "$ID-cache" >/dev/null 2>&1 || true
  docker network rm "$ID" >/dev/null 2>&1 || true
  docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap nettoyer EXIT INT TERM

# ── 1. expand/contract : les migrations de la PR contre le code déployé ──────────────────────
mkdir -p "$TEMP/n-1" "$TEMP/n"
git archive "$BASE" | tar -x -C "$TEMP/n-1"
set -- --pr --base "$BASE" --deploye "$TEMP/n-1" --tables-touchees "$TEMP/touchees.txt"
[ -z "$EN_PLUS" ] || set -- "$@" --en-plus "$EN_PLUS"
pnpm exec tsx scripts/gates/migrations-additive.ts "$@"
DE_LA_PR=$(git diff --name-only --diff-filter=AMR "$BASE" HEAD -- prisma/migrations/ | grep -c '\.sql$' || true)
[ -z "$EN_PLUS" ] || DE_LA_PR=$((DE_LA_PR + 1))

# Les migrations N : celles de l'arbre, plus le bac d'essai s'il y en a un.
cp -R prisma "$TEMP/n/prisma"
[ -z "$EN_PLUS" ] || cp -R "$EN_PLUS" "$TEMP/n/prisma/migrations/"
compter_migrations() { find "$1" -mindepth 2 -maxdepth 2 -name migration.sql | wc -l | tr -d ' '; }
N_MIGRATIONS=$(compter_migrations "$TEMP/n/prisma/migrations")
N1_MIGRATIONS=$(compter_migrations "$TEMP/n-1/prisma/migrations")

# ── une base éphémère, joignable de l'hôte pour la CLI de Prisma ─────────────────────────────
docker network create "$ID" >/dev/null
docker run -d --name "$ID-base" --network "$ID" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=porte -e POSTGRES_PASSWORD=porte -e POSTGRES_DB=porte postgres:16-alpine >/dev/null
i=0
# Par TCP : le serveur provisoire de l'initialisation n'écoute que sur la socket, et redémarre.
until docker exec "$ID-base" pg_isready -h 127.0.0.1 -U porte -d porte >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || echouer "la base éphémère ne démarre pas en 60 s."
  sleep 1
done
PORT=$(docker port "$ID-base" 5432/tcp | head -n 1 | sed 's/.*://')
url() { echo "postgresql://porte:porte@127.0.0.1:$PORT/$1"; }
sql() { docker exec -i "$ID-base" psql -X -q -v ON_ERROR_STOP=1 -U porte -d "$1" -tA; }
creer() { echo "CREATE DATABASE $1;" | sql porte >/dev/null; }

migrer() {
  if ! DATABASE_URL=$(url "$1") pnpm exec prisma migrate deploy --schema "$2/prisma/schema.prisma" \
    >"$TEMP/migrer.txt" 2>&1; then
    sed 's/^/     /' "$TEMP/migrer.txt" >&2
    echouer "$3 : \`prisma migrate deploy\` a refusé."
  fi
}

diff_vide() {
  if ! DATABASE_URL=$(url "$1") pnpm exec prisma migrate diff --from-url "$(url "$1")" \
    --to-schema-datamodel prisma/schema.prisma --script --exit-code >"$TEMP/diff.txt" 2>&1; then
    sed 's/^/     /' "$TEMP/diff.txt" >&2
    echouer "$2 : la différence entre la base migrée et prisma/schema.prisma n'est pas vide."
  fi
}

COMPTES="SELECT c.relname || ' ' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations' ORDER BY 1;"
comptes() { echo "$COMPTES" | sql "$1"; }

# ── 2. base vierge ───────────────────────────────────────────────────────────────────────────
creer vierge
migrer vierge "$TEMP/n" "base vierge"
diff_vide vierge "base vierge"

# ── 3. vidage N−1 semé, restauré, migré ──────────────────────────────────────────────────────
creer precedente
migrer precedente "$TEMP/n-1" "base N−1 ($COURT)"
pnpm exec tsx scripts/gates/migrations-additive.ts --requete-schema | sql precedente >"$TEMP/catalogue.json"
pnpm exec tsx scripts/gates/migrations-additive.ts --semis "$TEMP/catalogue.json" >"$TEMP/semis.sql"
# SANS arrêt sur erreur, et c'est le mécanisme : chaque candidat est gardé par « table vide », le
# premier que la base accepte sème la table, les refus des autres sont attendus.
docker exec -i "$ID-base" psql -X -q -U porte -d precedente <"$TEMP/semis.sql" >/dev/null 2>&1 || true
comptes precedente >"$TEMP/avant.txt"
TABLES=$(wc -l <"$TEMP/avant.txt" | tr -d ' ')
SEMEES=$(awk '$2 > 0' "$TEMP/avant.txt" | wc -l | tr -d ' ')
LIGNES=$(awk '{ s += $2 } END { print s + 0 }' "$TEMP/avant.txt")
VIDES=$(awk '$2 == 0 { printf "%s ", $1 }' "$TEMP/avant.txt")
[ "$LIGNES" -gt 0 ] || echouer "le vidage N−1 n'a reçu aucune ligne : une migration additive y passerait trivialement."
while read -r table; do
  awk -v t="$table" '$1 == t && $2 > 0 { ok = 1 } END { exit !ok }' "$TEMP/avant.txt" ||
    echouer "table_touchee_non_semee : la PR modifie « $table », que le semeur n'a pas su semer — la migration n'y serait jugée que sur une table vide."
done <"$TEMP/touchees.txt"

# Le vidage passe par l'hôte : c'est un fichier, celui qu'une restauration réelle relirait.
docker exec "$ID-base" pg_dump -U porte -Fc -d precedente >"$TEMP/n-1.dump"
# QA-T70 (REQ-QA-023) : la restauration se fait COMME LE RUNBOOK (`docs/runbooks/sauvegarde.md`,
# étape 3), par le plan UNIQUE de l'exercice (`planDeLaPropriete`, `scripts/sauvegarde/exercice.ts`) :
# les rôles de la forme d'abord, puis les droits (`--no-owner`, jamais `--no-acl`), puis la propriété
# REJOUÉE, dont celle du journal. Sans elle, `evenements` appartiendrait au superutilisateur de la
# porte, et l'image N−1 démarrerait sur une base que la production n'a jamais.
docker exec -i "$ID-base" pg_restore --schema-only -f - <"$TEMP/n-1.dump" >"$TEMP/schema-n-1.sql" ||
  echouer "le schéma du vidage N−1 ne se lit pas."
pnpm exec tsx scripts/sauvegarde/exercice.ts --plan-de-propriete avant \
  <"$TEMP/schema-n-1.sql" >"$TEMP/plan-avant.sql" ||
  echouer "vidage N−1 : le plan de la propriété refuse (rôle ou propriété hors de la forme)."
pnpm exec tsx scripts/sauvegarde/exercice.ts --plan-de-propriete apres \
  <"$TEMP/schema-n-1.sql" >"$TEMP/plan-apres.sql" ||
  echouer "vidage N−1 : le plan de la propriété refuse (rôle ou propriété hors de la forme)."
creer migree
sql migree <"$TEMP/plan-avant.sql" >/dev/null
docker exec -i "$ID-base" pg_restore -U porte --exit-on-error --no-owner -d migree <"$TEMP/n-1.dump"
sql migree <"$TEMP/plan-apres.sql" >/dev/null
[ -s "$TEMP/plan-apres.sql" ] ||
  echouer "vidage N−1 : aucune propriété à rejouer — le journal y perdrait son propriétaire."
migrer migree "$TEMP/n" "vidage N−1 semé"
diff_vide migree "vidage N−1 migré"
comptes migree >"$TEMP/apres.txt"
while read -r table avant; do
  apres=$(awk -v t="$table" '$1 == t { print $2 }' "$TEMP/apres.txt")
  [ -n "$apres" ] && [ "$apres" -ge "$avant" ] ||
    echouer "ligne_perdue : « $table » portait $avant ligne(s) avant les migrations de la PR, ${apres:-0} après."
done <"$TEMP/avant.txt"

VERT="✅ porte D — base $COURT ; $DE_LA_PR migration(s) de la PR confrontée(s) au code déployé ; base vierge : $N_MIGRATIONS migration(s), diff vide ; vidage N−1 semé ($SEMEES/$TABLES table(s), $LIGNES ligne(s)) : $N1_MIGRATIONS migration(s) N−1 puis celles de la PR, diff vide, aucune ligne perdue"
[ -z "$VIDES" ] || VERT="$VERT ; non semée(s), aucune touchée par la PR : $VIDES"

# ── 4. l'image N−1 sur le schéma N ───────────────────────────────────────────────────────────
if [ "$DE_LA_PR" -eq 0 ]; then
  echo "$VERT ; image N−1 non démarrée : aucune migration dans la PR, le schéma est celui que la porte C prouve."
  exit 0
fi
docker build --tag "$IMAGE" "$TEMP/n-1" >"$TEMP/build.txt" 2>&1 || {
  tail -n 30 "$TEMP/build.txt" >&2
  echouer "l'image N−1 ($COURT) ne se construit pas."
}
docker run -d --name "$ID-cache" --network "$ID" redis:7-alpine >/dev/null
REQUISES=$(sed -n 's/^| `\([A-Z0-9_]*\)` | requise |.*/\1/p' "$TEMP/n-1/docs/env.md")
[ -n "$REQUISES" ] || echouer "docs/env.md de la base ne déclare aucune variable requise : la lecture a échoué."
secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
# QA-T62 (REQ-DM-024) : une image N−1 qui connaît le rôle d'exécution reçoit, comme la production et
# la porte C, DEUX URL. La migration et le provisionnement passent sous le superutilisateur
# ÉPHÉMÈRE ; le serveur, sous `partners_app`, dont le secret est tiré ici, masqué, puis CONSTATÉ par
# l'entrée de l'image (échec fermé). Une image N−1 plus ancienne, dont `docs/env.md` ne déclare pas
# `DATABASE_MIGRATION_URL`, garde son URL unique : c'est le code qu'elle porte.
DEUX_URL=""
grep -q '^| `DATABASE_MIGRATION_URL` |' "$TEMP/n-1/docs/env.md" && DEUX_URL=1
SECRET_EXECUTION=$(secret)
# Masqué AVANT tout usage, dans les journaux de la forge (aucun `set -x` dans ce script).
echo "::add-mask::$SECRET_EXECUTION"
for v in $REQUISES; do
  case "$v" in
    DATABASE_URL)
      if [ -n "$DEUX_URL" ]; then
        echo "DATABASE_MIGRATION_URL=postgresql://porte:porte@$ID-base:5432/migree"
        echo "DATABASE_URL=postgresql://partners_app:$SECRET_EXECUTION@$ID-base:5432/migree"
      else
        echo "DATABASE_URL=postgresql://porte:porte@$ID-base:5432/migree"
      fi
      ;;
    REDIS_URL) echo "REDIS_URL=redis://$ID-cache:6379" ;;
    *) echo "$v=$(secret)" ;;
  esac
done >"$TEMP/env"
echo "NOTIFY_SINK=true" >>"$TEMP/env"
echo "PARTNERS_ENV=porte-d" >>"$TEMP/env"
debut=$(date +%s)
# Le fichier porte le secret de `partners_app` : effacé dès le lancement, et avec `$TEMP` entier par
# `nettoyer`, en toute sortie.
docker run -d --name "$ID-app" --network "$ID" --env-file "$TEMP/env" "$IMAGE" >/dev/null || {
  rm -f "$TEMP/env"
  echouer "l'image N−1 ($COURT) ne se lance pas."
}
rm -f "$TEMP/env"
while :; do
  ecoule=$(($(date +%s) - debut))
  if [ "$(docker inspect -f '{{.State.Running}}' "$ID-app" 2>/dev/null)" != "true" ]; then
    docker logs --tail 20 "$ID-app" 2>&1 | sed 's/^/     /' >&2
    echouer "l'image N−1 s'est arrêtée après ${ecoule} s contre le schéma N."
  fi
  reponse=$(docker exec "$ID-app" node -e \
    "fetch('http://127.0.0.1:3000/api/readyz').then(async (r) => console.log(r.status + ' ' + (await r.text())), () => console.log('000'))" \
    2>/dev/null || echo 000)
  case "$reponse" in
    200\ *'"migrations":"ok"'*)
      echo "$VERT ; image N−1 : readyz 200 en ${ecoule} s sur le schéma N."
      exit 0
      ;;
  esac
  [ "$ecoule" -lt 180 ] || {
    docker logs --tail 20 "$ID-app" 2>&1 | sed 's/^/     /' >&2
    echouer "l'image N−1 n'a pas rendu readyz 200 en 180 s contre le schéma N (dernière réponse : $reponse)."
  }
  sleep 3
done
