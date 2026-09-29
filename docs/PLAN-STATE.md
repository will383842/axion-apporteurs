# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `b34b959` — 2026-09-29T18:00:27+02:00 |
| Qu’est-ce qui est en vol ? | 1. #241 (un contrôle requis rouge ou une revue manquante) · 2. #246 (un contrôle requis rouge ou une revue manquante) · 3. #242 (un conflit avec `main`) · 4. #244 (un conflit avec `main`) · 5. #245 (un conflit avec `main`) |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase 0 — 102/129 tâches, reste 21.75 j |
| Le prochain pas | QA-T11 — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #246 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

102/129 tâches terminées · reste 21.75 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 170 | QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05, INT-T22 … (12 affichées sur 170 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 141 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 141 — liste complète : `docs/TASKS.md`) |
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
| 1 | #241 — fix(GOV-062): l'outillage qui execute la porte A est juge, sept points nommes | `t/gov-062` | un contrôle requis rouge ou une revue manquante |
| 2 | #246 — chore(GOV-012): GOV-123 et GOV-124 versees, exception au gel decidee par Williams | `t/registre-rattrapage-12` | un contrôle requis rouge ou une revue manquante |
| 3 | #242 — feat(JUR-T34): la politique de confidentialite de l'espace, tiree du registre de l'article 30 et acceptee a la premiere connexion | `t/jur-t34` | un conflit avec `main` — à résoudre avant tout |
| 4 | #244 — docs(GOV-017a): confirmation du depot par e-mail — plan W20 et quatorze taches versees en phase 1, sans DECISIONS ni REQ nouvelles | `t/w20-confirmation-email` | un conflit avec `main` — à résoudre avant tout |
| 5 | #245 — feat(QA-T11): porte D, expand puis contract contre le code deploye, vidage N-1 seme, diff vide | `t/qa-t11` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T11** — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract (1 j) : 15 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `b34b959` (2026-09-29T18:00:27+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #246 — 2026-09-29 — chore(GOV-012): GOV-123 et GOV-124 versees, exception au gel decidee par Williams

**Fait.** Deux tâches versées, en exception au gel décidée par Williams. GOV-123 sort les vues
dérivées des PR et les rend sur main après chaque fusion. GOV-124 ramène à une lentille la
relecture d'une PR que le risque dérivé classe ordinaire.

**Reste.** Les deux tâches à coder, en priorité. INT-T26 attend la fusion de sa dépendance
INT-T27-A pour être close.

**Appris.** Une clôture se juge avec ses dépendances : une tâche livrée par une PR fusionnée
reste ouverte tant que sa dépendance ne l'est pas, sinon le registre ment sur l'ordre.

### PR #239 — 2026-09-29 — chore(GOV-012): registre rattrape, sept taches closes, gel de la gouvernance, avenants JUR-T03 et INT-T27-A

**Fait.** Onzième rattrapage. GOV-119, GOV-122, GOV-121, GOV-118, JUR-T04, QA-T05 et GOV-066 passent
`fusionnee` par `lot:cloture --tache`, chacune attestée par son commit d'écrasement. Deux avenants
A01 lèvent des dettes de la lentille exactitude sur axion-ia. JUR-T03 consigne la décision de Will
sur « commercial » et corrige son path. INT-T27-A porte la transcription du contrat v2 et chaque
fichier que sa PR modifie. Le gel de la gouvernance, décidé par Williams, reporte huit tâches
GOV en phase 3 et avance GOV-111 en phase 1.

**Reste.** DM-03-P et DM-04 attendent la fusion de DM-03-A (axion-ia #1181). INT-T02 est refusée
par la clôture : sa PR ne la déclare ni par son titre ni par sa ligne `Lot:`, et sa branche sort du
motif. Il faut un rattrapage par ADR.

**Appris.** Une clôture qui passe seule peut rendre le registre rouge par une dépendance encore
ouverte dans l'autre dépôt : `gov:tasks` se rejoue après chaque clôture, pas seulement à la fin.

### PR #237 — 2026-09-29 — feat(INT-T26): la candidature recue cree un apporteur candidat, coordonnees tirees et chiffrees, rattachement par empreinte

**Fait.** Une candidature reçue d'axionia devient un apporteur `candidat`. Le snapshot figé et le
passage de l'événement à `traite` se font dans une seule transaction. Les coordonnées ne voyagent
pas dans la charge : elles sont tirées à la route signée d'axionia, validées contre le `$defs`
publié du contrat v2, puis chiffrées. Une personne déjà connue par son courriel, son téléphone ou
la même candidature est rattachée, pas doublée. Si la route ne répond pas, l'événement attend
`coordonnees:<id>` et le travail de fond le reprend.

**Reste.** La route côté axionia (INT-T27-A, axion-ia#1223) n'est pas encore en production. D'ici
là, toute candidature attend, ce qui est l'état voulu. Le secret de relecture et l'URL d'axionia
entrent dans `env.ts` : un quatrième path, signalé au rattrapage.

**Appris.** Une erreur typée `AttenteDeDependance` suffit au travail de fond pour distinguer
« attendre » de « échouer ». Le traitement n'a rien à savoir de la file.

… 3 entrée(s) affichée(s) sur 103 ; les 100 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

