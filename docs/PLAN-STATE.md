# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `d13c426` — 2026-09-29T20:09:09+02:00 |
| Qu’est-ce qui est en vol ? | 1. #242 (un conflit avec `main`) · 2. #250 (un conflit avec `main`) · 3. #251 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T11 (A01) · GOV-062 (A01) · GOV-124 (A01) · GOV-126 (A01) |
| Où en est la phase ? | phase 0 — 102/130 tâches, reste 22.00 j |
| Le prochain pas | QA-T11 — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #250 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

102/130 tâches terminées · reste 22.00 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 185 | QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05, INT-T22 … (12 affichées sur 185 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 141 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 141 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**25.25 j** sur 25 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → ~~SEC-17~~ (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.5 j, ph 1) → DM-12 (0.5 j, ph 1) → SEC-11 (1 j, ph 1) → SEC-12 (1.5 j, ph 1) → SEC-14 (1 j, ph 1) → SEC-15 (1 j, ph 1) → DM-41 (1.25 j, ph 1) → SEC-41 (1.25 j, ph 1) → DM-43 (1 j, ph 1) → UX-P1-07 (1.5 j, ph 1) → QA-T16 (1 j, ph 1) → QA-T40 (1.5 j, ph 1)

Reste sur ce chemin : **15.00 j**.

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
| 1 | #242 — feat(JUR-T34): la politique de confidentialite de l'espace, tiree du registre de l'article 30 et acceptee a la premiere connexion | `t/jur-t34` | un conflit avec `main` — à résoudre avant tout |
| 2 | #250 — feat(GOV-126): le temoin d'une garde vaut la garde, tests de gouvernance, securite et integration a deux lentilles | `t/gov-126` | un conflit avec `main` — à résoudre avant tout |
| 3 | #251 — chore(GOV-012): registre rattrape, HT encaisse tranche par Williams, paths du lot A et de JUR-T29, GOV-125 versee | `t/registre-rattrapage-13` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T11 — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract | A01 | #243 | `a_faire` |
| GOV-062 — L'outillage qui execute la porte A n'est pas garde : configuration du gestionnaire, correctifs, actions tierces | A01 | #240 | `a_faire` |
| GOV-124 — Une seule lentille pour une PR sans risque, derivee par risqueDeLaPr ; deux pour tout le reste et dans le doute | A01 | #247 | `a_faire` |
| GOV-126 — Le temoin d'une garde vaut la garde : les tests de gouvernance, de securite et d'integration restent a deux lentilles | A01 | #249 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre · `docs/adr/0026-une-lentille-pour-une-pr-sans-risque.md` — partners/ADR-0026 — Une lentille pour une PR sans risque, deux pour tout le reste et dans le doute

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T11** — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract (1 j) : 15 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `d13c426` (2026-09-29T20:09:09+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #250 — 2026-09-29 — feat(GOV-126): le temoin d'une garde vaut la garde, tests de gouvernance, securite et integration a deux lentilles

**Fait.** Les tests de gouvernance, de sécurité et d'intégration restent à deux lentilles : une PR
qui ne toucherait que le témoin d'une garde ne peut plus l'affaiblir sous une seule relecture.

**Reste.** Aucune PR n'a encore été fusionnée à une seule lentille : la règle entre en usage avec
cette fermeture.

**Appris.** Un témoin fait partie de la garde qu'il prouve : l'autoriser à une lentille, c'était
autoriser la garde elle-même par un détour.

### PR #248 — 2026-09-29 — feat(GOV-124): une lentille pour une PR sans risque, derivee et fermee, deux pour tout le reste

**Fait.** Une PR de documentation, de tests ou d'outillage des vues, en zone gouvernance ou
qualité, n'exige plus que la lentille exactitude. Le classement est dérivé par le calcul du risque,
jamais déclaré, et tout ce qu'il ne sait pas lire vaut deux lentilles.

**Reste.** L'architecte accepte l'ADR 0026. Aucune dérivation ne lit l'intention d'un texte : la
limite est écrite dans l'ADR.

**Appris.** Une liste d'autorisation doit exclure ce qui nourrit son propre calcul : sans cela, une
PR relue par une seule lentille aurait pu ramener à une lentille toutes les PR suivantes d'une tâche.

### PR #246 — 2026-09-29 — chore(GOV-012): GOV-123 et GOV-124 versees, exception au gel decidee par Williams

**Fait.** Deux tâches versées, en exception au gel décidée par Williams. GOV-123 sort les vues
dérivées des PR et les rend sur main après chaque fusion. GOV-124 ramène à une lentille la
relecture d'une PR que le risque dérivé classe ordinaire.

**Reste.** Les deux tâches à coder, en priorité. INT-T26 attend la fusion de sa dépendance
INT-T27-A pour être close.

**Appris.** Une clôture se juge avec ses dépendances : une tâche livrée par une PR fusionnée
reste ouverte tant que sa dépendance ne l'est pas, sinon le registre ment sur l'ordre.

… 3 entrée(s) affichée(s) sur 108 ; les 105 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

