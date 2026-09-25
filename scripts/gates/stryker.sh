#!/usr/bin/env bash
# `pnpm mutation` — QA-T30 (REQ-QA-002) : Stryker sur `src/domain/**`, dans le travail de nuit.
#
# Deux temps, et les deux tournent quoi qu'il arrive au premier :
#   1. Stryker mute le domaine (`stryker.config.json`) et écrit `reports/mutation/mutation.json`.
#      Sous le seuil `thresholds.break`, il sort lui-même en non nul.
#   2. `scripts/gates/mutation.ts` relit le rapport et le seuil DÉCLARÉ, et NOMME chaque mutant non
#      détecté (fichier:ligne, mutateur, statut). Un compte seul ne dit pas quoi corriger.
# Le travail sort en non nul si l'un des deux le fait : un seuil qu'aucune sortie ne fait respecter
# est une intention.
#
# Les chemins sont ceux du répertoire courant (la racine du dépôt, ou un projet jetable qui porte
# sa propre configuration) ; le lecteur est pris à côté de ce script.
set -uo pipefail

ICI=$(cd "$(dirname "$0")" && pwd)

node node_modules/@stryker-mutator/core/bin/stryker.js run
CODE_STRYKER=$?

node --import tsx "$ICI/mutation.ts"
CODE_RAPPORT=$?

if [ "$CODE_STRYKER" -ne 0 ] || [ "$CODE_RAPPORT" -ne 0 ]; then
  echo "mutation : sortie en echec (stryker ${CODE_STRYKER}, rapport ${CODE_RAPPORT})." >&2
  exit 1
fi
