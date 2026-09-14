# Axion Apporteurs

Outil de pilotage du réseau d'apporteurs d'affaires d'**AXION IA SAS** — de l'entrée d'un apporteur
jusqu'au versement de ses commissions.

## ⚠️ Ce dépôt est public

Trois catégories de contenu **n'y entrent jamais** — la garde `pnpm gov:publication` les refuse et la
CI échoue dessus :

1. **les notes d'analyse juridique** et tout commentaire expliquant le *pourquoi* d'une règle relationnelle ;
2. **les seuils de détection d'abus** — signaux, quotas, fenêtres : publiés, ils indiquent comment rester en dessous ;
3. **les montants de la grille de commissions** et l'économie du réseau.

Ces valeurs vivent en configuration ou en base de données. La règle complète est en `docs/DECISIONS.md` (W13).

## Comment ce dépôt se construit

Il est écrit **en autopilote** par une hiérarchie d'agents. Une session = un lot de tâches.

```bash
pnpm plan-state:build     # régénère l'état vivant depuis tasks.json, les issues et git
pnpm lot:composer --phase -1 --repo partners --max 8
# puis le workflow scripts/lot/lot.workflow.js
```

| Document | Ce qu'il contient |
| --- | --- |
| `docs/PLAN-STATE.md` | L'état vivant — **dérivé**, jamais édité à la main |
| `docs/DECISIONS.md` | Chaque décision : tranchée, ou hypothèse par défaut datée avec sa réversibilité |
| `docs/CONVENTIONS.md` | Nommage, argent en centimes, branches, worktrees, pré-vol |
| `docs/REGLES-MAISON.md` | Les règles qui ont déjà coûté cher |
| `docs/GLOSSAIRE.md` | Un terme canonique par concept |
| `docs/gates.json` | Le registre des gates : chacune porte son cas d'échec et la preuve qu'elle a rougi |
| `.claude/agents/` | Les fiches de rôle des agents |

## La règle qui gouverne tout le reste

> **Une garde qui n'a jamais rougi n'existe pas.**

Toute gate est posée en deux temps : on l'exécute d'abord sur un cas qui **doit** échouer, on garde la
preuve, et seulement ensuite elle devient bloquante.
