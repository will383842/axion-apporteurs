# partners/ADR-0028 — Le lot dédié du gardien-spec : écarter les réglages du projet, ouvrir trois fichiers

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-29 |
| **Décideur** | `architecte` — cet ADR consigne une décision de Williams (question 21 de W19) et la façon dont elle est appliquée ; il n'est pas encore accepté |
| **Tâche** | GOV-116 |
| **Exigences servies** | REQ-GOV-010 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | complète `partners/ADR-0019`, dont il livre le « lot `--settings` surchargé » rangé en « Reste à faire » |

## Contexte

`docs/CONVENTIONS.md` §8 réserve `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md` au
`gardien-spec`, dans un « lot dédié avec `--settings` surchargé ». Mesuré le 2026-09-29 : ce lot
n'existait nulle part, ni commande ni fichier de réglages. Deux faits le rendaient plus subtil qu'un
fichier de plus :

1. un fichier passé par `claude --settings` s'**ajoute** aux réglages chargés, et un `deny` de
   `.claude/settings.json` n'est pas levé par un `allow` ajouté ;
2. `.claude/settings.json` n'interdisait que `docs/DECISIONS.md` : une session ordinaire pouvait écrire
   `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`, que le §8 lui réserve pourtant.

## Décision

1. **La procédure.** Williams seul lance, depuis la racine du dépôt et sur une branche `t/<slug>`
   dédiée, `claude --setting-sources user --settings config/lot-dedie-gardien-spec.settings.json`.
   `pnpm lot:gardien-spec` l'imprime. Aucun agent ne la lance pour lui, aucune session ne se la
   délègue.
2. **Écarter, puis tout reprendre.** `--setting-sources user` écarte les réglages du projet et les
   réglages locaux. Le fichier du lot est **rendu** depuis `.claude/settings.json`
   (`scripts/lot/lot-dedie-gardien-spec.ts --rendre`) : il en reprend TOUTES les interdictions, tous
   les hooks et l'environnement, et n'ouvre que l'écriture des trois fichiers (`Write` et `Edit`).
   Il ne reprend AUCUNE autorisation du projet : en `allow`, la lecture (`git status/diff/log/show`,
   `gh pr view/checks/diff`, `gh run view`) et les six règles, rien d'autre. Il fixe le mode à
   `default`, pour que tout le reste DEMANDE à Williams, et il refuse en plus les exécuteurs
   (`node`, `npx`, `pnpm`, `npm`, `tsx`, `docker`, `python`, `gh api`, `gh pr merge`,
   `git merge/rebase/reset/checkout/restore`).
3. **Une session ordinaire reste bloquée.** `.claude/settings.json` porte en `deny` les six règles
   d'écriture des trois fichiers. Cet ajout touche un fichier réservé : Williams l'applique lui-même.
4. `pnpm lot:gardien-spec:verifier` rougit si le fichier du lot dérive du rendu, et si une des six
   règles manque au `deny` du projet.
5. **Le confinement est mécanique** (lentille securite, 2026-09-30). `--setting-sources user` charge
   aussi `~/.claude/settings.json` : son mode et ses `allow` s'ajoutent à ceux du lot, et un
   `deny` ne les borne que motif par motif. Un hook `PreToolUse` du lot
   (`lot-dedie-gardien-spec.ts --garde`) juge donc chaque `Write`, `Edit`, `MultiEdit`,
   `NotebookEdit` et `Bash`, quelle que soit la règle héritée. Une écriture passe si son chemin,
   RÉSOLU puis suivi jusqu'au fichier réel, est l'un des trois fichiers, casse comprise (seule la
   lettre de lecteur Windows est normalisée). Une commande passe si elle ne porte aucun
   métacaractère et figure sur une liste : la lecture, `git add` des trois fichiers, `git commit -m`,
   `git push` et `git switch -c` sur `t/*`, et `gh pr create`. Tout le reste est refusé, et le refus
   est nommé.

## Conséquences

GOV-112 peut s'écrire dans le lot. Une session ordinaire ne peut plus écrire le glossaire ni la
préséance. Les réglages utilisateur de Williams restent chargés dans le lot, mais la garde refuse
toute écriture hors des trois fichiers et toute commande hors de la liste, quelles que soient leurs
autorisations. Le lot ne fusionne pas : `gh pr merge` y est refusé.

## Alternatives écartées

- **`--settings` seul, sans écarter le projet** : le `deny` du projet resterait, et le lot n'ouvrirait
  rien. C'est le constat 1.
- **Retirer `docs/DECISIONS.md` du `deny` du projet** : cela ouvrirait le fichier à toute session.
- **Un fichier de réglages tapé à la main** : il dériverait du projet au premier `deny` ajouté.

## Ce qui le vérifie

`tests/unit/gouvernance/lot-dedie-gardien-spec.spec.ts` :
- le lot ouvre les trois fichiers et eux seuls, garde tout autre `deny` et les hooks ;
- le lot fixe le mode `default` et n'autorise sans demander aucun Bash qui exécute ou écrit ;
- la garde refuse `docs/../docs/tasks.json`, `DOCS/Decisions.md`, un chemin absolu hors du lot, un
  lien qui pointe ailleurs, et toute commande qui exécute, écrit, enchaîne ou sort de `t/*` ;
- le fichier sur disque est le rendu exact ;
- une session ordinaire porte les six règles en `deny`, et un projet qui en oublie une est nommé.

La trace datée de l'exécution réelle par Williams est jointe à la PR.

## Reste à faire

Les quatre règles `deny` qui manquaient sont posées (commit `a878a31e`, sur autorisation explicite de
Williams). Williams lance le lot une fois et joint la trace. Puis l'architecte accepte cet ADR.
