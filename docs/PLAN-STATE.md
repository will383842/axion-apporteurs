# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `5552ef6` — 2026-09-26T02:34:56+02:00 |
| Qu’est-ce qui est en vol ? | 1. #134 (un contrôle requis rouge ou une revue manquante) · 2. #82 (un conflit avec `main`) · 3. #130 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 35/111 tâches, reste 57.60 j |
| Le prochain pas | SEC-03 — Lien magique apporteur (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #134 — 2026-09-26 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

35/111 tâches terminées · reste 57.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 209 | JUR-T02, QA-T04, QA-T07, QA-T30, CPL-T22, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 74 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **13.50 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W9
- W6
- DEC-INT-002 — **bloquante (§1 du registre)**
- W12
- W11

## Hypothèses par défaut appliquées

62 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #134 — feat(SEC-03): lien magique apporteur — demande indistincte, consommation unique, empreintes HMAC, tables | `t/sec-03` | un contrôle requis rouge ou une revue manquante |
| 2 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 3 | #130 — feat(QA-T04): lot L0-03 — environnement fail-fast et sondes, red-first, mutation du domaine, harnais a11y | `t/lot-l0-03` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **41 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-07, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-03** — Lien magique apporteur (1 j, **sur le chemin critique**) : 41 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `5552ef6` (2026-09-26T02:34:56+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #134 — 2026-09-26 — feat(SEC-03): lien magique apporteur — demande indistincte, consommation unique, empreintes HMAC, tables

**Fait.** Le noyau du lien magique (`src/server/auth/lien-magique.ts`) répond à la demande sans lire
le compte, limite par empreinte d'adresse réseau et par courriel en refusant sur panne, et consomme
le lien par une écriture conditionnelle unique qui ouvre au plus une session. Seules des empreintes
HMAC-SHA-256 sont stockées, sous `MAGIC_LINK_SECRET` pour le lien et `SESSION_SECRET` pour la
session, chacune dans son domaine et avec son `kid` (partners/ADR-0013, décision 14, dont le vecteur
figé est posé et vu rougir sous mutant). La migration `20260926000000_lien_magique_et_session` crée
`liens_magiques` et `sessions_espace`, leurs CHECK et le déclencheur `liens_magiques_usage_unique` ;
l'adaptateur Prisma des ports est `src/server/auth/lien-magique-depot.ts`. SEC-03 porte la PR.

**Reste.** Le point (4) de l'acceptance, l'écran `/connexion`, n'est pas livré : le dépôt n'a aucune
page, ni `@types/react`, ni `jsx` au `tsconfig.json`, ni layout racine, et le harnais de UX-P0-03
n'existe pas encore. Les ports `trouverApporteur`, `adresseStockee` et `envoyer` n'ont pas
d'adaptateur : `apporteurs` ne porte aucune colonne de courriel et aucune tâche du registre ne la
pose (SEC-08 est fusionnée sans l'avoir fait), ni l'envoi de courriel. Le test en base réelle
`tests/integration/lien-magique.spec.ts` n'a tourné qu'en CI, faute de Docker sur le poste.

**Appris.** La garde `securite:rate-famille` refuse, hors du registre des compteurs, toute chaîne
qui porte un préfixe de famille et tout port nommé `limiter` : un noyau à ports prend un port par
compteur, sans nom de compteur, et seul l'appel direct câblé par l'action nomme le compteur. La
garde `journal:sans-pii` refuse aussi un simple paramètre nommé `evenement` sous `src/`.

### PR #131 — 2026-09-26 — chore(GOV-100): cadrage de SEC-03 et SEC-04 — deux tables au schéma, empreinte HMAC des jetons, statuts qui ouvrent l'espace

**Fait.** Le cadrage de l'architecte du 2026-09-26, pris sur délégation de Will, est inscrit au
registre : SEC-03 et SEC-04 portent `schema: true`, SEC-03 crée `liens_magiques` et
`sessions_espace` dans une même migration et ses `paths` portent la migration et les modules de
durées, de dépôt du lien et d'accès à l'espace ; SEC-04 étendra `sessions_espace`. L'empreinte des
jetons d'authentification est la décision 14 de partners/ADR-0013 (HMAC-SHA-256 sous le secret de
l'usage, domaine séparé, `kid` stocké, pas de double clé pour les liens), et `HYP-SEC03-ACCES`
ouvre l'espace aux statuts `signe` et `suspendu` et le ferme à `candidat`, `retenu`, `vivier`,
`refuse`, `kyc_en_cours` et `pret_a_signer`. Les points (1) et (5) de l'acceptance de SEC-03 le
disent. Sur décision du coordinateur, prise sur délégation de Will, la PR aligne aussi REQ-SEC-001 sur la
décision 14, corrige la ligne `suspendu` du glossaire (accès à l'espace maintenu, nouveaux dépôts
refusés) et passe DM-11 à `schema: true`, dette nommée par la PR 124. Après les deux relectures,
REQ-SEC-003 et le point (2) de SEC-04 ne font plus révoquer les sessions à la suspension, seulement
à la résiliation, au changement de courriel ou d'IBAN et pour motif de sécurité (contrat art. 3.8) ;
`HYP-SEC03-ACCES` devient une liste blanche, `HYP-E1-24` exclut les liens de la double clé, et les
art. 3.7 al. 3 et 12.3 que cite `HYP-SEC03-ACCES` ont leur ancrage dans `CONCORDANCES`. GOV-100
porte la PR. Gardes jouées à 0 : `gov:tasks`, `gov:hypotheses`,
`gov:attributions`, `gov:trace:verifier`, `plan-state:verifier`, `lot:paths:check`,
`gov:identifiants`, `gov:lexique`, `gov:termes-interdits`, `gov:adr`, `gov:requirements`,
`gov:preseance`, `partners:schema:enums`, `gov:etat`, `gov:publication`,
`tests/unit/gouvernance/un-nom-une-garde.spec.ts`, `tests/unit/gouvernance/glossaire-enums.spec.ts`
et `tests/unit/contrat/`.

**Reste.** SEC-03 peut être attribuée sur ce cadrage. L'assertion de la décision 14 (un vecteur
figé d'empreinte de lien) est due par SEC-03, celle de la session par SEC-04 : d'ici là,
partners/ADR-0013 reste `propose`. Le mot « suspension » de REQ-SEC-002 et du point (3) de SEC-03
désigne le refus d'une demande de lien au-delà de la limite de débit, pas le statut `suspendu` :
il ne contredit pas `HYP-SEC03-ACCES`.

**Appris.** Aucun verbe hors dépôt ne savait écrire `schema` dans `docs/tasks.json` : la dette
nommée par la PR 124 pour DM-11 bloquait aussi ce cadrage. Le champ est écrivable depuis ce jour
par `reecrire-champ.mjs`, sa valeur jugée booléenne par le schéma du dépôt ; DM-11 a été corrigée
par le même geste dans cette PR. Et une ligne du registre des décisions qui cite un article du
contrat fait rougir REQ-JUR-003 tant que `CONCORDANCES` ne l'ancre pas : les gardes de gouvernance
sortaient à 0, seule `tests/unit/contrat/` le voyait. Une PR qui écrit `docs/DECISIONS.md` la lance.

### PR #129 — 2026-09-25 — chore(GOV-012): registre rattrape, douze taches livrees par des PR fusionnees passent fusionnee

**Fait.** Quatorze tâches livrées par des PR fusionnées portaient encore `a_faire` : DM-06 (PR 128), SEC-08 (PR 126), GOV-099 (PR 124), GOV-098 (PR 122), GOV-097 (PR 120), GOV-096 (PR 118), GOV-095 (PR 116), GOV-090 (PR 113), GOV-092 (PR 112), GOV-047 (PR 99), JUR-T01 (PR 92), QA-T08 (PR 88), et les deux fusionnées pendant la revue, UX-P0-01 (PR 93) et INT-T09 (PR 91), ajoutées au tour de fusion de main. Elles passent `fusionnee` par `reclasser.mjs`, revendication constatée sur l'issue puis livraison constatée sur la forge, jamais à la main. La phase 0 passe de 21 à 35 tâches terminées sur 110.

**Reste.** Les six tâches du lot de la PR 114 (GOV-082, GOV-046, GOV-048, GOV-076, GOV-078, GOV-086) restent `a_faire` : la branche de tête `t/lot-L0-02` porte une majuscule que le motif du schéma refuse, et cinq d'entre elles n'ont aucune issue. GOV-063 (PR 102) reste `a_faire` : sa dépendance GOV-061 ne l'est pas, et sa clause 2 est ouverte. La moitié datée de l'acceptance de JUR-T01 est portée par JUR-T01b. Le retard lui-même est l'objet de GOV-057 : le pas 8 du protocole ne sait pas clore une tâche livrée seule, hors de tout lot.

**Appris.** `reclasser.mjs --fusionnee` vérifie que la PR est fusionnée et que le sha est son commit de fusion, mais ne confronte JAMAIS l'identifiant de la tâche au titre ni au champ `Lot:` de la PR : joué sur un arbre jetable, QA-T07 a été attestée par la PR 128 de DM-06, exit 0. Chaque couple de cette PR a donc été confronté à la main au titre de sa PR. Et l'option `--si-inchange` qu'on croyait exigée par ce verbe n'existe pas dans son source.

… 56 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

