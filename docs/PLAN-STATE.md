# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `14a8594` — 2026-09-29T10:16:33+02:00 |
| Qu’est-ce qui est en vol ? | 1. #214 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-049 (A01) · GOV-075 (A01) · GOV-084 (A01) · GOV-110 (A01) |
| Où en est la phase ? | phase 0 — 91/125 tâches, reste 29.25 j |
| Le prochain pas | QA-T05 — Pipeline GHCR privé → Coolify pull |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #216 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

91/125 tâches terminées · reste 29.25 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 167 | QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05 … (12 affichées sur 167 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 130 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 130 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → ~~SEC-17~~ (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **11.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend sont codables dans `docs/DECISIONS.md` — tranchées, ou portées par une hypothèse par défaut.

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #214 — feat(DM-03-P): la grille publiee par axionia est importee version par version, chaque ligne confrontee a son empreinte | `t/dm-03-p` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-049 — Une tache en cours sans lot est invisible de TOUTES les gardes, et c'est ce lot qui l'a rencontre | A01 | #196 | `a_faire` |
| GOV-075 — Des taches livrees gardent un chemin gabarit, et une tache livree omet un fichier qu'elle a modifie | A01 | #208 | `a_faire` |
| GOV-084 — Neuf scripts de garde suivis ne sont revendiques par aucune tache | A01 | #212 | `a_faire` |
| GOV-110 — La cloture compare le sujet du commit de fusion au titre ACTUEL de la PR : un renommage apres la fusion le rendrait conforme | A01 | #210 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T05** — Pipeline GHCR privé → Coolify pull (1 j) : 17 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `14a8594` (2026-09-29T10:16:33+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #216 — 2026-09-29 — feat(GOV-084): tout script de garde suivi a une tache porteuse, deux barrieres rattachees a GOV-000

**Fait.** `gov:attributions` refuse désormais un script suivi sous `scripts/gates/` que nulle tâche
ne déclare (famille `script_de_garde_sans_porteur`). La liste vient de l'index git, jamais d'une
liste tapée, et le vert imprime le compte des scripts confrontés : 49. Les deux derniers orphelins,
`gh-sur.js` et `git-push-sur.js`, rejoignent GOV-000, qui porte leur appelant et leur garde.

**Reste.** Rien sur cette garde. Le cas « une tâche déclare un script qui n'existe plus » est
l'affaire de la traçabilité, pas de celle-ci.

**Appris.** L'acceptance comptait neuf orphelins le 2026-09-16 ; la mesure refaite à la tête de
`main` en donne deux. Un compte recopié dans une acceptance vieillit, et c'est la garde qui le rend
vrai à chaque passage.

### PR #211 — 2026-09-29 — fix(GOV-110): la cloture confronte le sujet d'ecrasement au titre que la PR portait a l'instant de la fusion

**Fait.** La clôture d'une tâche seule attendait, pour première ligne du commit d'écrasement, le
titre ACTUEL de la PR, qui reste modifiable après la fusion. Elle lit maintenant les renommages dans
la chronologie de la PR et retient le titre en vigueur à `mergedAt`. Un renommage postérieur est
sans effet. Une chronologie illisible fait refuser la clôture, sans repli sur le titre actuel.

**Reste.** La commande réelle a été jouée en lecture sur la PR #207, renommée avant sa fusion. Le
cas d'une PR renommée après sa fusion n'est éprouvé que par la forge simulée.

**Appris.** Une donnée lue « maintenant » pour juger un fait passé doit être relue à l'instant de
ce fait : sinon, la preuve dépend de ce que la forge laisse encore modifier.

### PR #209 — 2026-09-29 — fix(GOV-075): aucun chemin gabarit la ou il ment, treize taches livrees reparees

**Fait.** Un chemin gabarit dit « pas encore connu ». Sur une tâche livrée, c'est faux. La garde
`gov:attributions` refuse désormais un gabarit sur une tâche livrée, sans statut, sans phase, ou de
phase inférieure ou égale à la phase courante (famille `chemin_gabarit`). Les treize tâches livrées
qui en portaient reçoivent leurs chemins réels, confrontés au disque et à l'historique git, par
`ajouter-path` puis `retirer-path`. GOV-036 déclare les deux fichiers que son commit modifiait. La
liste figée des gabarits tolérés est vide, donc elle est supprimée.

**Reste.** Un gabarit de phase future est compté et imprimé, pas refusé. La garde rougira `main` au
passage de phase tant que le lot préparatoire n'aura pas écrit les chemins de la phase suivante, et
c'est voulu : un avenant A01 à l'acceptance le dit, le volet « aucun gabarit, quelle que soit la
phase » n'étant pas tenu pour les phases futures. Les chemins repris de la vue dérivée n'avaient
pas tous été confirmés par git : la lentille `exactitude` en a démontré trois faux (INT-T01b,
GOV-002, GOV-017a), retirés dans cette PR au vu des commits de livraison.

**Appris.** Un masque tolérant cache plus que ce qu'il nomme : le retirer a fait apparaître treize
citations et deux gates non réciproques que personne n'avait déclarées.

… 3 entrée(s) affichée(s) sur 88 ; les 85 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

