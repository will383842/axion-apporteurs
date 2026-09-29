#!/bin/sh
# La porte C sait rougir — QA-T05 (REQ-QA-018), face rouge.
#
# La même image, une migration CASSÉE en plus : la porte doit sortir en code non nul ET donner le
# compte des migrations en attente. Une porte qui échoue sans dire pourquoi, ou qui reste verte, ne
# garde rien.
#
# USAGE : pnpm gate-c:prove     (après `pnpm image:construire`)
set -eu

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT INT TERM
CASSEE="$TEMP/99999999999999_temoin_casse"
mkdir -p "$CASSEE"
printf 'ALTER TABLE table_qui_n_existe_pas ADD COLUMN x integer;\n' >"$CASSEE/migration.sql"

if sh scripts/gates/gate-c.sh partners:construite "$CASSEE" >"$TEMP/sortie.txt" 2>&1; then
  cat "$TEMP/sortie.txt" >&2
  echo "❌ la porte C est restée verte sur une migration cassée." >&2
  exit 1
fi
if ! grep -q "migration(s) en attente" "$TEMP/sortie.txt"; then
  cat "$TEMP/sortie.txt" >&2
  echo "❌ la porte C a échoué sans donner le compte des migrations en attente." >&2
  exit 1
fi
echo "✅ porte C — la migration cassée fait sortir la porte en non nul :"
grep "migration(s) en attente" "$TEMP/sortie.txt"
