# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `9620e4d` — 2026-09-27T06:30:49+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (rien) · 2. #165 (un contrôle requis rouge ou une revue manquante) · 3. #175 (un contrôle requis rouge ou une revue manquante) · 4. #168 (état `UNKNOWN`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 47/116 tâches, reste 53.10 j |
| Le prochain pas | fusionner #82, puis SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #175 — 2026-09-27 |

**Ce qu’on tape maintenant.** `gh pr view 82 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

47/116 tâches terminées · reste 53.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 202 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … (12 affichées sur 202 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 86 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 86 — liste complète : `docs/TASKS.md`) |
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

Aucune : toutes les décisions dont la phase courante dépend sont codables dans `docs/DECISIONS.md` — tranchées, ou portées par une hypothèse par défaut.

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | rien — fusionnable maintenant |
| 2 | #165 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte | `t/lot-l0-07` | un contrôle requis rouge ou une revue manquante |
| 3 | #175 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal | `t/lot-l0-09` | un contrôle requis rouge ou une revue manquante |
| 4 | #168 — chore(GOV-045): lot L0-08 — refus nommés, clé double, schema/paths, attestation, occurrences | `t/lot-l0-08` | état `UNKNOWN` — à qualifier à la main |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

## Décisions du jour

`docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md` — partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema · `docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition · `docs/adr/0023-route-des-coordonnees-de-candidature.md` — partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #82** — elle est en tête de file et ne bloque sur rien.

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 35 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `9620e4d` (2026-09-27T06:30:49+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #175 — 2026-09-27 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal

**Fait.** Quatre tâches de la phase 0. GOV-083 : une entrée du registre des gates dont le script manque
sur le disque est triée (autre dépôt, promise, fautive) au lieu d'être écartée en silence ; la fautive
rougit `gate_sans_script`, et les cinq existantes sont déclarées une par une au passif, avec leur motif.
GOV-061 : chaque étape du job `gate-a` est confrontée à un constat figé, présente, active et effective,
et une garde citée dans un seul commentaire du workflow ne passe plus pour appelée. GOV-094 : le banc
du corps publié exige un témoin par CAUSE, et le compte des causes se dérive des sites qui les émettent.
GOV-073 : une seule grammaire de journal, importée par ses quatre lecteurs, avec un refus commun.

**Reste.** GOV-085 n'est pas livrée : GOV-082, dont elle dépend, est encore à faire. Les cinq entrées
fautives de `docs/gates.json` sont à corriger par le gardien de la spécification ; chaque correction
fera rougir sa ligne de passif, qu'il faudra retirer. Seize familles à plusieurs sites, nommées par le
balayage de GOV-094, attendent la tâche qui les traitera.

**Appris.** Une tâche qui cite le chemin d'une garde dans ses `paths` ne la promet pas : elle peut
aussi bien la retoucher. Seul le champ `tache` de l'entrée du registre dit qui l'écrira. Autre fait :
l'analyseur YAML que Prettier embarque rend les commentaires comme des nœuds, avec leur position.
Retirer les commentaires d'un workflow ne demande donc aucun découpage maison.

### PR #169 — 2026-09-27 — feat(INT-T01c): contrat v2 — onze types, charges fermées, route des coordonnées du candidat

**Fait.** Le contrat d'événements passe en `schema_version` 2 : `TYPES_EVENEMENT` fait onze, les quatre types entrants en fin de liste, et l'enum `type_evenement_recu` les reçoit par une migration additive (`20260927000300`). Les onze charges sont fermées dans `packages/contracts/payloads.ts` et confrontées clé pour clé, dans les deux sens, à la fixture du producteur réel copiée sous `tests/fixtures/axionia/fixtures-producteur.v1.json`. La frontière porte une exemption nommée, par chemin, de `payload.parrainCodeCapture` sur la candidature seulement ; `packages/contracts/api.ts` publie, sous l'empreinte, le schéma de la route des coordonnées du candidat (partners/ADR-0023). Empreinte `8b0b09a...` → `e8ce08f...`.

**Reste.** Le lockstep du registre : textes de REQ-INT-004 (onze types, `schema_version` 2) et REQ-QA-007 (trois API), deux titres de test promis par INT-T01a, les `paths` d'INT-T01c, puis les vues ; REQ-DM-018 écrit encore l'ancien nom du HT encaissé. Côté axionia, dans la même fenêtre (INT-T05, INT-T22) : copie de `contracts.v2.json`, émission des quatre types, renommage du HT encaissé en `montantHtCents`, fixtures régénérées en v2, exemption par chemin ; la route elle-même (INT-T27-A) et son client (INT-T26). Le récepteur ne juge pas encore les charges fermées : le Zod généré ne projette que l'enveloppe.

**Appris.** Un nom d'événement qui ENTRE au contrat devient interdit en clair partout ailleurs : `gov:termes-interdits` refuse un nom VALIDE écrit hors de `packages/contracts`, commentaires `.ts` compris, alors qu'il tolérait le même nom tant qu'il était hors nomenclature — ajouter un type rougit donc des fichiers que le diff du contrat ne touche pas (ici `src/domain/apporteur/snapshot-candidature.ts`). Et le producteur v1 émettait un champ (`paiement.recu`) sous un nom que le glossaire interdit sec : fermer une charge fidèlement au producteur peut buter sur le glossaire, qui prime ; le renommage se nomme alors dans le test, pas dans la fixture.

### PR #166 — 2026-09-27 — chore(GOV-012): registre rattrape, quatre taches livrees par des PR fusionnees passent fusionnee

**Fait.** Onze tâches livrées par des PR fusionnées portaient encore `a_faire`. Quatre passent `fusionnee` par `reclasser.mjs` : GOV-101 (PR 140), SEC-04 (PR 148), SEC-06 et INT-T10 (PR 145, lot L0-05). Pour chacune, la revendication est constatée sur son issue déjà ouverte (137, 149, 146, 147), puis la livraison sur la forge, jamais à la main. Chaque couple a été confronté à la main au titre ou au champ `Lot:` de sa PR. La phase 0 passe de 43 à 47 tâches terminées sur 116, et le prochain pas quitte SEC-04, déjà livrée, pour SEC-17.

**Reste.** Les six tâches du lot de la PR 114 restent `a_faire`, et cette fois le refus est joué : le verbe rend `branche_de_la_forge_refusee` sur `t/lot-L0-02`, avec ou sans `--branche-divergente`. Aucune issue n'a été ouverte pour les cinq tâches de ce lot qui n'en ont pas. GOV-063 reste `a_faire` : sa dépendance GOV-061 ne l'est pas encore. Décision à prendre pour le lot 114 : l'outil, ou le schéma.

**Appris.** `--branche-divergente` ne lève qu'une divergence entre la tête de PR et une branche déjà portée par la tâche. Il ne permet pas d'écrire une tête hors motif sur une tâche qui n'a pas de branche : pour ces tâches, aucune voie ne mène à `fusionnee`. Et `--fusionnee` ne regarde pas les dépendances. Joué sur GOV-063, il écrit `fusionnee` avec exit 0 ; seule la garde `gov:tasks` refuse ensuite, en `dep_non_livree`. Les deux gestes ont été défaits avant les écritures légitimes, avec un sha256 identique à celui d'`origin/main`.

… 3 entrée(s) affichée(s) sur 70 ; les 67 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

