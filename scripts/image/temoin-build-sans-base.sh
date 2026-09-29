#!/bin/sh
# Le build sans base sait rougir — QA-T05 (REQ-QA-032), face rouge.
#
# Une page qui interroge la base AU RENDU est ajoutée à une copie jetable de l'arbre, puis l'image
# est construite sans aucune variable : le build doit ÉCHOUER, et l'échec doit NOMMER la page ET
# venir du rendu ou de la base — pas d'une autre cause (une erreur de type sur le fichier témoin
# nommerait aussi la page, et ne prouverait rien). L'arbre de travail n'est jamais modifié.
#
# USAGE : pnpm image:temoin-build-sans-base
set -eu

COPIE=$(mktemp -d)
SORTIE="$COPIE.build.txt"
trap 'rm -rf "$COPIE" "$SORTIE"' EXIT INT TERM

git ls-files -z | xargs -0 -I{} cp --parents {} "$COPIE"
PAGE="$COPIE/src/app/temoin-build-sans-base/page.tsx"
mkdir -p "$(dirname "$PAGE")"
cat >"$PAGE" <<'PAGE'
import { PrismaClient } from '@prisma/client';

export default async function Page() {
  const lignes = await new PrismaClient().$queryRaw`SELECT 1`;
  return <p>{JSON.stringify(lignes)}</p>;
}
PAGE

if docker build --tag partners-temoin "$COPIE" >"$SORTIE" 2>&1; then
  echo "❌ le build a réussi alors qu'une page lit la base au rendu : le témoin ne mesure rien." >&2
  exit 1
fi
if ! grep -q "temoin-build-sans-base" "$SORTIE" || ! grep -q -i -E "prerender|DATABASE_URL" "$SORTIE"; then
  tail -40 "$SORTIE" >&2
  echo "❌ le build a échoué sans nommer la page qui lit la base au rendu." >&2
  exit 1
fi
echo "✅ build sans base — la page qui lit la base au rendu fait échouer le build, et elle est nommée."
