# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `a5a8b53` — 2026-09-29T04:32:24+02:00 |
| Qu’est-ce qui est en vol ? | 1. #207 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | GOV-049 (A01) |
| Où en est la phase ? | phase 0 — 91/125 tâches, reste 29.25 j |
| Le prochain pas | QA-T05 — Pipeline GHCR privé → Coolify pull |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #207 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

91/125 tâches terminées · reste 29.25 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 167 | QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05 … (12 affichées sur 167 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 130 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 130 — liste complète : `docs/TASKS.md`) |
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
| 1 | #207 — chore(registre): rattrapage 8 — sept clotures, SEC-05 sensible, trois suites versees | `t/registre-rattrapage-8` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-049 — Une tache en cours sans lot est invisible de TOUTES les gardes, et c'est ce lot qui l'a rencontre | A01 | #196 | `a_faire` |

⚠️ **20 revendication(s) périmée(s)** — QA-T07, SEC-05, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-058, GOV-060, GOV-069, GOV-072, GOV-079, GOV-081, GOV-093, INT-T01c, GOV-106, GOV-107, GOV-108 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T05** — Pipeline GHCR privé → Coolify pull (1 j) : 17 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `a5a8b53` (2026-09-29T04:32:24+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #207 — 2026-09-29 — chore(GOV-012): registre rattrape, sept taches closes, SEC-05 sensible, trois suites versees

**Fait.** Le registre rattrape les PR #200 et #206 : sept tâches closes par `lot:cloture --tache`,
avec l'attestation lue dans le commit de fusion sur la branche par défaut. `SEC-05.sensible` passe
de vide à `rgpd`, relevé par la lentille `exactitude` : la tâche cloisonne des données d'apporteurs.
Trois suites versées `a_faire` : GOV-109 (expressions constantes de la JSX que la garde lexicale ne
voit pas encore), GOV-110 (titre attendu à l'instant de la fusion, pas au moment de la clôture),
GOV-111 (options de lecture, filtres de relation et lignes entières dans le cloisonnement).

**Reste.** Les trois suites sont à revendiquer et à livrer. Le détail des formes de GOV-109 est tenu
hors dépôt jusqu'à son correctif ; aucune acceptance ne les cite.

**Appris.** `poser-champ` n'écrit qu'un champ vide, et un tableau vide n'est pas vide pour lui :
corriger une valeur déjà posée passe par `reecrire-champ`, qui exige un motif consigné.

### PR #206 — 2026-09-29 — chore(GOV-106): lot L0-13 — la garde lexicale juge le rendu, la regle d'arret est ecrite, la cloture confronte le titre

**Fait.** Cinq tâches, un commit chacune. GOV-106 : la garde lexicale juge le texte que la JSX et
le Markdown affichent, par l'arbre syntaxique ; des constructions qui rendaient à l'écran un terme
interdit sans être vues le sont maintenant. GOV-058 : `partners/ADR-0025` écrit la règle d'arrêt
décidée le 2026-09-15, avec ses sources, et dit ce qui n'a pas été retrouvé. GOV-081 : une raison
de dette qui nomme une tâche absente de sa gate rougit (`raison_perimee`). GOV-107 : la première
ligne du message d'écrasement ne déclare que si elle est le titre de la PR suivi de son numéro.
GOV-108 : le journal et la reprise renvoient à RM-15, et l'arbre du journal se lit avec `-z`.

**Reste.** La garde lexicale ne devine pas une valeur qui n'est pas constante, ni ce qu'un
composant rend lui-même ; les homoglyphes restent à juger. `partners/ADR-0025` est proposé :
l'articulation de la règle d'arrêt avec W14 (règle 2) est rendue à Will. Le titre d'une PR reste
modifiable après sa fusion.

**Appris.** Les témoins d'une forme de contournement sont entrés dans le même commit que son
correctif, jamais avant ; ils sont publics depuis la poussée de la branche, puisque le dépôt l'est.
Les formes sont écrites dans le spec, public depuis cette poussée ; ni les messages de commit ni
ce journal ne les énumèrent. La divulgation que porte le spec est jugée par la lentille `securite`.

### PR #200 — 2026-09-28 — feat(SEC-05): lot L0-12 — cloisonnement par apporteur, une grammaire des zones de prose

**Fait.** Deux tâches, un commit chacune. SEC-05 : la couche d'accès `forApporteur` injecte
l'apporteur de la session dans chaque `where`, que l'appelant peut restreindre sans jamais le
remplacer ; elle refuse d'écrire l'identifiant, l'apporteur et les relations, et répond à un
identifiant étranger exactement comme à un identifiant inexistant (404 identique à l'octet). Une
garde statique confronte chaque route et action de l'espace à ses cas d'accès. GOV-069 : une seule
grammaire découpe SQL, Prisma et prose pour la garde des termes interdits, et une construction jamais
refermée est refusée en la nommant.

**Reste.** GOV-049 est sortie du lot : sa clause « une tâche en cours porte un lot » contredisait un témoin livré par GOV-086 (une tâche prise, avec sa branche et sans PR, est en vol), et sa prémisse est tombée avec GOV-057, qui sait clore une tâche seule. Elle reste à faire, à re-arbitrer. Aucune route de l'espace ne reçoit encore d'identifiant de ressource : l'attaque boîte
noire est jouée sur chaque méthode de la couche, et attend les écrans. « Même durée observable » est
prouvée par la structure (une requête au texte identique), pas par une mesure de temps. GOV-069
approche la continuation paresseuse des citations et les blocs HTML.

**Appris.** Une garde de cloisonnement se prouve par ses brèches : sans la couche, la batterie en
relève sept par modèle ; avec elle, zéro, et la ligne de l'apporteur reste lisible et modifiable.

… 3 entrée(s) affichée(s) sur 85 ; les 82 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

