#!/bin/sh
# Publier l'image sur le registre de la forge — QA-T05 (REQ-QA-018).
#
# Deux étiquettes : `sha-<7>` (le commit) et `latest` ; la plateforme tire l'EMPREINTE (QA-T65). La connexion passe par le jeton
# du workflow (`JETON`, posé depuis `GITHUB_TOKEN`), lu sur l'entrée standard, jamais en argument.
# Le script REFUSE de publier hors de `main` : la garde du workflow (`if:`) est doublée ici, pour
# qu'une étape mal gardée ne pousse pas `latest` depuis une branche.
#
# USAGE : pnpm image:publier      (après `pnpm image:construire`, dans la forge)
set -eu

: "${JETON:?JETON absent : le workflow le pose depuis GITHUB_TOKEN}"
: "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_ACTOR:?}"
if [ "${GITHUB_REF:-}" != "refs/heads/main" ]; then
  echo "❌ publication refusée hors de main (GITHUB_REF=${GITHUB_REF:-absent})." >&2
  exit 1
fi

REGISTRE="ghcr.io/$GITHUB_REPOSITORY"
COURT=$(printf '%s' "$GITHUB_SHA" | cut -c1-7)
printf '%s' "$JETON" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
docker tag partners:construite "$REGISTRE:sha-$COURT"
docker tag partners:construite "$REGISTRE:latest"
docker push "$REGISTRE:sha-$COURT"
docker push "$REGISTRE:latest"
# QA-T65 (REQ-GOV-014) : l'empreinte de l'image publiée, que la plateforme tirera (jamais l'étiquette).
EMPREINTE=$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$REGISTRE:sha-$COURT" | grep "^$REGISTRE@sha256:" | head -n 1 | cut -d@ -f2)
case "$EMPREINTE" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *) echo "❌ empreinte publiée illisible pour $REGISTRE:sha-$COURT" >&2; exit 1 ;;
esac
echo "✅ publié : $REGISTRE:sha-$COURT et $REGISTRE:latest"
echo "   empreinte publiée : $EMPREINTE"
