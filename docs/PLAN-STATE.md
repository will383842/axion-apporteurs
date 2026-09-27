# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `aca324d` — 2026-09-27T10:54:47+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (état `UNKNOWN`) · 2. #165 (état `UNKNOWN`) · 3. #175 (état `UNKNOWN`) · 4. #180 (état `UNKNOWN`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 59/116 tâches, reste 45.35 j |
| Le prochain pas | SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #176 — 2026-09-27 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

59/116 tâches terminées · reste 45.35 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 190 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … (12 affichées sur 190 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 98 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 98 — liste complète : `docs/TASKS.md`) |
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
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | état `UNKNOWN` — à qualifier à la main |
| 2 | #165 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte | `t/lot-l0-07` | état `UNKNOWN` — à qualifier à la main |
| 3 | #175 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal | `t/lot-l0-09` | état `UNKNOWN` — à qualifier à la main |
| 4 | #180 — feat(JUR-T02): lot L0-10 — SSOT des délais du contrat, contrat sobre figé, alertes Telegram sans PII | `t/lot-l0-10` | état `UNKNOWN` — à qualifier à la main |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md` — partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema · `docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition · `docs/adr/0023-route-des-coordonnees-de-candidature.md` — partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 27 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `aca324d` (2026-09-27T10:54:47+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #176 — 2026-09-27 — chore(GOV-012): registre rattrape, douze taches livrees par des PR fusionnees passent fusionnee

**Fait.** Treize tâches livrées par les PR 158, 169 et 168 portaient encore `a_faire`. Douze passent `fusionnee` par `reclasser.mjs` : GOV-053, GOV-055, GOV-060, GOV-079, GOV-050 et GOV-051 (PR 158, lot L0-06), INT-T01c (PR 169), GOV-045, GOV-054, GOV-072, GOV-093 et GOV-042 (PR 168, lot L0-08). Chaque revendication est constatée sur son issue déjà ouverte (150 à 155, 167, 159 à 163), puis la livraison sur la forge. Chaque attestation est lue dans `origin/main` par `cloture.ts --rattraper-attestations`. La phase 0 passe de 47 à 59 tâches terminées sur 116, reste 45,35 jours.

**Reste.** GOV-074 reste `a_faire` : la PR 168 écrit qu'elle ne livre pas toute son acceptance (comparaison par préfixe et exemptions sans second producteur non identifiées une à une, `DETTE_GABARIT_LIVREE` au grain du site). Décision à prendre : une tâche fille pour le reste, ou une acceptance rétrécie par avenant. Les PR 114 et 102 restent dans l'état écrit par la PR 166.

**Appris.** Depuis GOV-042, `--fusionnee` ne suffit plus : `reclasser.mjs` n'écrit pas l'attestation, et `gov:tasks` rougit sans elle. Le rattrapage du dépôt la lit dans l'historique, en filtrant le sujet par `(#<pr>)` avant de chercher l'identifiant. Ce filtre est nécessaire : le message de la PR 168 nomme aussi GOV-055, livrée par la PR 158. Sans le filtre, la recherche aurait trouvé deux commits et laissé l'attestation vide.

### PR #175 — 2026-09-27 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal

**Fait.** Quatre tâches de la phase 0. GOV-083 : une entrée du registre des gates dont le script manque
sur le disque est triée (autre dépôt, promise, fautive) au lieu d'être écartée en silence ; la fautive
rougit `gate_sans_script`, et les cinq existantes sont déclarées une par une au passif, avec leur motif.
GOV-061 : chaque étape du job `gate-a` est confrontée à un constat figé, présente, active et effective,
et une garde citée dans un seul commentaire du workflow ne passe plus pour appelée. GOV-094 : le banc
du corps publié exige un témoin par CAUSE, et le compte des causes se dérive des sites qui les émettent.
GOV-073 : une seule grammaire de journal, importée par ses quatre lecteurs, avec un refus commun.
Correctif du 2026-09-27T07:55Z, après un veto de sécurité : le constat de la porte A fige désormais
l'étape entière, le job entier et le workflow hors `jobs`, clé par clé (`porte_a_alteree`), et refuse
deux étapes de même nom (`etape_en_double`) ; une garde n'est plus dite appelée que par une commande
en position de commande, et un script que `package.json` lance ne passe plus pour une promesse.
Correctif du 2026-09-27T08:42Z, après un refus d'exactitude : la lecture des appels découpait la ligne
sans tenir compte des guillemets, et une garde citée dans un `echo`, court-circuitée par `true ||`
ou placée après un `exit` passait pour appelée. Un lexer shell minimal respecte désormais guillemets
et échappements, et ne compte que les commandes atteignables dont le statut compte ; une ligne qu'il
ne sait pas juger n'appelle rien. La configuration pnpm/npm de la racine est figée absente au constat.

**Reste.** GOV-085 n'est pas livrée : GOV-082, dont elle dépend, est encore à faire. Les cinq entrées
fautives de `docs/gates.json` sont à corriger par le gardien de la spécification ; chaque correction
fera rougir sa ligne de passif, qu'il faudra retirer. Seize familles à plusieurs sites, nommées par le
balayage de GOV-094, attendent la tâche qui les traitera. Limite déclarée de la porte A : un `if:`
toujours faux posé sur le job `gate-a` saute aussi l'étape `gov:conventions`, et un job requis
sauté laisse fusionner ; en CI, cette faute n'est vue qu'hors du job (pré-vol, revue). Dettes
relevées par la revue, non traitées ici : dans `gov-entite.ts`, une famille écrite autrement qu'en
littéral est sautée par le balayage des causes, et le compte de sites repose sur la même lecture ;
dans `gov-attributions.ts`, un titre indenté est lu par `gov:etat` ; le point (6) de GOV-094 attend
sa tâche ; GOV-083 et GOV-061 partagent un fichier et ont été composées dans un même lot. La règle
littérale de GOV-083 (1), phase courante égale refus, rougirait dix entrées de phase 0 dont la tâche
porteuse est à faire (`a_faire`) : c'est un avenant d'acceptance à écrire au registre. Hors du job
`gate-a`, rien ne juge qu'une étape s'exécute : une étape de `nightly.yml` sous un `if:` faux
compte encore pour un appel.

**Appris.** Une tâche qui cite le chemin d'une garde dans ses `paths` ne la promet pas : elle peut
aussi bien la retoucher. Seul le champ `tache` de l'entrée du registre dit qui l'écrira. Autre fait :
l'analyseur YAML que Prettier embarque rend les commentaires comme des nœuds, avec leur position.
Retirer les commentaires d'un workflow ne demande donc aucun découpage maison. Et une confrontation
qui ne lit que les clés qu'elle connaît laisse passer toutes les autres : un `shell:` ou un
`with: ref:` changent ce qu'une étape exécute sans changer sa commande. On fige l'objet entier.
Enfin, découper une commande shell par une expression régulière la lit comme un texte, pas comme
une commande : les guillemets, les courts-circuits et l'arrière-plan décident de ce qui s'exécute.

### PR #169 — 2026-09-27 — feat(INT-T01c): contrat v2 — onze types, charges fermées, route des coordonnées du candidat

**Fait.** Le contrat d'événements passe en `schema_version` 2 : `TYPES_EVENEMENT` fait onze, les quatre types entrants en fin de liste, et l'enum `type_evenement_recu` les reçoit par une migration additive (`20260927000300`). Les onze charges sont fermées dans `packages/contracts/payloads.ts` et confrontées clé pour clé, dans les deux sens, à la fixture du producteur réel copiée sous `tests/fixtures/axionia/fixtures-producteur.v1.json`. La frontière porte une exemption nommée, par chemin, de `payload.parrainCodeCapture` sur la candidature seulement ; `packages/contracts/api.ts` publie, sous l'empreinte, le schéma de la route des coordonnées du candidat (partners/ADR-0023). Empreinte `8b0b09a...` → `e8ce08f...`.

**Reste.** Le lockstep du registre : textes de REQ-INT-004 (onze types, `schema_version` 2) et REQ-QA-007 (trois API), deux titres de test promis par INT-T01a, les `paths` d'INT-T01c, puis les vues ; REQ-DM-018 écrit encore l'ancien nom du HT encaissé. Côté axionia, dans la même fenêtre (INT-T05, INT-T22) : copie de `contracts.v2.json`, émission des quatre types, renommage du HT encaissé en `montantHtCents`, fixtures régénérées en v2, exemption par chemin ; la route elle-même (INT-T27-A) et son client (INT-T26). Le récepteur ne juge pas encore les charges fermées : le Zod généré ne projette que l'enveloppe.

**Appris.** Un nom d'événement qui ENTRE au contrat devient interdit en clair partout ailleurs : `gov:termes-interdits` refuse un nom VALIDE écrit hors de `packages/contracts`, commentaires `.ts` compris, alors qu'il tolérait le même nom tant qu'il était hors nomenclature — ajouter un type rougit donc des fichiers que le diff du contrat ne touche pas (ici `src/domain/apporteur/snapshot-candidature.ts`). Et le producteur v1 émettait un champ (`paiement.recu`) sous un nom que le glossaire interdit sec : fermer une charge fidèlement au producteur peut buter sur le glossaire, qui prime ; le renommage se nomme alors dans le test, pas dans la fixture.

… 3 entrée(s) affichée(s) sur 72 ; les 69 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

