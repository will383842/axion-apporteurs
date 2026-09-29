# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `b3d7572` — 2026-09-29T12:12:09+02:00 |
| Qu’est-ce qui est en vol ? | 1. #218 (un contrôle requis rouge ou une revue manquante) · 2. #221 (un contrôle requis rouge ou une revue manquante) · 3. #226 (un contrôle requis rouge ou une revue manquante) · 4. #228 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | GOV-119 (A01) · GOV-121 (A01) |
| Où en est la phase ? | phase 0 — 95/130 tâches, reste 28.50 j |
| Le prochain pas | QA-T05 — Pipeline GHCR privé → Coolify pull |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #228 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

95/130 tâches terminées · reste 28.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 168 | QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05 … (12 affichées sur 168 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 134 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 134 — liste complète : `docs/TASKS.md`) |
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
| 1 | #218 — feat(DM-04): commission et prorata en fonction pure, entiers exacts, bareme choisi par commissionId | `t/dm-04` | un contrôle requis rouge ou une revue manquante |
| 2 | #221 — feat(QA-T05): la forge construit, juge puis publie l'image, la plateforme ne fera plus que la tirer | `t/qa-t05` | un contrôle requis rouge ou une revue manquante |
| 3 | #226 — fix(GOV-122): un renommage a la seconde de la fusion est indecidable, une date illisible rend la chronologie illisible | `t/gov-122` | un contrôle requis rouge ou une revue manquante |
| 4 | #228 — test(GOV-121): la preuve de vol est jouee a null, la forme reelle du registre, et le docblock dit juste | `t/gov-121` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-119 — La porte A d'une PR rougit quand une AUTRE PR fusionne pendant son execution | A01 | #223 | `a_faire` |
| GOV-121 — Le temoin de la preuve de vol ne joue que la cle absente, jamais owner ou branch a null, la forme reelle du registre | A01 | #227 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T05** — Pipeline GHCR privé → Coolify pull (1 j) : 19 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `b3d7572` (2026-09-29T12:12:09+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #228 — 2026-09-29 — test(GOV-121): la preuve de vol est jouee a null, la forme reelle du registre, et le docblock dit juste

**Fait.** Le témoin de la preuve de vol joue maintenant `owner: null` et `branch: null`, la forme
que porte réellement le registre, en plus de la clé absente. Mesuré par mutation : sans la moitié
« type » de la clause, les deux faces neuves échouent. Le docblock ne dit plus « aucun témoin » là
où un témoin voisin existait.

**Reste.** Rien sur ce témoin.

**Appris.** Retirer une clé et la mettre à `null` ne jugent pas la même moitié d'une règle : un
témoin doit jouer la forme que les données prennent vraiment.

### PR #225 — 2026-09-29 — fix(GOV-119): une fusion posterieure au clone est nommee et comptee, pas un rouge de la porte A

**Fait.** `gov:etat` ne rougit plus quand une autre PR fusionne pendant la porte A d'une PR. Une
fusion dont le commit manque au clone, et dont la date est postérieure à la base de ce clone, est
nommée et comptée ; une fusion antérieure au commit absent, ou une date illisible, reste un rouge.

**Reste.** Rien sur ce point. La porte A continue de lire la forge : elle voit seulement que le
futur de son clone n'est pas une illisibilité.

**Appris.** Le même rouge a coûté deux portes A dans la journée avant d'être versé. Une gate qui
dépend de l'instant où elle tourne mesure la file, pas la PR.

### PR #219 — 2026-09-29 — chore(GOV-012): registre rattrape, quatre taches closes, cinq suites versees

**Fait.** Dixième rattrapage. GOV-075, GOV-110, GOV-084 et GOV-049 passent `fusionnee` par
`lot:cloture --tache`, chacune attestée par son commit d'écrasement. Cinq suites sont versées
`a_faire`, de GOV-118 à GOV-122 : toutes sont des relevés non bloquants des deux lentilles, et
l'une est une mesure faite sur la porte A de la PR #209.

**Reste.** Les suites versées. GOV-119 est la plus coûteuse à laisser courir : tant qu'elle n'est
pas livrée, une fusion pendant la porte A d'une autre PR peut faire rougir celle-ci.

**Appris.** Une acceptance qui cite un fichier et sa ligne affirme un fait daté : la sonde exige
alors son repère. Nommer le fichier sans la ligne suffit à dire où regarder.

… 3 entrée(s) affichée(s) sur 93 ; les 90 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

