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
3. **Une session ordinaire reste bloquée.** `.claude/settings.json` porte en `deny` les six règles
   d'écriture des trois fichiers. Cet ajout touche un fichier réservé : Williams l'applique lui-même.
4. `pnpm lot:gardien-spec:verifier` rougit si le fichier du lot dérive du rendu, et si une des six
   règles manque au `deny` du projet.

## Conséquences

GOV-112 peut s'écrire dans le lot. Une session ordinaire ne peut plus écrire le glossaire ni la
préséance. Les réglages utilisateur de Williams restent chargés dans le lot : ils ne doivent pas
porter d'autorisation sur un fichier réservé, ce que le dépôt ne peut pas vérifier.

## Alternatives écartées

- **`--settings` seul, sans écarter le projet** : le `deny` du projet resterait, et le lot n'ouvrirait
  rien. C'est le constat 1.
- **Retirer `docs/DECISIONS.md` du `deny` du projet** : cela ouvrirait le fichier à toute session.
- **Un fichier de réglages tapé à la main** : il dériverait du projet au premier `deny` ajouté.

## Ce qui le vérifie

`tests/unit/gouvernance/lot-dedie-gardien-spec.spec.ts` :
- le lot ouvre les trois fichiers et eux seuls, garde tout autre `deny` et les hooks ;
- le fichier sur disque est le rendu exact ;
- une session ordinaire porte les six règles en `deny`, et un projet qui en oublie une est nommé.

La trace datée de l'exécution réelle par Williams est jointe à la PR.

## Reste à faire

Williams ajoute à `.claude/settings.json` les quatre règles `deny` qui manquent (`Write` et `Edit` de
`docs/GLOSSAIRE.md` et de `docs/PRESEANCE.md`), lance le lot une fois et joint la trace. Puis
l'architecte accepte cet ADR.
