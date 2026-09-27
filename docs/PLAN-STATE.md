# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `a006447` — 2026-09-27T04:23:08+02:00 |
| Qu’est-ce qui est en vol ? | 1. #158 (un contrôle requis rouge ou une revue manquante) · 2. #169 (un contrôle requis rouge ou une revue manquante) · 3. #82 (un conflit avec `main`) · 4. #165 (un conflit avec `main`) · 5. #168 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 47/116 tâches, reste 53.10 j |
| Le prochain pas | SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 4 question(s) pour Will |
| Dernière entrée de journal | PR #168 — 2026-09-27 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

47/116 tâches terminées · reste 53.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 202 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 86 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **12.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W9
- W6
- W12
- W11

## Hypothèses par défaut appliquées

64 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #158 — chore(GOV-053): lot L0-06 — PLAN-STATE à la ligne, rubriques dues, lecteur unique, forme des chemins | `t/lot-l0-06` | un contrôle requis rouge ou une revue manquante |
| 2 | #169 — feat(INT-T01c): contrat v2 — onze types, charges fermées, route des coordonnées du candidat | `t/int-t01c` | un contrôle requis rouge ou une revue manquante |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 4 | #165 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte | `t/lot-l0-07` | un conflit avec `main` — à résoudre avant tout |
| 5 | #168 — chore(GOV-045): lot L0-08 — refus nommés, clé double, schema/paths, attestation, occurrences | `t/lot-l0-08` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **45 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-06, SEC-07, SEC-04, INT-T10, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091, GOV-101 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 35 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `a006447` (2026-09-27T04:23:08+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #168 — 2026-09-27 — chore(GOV-045): lot L0-08 — refus nommés, clé double, schema/paths, attestation, occurrences

**Fait.** GOV-045 porte la PR, et GOV-054, GOV-072, GOV-093, GOV-042 et GOV-074 sont dans son champ
`Lot:`. Le cliquet des refus nomme désormais chaque sortie déclarée : portée, conditions, argument,
figés dans `REFUS_NOMMES`, et une mutation retire les sorties une à une pour vérifier que chacune
est tuée par son nom. Il compte aussi la sortie différée : les trois de `scripts/plan-state/build.ts`
sont déclarées. `gov:requirements` lit le texte du registre et refuse une clé écrite deux fois, ou un
registre illisible, en nommant la clé ou la position. `gov:tasks` confronte le champ `schema` aux
`paths` et imprime la réciproque. L'attestation s'étend aux tâches de ce dépôt : `lot:cloture` la
pose, et `--rattraper-attestations` lit le passé dans `origin/main`, avec un passif déclaré de huit
tâches. Les exemptions de `gov:attributions` portent sur une occurrence, et la minuscule comme le
trait d'union insécable sont vus.

**Reste.** Deux écritures de registre réservées conditionnent la porte A : l'attestation des
tâches déjà livrées dans `docs/tasks.json`, posée par le mode `--rattraper-attestations` de
`scripts/lot/cloture.ts` et à relancer après toute fusion de `main`, et l'entrée de
`scripts/gates/registre-des-refus.ts` dans `docs/gates.json`. Deux livrables relèvent de l'outillage
hors dépôt : rendre le champ `schema` écrivable (GOV-093, livrable 5) et réparer l'écrivain du
registre des exigences (GOV-072).

**Appris.** Une exemption figée qui recopie l'identifiant d'une gate peut tomber sous
`securite:rate-famille` : l'identifiant `partners:webhook:idempotent` porte un préfixe de famille de
compteurs, et toute chaîne de `scripts/` qui le contient est refusée. La clé figée d'une chaîne de
`docs/gates.json` porte donc le script jugé et le champ, jamais l'identifiant de la gate. De son
côté, `pnpm vues:fusion` a laissé une fusion EN COURS (MERGE_HEAD présent) après avoir annoncé
« fusion abandonnée, rien commité » quand le rendu de `docs/TASKS.md` refusait un backlog fautif.

### PR #166 — 2026-09-27 — chore(GOV-012): registre rattrape, quatre taches livrees par des PR fusionnees passent fusionnee

**Fait.** Onze tâches livrées par des PR fusionnées portaient encore `a_faire`. Quatre passent `fusionnee` par `reclasser.mjs` : GOV-101 (PR 140), SEC-04 (PR 148), SEC-06 et INT-T10 (PR 145, lot L0-05). Pour chacune, la revendication est constatée sur son issue déjà ouverte (137, 149, 146, 147), puis la livraison sur la forge, jamais à la main. Chaque couple a été confronté à la main au titre ou au champ `Lot:` de sa PR. La phase 0 passe de 43 à 47 tâches terminées sur 116, et le prochain pas quitte SEC-04, déjà livrée, pour SEC-17.

**Reste.** Les six tâches du lot de la PR 114 restent `a_faire`, et cette fois le refus est joué : le verbe rend `branche_de_la_forge_refusee` sur `t/lot-L0-02`, avec ou sans `--branche-divergente`. Aucune issue n'a été ouverte pour les cinq tâches de ce lot qui n'en ont pas. GOV-063 reste `a_faire` : sa dépendance GOV-061 ne l'est pas encore. Décision à prendre pour le lot 114 : l'outil, ou le schéma.

**Appris.** `--branche-divergente` ne lève qu'une divergence entre la tête de PR et une branche déjà portée par la tâche. Il ne permet pas d'écrire une tête hors motif sur une tâche qui n'a pas de branche : pour ces tâches, aucune voie ne mène à `fusionnee`. Et `--fusionnee` ne regarde pas les dépendances. Joué sur GOV-063, il écrit `fusionnee` avec exit 0 ; seule la garde `gov:tasks` refuse ensuite, en `dep_non_livree`. Les deux gestes ont été défaits avant les écritures légitimes, avec un sha256 identique à celui d'`origin/main`.

### PR #148 — 2026-09-26 — feat(SEC-04): sessions revocables en base, sessionVersion tenue par la base, relevement

**Fait.** La session de l'espace apporteur est révocable. La consommation d'un lien pose enfin le cookie `__Host-partners-session` (HttpOnly, Secure, SameSite=Lax, Path=/, 30 jours dérivés de `DUREES_AUTH`). `exigerSession` relit en base, à chaque appel, la session, la version et le statut de l'apporteur, et nomme un motif fermé ; `exigerSessionRelevee` exige un lien consommé depuis moins de 10 minutes par la session COURANTE. La base tient `sessionVersion` : le déclencheur `apporteurs_version_de_session` incrémente d'un cran à la résiliation et au changement d'empreinte de courriel, jamais à la suspension, et refuse toute descente ; chaque session ouverte copie la version de son apporteur ; une révocation est définitive. La migration `20260926100000_sessions_revocables` pose aussi les coordonnées chiffrées de l'apporteur (nom, prénom, téléphone et `phone_hash` non unique), l'acceptation de la politique de confidentialité, le code et ses essais sur `liens_magiques`, et la table `changements_courriel` ; module du semeur `prisma/seed/05-sessions.ts`. Mutation : 100 pour cent, 103 mutants sur 103.

**Reste.** Appeler `exigerSession` depuis chaque page et action de l'espace, et effacer le cookie sur refus : SEC-05. Le déclencheur du changement de coordonnée bancaire : SEC-22, avec sa table. L'effet différé du changement de courriel et l'annulation des liens en vol vers l'ancienne adresse : UX-P1-09. La session en lecture seule après résiliation : SEC-19. Les chemins de SEC-04 attendent quatre ajouts au registre, nommés dans le corps de la PR, et `G-SEC-REVOCATION.preuveRouge` reste à poser.

**Appris.** Stryker laisse survivre un mutant STATIQUE : une constante fléchée de module (`const refus = (motif) => ...`) est évaluée au chargement, avant toute activation de mutant, et `() => undefined` y survit alors que chaque test qui l'appelle rougirait. Une déclaration de fonction est évaluée à l'appel : même code, mutant tué. Et Prisma ne rend que la CLÉ d'une unicité violée, jamais le nom de l'index, même en SQL brut par `$executeRawUnsafe` : pour qu'un témoin nomme un index unique partiel, un bloc `DO` relève `CONSTRAINT_NAME` par `GET STACKED DIAGNOSTICS` et le relance dans son message. Les messages des `RAISE EXCEPTION` et des CHECK, eux, traversent.

… 65 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

