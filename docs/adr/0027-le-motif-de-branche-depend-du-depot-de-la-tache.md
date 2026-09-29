# partners/ADR-0027 — Le motif de branche dépend du dépôt de la tâche

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-29 |
| **Décideur** | `architecte` — cet ADR consigne un arbitrage de l'orchestrateur sur une dette bloquante ; il n'est pas encore accepté |
| **Tâche** | GOV-125 |
| **Exigences servies** | REQ-GOV-026 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | amende `partners/ADR-0007` : son motif de branche vaut pour les tâches de Partners seulement |

## Contexte

Mesuré le 2026-09-29 : `lot:cloture` refusait DM-03-A (axion-ia #1181, branche
`feat/partners-dm-03-a-grille`, en production) et INT-T02 (axion-ia #1180), famille
`branche_hors_motif`. Le motif de `branch` de `partners/ADR-0007` ne connaît que les deux formes de
Partners, `t/` et `lot/`. Une tâche du dépôt axionia se livre sur une branche d'axion-ia : elle ne
pouvait donc jamais être close, et les tâches de Partners qui en dépendent (DM-03-P, DM-04) restaient
ouvertes.

La convention écrite d'axion-ia (`CONTRIBUTING.md`, ligne 26) dit `feat/<scope>` ou `fix/<scope>`. La
forge en montre d'autres, libres par domaine (`qualiopi/`, `recrutement/`, `partners/`, `jur/`…). Il n'y
a donc pas de liste fermée de préfixes à recopier.

## Décision

1. Le motif de `branch` vit dans UNE règle de `$defs.tache.allOf` de `scripts/lot/tasks.schema.json`.
   Si `repo` vaut `axionia`, la branche a la forme d'une branche d'axion-ia : un préfixe en minuscules,
   une barre, puis un nom. Sinon, elle garde les deux formes fermées de `partners/ADR-0007`.
2. La clôture (`motifDeBranche(repo)`) et l'outil hors dépôt `reclasser.mjs` lisent cette règle. Tout
   autre emplacement d'un motif de `branch` est un refus.
3. Pour une tâche axionia, le préfixe n'est pas jugé. La tâche est **nommée** par le titre du commit
   d'écrasement ou par sa ligne `Lot:`, ce que la clôture vérifiait déjà (`tache_etrangere_a_la_pr`).

## Conséquences

DM-03-A et INT-T02 deviennent closables, puis DM-03-P et DM-04. Les branches de tâches Partners
créées dans axion-ia suivront désormais `partners/<id>-<scope>` (engagement de la session -66).

## Alternatives écartées

- **Une liste fermée des préfixes d'axion-ia** : aucune source ne la fixe, et la forge la contredit.
- **Ne pas écrire la branche d'une tâche axionia** : le schéma l'exige d'une tâche `fusionnee`.

## Ce qui le vérifie

`tests/unit/gouvernance/une-tache-axionia-se-clot-sur-sa-branche.spec.ts` : une tâche axionia livrée
par `feat/partners-x` est écrivable ; une tâche de Partners livrée par `feat/x` reste refusée ; un
dépôt absent ou inconnu garde le motif fermé ; une forme mal écrite reste refusée.

## Reste à faire

Accepter cet ADR (architecte).
