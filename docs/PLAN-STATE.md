# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `bedbaf7f` — 2026-09-30T02:50:29+02:00 |
| Qu’est-ce qui est en vol ? | 1. #263 (un contrôle requis rouge ou une revue manquante) · 2. #268 (un contrôle requis rouge ou une revue manquante) · 3. #272 (un contrôle requis rouge ou une revue manquante) · 4. #280 (un contrôle requis rouge ou une revue manquante) · 5. #281 (un contrôle requis rouge ou une revue manquante) · 6. #262 (un conflit avec `main`) · 7. #275 (un conflit avec `main`) |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase 0 — 121/134 tâches, reste 9.25 j |
| Le prochain pas | QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #281 — 2026-09-30 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

121/134 tâches terminées · reste 9.25 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 171 | QA-T06, QA-T12, QA-T13, INT-T03, INT-T22, QA-T20, JUR-T29, DM-07, DM-08, DM-24, DM-25, INT-T07-P … (12 affichées sur 171 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 160 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 160 — liste complète : `docs/TASKS.md`) |
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
| 2 | #268 — feat(QA-T34): la plateforme tire sha-7 apres publier, un seul producteur, l'atterrissage lu sur x-partners-build-sha | `t/qa-t34` | un contrôle requis rouge ou une revue manquante |
| 3 | #272 — feat(QA-T50): base, cache et application crees s'ils manquent, variables posees depuis les secrets, aucune valeur imprimee | `t/qa-t50` | un contrôle requis rouge ou une revue manquante |
| 4 | #280 — feat(QA-T12): sauvegarde chiffree cote client, exercice de restauration mensuel sur un Postgres ephemere, fraicheur nocturne | `t/qa-t12` | un contrôle requis rouge ou une revue manquante |
| 5 | #281 — feat(QA-T06): preview par PR sous six conditions, semeur deterministe verifie sur deux bases, plafond de deux | `t/qa-t06` | un contrôle requis rouge ou une revue manquante |
| 6 | #262 — feat(GOV-116): le lot dedie du gardien-spec, procedure exacte lancee par Williams, reglages rendus depuis le projet | `t/gov-116` | un conflit avec `main` — à résoudre avant tout |
| 7 | #275 — feat(GOV-123): les vues derivees sortent de git et se rendent a la volee, fin des conflits de vues entre PR | `t/gov-123-vues` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-30 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T06** — Preview par PR sur Coolify, base éphémère, seed déterministe (1 j) : 9 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `bedbaf7f` (2026-09-30T02:50:29+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #281 — 2026-09-30 — feat(QA-T06): preview par PR sous six conditions, semeur deterministe verifie sur deux bases, plafond de deux

**Fait.** Le semeur exécute les modules de semis dans l'ordre de leur préfixe, avec un instant injecté,
des identifiants dérivés d'un espace de noms fixe et les clés de l'environnement ; sa garde sème deux
bases neuves et les compare table par table, colonnes chiffrées déchiffrées. Chaque PR du dépôt reçoit
une preview isolée : image publiée dans un paquet distinct de celui de production, déploiement par un
job qui n'exécute aucun code de la PR, deux previews au plus, destruction complète à la fermeture. Le
point d'entrée sème la preview au démarrage, et refuse de démarrer si un semis est demandé ailleurs.

**Reste.** L'exercice réel attend le jeton de la plateforme réservé aux previews et son domaine.
L'effacement des previews de plus de quarante-huit heures n'est pas fait : la plateforme ne documente
aucune date de création. Les tests de bout en bout et le balayage de sécurité contre la preview
attendent une preview réelle. Une PR en attente n'est pas relancée d'office quand une place se libère.

**Appris.** Le chiffrement des données personnelles tire un vecteur aléatoire : deux semis identiques
donnent des octets chiffrés différents. Une garde de déterminisme qui compare les octets rougit à tort,
et une garde qui les ignore laisse passer un clair tiré au hasard : il faut déchiffrer avant de comparer.

### PR #279 — 2026-09-30 — chore(GOV-012): registre rattrape, INT-T04 et INT-T05 closes par le passif, QA-T13 decoupee, paths de QA-T06 et JUR-T29

**Fait.** Cinq clôtures, dont INT-T04 et INT-T05 par le passif déclaré. QA-T13 est découpée : le
socle et ses trois runbooks exercés avant la fin de la Phase 0, les runbooks d'argent à QA-T25.
JUR-T29 déclare les fichiers réels de sa PR. Les dettes non bloquantes sont rangées dans LECONS.

**Reste.** La clôture de JUR-T29 après la fusion et la mise en production de axion-ia #1232.

**Appris.** Une clôture écrite sur une base qui ne porte pas la revendication de la tâche se perd
à la fusion du registre : on clôt sur la base à jour, jamais avant.

### PR #278 — 2026-09-29 — feat(GOV-128): le passif de la declaration lit la ligne Lot: du squash immuable, deux entrees pour axion-ia 1228

**Fait.** Le passif déclaré de la déclaration sait lire la ligne Lot: du message d'écrasement
immuable, derrière une première ligne conforme. Deux entrées l'utilisent, INT-T04 et INT-T05, livrées
par axion-ia #1228 et en production.

**Reste.** Le rattrapage qui clôt INT-T04 et INT-T05.

**Appris.** Un corps de squash enrichi d'une seule phrase suffit à ne plus rien déclarer : la
consigne de fusion côté axion-ia est désormais un corps réduit à la seule ligne Lot:.

… 3 entrée(s) affichée(s) sur 121 ; les 118 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

