# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `0db2bca0` — 2026-09-30T00:01:49+02:00 |
| Qu’est-ce qui est en vol ? | 1. #263 (un contrôle requis rouge ou une revue manquante) · 2. #267 (un contrôle requis rouge ou une revue manquante) · 3. #268 (un contrôle requis rouge ou une revue manquante) · 4. #271 (un contrôle requis rouge ou une revue manquante) · 5. #272 (un contrôle requis rouge ou une revue manquante) · 6. #262 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-117 (A01) |
| Où en est la phase ? | phase 0 — 116/133 tâches, reste 13.00 j |
| Le prochain pas | QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #271 — 2026-09-30 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

116/133 tâches terminées · reste 13.00 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 175 | QA-T06, QA-T12, QA-T13, INT-T03, INT-T04, INT-T05, INT-T22, QA-T20, JUR-T29, DM-07, DM-08, DM-24 … (12 affichées sur 175 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 155 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 155 — liste complète : `docs/TASKS.md`) |
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
| 1 | #263 — feat(QA-T20): le poids charge par route se lit dans les manifestes de Next 16, zero octet est une faute | `t/qa-t20` | un contrôle requis rouge ou une revue manquante |
| 2 | #267 — fix(GOV-109): la garde lexicale evalue toute expression JSX constante comme React la rend | `t/gov-109` | un contrôle requis rouge ou une revue manquante |
| 3 | #268 — feat(QA-T34): la plateforme tire sha-7 apres publier, un seul producteur, l'atterrissage lu sur x-partners-build-sha | `t/qa-t34` | un contrôle requis rouge ou une revue manquante |
| 4 | #271 — chore(GOV-012): registre rattrape, JUR-T03 close, chiffrement client des sauvegardes, paths de QA-T12 et JUR-T29 | `t/registre-rattrapage-16` | un contrôle requis rouge ou une revue manquante |
| 5 | #272 — feat(QA-T50): base, cache et application crees s'ils manquent, variables posees depuis les secrets, aucune valeur imprimee | `t/qa-t50` | un contrôle requis rouge ou une revue manquante |
| 6 | #262 — feat(GOV-116): le lot dedie du gardien-spec, procedure exacte lancee par Williams, reglages rendus depuis le projet | `t/gov-116` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-117 — L'outil d'écriture du registre écrit reqs, hyp et zone d'une tâche existante, validés contre le schéma, les REQ et les HYP existantes, et journalisés | A01 | #258 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-30 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T06** — Preview par PR sur Coolify, base éphémère, seed déterministe (1 j) : 13 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `0db2bca0` (2026-09-30T00:01:49+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #271 — 2026-09-30 — chore(GOV-012): registre rattrape, JUR-T03 close, chiffrement client des sauvegardes, paths de QA-T12 et JUR-T29

**Fait.** Seizième rattrapage. JUR-T03 est close après vérification de sa mise en production. Les
sauvegardes de Partners devront être chiffrées côté client avant la première donnée réelle. Les
chemins de QA-T12 et de JUR-T29 suivent ce que leurs auteurs ont mesuré.

**Reste.** La levée de l'exception « 500 euros nu » attend la confirmation de Williams.

**Appris.** Une condition de mise en service écrite dans un runbook seul se perd : écrite dans
l'acceptance, elle a un témoin et bloque réellement.

### PR #261 — 2026-09-29 — chore(GOV-012): registre rattrape, INT-T02 INT-T27-A et INT-T26 closes, REQ-DM-021 amendee, JUR-T36 versee

**Fait.** Quinzième rattrapage. INT-T02 se clôt par l'unique entrée du passif déclaré, et INT-T27-A
et INT-T26, qui en dépendaient, avec elle. REQ-DM-021 suit l'arbitrage sur l'ordre du bénéficiaire.
JUR-T36 porte la dette bloquante de mise en service relevée par la lentille juriste.

**Reste.** La Phase 0 compte 114 tâches livrées sur 132 ; le reste se livre dans les PR ouvertes.

**Appris.** Trois tâches livrées et en production restaient ouvertes à cause d'une seule déclaration
non conforme : une dépendance bloquée gèle toute la chaîne qui la suit.

### PR #259 — 2026-09-29 — feat(GOV-117): l'outil du registre ecrit reqs, hyp et zone d'une tache, valides contre le schema et les registres

**Fait.** Les outils hors dépôt savent écrire les exigences, les hypothèses et la zone d'une tâche,
avec sept refus nommés et les exigences redérivées après chaque écriture. Un témoin du dépôt montre
que les gardes prennent une écriture qui passerait sans l'outil.

**Reste.** GOV-115 peut désormais écrire les tâches de W19 dans leurs champs.

**Appris.** Une dérivation copiée dans un seul outil finit par diverger des autres : l'extraire en une
fonction unique a aussi réparé la phase des exigences, que le versement ne dérivait pas.

… 3 entrée(s) affichée(s) sur 117 ; les 114 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

