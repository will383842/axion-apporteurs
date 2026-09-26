# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `05dcd2f` — 2026-09-26T04:04:04+02:00 |
| Qu’est-ce qui est en vol ? | 1. #134 (un contrôle requis rouge ou une revue manquante) · 2. #82 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 35/111 tâches, reste 57.60 j |
| Le prochain pas | SEC-03 — Lien magique apporteur (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #131 — 2026-09-26 |

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

`origin/main` = `05dcd2f` (2026-09-26T04:04:04+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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

### PR #130 — 2026-09-25 — feat(QA-T04): lot L0-03 — environnement fail-fast et sondes, red-first, mutation du domaine, harnais a11y

**Fait.** Lot de quatre tâches, un commit rouge puis un commit de code par tâche. QA-T04 :
`src/lib/env.ts` étend le schéma de SEC-01 à la configuration (base, cache, puits de
notifications, niveau de journal, collecte d'erreurs). Hors production, `NOTIFY_SINK=true` est
exigé, par le prédicat du notifieur importé. `register()` juge tout l'environnement par `exigerDemarrage`
avant toute composition et sort en non nul ; les secrets gardent leur lecteur de SEC-01. `docs/env.md` est le rendu du schéma (`pnpm env:doc`), comparé par
`env-fail-fast.spec.ts`. `/api/livez` et `/api/readyz` vivent dans `src/server/sante/disponibilite.ts` :
la sonde de disponibilité juge quatre sous-systèmes et ne nomme qu'eux. L'entrée de l'image migre
en bloquant, `SKIP_MIGRATE=1` n'est écrit que par elle et par le runbook de retour arrière, et le
`HEALTHCHECK` interroge `readyz`. CPL-T22 : `pnpm red-first` en `gate-a` lance chaque fichier de
test ajouté contre le code de la base, dans un arbre posé puis retiré. QA-T30 : Stryker sur
`src/domain/**` dans le job `mutation` de la nuit ; première passe complète à 79,38 %, rupture
alignée à 79, cible 80 déclarée ; `scripts/mutation/rapport.ts` nomme chaque mutant non détecté.
UX-P0-03 : `playwright.config.ts` et trois passes d'accessibilité dans `pnpm test`, sur les huit
maquettes lues dans `VALIDATION.md`, iPhone sous WebKit et bureau sous Chromium, au premier plan.

**Reste.** Le bloc des pannes de `sondes-de-vie.spec.ts` n'a été vu vert qu'en Gate A : pas de
démon Docker sur le poste de l'auteur. L'image n'est construite par aucun workflow (QA-T05), et la
sonde de la plateforme se règle hors du dépôt. La double clé de rotation de REQ-QA-030 appartient à
QA-T13. Le blocage à 80 % sur les fichiers touchés par une PR n'existe pas. Les 139 mutants sans
couverture vivent dans quatre modules testés hors de `tests/unit/domaine` (données personnelles,
charges du journal, lexique interdit, registre des décisions) : leurs tests lancent des gardes qui
exigent un dépôt git. Dette a11y mesurée, non bloquante avant QA-T16 : `deposer.html` et
`mes-commissions.html` portent un `p.doux.petit` à 16 px, que la charte ne permet qu'aux pastilles,
dates et onglets. Les deux maquettes de console portent des cibles de 21 px sur le bureau et des
cases de 24 px sur mobile. Les routes réelles de la phase 0 (SEC-03, JUR-T04) ne sont pas encore
servies au harnais.

**Appris.** Stryker en place (`inPlace`) réécrit TOUT fichier que couvre `disableTypeChecks`, bien
au-delà de `src/domain` : une passe interrompue a laissé 220 fichiers suivis porteurs de
`// @ts-nocheck`, rattrapés par `git checkout`. Le bac à sable n'est pas un dépôt git : les tests
qui balaient les fichiers suivis ou lancent une garde y échouent à blanc, un par passe. Il faut les
écarter par leur nom, et les nommer. Avec pnpm, Stryker ne trouve pas son greffon par le motif
`@stryker-mutator/*` : il faut le citer par son chemin. La garde red-first a rougi sur sa propre
spec, qui citait le marqueur en prose : une directive doit ouvrir une ligne de commentaire. Enfin,
ajouter la bibliothèque `dom` pour typer le harnais change aussi le type `Headers` du reste du
programme ; `dom.iterable` le rétablit. Et `vitest list --json` prend un CHEMIN de sortie : lancé
avec un fichier de test à sa suite pour en sonder l'inclusion, il a écrasé ce fichier par la
liste JSON, et le commit suivant l'a emporté sans que rien ne rougisse. C'est `red-first` qui
l'a trahi, en rendant « aucune suite trouvée » au lieu d'une erreur de chargement ; la spec est
restaurée depuis son commit de code. Enfin, étendre le schéma que lisent d'autres porteurs change
leur contrat : `lireEnvironnement` exigeait soudain la base et le puits de notifications de la
frontière axionia et des clés de chiffrement, qui n'en ont pas besoin, et la Gate A l'a vu
(`frontiere.spec.ts`, et le témoin sans démon du harnais, qui compte les fichiers verts). Les
secrets gardent leur lecteur ; le démarrage a le sien, `lireDemarrage`.

**Relecture.** Sur la tête `42a83cc`, `schema` (5323675397) et `exactitude` (5323686046)
acceptent ; `securite` refuse (5323686113) et `mutation` refuse (5323721215). `securite` : le
contexte de construction n'excluait pas les fichiers `.env*`, qu'un `COPY . .` emportait dans
l'image, où `next start` les charge avant `register()`. Le refus de démarrer n'aurait plus rien
refusé, et les secrets du poste auraient vécu dans une couche publique. `.dockerignore` exclut
désormais `.env*` et réintègre `.env.example` ; un témoin lit la règle comme Docker (dernière ligne
qui correspond) et rougit si la ligne est retirée. Dettes fermées dans le même tour : le code de
l'image appartient à root et seul `.next/cache` est écrit par l'utilisateur d'exécution ;
`readyz` garde un client de cache unique par adresse, remplacé seulement s'il est mort, fermé par
`fermerSondes` ; `red-first` passe `--no-renames`, et un test déplacé puis réécrit est jugé
(témoin sur dépôt jetable, rouge avant le correctif). `exactitude` : `timeout -k 5 55` dans
l'entrée, et la garde de l'échappatoire couvre les futurs `docker-compose*.yml` et `Dockerfile.*`.
`mutation` : cinq survivants, chacun rejoué sous son mutant après le correctif et vu rouge. La
configuration requise est écrite en toutes lettres dans le test (une base rendue facultative
rougit) ; le délai de migration est lu dans le script, `-k 5` et 55 compris ; une justification de
dix-neuf caractères est refusée et une de vingt admise ; `specsDuDisque` est jouée sur un bac posé
dans le répertoire temporaire ; le dossier parent de l'arbre de `red-first` est vu retiré. Dans le
même tour : les lignes de migration sont jugées dans le code (une ligne échouée ou annulée met
`readyz` en défaut, témoin par doublure du client de base), le délai de sonde est fixé à deux
secondes par un test, et les deux paramètres par défaut relevés par RM-11 sont devenus explicites.
Ce qui reste hors de portée ici : aucune migration factice qui pend n'est jouée contre une vraie
base, et le client de cache partagé n'est vu qu'en doublure hors de la porte A.

### PR #129 — 2026-09-25 — chore(GOV-012): registre rattrape, douze taches livrees par des PR fusionnees passent fusionnee

**Fait.** Quatorze tâches livrées par des PR fusionnées portaient encore `a_faire` : DM-06 (PR 128), SEC-08 (PR 126), GOV-099 (PR 124), GOV-098 (PR 122), GOV-097 (PR 120), GOV-096 (PR 118), GOV-095 (PR 116), GOV-090 (PR 113), GOV-092 (PR 112), GOV-047 (PR 99), JUR-T01 (PR 92), QA-T08 (PR 88), et les deux fusionnées pendant la revue, UX-P0-01 (PR 93) et INT-T09 (PR 91), ajoutées au tour de fusion de main. Elles passent `fusionnee` par `reclasser.mjs`, revendication constatée sur l'issue puis livraison constatée sur la forge, jamais à la main. La phase 0 passe de 21 à 35 tâches terminées sur 110.

**Reste.** Les six tâches du lot de la PR 114 (GOV-082, GOV-046, GOV-048, GOV-076, GOV-078, GOV-086) restent `a_faire` : la branche de tête `t/lot-L0-02` porte une majuscule que le motif du schéma refuse, et cinq d'entre elles n'ont aucune issue. GOV-063 (PR 102) reste `a_faire` : sa dépendance GOV-061 ne l'est pas, et sa clause 2 est ouverte. La moitié datée de l'acceptance de JUR-T01 est portée par JUR-T01b. Le retard lui-même est l'objet de GOV-057 : le pas 8 du protocole ne sait pas clore une tâche livrée seule, hors de tout lot.

**Appris.** `reclasser.mjs --fusionnee` vérifie que la PR est fusionnée et que le sha est son commit de fusion, mais ne confronte JAMAIS l'identifiant de la tâche au titre ni au champ `Lot:` de la PR : joué sur un arbre jetable, QA-T07 a été attestée par la PR 128 de DM-06, exit 0. Chaque couple de cette PR a donc été confronté à la main au titre de sa PR. Et l'option `--si-inchange` qu'on croyait exigée par ce verbe n'existe pas dans son source.

… 56 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

