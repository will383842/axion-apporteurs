# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `dc6cfcb9` — 2026-09-30T00:49:30+02:00 |
| Qu’est-ce qui est en vol ? | 1. #271 (un contrôle requis rouge ou une revue manquante) · 2. #278 (un contrôle requis rouge ou une revue manquante) · 3. #262 (un conflit avec `main`) · 4. #263 (un conflit avec `main`) · 5. #268 (un conflit avec `main`) · 6. #272 (un conflit avec `main`) · 7. #275 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-109 (A01) · GOV-117 (A01) · GOV-128 (A01) |
| Où en est la phase ? | phase 0 — 115/134 tâches, reste 14.50 j |
| Le prochain pas | QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #278 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

115/134 tâches terminées · reste 14.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 177 | QA-T06, QA-T12, QA-T13, INT-T03, INT-T04, INT-T05, INT-T22, JUR-T03, QA-T20, JUR-T29, DM-07, DM-08 … (12 affichées sur 177 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 154 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 154 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**26.00 j** sur 26 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → ~~SEC-17~~ (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.5 j, ph 1) → DM-12 (0.5 j, ph 1) → SEC-11 (1 j, ph 1) → SEC-12 (1.5 j, ph 1) → SEC-14 (1 j, ph 1) → SEC-15 (1 j, ph 1) → DM-41 (1.25 j, ph 1) → SEC-41 (1.25 j, ph 1) → DM-13 (1.25 j, ph 1) → UX-P1-01 (1 j, ph 1) → UX-P1-08 (1 j, ph 1) → UX-P3-02 (1 j, ph 3) → UX-P3-12 (1.5 j, ph 3)

Reste sur ce chemin : **15.75 j**.

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
| 1 | #271 — chore(GOV-012): registre rattrape, JUR-T03 close, chiffrement client des sauvegardes, paths de QA-T12 et JUR-T29 | `t/registre-rattrapage-16` | un contrôle requis rouge ou une revue manquante |
| 2 | #278 — feat(GOV-128): le passif de la declaration lit la ligne Lot: du squash immuable, deux entrees pour axion-ia 1228 | `t/gov-128` | un contrôle requis rouge ou une revue manquante |
| 3 | #262 — feat(GOV-116): le lot dedie du gardien-spec, procedure exacte lancee par Williams, reglages rendus depuis le projet | `t/gov-116` | un conflit avec `main` — à résoudre avant tout |
| 4 | #263 — feat(QA-T20): le poids charge par route se lit dans les manifestes de Next 16, zero octet est une faute | `t/qa-t20` | un conflit avec `main` — à résoudre avant tout |
| 5 | #268 — feat(QA-T34): la plateforme tire sha-7 apres publier, un seul producteur, l'atterrissage lu sur x-partners-build-sha | `t/qa-t34` | un conflit avec `main` — à résoudre avant tout |
| 6 | #272 — feat(QA-T50): base, cache et application crees s'ils manquent, variables posees depuis les secrets, aucune valeur imprimee | `t/qa-t50` | un conflit avec `main` — à résoudre avant tout |
| 7 | #275 — feat(GOV-123): les vues derivees sortent de git et se rendent a la volee, fin des conflits de vues entre PR | `t/gov-123-vues` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-109 — La garde lexicale ne s'arrete pas au texte litteral : des expressions constantes de la JSX rendent encore a l'ecran un terme qu'elle ne voit pas | A01 | #266 | `a_faire` |
| GOV-117 — L'outil d'écriture du registre écrit reqs, hyp et zone d'une tâche existante, validés contre le schéma, les REQ et les HYP existantes, et journalisés | A01 | #258 | `a_faire` |
| GOV-128 — Le passif de la declaration lit aussi la ligne Lot: du squash immuable : une PR de lot au corps enrichi se clot sur arbitrage ecrit | A01 | #277 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-30 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T06** — Preview par PR sur Coolify, base éphémère, seed déterministe (1 j) : 14 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `dc6cfcb9` (2026-09-30T00:49:30+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #278 — 2026-09-29 — feat(GOV-128): le passif de la declaration lit la ligne Lot: du squash immuable, deux entrees pour axion-ia 1228

**Fait.** Le passif déclaré de la déclaration sait lire la ligne Lot: du message d'écrasement
immuable, derrière une première ligne conforme. Deux entrées l'utilisent, INT-T04 et INT-T05, livrées
par axion-ia #1228 et en production.

**Reste.** Le rattrapage qui clôt INT-T04 et INT-T05.

**Appris.** Un corps de squash enrichi d'une seule phrase suffit à ne plus rien déclarer : la
consigne de fusion côté axion-ia est désormais un corps réduit à la seule ligne Lot:.

### PR #267 — 2026-09-29 — fix(GOV-109): la garde lexicale evalue toute expression JSX constante comme React la rend

**Fait.** La garde du lexique évalue désormais la valeur rendue de toute expression JSX constante,
ternaires compris, avec les deux branches jugées, au lieu d'une liste de formes. Ce qu'elle ne peut
pas évaluer est écrit dans son en-tête.

**Reste.** Les expressions non constantes, et ce qu'un composant fait de ses enfants, restent hors
de la garde : c'est la relecture qui les voit.

**Appris.** Une liste de formes interdites se contourne par la forme suivante : évaluer la valeur
rendue ferme toute la famille d'un coup.

### PR #261 — 2026-09-29 — chore(GOV-012): registre rattrape, INT-T02 INT-T27-A et INT-T26 closes, REQ-DM-021 amendee, JUR-T36 versee

**Fait.** Quinzième rattrapage. INT-T02 se clôt par l'unique entrée du passif déclaré, et INT-T27-A
et INT-T26, qui en dépendaient, avec elle. REQ-DM-021 suit l'arbitrage sur l'ordre du bénéficiaire.
JUR-T36 porte la dette bloquante de mise en service relevée par la lentille juriste.

**Reste.** La Phase 0 compte 114 tâches livrées sur 132 ; le reste se livre dans les PR ouvertes.

**Appris.** Trois tâches livrées et en production restaient ouvertes à cause d'une seule déclaration
non conforme : une dépendance bloquée gèle toute la chaîne qui la suit.

… 3 entrée(s) affichée(s) sur 118 ; les 115 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

