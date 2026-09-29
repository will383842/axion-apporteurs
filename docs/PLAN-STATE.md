# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `8d6d219` — 2026-09-29T22:00:53+02:00 |
| Qu’est-ce qui est en vol ? | 1. #254 (un conflit avec `main`) · 2. #242 (état `UNKNOWN`) |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase 0 — 114/132 tâches, reste 14.25 j |
| Le prochain pas | QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #257 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

114/132 tâches terminées · reste 14.25 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 176 | QA-T06, QA-T12, QA-T13, INT-T03, INT-T04, INT-T05, INT-T22, JUR-T03, QA-T20, JUR-T29, DM-07, DM-08 … (12 affichées sur 176 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 153 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 153 — liste complète : `docs/TASKS.md`) |
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
| 1 | #254 — docs(GOV-017a): W20, questions 18 et 19 tranchees — aucune tacite d'une demande signalee, liberee apres 3 injoignables ou 45 jours | `t/w20-q18-q19` | un conflit avec `main` — à résoudre avant tout |
| 2 | #242 — feat(JUR-T34): la politique de confidentialite de l'espace, tiree du registre de l'article 30 et acceptee a la premiere connexion | `t/jur-t34` | état `UNKNOWN` — à qualifier à la main |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre · `docs/adr/0026-une-lentille-pour-une-pr-sans-risque.md` — partners/ADR-0026 — Une lentille pour une PR sans risque, deux pour tout le reste et dans le doute · `docs/adr/0027-le-motif-de-branche-depend-du-depot-de-la-tache.md` — partners/ADR-0027 — Le motif de branche dépend du dépôt de la tâche

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T06** — Preview par PR sur Coolify, base éphémère, seed déterministe (1 j) : 14 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `8d6d219` (2026-09-29T22:00:53+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #257 — 2026-09-29 — feat(GOV-127): le passif declare de la declaration, une liste fermee a une entree levee sur arbitrage ecrit

**Fait.** La clôture reçoit un passif déclaré de la déclaration : une liste fermée, datée, à une
seule entrée. Elle lève les deux refus pour INT-T02, livrée avant la convention côté axion-ia, et pour
elle seule, parce que sa PR nommait la tâche à l'instant de la fusion.

**Reste.** Le rattrapage qui clôt INT-T02, puis INT-T27-A et INT-T26, livrées et en production.

**Appris.** Une exception se prouve avant de s'écrire : les accords portaient sur une tête antérieure
à la tête fusionnée, et seule la comparaison du patch propre a établi que c'était la même livraison.

### PR #255 — 2026-09-29 — chore(GOV-012): registre rattrape, six taches closes dont DM-03-A livree dans axion-ia, paths de JUR-T03 et JUR-T29

**Fait.** Quatorzième rattrapage. Avec le motif de branche par dépôt, DM-03-A, livrée dans axion-ia et
en production, se clôt enfin, et DM-03-P et DM-04 avec elle. GOV-124, GOV-125 et GOV-126 sont closes.
Les chemins de JUR-T03 et de JUR-T29 sont ceux que la forge et la garde ont mesurés.

**Reste.** INT-T02 : sa PR nomme la tâche, mais sous une forme que la clôture refuse. L'exception
arbitrée demande un outil, GOV-127. INT-T27-A et INT-T26 attendent derrière elle.

**Appris.** Un arbitrage ne suffit pas quand aucun outil ne sait l'écrire : le registre ne s'édite
pas à la main, et l'exception doit elle-même devenir une règle écrite, fermée et testée.

### PR #253 — 2026-09-29 — feat(GOV-125): le motif de branche depend du depot de la tache, une tache axionia se clot sur sa branche

**Fait.** Le motif de branche du registre dépend désormais du dépôt de la tâche. Une tâche d'axion-ia
se clôt sur une branche d'axion-ia, dont seule la forme est jugée ; une tâche de Partners garde les
deux formes fermées. La clôture et l'outil hors dépôt lisent la même règle.

**Reste.** Le rattrapage qui clôt les tâches d'axion-ia livrées et en production, puis celles de
Partners qui en dépendaient.

**Appris.** Un motif fermé qui ne connaît qu'un dépôt bloque en silence tout ce qui se livre dans
l'autre : la dette ne s'est vue qu'au moment de clore une tâche d'argent déjà en production.

… 3 entrée(s) affichée(s) sur 112 ; les 109 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

