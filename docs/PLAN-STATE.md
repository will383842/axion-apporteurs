# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `75b5e8d` — 2026-09-29T12:29:03+02:00 |
| Qu’est-ce qui est en vol ? | 1. #221 (un contrôle requis rouge ou une revue manquante) · 2. #228 (un contrôle requis rouge ou une revue manquante) · 3. #218 (un conflit avec `main`) · 4. #230 (un conflit avec `main`) · 5. #231 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-122 (A01) · GOV-119 (A01) |
| Où en est la phase ? | phase 0 — 95/134 tâches, reste 31.50 j |
| Le prochain pas | QA-T05 — Pipeline GHCR privé → Coolify pull |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #230 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

95/134 tâches terminées · reste 31.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 172 | QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05 … (12 affichées sur 172 — liste complète : `docs/TASKS.md`) |
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
| 1 | #221 — feat(QA-T05): la forge construit, juge puis publie l'image, la plateforme ne fera plus que la tirer | `t/qa-t05` | un contrôle requis rouge ou une revue manquante |
| 2 | #228 — test(GOV-121): la preuve de vol est jouee a null, la forme reelle du registre, et le docblock dit juste | `t/gov-121` | un contrôle requis rouge ou une revue manquante |
| 3 | #218 — feat(DM-04): commission et prorata en fonction pure, entiers exacts, bareme choisi par commissionId | `t/dm-04` | un conflit avec `main` — à résoudre avant tout |
| 4 | #230 — docs(GOV-012): conseillers salaries — plan W19 et taches versees (GOV-112, GOV-115 a GOV-117), sans DECISIONS ni GLOSSAIRE | `t/archi-commerciaux-salaries` | un conflit avec `main` — à résoudre avant tout |
| 5 | #231 — fix(GOV-118): un gabarit qui existe est un chemin reel, zero script de garde confronte est un refus | `t/gov-118` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-122 — La cloture retient un renommage fait dans la seconde meme de la fusion, et une date illisible y devient NaN au lieu d'un refus | A01 | #224 | `a_faire` |
| GOV-119 — La porte A d'une PR rougit quand une AUTRE PR fusionne pendant son execution | A01 | #223 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T05** — Pipeline GHCR privé → Coolify pull (1 j) : 21 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `75b5e8d` (2026-09-29T12:29:03+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #230 — 2026-09-29 — docs(GOV-012): conseillers salaries — plan W19 et taches versees (GOV-112, GOV-115 a GOV-117), sans DECISIONS ni GLOSSAIRE

**Fait.** Le plan du chantier W19 est versé dans `docs/chantiers/W19-conseillers-salaries.md`, avec
les réponses de Williams du 2026-09-29, dont la question 22 : les conseillers travaillent dans le CRM
Pro, et Partners garde le registre et décide par l'API 3. Quatre tâches entrent au registre `a_faire`
(GOV-112, GOV-115, GOV-116, GOV-117) ; INT-T28, SEC-34 et DM-32 sont ajoutées au plan, UX-P2-11 en
sort. Chiffrage : chantier W19 21,0 j, lot transverse « confort de la console pour tous les rôles »
15,7 j, total Partners 36,7 j.

**Reste.** Tout le chantier : GOV-116 puis GOV-112 écrivent `docs/DECISIONS.md`, `docs/GLOSSAIRE.md`
et `docs/PRESEANCE.md`, que cette PR ne touche pas ; GOV-117 puis GOV-115 versent les trente-deux
autres tâches. Aucune tâche W19 n'est livrée par cette PR.

**Appris.** Un titre de PR doit nommer une tâche du registre, et une PR sur une tâche `a_faire`
non revendiquée rougit `gov:etat` : une PR de plan qui verse ses tâches sans les livrer se titre sur
une tâche déjà livrée, comme la PR #219 sur GOV-012, jamais sur l'une des tâches qu'elle verse.

### PR #226 — 2026-09-29 — fix(GOV-122): un renommage a la seconde de la fusion est indecidable, une date illisible rend la chronologie illisible

**Fait.** La clôture d'une tâche seule ne retient plus un renommage daté de la seconde même de la
fusion : l'instant est indécidable, et elle refuse. Une date illisible dans la chronologie rend
celle-ci illisible au lieu de produire NaN. La prose parle du titre à l'instant de la fusion.

**Reste.** Rien sur ces trois points.

**Appris.** Une égalité à la seconde n'est pas un cas limite théorique quand la source horodate à la
seconde et que deux de ses dates sont décalées d'une seconde : c'est le cas courant.

### PR #225 — 2026-09-29 — fix(GOV-119): une fusion posterieure au clone est nommee et comptee, pas un rouge de la porte A

**Fait.** `gov:etat` ne rougit plus quand une autre PR fusionne pendant la porte A d'une PR. Une
fusion dont le commit manque au clone, et dont la date est postérieure à la base de ce clone, est
nommée et comptée ; une fusion antérieure au commit absent, ou une date illisible, reste un rouge.

**Reste.** Rien sur ce point. La porte A continue de lire la forge : elle voit seulement que le
futur de son clone n'est pas une illisibilité.

**Appris.** Le même rouge a coûté deux portes A dans la journée avant d'être versé. Une gate qui
dépend de l'instant où elle tourne mesure la file, pas la PR.

… 3 entrée(s) affichée(s) sur 94 ; les 91 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

