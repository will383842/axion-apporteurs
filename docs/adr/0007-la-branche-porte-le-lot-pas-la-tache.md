# partners/ADR-0007 — La branche porte le LOT, la tâche porte le COMMIT

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-012 |
| **Exigences servies** | REQ-GOV-013, REQ-GOV-014, REQ-CPL-021 |
| **Décisions du registre citées** | W13 |
| **Règle maison appliquée** | RM-09 |
| **Remplace / remplacé par** | — |

## Contexte

`docs/CONVENTIONS.md` §5 annonce une branche par tâche, `t/<id-en-minuscules>`, et
`scripts/lot/tasks.schema.json` l'imposait par le motif `^t/[a-z0-9-]+$` sur le champ `branch`.
Ce n'est pas ce que le dépôt a fait, et ce n'est pas ce qu'il peut faire.

Trois faits, tous mesurés :

1. **Le lot `L-1-01` a été livré sur une branche unique**, `lot/L-1-01-integration`, en huit commits
   — un par tâche. C'est la seule branche que la PR #26 a portée, et c'est la valeur que
   `pnpm lot:cloture` a écrite dans les sept lignes de `docs/tasks.json`. La garde `gov:tasks` est
   donc devenue rouge **au moment même où le lot a été clôturé** : le seul écrivain légitime du
   statut produisait un document que le schéma refuse.
2. **Une PR coûte un créneau de fusion, pas un commit.** Le cycle de gates de ce dépôt se compte en
   dizaines de minutes, et la file est partagée avec les sessions qui travaillent sur `axionia`.
   185 tâches restent à livrer : à une PR par tâche, la file seule dépasse le budget du projet.
3. **La granularité n'est pas perdue.** Elle se lit dans le commit (`feat(<ID>): …`), dans le champ
   `lot` et dans le champ `pr` de chaque ligne du backlog. Une tâche reste traçable jusqu'à sa PR ;
   ce qu'elle perd, c'est une branche à elle, qui ne prouvait rien que le commit ne prouve.

## Décision

Le champ `branch` de `docs/tasks.json` accepte **deux formes**, et deux seulement :

- `lot/<id-de-lot>-<suffixe>` — la forme normale. Un lot, une branche, une PR, un commit par tâche.
- `t/<slug>` — la forme dérogatoire, pour une tâche livrée seule : correctif urgent, tâche
  `sensible` que l'on veut relire isolément, tâche qu'un lot a dû sortir en cours de route.

Le motif du schéma devient `^(t/[a-z0-9][a-z0-9._-]*|lot/[A-Za-z0-9][A-Za-z0-9._/-]*)$`. Il reste
un motif fermé : une branche sans préfixe reconnu est toujours refusée.

`docs/CONVENTIONS.md` §5 est corrigé pour dire la même chose que le schéma. Les deux disaient la
même chose fausse ; ils disent maintenant la même chose vraie.

## Conséquences

- **`pnpm lot:cloture` cesse de produire un document invalide.** C'est la conséquence qui motive
  l'ADR : un outil déclaré seul écrivain d'un champ ne peut pas écrire une valeur que la garde du
  même champ refuse.
- **La revue porte sur un lot.** Le gabarit de PR (REQ-GOV-013) est rempli une fois pour le lot et
  cite chaque tâche par son identifiant. La lentille de relecture s'applique par commit.
- **Une régression se révoque par commit**, pas par branche : `git revert <sha>` d'un commit de
  tâche est le geste de retour arrière, et il reste atomique.
- **Retour arrière de cet ADR** : restreindre à nouveau le motif à `^t/[a-z0-9-]+$` et réécrire les
  lignes `branch` déjà posées. Coût réel : une migration du backlog plus une PR par tâche restante.
- La matrice d'autonomie (`.claude/settings.json`) autorise `git push -u origin t/*` mais pas
  `lot/*`. Elle est étendue par la même PR : sans cela, la branche de lot ouvre une demande de
  permission qui fige une session en autopilote.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Faire écrire à `lot:cloture` une branche `t/<id>` fictive | Écrire dans le backlog le nom d'une branche qui n'a jamais existé. Le champ deviendrait décoratif, et la traçabilité qu'il sert disparaîtrait sans que rien ne rougisse. |
| Une PR par tâche, comme le disait CONVENTIONS §5 | 185 créneaux de fusion sur une file partagée avec quatre sessions. Le coût de la file dépasse celui du travail. |
| Retirer le motif du champ `branch` | Un champ libre accepte `main`, une chaîne vide, un nom de branche d'un autre dépôt. Le motif est ce qui empêche une PR de se déclarer fusionnée depuis n'importe où. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/gardes.spec.ts` · `it('est verte sur l’état du dépôt')`,
  celle que le `describe.each` instancie pour `gov:tasks`. C'est l'assertion qui verrait cette
  décision mourir **sur les données réelles** : sept lignes de `docs/tasks.json` portent aujourd'hui
  `lot/L-1-01-integration`, donc restreindre à nouveau le motif à `^t/[a-z0-9-]+$` rendrait
  `gov:tasks` rouge sur le backlog du dépôt, et ce test avec lui.
- Le second témoin `schema` de `pnpm gov:tasks --prove` est, lui, ciblé sur le motif de `branch`
  (`scripts/gates/gov-tasks.ts`) : une branche `feature/x`, sans préfixe reconnu, fait rougir la
  garde, et les deux formes décidées ici sont ses contre-témoins. Son titre n'est pas cité ici
  parce qu'il est **calculé** par le `describe.each` — partners/ADR-0003 et partners/ADR-0005
  avaient déjà écrit pourquoi on ne cite pas un titre calculé : il fige un nombre dont la source est
  ailleurs (RM-01). GOV-010 en a fait une règle, et c'est cet ADR qui la lui a fait trouver.

## Reste à faire

—
