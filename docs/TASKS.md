# Taches par phase — Axion Apporteurs

> ⚠️ **Ce fichier est une VUE. La source est `docs/tasks.json`.**
> Regenere par `pnpm gov:tasks --render`, jamais edite a la main : une correction tapee ici
> disparait au rendu suivant. Trois comptages differents ont circule dans la version tenue
> a la main, tous faux — les nombres ci-dessous sont comptes a la generation.
> `pnpm gov:tasks --verifie-rendu` rougit si ce fichier a derive de sa source (REQ-GOV-032).
>
> Une tache = une PR, **≤ 1,5 jour**. Le plafond est porte par la garde `gov:tasks`.

**227 taches · 165.75 j estimes.**

| Phase | Taches | Jours | Terminees |
| --- | ---: | ---: | ---: |
| -1 — Gouvernance (prealable bloquant) | 39 | 23.75 | 34 |
| 0 — Socle technique | 67 | 47.25 | 0 |
| 1 — Operationnel | 60 | 47.25 | 0 |
| 2 — Argent | 40 | 29.75 | 0 |
| 3 — Pilotage et conformite | 21 | 17.75 | 0 |

## Phase -1 — Gouvernance (prealable bloquant)

### GOV-000 — Dépôt axion-partners, CI minimale, outillage d'autopilote ✅ **fusionnee**

`1 j` · zone `gouvernance` · sensible : attribution · aucune dependance · decisions `W13`

Couvre : `REQ-CPL-021`, `REQ-GOV-014`, `REQ-GOV-031`

**Acceptation.** dépôt public (W13) ; `main` protégée (strict, `required_linear_history`, check requis **`gate-a`**) ; `package.json` déclarant les scripts que le SKILL et le workflow appellent — **`plan-state:build`, `lot:composer`, `lot:cloture`, `prevol`, `deploy:verify`, `gov:check`, `gov:autonomie`, `gov:issues`** — plus vitest ; `.github/workflows/ci.yml` avec un job **`name: gate-a`** exécutant `pnpm gov:check`, le check requis de la protection de branche portant **ce nom exact** (sinon GitHub reste en « Expected — Waiting for status », `gh pr checks --watch` n'aboutit jamais et la file se bloque dès la PR témoin) ; `scripts/gates/gov-check.ts` et `scripts/gates/gov-autonomie.ts` écrits, chacun avec sa fixture rouge archivée (`gates.json` les attribue à GOV-000) ; `scripts/gates/hook-env.js` ; `.claude/settings.json` (matrice d'autonomie : `permissions.allow`/`deny`, hook `PreToolUse` → `scripts/gates/hook-env.js` refusant toute `DATABASE_URL` non locale ou `NOTIFY_SINK ≠ true`) ; `scripts/lot/{composer.ts,lot.workflow.js,tasks.schema.json}` ; `scripts/plan-state/build.ts` ; `scripts/lot/cloture.ts` (écrivain de statut : `pnpm lot:cloture --lot <id>` écrit `statut`, `pr`, `branch`, `owner` dans `docs/tasks.json` d'après le retour du workflow, puis commite — sans lui la boucle ne progresse jamais) ; `.claude/skills/lot/SKILL.md` ; **`.claude/agents/` (15 fiches de rôle)** ; `docs/PLAN-STATE.md` v0 ; **`docs/tasks.json` amorcé avec les tâches de phase −1 au statut `a_faire`** (sans quoi GOV-017a n'est atteignable par aucun outillage : `build.ts` et `composer.ts` commencent par le lire) ; déplacement de `axionia/docs/partners/*` + du plan vers `axion-partners/docs/` avec `README.md` de renvoi. Toutes les tâches de phase −1 en dépendent (directement pour les racines GOV-007, GOV-001, JUR-T02 ; par transitivité pour les autres).

**Tests.** `tests/unit/gouvernance/autonomie.spec.ts#REQ-CPL-021 — le hook juge sur les JETONS, pas sur des sous-chaînes` · `tests/unit/gouvernance/autonomie.spec.ts#REQ-CPL-021 — `gh api` : l’écriture est refusée, la lecture reste permise` · `tests/unit/gouvernance/autonomie.spec.ts#REQ-CPL-021 — `pnpm gov:autonomie` et sa preuve sont vertes sur l’état du dépôt` · `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts#REQ-GOV-014 — aucun workflow ne pousse sur la branche principale` · `tests/unit/gouvernance/gardes.spec.ts#'gov:publication' > sait rougir : ses 7 familles ont chacune un témoin`

### GOV-007 — Charte des agents, gabarit de PR ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · `schema` · depend de `GOV-000`

Couvre : `REQ-GOV-010`, `REQ-GOV-011`, `REQ-GOV-012`, `REQ-GOV-013`

**Acceptation.** `CHARTE-AGENTS.md` (~15 rôles de sous-agents, fiches générées par GOV-023), `PULL_REQUEST_TEMPLATE.md` (8 cases, `Auteur:`, `Relecteur:`, `Couvre:`, bloc ROUGE/VERT), CODEOWNERS (`prisma/** @A02`, `packages/contracts/** @A02`) ; suppléant A12 pour les PR de A04 ; toute PR modifiant `prisma/**` ou `packages/contracts/**` porte le label `schema` et A02 est troisième relecteur bloquant.

**Tests.** `tests/gov/charte-pr.spec.ts`

### GOV-001 — Registre d'exigences consolidé ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-000`

Couvre : `REQ-GOV-001`, `REQ-GOV-026`

**Acceptation.** `REQUIREMENTS.md` + `requirements.json` avec toutes les REQ de ce rapport (B.1-B.9), champs `phase`, `module (1-21)`, `etape (1-12)` ; premier livrable `docs/partners/REQUIREMENTS-ANNEXE-FUSIONS.md` (couples de REQ fusionnées avec la REQ survivante, préséance DM > INT > SEC).

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:requirements' > sait rougir : ses 11 familles ont chacune un témoin` · `tests/unit/gouvernance/inventaire-prouve.spec.ts#REQ-GOV-026 — toute tâche en état ≥ « codé » porte au moins une preuve qui résout (chemin présent ou SHA retrouvé)`

### GOV-018 — Règles maison et leçons dans le dépôt ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-007`

Couvre : `REQ-GOV-024`, `REQ-GOV-023`

**Acceptation.** `docs/REGLES-MAISON.md` porte RM-01 a RM-14 — les neuf regles de REQ-GOV-024 plus cinq — une section par regle, le tableau de tete etant leur vue ; la ligne « Regle maison appliquee » vit entre ses marqueurs dans le gabarit de PR, et `gov:pr` la LIT. `docs/LECONS.md` porte le journal des lecons : chacune cite son incident mesure, ce qu'on en tire, une source verifiable (SHA, `chemin:ligne` ou message verbatim) et la `RM-nn` qu'elle a produite — ou dit qu'elle n'en a produit aucune. `pnpm gov:lecons --now <date>` (nightly, jamais l'horloge) rougit quand la consolidation depasse sept jours ALORS QUE des « appris » attendent, et reste verte sans dette. 12 familles, 13 temoins, 9 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/regles-maison.spec.ts#REQ-GOV-024 — docs/REGLES-MAISON.md porte RM-01 a RM-14, une section par regle` · `tests/unit/gouvernance/regles-maison.spec.ts#REQ-GOV-024 — les neuf regles que l'exigence enumere sont chacune couvertes par une section` · `tests/unit/gouvernance/regles-maison.spec.ts#REQ-GOV-023 — docs/LECONS.md porte une date de consolidation MACHINE-LISIBLE` · `tests/unit/gouvernance/regles-maison.spec.ts#REQ-GOV-023 — ROUGE : consolidation de plus de 7 jours ALORS QUE des « appris » attendent` · `tests/unit/gouvernance/regles-maison.spec.ts#REQ-GOV-023 — CONTRE-TEMOIN : la meme peremption sans aucun « appris » en attente reste VERTE`

### GOV-008 — PLAN-STATE vivant, protocole de session, verrou d'écriture ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · sensible : auth · depend de `GOV-007`

Couvre : `REQ-GOV-006`, `REQ-GOV-007`, `REQ-GOV-023`

**Acceptation.** `docs/PLAN-STATE.md` porte les sept rubriques de REQ-GOV-006 — bloc « REPRENDRE EN 30 SECONDES » en tete, file de fusion ORDONNEE avec ce qui bloque chaque PR, revendications rendues depuis leurs deux sources existantes, decisions du jour derivees de `git log`, prochain pas derive du chemin critique, journal rendu depuis `docs/journal/` — le tout DERIVE par `pnpm plan-state:build`, jamais ecrit a la main. La revendication ne cree aucun troisieme endroit : elle vit dans les labels `en_cours` + `owner:<Axx>` de l'issue et dans le champ `owner` du backlog. Garde `gov:etat` : 9 familles dont `plan_state_perime` (date du COMMIT, jamais `mergedAt` : 1 s d'ecart systematique mesure), `deux_pr_meme_tache`, `pr_fusionnee_sans_journal` ; sans `gh` elle ECHOUE en nommant les cinq familles non evaluees, jamais de vert silencieux. 8 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/plan-state-frais.spec.ts#REQ-GOV-006 — PLAN-STATE porte les sept rubriques que l’exigence enumere, bloc « REPRENDRE EN 30 SECONDES » compris` · `tests/unit/gouvernance/plan-state-frais.spec.ts#REQ-GOV-006 — sans lecture GitHub possible, gov:etat ECHOUE au lieu de verdir en silence` · `tests/unit/gouvernance/une-tache-un-owner.spec.ts#REQ-GOV-007 — deux PR OUVERTES citant la meme tache font rougir la famille `deux_pr_meme_tache`` · `tests/unit/gouvernance/une-tache-un-owner.spec.ts#REQ-GOV-007 — la revendication n’a PAS de troisieme endroit : PLAN-STATE la rend, il ne la stocke pas` · `tests/unit/gouvernance/plan-state-frais.spec.ts#REQ-GOV-023 — chaque entree cite un numero de PR et porte fait / reste / appris`

### GOV-002 — Table de préséance et bandeaux ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-001`

Couvre : `REQ-GOV-002`, `REQ-GOV-030`

**Acceptation.** ≥ 7 couples ; bandeaux sur fonctionnement §3.2/R3/R5/§9, contrat art. 1.2/1.5.

**Tests.** `preseance.spec.ts`

### GOV-003 — Identifiants qualifiés + gate anti-identifiant nu ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-001`

Couvre : `REQ-GOV-003`

**Acceptation.** Garde `gov:identifiants` : un identifiant nu de la forme lettre + un ou deux chiffres (`D3`, `C12`, `D11`) est refusé dans tout fichier suivi. Deux distinctions sont portées par le code, parce que l'énoncé de REQ-GOV-003 les confondait : (a) `A` suivi de DEUX chiffres est un code de POSTE d'agent, espace de noms déclaré par `tasks.schema.json` (`^A[0-9]{2}$`), non un identifiant de décision ; (b) un identifiant entre guillemets est une CITATION, pas une référence — les documents qui expliquent la règle doivent pouvoir écrire son contre-exemple. Trois témoins vus rougir, dix contre-témoins vus rester verts.

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:identifiants' > sait rougir : 3 témoins et 10 contre-témoins`

### GOV-004 — Vérification des affirmations sur le code d'axionia ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `GOV-001`

Couvre : `REQ-GOV-004`

**Acceptation.** ≥ 25 affirmations avec « vérifié le » ; fausses marquées (Invoice, Refund, payerSiret, HT encaissé, C3 codé, patron Calendly, EmargementToken index, score non snapshoté…).

**Tests.** `affirmations-verifiees.spec.ts`

### GOV-005 — Registre des décisions ouvertes, hypothèses par défaut, tests HYP-* ✅ **fusionnee**

`1 j` · zone `gouvernance` · `schema` · depend de `GOV-001`, `GOV-003` · decisions `W1`, `W3`, `W4`, `W6`

Couvre : `REQ-GOV-003`, `REQ-GOV-015`

**Acceptation.** toutes les questions de la section E avec hypothèse, propriétaire, impact, phase bloquée ; livrable `docs/DECISIONS.md` (= `DECISIONS-INDEX.md` de REQ-GOV-003, un seul nom) avec table `DEC-*` ← identifiants d'origine (INT-Q01, INT-Q02, INT-Q04, INT-Q10, C12, A12-A16, F-DM-13, D12…) et champ `reversibilite ∈ {parametre, migration, avenant}` ; W1, W3, W4, W6 sans valeur par défaut.

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:hypotheses' > sait rougir : ses 10 familles ont chacune un témoin`

### GOV-006 — Glossaire + gate schéma enum ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · `schema` · sensible : attribution · depend de `GOV-002`

Couvre : `REQ-DM-003`, `REQ-GOV-016`, `REQ-JUR-027`

**Acceptation.** `docs/GLOSSAIRE.md` (13 états d'attribution, `EvenementRecu`, « Déposer » retenu contre « Déclarer », rôle `qualifieur`, `ETATS_OCCUPANTS` à 7 états dérivés de REQ-DM-003).

**Tests.** `glossaire-enums.spec.ts`

### GOV-009 — Squelette ADR + 6 ADR fondateurs ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-005` · decisions `HYP-BEB-D2`, `HYP-TENANT`

Couvre : `REQ-CPL-018`, `REQ-GOV-008`

**Acceptation.** ADR-0001 stack (HYP-BEB-D2), 0002 frontière/sources de vérité/mono-tenant (REQ-CPL-018), 0003 grille publiée, 0004 auth + rôles défaut refus, 0005 gouvernance, 0006 fusion.

**Tests.** `adr-index-derive.spec.ts`

### GOV-010 — Gate ADR ↔ assertion ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-009`

Couvre : `REQ-GOV-009`

**Acceptation.** `gov:adr` refuse un ADR « accepte » dont l'assertion citee n'existe pas — fichier de test absent, titre `it()` introuvable, titre reconnu seulement comme gabarit de chaine, ou mention `hors-code` suivie de moins de 40 caracteres de motif. Quatre familles ajoutees a la garde existante plutot qu'un second script : deux parseurs jumeaux de la meme rubrique divergent. 16 familles, un temoin chacune, 11 contre-temoins verts (`pnpm gov:adr --prove`).

**Tests.** `tests/unit/gouvernance/adr-assertion-existe.spec.ts#REQ-GOV-009 — chaque ADR « accepte » cite un fichier de test qui existe et un titre it() qu'on y retrouve LITTERALEMENT` · `tests/unit/gouvernance/adr-assertion-existe.spec.ts#REQ-GOV-009 — la preuve NOMME les quatre familles de GOV-010, elle ne les compte pas`

### GOV-011 — Matrice de traçabilité dérivée ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-001`, `GOV-007`

Couvre : `REQ-GOV-005`

**Acceptation.** `pnpm gov:trace` derive la matrice REQ -> tache -> test -> PR de quatre sources : le registre des exigences, le backlog, les fichiers de test presents sur le disque, et les corps de PR fusionnees (source FACULTATIVE, dont l'indisponibilite est imprimee, jamais tue, et ne rend jamais vert). Les titres de `it()` sont RESOLUS par `vitest list --json`, gabarits `describe.each` compris — une promesse perimee (« ses 11 familles » pour un fichier qui en annonce douze) est refusee ; le perimetre d'execution est LU dans `vitest.config.ts`, un test promis que vitest ne lance pas est refuse. « >= testee » est DERIVE (le registre ne porte aucune echelle de maturite). `docs/TRACABILITE.md` est la VUE, ecrite par `--render`, gardee par `--verifier`, reseau-free par construction. 10 familles, 8 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/tracabilite.spec.ts#REQ-GOV-005 : la famille `req_non_citee_par_son_test` a son témoin` · `tests/unit/gouvernance/tracabilite.spec.ts#REQ-GOV-005 : le registre porte bien l’absorption, et c’est REQ-QA-014 qui fait foi` · `tests/unit/gouvernance/tracabilite.spec.ts#REQ-QA-014 : chaque famille a son témoin, et les contre-témoins restent verts`

### GOV-012 — Protocole de fusion, release manager, protection de main ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-007`

Couvre : `REQ-GOV-014`

**Acceptation.** squash + `required_linear_history` ; gate `gov:depot-visibilite` : visibilite reelle differente de la valeur LUE dans la ligne W13 de `docs/DECISIONS.md`, check requis `gate-a` absent de la protection de `main`, check requis qu'aucun job de `ci.yml` ne produit, historique lineaire non exige, ecrasement autorise, ou etape de workflow atteignant `main` (jugee par `jugerPush`, source unique) -> sortie 1 ; protection SUPPRIMEE -> sortie 1 ; protection NON LUE -> sortie 2 INDETERMINE, jamais 0. `docs/PROTOCOLE-FUSION.md` livre neuf pas, chacun avec sa commande et son critere de lecture. 9 familles, 5 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts#REQ-GOV-014 — aucun workflow ne pousse sur la branche principale` · `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts#REQ-GOV-014 — les étapes des workflows sont réellement LUES, pas survolées` · `tests/unit/gouvernance/tout-check-est-cable.spec.ts#branche_non_protegee — la protection SUPPRIMÉE est un ROUGE, pas un indéterminé` · `tests/unit/gouvernance/tout-check-est-cable.spec.ts#protection_non_lisible — protection NON LUE ⇒ verdict INDÉTERMINÉ, pas conforme`

### GOV-013 — Gate lexicale « commercial » ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-012`

Couvre : `REQ-GOV-017`

**Acceptation.** `pnpm gov:lexique` refuse tout usage PRESCRIPTIF des termes de REQ-GOV-017, durcie par REQ-JUR-037, sur sept motifs — `prisma/**`, `messages/**`, `src/**/*.tsx`, `src/app/(espace)/**`, gabarits e-mail, `micro-copy/**`, `docs/adr/**` — et un motif attendu qui ne balaie plus rien est une faute, pas un succes. La liste noire n'est pas dans la gate : elle est IMPORTEE de `src/domain/lexique/lexique-interdit.ts` — 9 familles, 63 formes flechies, deux portees, les marqueurs de denegation et les exceptions declarees avec elle (RM-01). La garde vise la TOURNURE et non le mot : l'usage denegatif ou definitionnel passe, l'usage prescriptif ou evaluatif rougit. Une garde qui ferait rougir la phrase qui PROTEGE forcerait a la retirer.

**Tests.** `lexique.spec.ts`

### GOV-014 — Conventions + sélection des gardes d'axionia ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-012`, `GOV-013`

Couvre : `REQ-GOV-018`, `REQ-GOV-029`

**Acceptation.** `docs/CONVENTIONS.md` (branches `t/<id-en-minuscules>`, worktrees `../axion-partners-wt/<id>`, titre de PR `<type>(<ID-TÂCHE>): <titre>`, commits `<type>(<domaine>): …` ≤ 100 car., camelCase français, suffixes `…Cents`/`…At`, snake_case Postgres par `@map`, `pnpm perf:bundle -- <route>`, `pnpm prevol`, « les hooks locaux ne font pas foi », jamais de jonction `node_modules` en worktree).

**Tests.** `gardes-transposees.spec.ts`

### GOV-015 — Fiches tiers ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `GOV-001`

Couvre : `REQ-CPL-002`, `REQ-GOV-022`

**Acceptation.** chaque tiers dont une valeur est produite pour lui porte sa fiche `docs/tiers/<nom>.md` avec URL officielle, date de lecture, extrait cite, exemple officiel, quotas et comportement en panne (REQ-GOV-022) ; la fiche `banque.md` repond a REQ-CPL-002 ou nomme ce qui manque ; `docs/tiers/README.md` est l'index du dossier et la garde `fiches-tiers` rougit sur toute fiche amputee d'une rubrique ecrivable, chacune de ses familles vue rougir sur son temoin.

**Tests.** `fiches-tiers.spec.ts`

### INT-T01a — Contrat d'événements, enveloppe et nomenclature : Zod + JSON Schema + `schemaVersion` + hash ✅ **fusionnee**

`0.5 j` · zone `integration` · `schema` · depend de `GOV-004`, `GOV-009`, `GOV-015`

Couvre : `REQ-GOV-020`, `REQ-INT-003`, `REQ-INT-004`, `REQ-INT-029`, `REQ-QA-007`

**Acceptation.** nomenclature unique : liste FERMEE des 7 types litteraux que REQ-INT-004 enumere, source unique `packages/contracts/events.ts` ; les 4 noms d'evenements que le registre porte ailleurs sont recenses HORS contrat v1 sous `TYPES_HORS_CONTRAT_V1`, chacun avec l'exigence qui le nomme (7+4=11, rien d'invente). Enveloppe snake_case telle que REQ-INT-003 l'enumere, fermee par `additionalProperties: false`. JSON Schema 2020-12, source Zod, `schema_version` et empreinte DERIVES du descripteur par `pnpm contracts:export`, jamais retapes ; `pnpm contracts:hash` rougit sur tout artefact hors derivation. Test de contrat sur fixtures, dont un contre-temoin REQ-INT-029. L'ecart avec l'ancienne acceptation (11 types, camelCase) est consigne par `partners/ADR-0008`, tranche par `docs/PRESEANCE.md` §2 : le registre prime sur un document hors depot.

**Tests.** `tests/unit/integration/contrat-hash.spec.ts#REQ-INT-003 — l'enveloppe porte les neuf champs du registre, dans la casse du registre` · `tests/unit/integration/contrat-hash.spec.ts#REQ-INT-003 — un evenement hors schema est REFUSE : c’est ce refus qui vaut le 422` · `tests/unit/integration/contrat-hash.spec.ts#REQ-INT-004 — la liste des types est FERMEE sur les sept que le registre enumere` · `tests/unit/integration/contrat-hash.spec.ts#REQ-INT-029 — aucun champ interdit ne franchit la frontiere, et le detecteur sait rougir` · `tests/unit/integration/contrat-hash.spec.ts#REQ-QA-007 — le JSON Schema publie est DERIVE : regenere, il est identique au fichier commite` · `tests/unit/integration/contrat-hash.spec.ts#REQ-QA-007 — contracts.sha256 est l'empreinte du schema publie, et un champ renomme la change` · `tests/unit/integration/contrat-hash.spec.ts#REQ-GOV-020 — la fixture DECLARE sa provenance et nomme la tache qui la remplacera (RM-03)`

### INT-T01b — Contrat d'événements, payloads et fixtures produites par le producteur réel ✅ **fusionnee**

`1 j` · zone `integration` · `axionia` · `schema` · depend de `INT-T01a`

Couvre : `REQ-ARG-002`, `REQ-ARG-005`, `REQ-ARG-006`, `REQ-ARG-030`, `REQ-CPL-015`, `REQ-DM-018`, `REQ-DM-039`, `REQ-DM-040`, `REQ-INT-005`, `REQ-INT-006`, `REQ-INT-032`, `REQ-QA-008`, `REQ-QA-007`

**Acceptation.** payloads (REQ-INT-005/006/032, REQ-DM-039/040, K-18 payers[], `client.fusionne`, `candidature.recue`), dérivation HT, deux formes de remboursement ; `pnpm partners:fixtures` (dans axionia, `scripts/partners/fixtures.ts`, base de dev port 5434, pseudonymisation, sortie commitée dans Partners avec `Source:`) — **aucune fixture écrite à la main, aucun helper qui « complète » un champ manquant**.

**Tests.** `axionia/src/server/partners/__tests__/enveloppe.spec.ts` · `axionia/src/server/partners/__tests__/payloads.spec.ts` · `axionia/src/server/partners/__tests__/commission.spec.ts` · `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts` · `axionia/src/server/partners/__tests__/derivation-ht.spec.ts` · `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts`

### GOV-017a — Backlog converti en `docs/tasks.json` : champs déjà écrits, acyclique ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-001`, `GOV-005`

Couvre : `REQ-GOV-021`, `REQ-GOV-025`, `REQ-GOV-027`

**Acceptation.** conversion **mécanique** de `TASKS.md` en `docs/tasks.json` pour les champs qui existent déjà (`id`, `titre`, `phase`, `deps`, `reqs`, `hyp`, `externe`, `repo`, `estimateDays`, `statut`), validé par `scripts/lot/tasks.schema.json` ; `repo` absent → `partners` par défaut ; grappes fusionnées ; chemin critique écrit dans PLAN-STATE ; `TASKS.md` devient une vue générée (`pnpm gov:tasks --render`).

**Tests.** `tests/unit/gouvernance/paths-derives.spec.ts#la vue commitee est a jour : `--check` est vert sur le depot` · `tests/unit/gouvernance/paths-derives.spec.ts#REQ-GOV-025 — aucune tache `repo: axionia` ne pretend ecrire un fichier de ce depot` · `tests/gov/charte-pr.spec.ts#REQ-GOV-027 : la famille `phase_gelee` est prouvee, temoin et contre-temoin`

### GOV-017b — `paths ✅ **fusionnee**

`1.5 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-017a`

Couvre : `REQ-GOV-021`, `REQ-GOV-025`, `REQ-GOV-027`

**Acceptation.** chaque tâche porte `zone`, `paths[]` (≥ 1 entrée) et `sensible[]` ; **c'est ce qui fonde la disjonction de chemins du composeur** — sans ces champs, deux tâches d'un même lot peuvent écrire le même fichier et la file casse ; `acceptance` et `tests{}` deviennent requis **à l'attribution** (`statut: en_cours`), pas à l'écriture.

**Tests.** `tests/unit/gouvernance/paths-derives.spec.ts#la vue commitee est a jour : `--check` est vert sur le depot` · `tests/unit/gouvernance/paths-derives.spec.ts#REQ-GOV-025 — aucune tache `repo: axionia` ne pretend ecrire un fichier de ce depot` · `tests/gov/charte-pr.spec.ts#REQ-GOV-027 : la famille `phase_gelee` est prouvee, temoin et contre-temoin` · `tests/gov/charte-pr.spec.ts#REQ-GOV-027 : la phase courante se lit dans le backlog, pas dans la vue PLAN-STATE`

### GOV-019 — Budgets de performance après première mesure ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-014`

Couvre : `REQ-GOV-028`

**Acceptation.** `perf/budgets.json` (une entree de budget par route) et `lighthouserc.json` existent, et leurs seuils sont DERIVES du texte de REQ-GOV-028 lu dans `docs/requirements.json` : `--rendre` les ecrit, `--verifier` rougit si le disque en differe, et le test RENVERSE la source pour prouver que l'attente se renverse — sans quoi un retour constant passerait pour une derivation. La garde rougit sur une route de `src/app/(espace)` sans entree, dans les DEUX sens du cliquet, et LEVE si le texte de l'exigence ne dit plus le seuil au lieu de retomber sur un defaut. Perimetre vide ASSUME ET DIT : elle imprime le nombre de routes balayees et declare qu'un vert a zero route ne juge aucune route. Aucune dependance ajoutee — le mesureur entre avec QA-T20. L'etape de Gate A qui l'appelle ne porte pas `continue-on-error`, et la famille `etape_ci_muselee` le refuse.

**Tests.** `poids-du-bundle-garde-vraiment.spec.ts`

### GOV-020 — Inventaire prouvé C1-C8 ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-004`

Couvre : `REQ-GOV-026`

**Acceptation.** `pnpm gov:inventaire` rougit sur toute entree de `docs/tasks.json` en etat >= « code » qui ne porte aucune preuve QUI RESOUT — un chemin present sur le disque ou un SHA que `git` retrouve, derive de la portee conventionnelle du commit ; un numero de PR n'en est pas une (GOV-000 est `fusionnee` sans PR). La legende de REQ-GOV-026 n'est pas un second vocabulaire : c'est une echelle ordonnee derivee de l'enum `statut`, dont l'exhaustivite est verifiee, et dont le rang est le PLANCHER garanti (`en_cours` vaut `specifie` : revendiquee n'est pas codee). `docs/INVENTAIRE-CHANTIERS.md` porte les huit etiquettes que REQ-GOV-026 nomme ; deux seulement ont un referent resolu dans ce depot, les six autres n'ont AUCUN etat et la garde rougit si quelqu'un leur en ecrit un. 7 familles, 6 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/inventaire-prouve.spec.ts#REQ-GOV-026 — toute tâche en état ≥ « codé » porte au moins une preuve qui résout (chemin présent ou SHA retrouvé)` · `tests/unit/gouvernance/inventaire-prouve.spec.ts#REQ-GOV-026 — une étiquette dont ce dépôt ne résout pas le référent ne porte AUCUN état : une preuve inventée est pire qu'une preuve absente` · `tests/unit/gouvernance/inventaire-prouve.spec.ts#REQ-GOV-026 — la garde sait rougir : ses 7 familles ont chacune un témoin, et ses contre-témoins restent verts`

### GOV-023 — Fiches de rôle générées depuis `agents.json` ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-000`, `GOV-007`

Couvre : `REQ-GOV-010`

**Acceptation.** `docs/agents.json` est la source des quinze fiches : `pnpm gov:agents:rendre` rend `.claude/agents/<role>.md` (frontmatter + bloc marque : mission, entrees, sorties, interdits, documents a lire avec chemins verifies existants) ; `pnpm gov:agents:verifier` rougit si une fiche a ete editee a la main ; `pnpm gov:agents` confronte en plus la source au tableau §2 et aux chemins reserves §7 de la charte, et a tout `agentType` du workflow de lot. La derivation est FIDELE : `git diff .claude/agents/` ne porte aucune suppression ni aucune modification de ligne, seulement le bloc genere ajoute. 14 familles, 7 contre-temoins verts.

**Tests.** `tests/unit/gouvernance/fiches-agents.spec.ts#REQ-GOV-010 — la source declare les quinze postes, codes A01 a A15 uniques` · `tests/unit/gouvernance/fiches-agents.spec.ts#REQ-GOV-010 — tout chemin de documents[] existe sur le disque` · `tests/unit/gouvernance/fiches-agents.spec.ts#REQ-GOV-010 — chaque chemin reserve du §7 nomme un poste de la source (gate de l’exigence)` · `tests/unit/gouvernance/fiches-agents.spec.ts#REQ-GOV-010 — sait rougir : ses 14 familles ont chacune un temoin, 7 contre-temoins restent verts`

### QA-T00 — `prove.sh` + `gates.json` {id, script, fixtureRouge, phase, preuveRouge} + nightly `gates:prouvees` ✅ **fusionnee**

`0.5 j` · zone `qualite` · depend de `GOV-000`

Couvre : `REQ-QA-013`

**Acceptation.** chaque gate porte un champ `phase` et une `preuveRouge` archivee ; `gates:prouvees` calcule « toutes les gates de phase <= N presentes, bloquantes, avec `preuveRouge` ». PERIMETRE EXACT, dit plutot que maquille : de REQ-QA-013, QA-T00 ne couvre que la moitie BLOQUANTE — que le check requis de `main` soit celui que `ci.yml` produit, et que les gates declarees soient reellement armees. Le CONTENU de la gate (ESLint, Prettier, couverture, testcontainers, semgrep, audit, gitleaks, req:check, idor:check, lint de migration, size-limit) n'est livre par aucune tache de la phase -1 : il revient a QA-T01, QA-T07 et QA-T28, qui portent deja l'exigence. `pnpm gov:trace` le redira le jour ou elles entreront.

**Tests.** `tests/unit/gouvernance/tout-check-est-cable.spec.ts#le nom du check requis se lit dans les jobs de ci.yml, il n’est pas tapé` · `tests/unit/gouvernance/tout-check-est-cable.spec.ts#check_requis_absent — `gate-a` n’est plus exigé par la protection de `main`` · `tests/unit/gouvernance/tout-check-est-cable.spec.ts#un workflow qui ne se déclenche pas sur `pull_request` ne produit aucun check de PR`

### CPL-T01 — Registre `config/entite.json` à valeur sentinelle, ses lecteurs et la garde `gov:entite` ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · sensible : argent, attribution · depend de `GOV-005` · decisions `HYP-W2`, `W1`, `W13`, `W3`, `W4`

Couvre : `REQ-CPL-001`, `REQ-CPL-002`, `REQ-CPL-003`, `REQ-CPL-004`, `REQ-CPL-017`, `REQ-CPL-018`, `REQ-GOV-027`, `REQ-GOV-031`

**Acceptation.** Livrable de CODE, arbitré par `partners/ADR-0009`. (1) `config/entite.json` porte, en un seul endroit, la dénomination, la forme, le SIREN, le SIRET, le numéro de TVA et le siège de l'entité contractante (`W1`, tranchée le 2026-09-03), le domaine servi et le domaine d'envoi (`W3`), le modèle des têtes de réseau (`W4`) et les coordonnées bancaires débitrices (`HYP-W2`). (2) Toute valeur que le dépôt ne peut pas porter — les coordonnées bancaires débitrices, qui sont un secret et que `W13` interdit de commiter — vaut la sentinelle littérale `A-RENSEIGNER`, jamais une chaîne vide, jamais `null`, jamais un exemple plausible : un numéro d'exemple oublié dans un document signé ne se distingue pas d'une vraie valeur. (3) Aucun autre fichier ne retape ces valeurs (RM-01) : gabarit de contrat, mandat d'autofacturation, fichier de virement, export annuel et mentions légales les LISENT toutes ici, si bien que le SIREN du contrat, celui du mandat et celui du virement sont le même octet — ce que REQ-CPL-001 demandait déjà. (4) La garde `gov:entite` refuse la MISE EN SERVICE tant qu'un champ vaut la sentinelle, à ses quatre points de sortie (émission d'un contrat, génération d'un mandat, écriture d'un fichier de virement, export annuel) ; elle n'empêche ni le build, ni les tests, ni le développement — les phases 0 à 3 se codent et se prouvent contre la sentinelle. (5) Elle refuse SYMÉTRIQUEMENT qu'une coordonnée bancaire réelle soit commitée : la sentinelle est la seule valeur que ce champ prend dans le dépôt. (6) Deux témoins, l'un rouge et l'autre vert (RM-02) : un champ à `A-RENSEIGNER` fait rougir chacun des quatre points de sortie, un registre complet laisse la garde verte — sans le second, une garde qui rougit toujours finit désarmée. (7) L'entrée `gov:entite` est inscrite au registre des gardes avec sa preuve rouge.

**Tests.** `tests/unit/gouvernance/entite-registre.spec.ts` · `tests/unit/gouvernance/verrou-de-phase.spec.ts`

### GOV-024 — Une vue générée qui a dérivé de sa source doit rougir ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-017b`

Couvre : `REQ-GOV-010`, `REQ-GOV-011`, `REQ-GOV-021`, `REQ-GOV-032`

**Acceptation.** `pnpm gov:tasks` n'a qu'un mode `--render` : rien ne compare `docs/TASKS.md` à `docs/tasks.json`, et `docs/REQUIREMENTS.md` n'a même pas de générateur alors que son bandeau affirme le contraire. C'est ce trou qui a laissé la vue du backlog annoncer cinq tâches livrées quand la source en portait vingt — quinze d'écart, trouvés par trois relecteurs et par aucune garde, sur le fichier qu'on ouvre justement pour savoir où en est le chantier. `docs/TRACABILITE.md`, elle, a un `--verifier` depuis GOV-011 : c'est le patron à reprendre. À livrer : (1) le rendu de `gov-tasks.ts` extrait en fonction pure `rendreVue()`, et un mode `--verifie-rendu` qui compare sans écrire et NOMME l'écart en nombre de tâches livrées — « les deux fichiers diffèrent » n'apprend rien à qui lit un journal de CI ; (2) le même couple rendu / vérification pour `docs/REQUIREMENTS.md`, qui n'a aujourd'hui aucun générateur ; (3) les deux modes câblés dans le job de Gate A ; (4) un témoin rouge — une vue périmée d'une seule tâche fait sortir 1 — et un contre-témoin vert sur le dépôt à jour, sans lequel le rouge ne prouve rien (RM-02) ; (5) le point 5 de `docs/PRESEANCE.md` §5 refermé, et le bandeau du générateur aligné sur ce qu'il fait vraiment. L'extraction de `rendreVue()` est déjà écrite et a été vue rougir sur une vue périmée ; elle n'entre pas dans le lot L-1-05, qui n'écrit pas `scripts/gates/`. ⚠️ AJOUT DU TOUR 9, motif bloquant de la lentille exactitude, et c'est le meme defaut que celui du tour 8 UNE COUCHE PLUS LOIN : scripts/lot/revues.ts — plus de 1700 lignes, LA MACHINE QUI DECIDE DE LA FUSION — se declare lui-meme « LE lecteur des revues d'une PR (REQ-GOV-010, REQ-GOV-011) » des sa deuxieme ligne, son spec porte les deux annotations @req, et gov-pr.ts cite REQ-GOV-011 dans deux messages ajoutes. Or AUCUNE tache pr:31 ne portait ces exigences, et le fichier n'etait dans les paths d'AUCUNE tache — pendant que docs/pr/31.tpl.md coche « le code ne fait rien de plus qu'elles », sur une PR sensible argent+attribution. La derivation de Couvre: etait donc fidele a une source qui SOUS-DECLARAIT, pour la seconde fois. Rattache a GOV-024 parce que ce lecteur est ne du travail sur caseRevues : il existe pour que la case de DoD dise vrai, et cette case EST le protocole de revue.

**Tests.** `tests/unit/gouvernance/vues-derivees.spec.ts` · `tests/unit/gouvernance/corps-de-pr-couvre.spec.ts` · `tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts` · `tests/unit/gouvernance/tete-de-pr-concorde.spec.ts` · `tests/unit/gouvernance/revues-lecteur-unique.spec.ts`

### GOV-025 — La garde des identifiants nus est aveugle en fin de phrase — dépôt public, c'est une garde de publication ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-003`

Couvre : `REQ-GOV-003`

**Acceptation.** La lookahead négative de `scripts/gates/gov-identifiants.ts` inclut le point : une étiquette de relecteur collée à un point final n'est pas vue, la même suivie d'une espace l'est. Ses propres témoins `--prove` évitent tous cette position, si bien que l'auto-preuve n'exerce jamais le seul endroit où la garde est aveugle — elle reste verte sur le texte qu'elle condamne. Trouvé en mutation, puis reproduit involontairement pendant la rédaction de l'entrée de journal de la PR 30 : des deux occurrences écrites pour l'illustrer, une seule a été vue. Le dépôt est public (`W13`, REQ-GOV-031) : un identifiant qui ne résout nulle part y reste lisible pour toujours. À livrer : (1) le point retiré de la classe de la lookahead ; (2) un témoin à CHACUNE des positions limites — fin de phrase, fin de ligne, avant une virgule, avant une parenthèse fermante — parce qu'un témoin qui évite la position limite verdit sur le défaut ; (3) un contre-témoin qui prouve qu'un usage légitime passe toujours, dont la §0 du registre des décisions et les locutions déjà exemptées ; (4) la garde rejouée contre la version CASSÉE pour montrer que les nouveaux témoins la font bien rougir.

**Tests.** `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts`

### GOV-026 — Le CLAUDE.md racine, avec sa règle maison d'abord registrée ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-018`

Couvre : `REQ-GOV-024`

**Acceptation.** Retiré de la PR 30 : le fichier portait une règle de gouvernance absente de `docs/REGLES-MAISON.md` — « on ne compose jamais un lot tant qu'une PR de clôture est ouverte » —, n'appartenait aux `paths` d'aucune tâche du backlog, et son commit se rattachait à une tâche déjà fusionnée. Une règle qui ne vit que dans un fichier d'amorçage n'est référencée par aucun ADR et par aucun gabarit de PR : elle se perd à la première réécriture. À livrer, DANS CET ORDRE : (1) la règle enregistrée comme RM-13 dans `docs/REGLES-MAISON.md`, avec son énoncé, son pourquoi et la garde qui la voit ; (2) `tests/unit/gouvernance/regles-maison.spec.ts` étendu — il exige une section par règle, il doit donc rougir avant l'ajout ; (3) le fichier `CLAUDE.md` lui-même, qui renvoie à RM-13 par son numéro et jamais par paraphrase (RM-12) ; (4) `CLAUDE.md` inscrit dans les `paths` de cette tâche. Deux contraintes de rédaction, consignées dans `docs/REPRISE-SESSION.md` : ne pas y figer le premier geste, qui change à chaque session, et ne pas y résumer `docs/PRESEANCE.md` — le résumé qui avait été retiré avait déjà divergé, il omettait deux des fichiers réservés et affirmait que tout le reste était une vue générée, ce qui interdisait d'éditer les fichiers que la préséance donne justement à éditer.

**Tests.** `tests/unit/gouvernance/regles-maison.spec.ts`

### GOV-027 — Le composeur lit le registre des décisions autrement que la garde, et écarte des tâches dont la décision est posée ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-005`

Couvre : `REQ-GOV-015`, `REQ-GOV-021`

**Acceptation.** Deux lecteurs du même registre, et ils ne lisent pas la même chose (RM-04). `scripts/gates/gov-tasks.ts` reconnaît une décision à la PREMIÈRE CELLULE d'une ligne de tableau et accepte les quatre familles d'identifiants du registre ; `scripts/lot/composer.ts` la cherche par une expression régulière qui ne connaît que deux préfixes et n'applique pas les alias de la §0. Trois conséquences MESURÉES le 2026-09-04, toutes silencieuses : (a) des tâches sont écartées pour « décision sans hypothèse » alors que leur décision est bel et bien déclarée au registre — il suffit que son identifiant soit une décision de Will ou un alias ; (b) trois identifiants cités dans une NOTE en prose sous la §1 — une note qui explique précisément qu'ils ne bloquent PLUS — sont comptés comme bloquants, et écartent cinq tâches de plus ; (c) le composeur ratisse la §1 entière, si bien qu'une décision TRANCHÉE y bloque encore, alors que la §4 du registre prescrit de la faire descendre en §2. À livrer : (1) un lecteur UNIQUE du registre, importé par la garde et par le composeur, alias de la §0 compris ; (2) la frontière §1/§2 lue sur les LIGNES DE TABLEAU et non sur la prose ; (3) une décision tranchée qui ne bloque plus rien ; (4) un témoin par famille et un contre-témoin vert ; (5) le décompte des tâches redevenues éligibles imprimé, pour qu'on voie la différence au lieu de la supposer.

**Tests.** `tests/unit/gouvernance/registre-lecteur-unique.spec.ts`

### GOV-028 — Citer n'est pas se servir — mais dans un fichier de code, la quote est de la SYNTAXE ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-025`

Couvre : `REQ-GOV-003`

**Acceptation.** La constante CITATIONS de scripts/gates/gov-identifiants.ts neutralise TOUTE chaine citee de 120 caracteres ou moins — guillemets francais, guillemets droits ET quotes simples — avant de chercher un identifiant nu. La regle « citer n'est pas se servir » a ete ecrite pour la PROSE et s'applique par accident a la SYNTAXE : dans un .json, un .ts ou un .yml, les guillemets qui entourent une valeur ne citent rien, ils delimitent. TEMOIN REJOUABLE, mesure le 2026-09-05 sur la garde livree : un fichier suivi portant `export const note = "conforme a D11 ; rien de plus";` rend ZERO faute ; le MEME identifiant dans la MEME instruction, la chaine rallongee au-dela de 120 caracteres, en rend UNE. Le verdict de la garde depend donc de la LONGUEUR du voisinage et non de son contenu. ⚠️ Les comptes globaux ne sont volontairement PAS asserts ici : ils sont a etablir PAR cette tache, sur un harnais qui rejoue le pipeline complet de la garde (exemptions et locutions legitimes comprises) et non la seule fautesDeLigne — une premiere mesure faite sans ce pipeline a rendu des chiffres invraisemblables, et un compteur qu'on ne sait pas reproduire est exactement ce que cette tache reproche a la garde. A livrer : (1) la neutralisation devient CONTEXTUELLE — en prose les trois familles de guillemets citent, dans un fichier de code seuls les guillemets francais et une citation IMBRIQUEE citent ; (2) un temoin par famille de delimiteur, chacun double par sa version rallongee, montrant que l'ancien contournement disparait ; (3) des contre-temoins verts sur les usages legitimes, soit par exemption nommee soit par un ajustement de la regle, jamais par un retour au silence ; (4) le plafond de 120 caracteres justifie ou supprime — une garde dont le verdict depend de la longueur d'une phrase n'est pas rejouable ; (5) les trois comptes globaux etablis et ecrits ici, avec la commande qui les reproduit.

**Tests.** `tests/unit/gouvernance/citation-json-vs-prose.spec.ts`

### GOV-029 — L'identifiant d'un lot se derivait d'un dossier que git ignore, et repartait sur un numero deja pris ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-027`

Couvre : `REQ-GOV-033`

**Acceptation.** scripts/lot/composer.ts tirait le numero du prochain lot de readdirSync('docs/lots'), un dossier que .gitignore l. 67 EXCLUT du depot. Dans un arbre neuf il n'existe pas, le maximum d'un ensemble vide vaut 0, et le composeur repart a L-1-01 — identifiant deja porte par sept taches fusionnee. Mesure le 2026-09-05 dans un worktree neuf : « Lot L-1-01 : 7 tache(s) » pour sept taches dont aucune n'appartient au L-1-01 historique ; pnpm lot:cloture aurait alors ecrit lot: L-1-01 sur les nouvelles, et le lot historique en aurait compte quatorze. Rien ne l'aurait vu : t.lot est une chaine libre qu'aucun schema ne confronte. Le commentaire du code nommait pourtant le cas — « un dossier supprime, archive ou non commite faisait retomber sur un identifiant deja utilise » — et n'en avait corrige que la moitie : le COMPTAGE etait devenu un MAXIMUM, la SOURCE etait restee le dossier ignore. A livrer : (1) le numero se derive de l'UNION du dossier, qui porte les lots composes mais pas encore clos, et du champ lot de docs/tasks.json, seule des deux sources a etre SUIVIE par git ; (2) un temoin par source, aucune ne suffisant seule ; (3) des contre-temoins sur les noms hors nomenclature et sur les identifiants d'une autre phase ; (4) un controle sur le depot REEL, qui verifie que le prochain identifiant de chaque phase n'est porte par aucune tache.

**Tests.** `tests/unit/gouvernance/lot-identifiant-unique.spec.ts`

### GOV-032 — Un instant de reference se fige par rapport a CE QU'IL JUGE ✅ **fusionnee**

`0.25 j` · zone `gouvernance` · depend de `GOV-008`

Couvre : `REQ-GOV-006`

**Acceptation.** Trois endroits portaient un instant de reference ECRIT EN DUR — `scripts/gates/gov-etat.ts` (la base de son mode --prove et la date de son temoin `journal_date_future`), `tests/unit/gouvernance/plan-state-frais.spec.ts` et `tests/unit/gouvernance/une-tache-un-owner.spec.ts` — sous ce commentaire : « un instant FIXE, jamais new Date() : une garde qui lit l'horloge n'est pas rejouable ». Le raisonnement est JUSTE et porte sur le MAUVAIS SUJET. Il vaut pour un univers INJECTE, ou l'instant fait partie de la fixture ; il ne vaut pas pour un fichier VIVANT. Or ces trois appels confrontent l'instant au JOURNAL REEL, qui avance. Un instant fige au 2026-09-04 confronte a un journal qui grandit est un test A RETARDEMENT : il rougit sur la premiere entree ecrite apres cette date, donc sur toute entree future, pour toujours. Il est tombe le LENDEMAIN. Le meme defaut vivait dans la GARDE : --prove appariait le journal REEL au meme litteral, donc il REFUSAIT de commencer et sortait 1, exactement comme une garde qui aurait trouve un defaut — une preuve qui s'eteint toute seule au bout d'un jour ne prouve rien le second jour, ET RIEN NE LE DIT. Le temoin de `journal_date_future` portait lui aussi une date en dur (2026-12-31) : un temoin dont la date est ecrite a la main cesse d'exercer sa famille le jour ou le present le rattrape, en silence — il devient un contre-temoin. A tenir : les trois instants sont DERIVES ; `controler()` reste PURE et RECOIT son instant, aucune horloge n'entre dans la garde ; la famille `journal_date_future` est rejouee contre une entree datee de DEMAIN et vue rougir ; et le depot tel quel reste vert.

**Tests.** `tests/unit/gouvernance/plan-state-frais.spec.ts`

### GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur

`0.5 j` · zone `gouvernance` · depend de `GOV-024`

Couvre : `REQ-GOV-032`

**Acceptation.** REQ-GOV-032 enumere CINQ vues generees — docs/TASKS.md, docs/REQUIREMENTS.md, docs/TRACABILITE.md, docs/paths-proposes.json et docs/PLAN-STATE.md — et exige de chacune un mode de VERIFICATION qui n'ecrit rien et sort 1 quand le fichier commite differe d'un octet de ce que sa source produirait. GOV-024 en a livre quatre. La cinquieme, PLAN-STATE, n'en a toujours pas : `pnpm plan-state:build` ECRIT, et rien ne compare. ⚠️ CE QUI REND CETTE TACHE URGENTE PLUTOT QU'UTILE : REQ-GOV-032.taches vaut [GOV-024], donc le jour ou GOV-024 passe fusionnee, `gov:requirements` reste VERT avec un tiers de l'exigence sans porteur, et plus AUCUNE commande du depot ne peut rougir dessus. L'exigence ne serait pas violee : elle serait INTROUVABLE. A livrer : (1) `plan-state:build --verifier` qui n'ecrit rien, sort 1 sur un octet d'ecart et NOMME l'ecart en unites du domaine, comme ses quatre soeurs ; (2) le rendu rendu PUR et deterministe — deux appels, le meme octet — sans quoi le verificateur mesurerait la machine ; (3) l'etape de Gate A qui l'appelle, sans continue-on-error ; (4) le temoin qui le voit rougir sur une vue perime d'une ligne, et le contre-temoin vert sur le depot a jour ; (5) tant qu'a ouvrir ce fichier : `scripts/plan-state/build.ts` cite encore `scripts/gates/plan-state-derive.spec.ts`, un chemin MORT que le registre vient d'abandonner — c'est LEC-12 mot pour mot, dans le fichier meme que cette tache touche. NOTE : le TROISIEME objet que la relecture avait rattache a cette tache — le generateur du corps de PR, qui vivait hors du depot — est deja livre par la PR 31 sous `scripts/lot/corps-de-pr.ts`, avec son script `pnpm pr:corps`.

**Tests.** `tests/unit/gouvernance/vues-derivees.spec.ts`

### GOV-036 — Les deux listes qui decident de ce que gov:entite REGARDE sont tapees a la main

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `CPL-T01`

Couvre : `REQ-GOV-031`

**Acceptation.** Trois constats de la lentille securite, tous mesures sur les quatre passes de la PR 31, tous non bloquants parce qu'aucun ne laisse fuir un IBAN AUJOURD'HUI — mais tous portant sur ce que la garde REGARDE, c'est-a-dire sur le seul endroit ou une garde peut devenir aveugle en silence. (1) PAYS_ISO est une liste TAPEE : 47 entrees, dont SEPT qui n'emettent aucun IBAN, et CINQUANTE ET UN pays emetteurs OMIS. Mesure : cinq IBAN etrangers a cle mod-97 valide (TR, IL, RS, AL, LB) ne sont pas vus. Le risque est faible tant que la residence fiscale exigee est francaise, mais la garde est repo-wide et servira aux RIB des apporteurs. C'est RM-01 applique a une constante : la liste se DERIVE, elle ne se tape pas. (2) EXTENSIONS_BALAYEES est une liste d'AUTORISATION sous un commentaire qui dit « un secret ne choisit pas son extension ». Ne sont pas balayes : .sh .py .tf .toml .ini .mdx .html .http .rst .jsonc .log .har .pdf Makefile .gitattributes .sha256 — et `scripts/*.sh` exportant PARTNERS_IBAN_DEBITEUR est le cas plausible. La forme juste est une liste de REFUS (binaires), avec le contre-temoin .png qui s'y transpose tel quel. (3) Le commentaire pres de estBalaye annonce des temoins « --prove, famille filtre_trop_large » : cette famille N'EXISTE PAS, FAMILLES en porte onze et aucune de ce nom. Les temoins sont dans le banc d'essai, ce qui suffit — mais le code annonce une couverture qu'il n'a pas, dans la phrase meme qui repond a un constat de mutation.

**Tests.** `tests/unit/gouvernance/entite-registre.spec.ts`

### GOV-037 — Les nombres se derivent, les ATTRIBUTIONS non : rien ne confronte un nom de tache a ses paths

`0.5 j` · zone `gouvernance` · depend de `GOV-024`

Couvre : `REQ-GOV-003`, `REQ-GOV-021`

**Acceptation.** Observation de cloture de la lentille exactitude apres CINQ passes sur la PR 31 : « les nombres se derivent maintenant, les ATTRIBUTIONS non ». Un nom de tache ecrit dans l'en-tete d'un fichier, ou dans le champ tache de docs/gates.json, n'est confronte a RIEN — ni aux paths du backlog, ni a l'existence de la tache. LES occurrences mesurees dans la seule journee du 2026-09-05 — toutes trouvees a la LECTURE, aucune par une garde. Elles sont enumerees ci-dessous et il n'y a volontairement PAS de compte en tete : c'est la troisieme fois dans cette PR qu'un compte ecrit dans une acceptance ne tient pas — « les neuf regles plus trois » de GOV-018 ne suivait pas une addition faite en queue, « seize taches ecartees » de GOV-027 etait une mesure simplement fausse, et celui-ci decrivait la liste placee juste a cote de lui. Les trois causes different ; ce qu'elles ont en commun est qu'un compte tape doit etre tenu a jour et qu'une liste se lit : un correctif de lookahead etiquete GOV-029 alors qu'il corrige GOV-025 ; la derivation d'un instant etiquetee GOV-029 alors qu'elle n'a pas de tache (devenue GOV-032) ; une entree de registre citant GOV-029 pour une lacune que GOV-029 ne porte pas ; l'en-tete de scripts/lot/corps-de-pr.ts nommant GOV-035 alors que le fichier est dans les paths de GOV-024, et que l'acceptance de GOV-035 ecrit elle-meme qu'elle ne le porte pas ; et une CINQUIEME, trouvee le 2026-09-05 en verifiant le refus de la lentille schema sur la tete 41bc814 : la revue elle-meme s'appuie sur GOV-033 pour porter un arbitrage, or GOV-033 n'existe dans AUCUNE branche du depot. C'est la premiere occurrence qui vit dans une REVUE plutot que dans du code, donc hors de portee de toute garde de depot — ce qui borne honnetement ce que cette tache peut fermer. ⚠️ ET ELLE PORTE UNE DISTINCTION QUE LES QUATRE PREMIERES CACHAIENT : on ne peut pas trancher si le relecteur CITE une tache qu'il croit exister ou s'il RESERVE le prochain identifiant libre (GOV-033 et GOV-034 le sont tous les deux). Les deux lectures sont egalement plausibles et rien dans le depot ne les distingue. La garde livree doit donc dire ce qu'elle fait d'un identifiant BIEN FORME QUI NE RESOUT PAS — le refuser, ou exiger une forme explicite de reservation — plutot que de supposer qu'un tel identifiant est forcement une faute. ⚠️ CE QUI REND CETTE FAMILLE COUTEUSE : une attribution fausse envoie le lecteur suivant chercher dans un fichier que personne n'a touche, et gov:identifiants ne peut pas la voir — il juge la FORME d'un identifiant, jamais sa RESOLUTION, et GOV-029 a exactement la bonne forme. A livrer : (1) une garde qui, pour tout fichier suivi de scripts/ et tests/ portant un identifiant de tache dans ses vingt premieres lignes, verifie que cette tache EXISTE au backlog ET que le fichier figure dans ses paths — ou que la tache est explicitement citee comme contexte et non comme proprietaire ; (2) le meme controle sur TOUTE chaine d'une entree de docs/gates.json — pas seulement le champ tache : la lentille schema a mesure que sur gov:plan-state le champ tache vaut GOV-008 et n'a JAMAIS bouge, pendant que toute la valse GOV-029 -> GOV-032 -> GOV-035 se jouait dans la prose du champ verifie. Un controle limite au champ tache aurait rendu VERT sur deux des cinq occurrences qui motivent cette tache, et le livrable (4) aurait ete insatisfiable ; (3) un temoin par famille, vu rougir, et des contre-temoins verts sur les citations legitimes — un fichier a le droit de NOMMER une tache voisine sans etre a elle, et une garde qui l'interdirait serait retiree dans la semaine ; (4) CHACUNE des occurrences enumerees ci-dessus, y compris celle du point (5), rejouee contre la garde livree, chacune vue rougir avant sa correction ; (5) ⚠️ LA GARDE CONFRONTE LE NOM A L'ETAT COURANT DU BACKLOG, ELLE NE VERIFIE PAS UNE FOIS. La cinquieme occurrence le prouve : `docs/gates.json` citait GOV-032 pour la lacune PLAN-STATE, et c'etait DEFENDABLE au moment ou la phrase a ete ecrite — aucune tache ne portait alors cette lacune. Elle est devenue fausse quand GOV-035 a ete creee. Une attribution ne se corrompt donc pas seulement quand l'auteur se trompe : elle se corrompt quand le BACKLOG bouge, et une garde qui ne s'executerait qu'a l'ecriture ne verrait jamais cette moitie-la. ⚠️ TEMOIN DE CLASSE, ET EXPLICITEMENT HORS LIVRAISON DE CETTE TACHE : tests/unit/gouvernance/entite-registre.spec.ts porte 88 titres etiquetes REQ-CPL-018, qui dit « ADR mono-tenant en V1, aucune colonne tenant », alors qu ils parlent d IBAN, de BIC, de SIREN et de corps de PR (la 89e, ligne 267, la teste legitimement). La lentille schema a tranche que cette famille N ENTRE PAS dans le perimetre livrable de GOV-037 : ses confrontations a elle sont MECANISABLES (un nom de tache existe-t-il, le fichier est-il dans ses paths), alors que « ce it() teste un IBAN » contre « REQ-CPL-018 dit mono-tenant » ne l est par aucune garde — l y verser rendrait GOV-037 INFERMABLE, qui est precisement le defaut que cette tache decrit. Elle est donc consignee ici comme OBSERVATION, pour que la garde livree sache dire ce qu elle NE PEUT PAS voir ; la correction des 88 titres est une tache distincte, GOV-039. ⚠️ CINQUIEME LIVRABLE, ajoute au tour 9 et MECANISABLE, lui : confronter le fichier QU UNE TACHE PROMET DE TESTER (son champ tests{}) a ceux qu elle DECLARE TOUCHER (son champ paths). Mesure du 2026-09-05 : ni gov:tasks ni gov:trace ne rougissent quand les deux divergent. ⚠️ CORRECTION DU 10e TOUR, ET ELLE CHANGE LA CIBLE : j'avais decrit cela comme une negligence a corriger tache par tache. Mesure — 9 taches sur 9 de la PR 31 promettent dans tests{} un fichier absent de leurs paths, ET CETTE TACHE-CI AUSSI (3e recursion, relevee par la lentille exactitude). Ce n'est donc pas une negligence : c'est LA CONVENTION — paths porte les fichiers de SOURCE, tests{} porte les SPECIFICATIONS, et les deux sont deliberement disjoints dans tout le backlog. LE VRAI DEFAUT EST DANS LE COMPOSEUR, pas dans les taches : scripts/lot/composer.ts detecte les collisions de lot en comparant t.paths SEUL, si bien que deux lots touchant la meme specification ne se verraient pas. A livrer : que la detection de collision lise AUSSI tests{}, avec un temoin sur deux lots partageant une spec — et NON une reecriture des neuf listes de chemins. ⚠️ Noter au passage que j'ai introduit une INCOHERENCE en ajoutant des specs aux paths de CPL-T01 et GOV-024 : deux taches suivent desormais une convention que les autres ne suivent pas, et c'est a normaliser ici. Le trou par lequel verrou-de-phase.spec.ts est devenu orphelin — dans les paths d aucune tache, dans aucun tests, couvert par sa seule annotation @req — et par lequel GOV-040 a ete ecrite avec le meme defaut le jour ou on le fermait ailleurs. scripts/lot/composer.ts compare t.paths pour detecter les collisions de lot : un fichier promis et non declare lui est invisible. Un temoin vu rougir sur GOV-040 telle qu elle a ete redigee, et un contre-temoin vert sur une tache dont les deux champs concordent. ⚠️ CHIFFRE CORRIGE AU 10e TOUR : j'avais mesure 9 taches sur 9 pour la seule PR 31 ; la lentille schema a mesure 38 TACHES SUR 209 pour le depot entier. Le 5e livrable doit donc dire CE QU'ON FAIT DES 38 — les normaliser, ou declarer la convention et corriger le composeur seul — sinon il est INFERMABLE, ce qui est precisement le defaut que cette tache decrit. ⚠️ SIXIEME LIVRABLE, meme lentille : DIX fichiers sous scripts/, src/ et tests/ sont modifies par la PR 31 et ne figurent dans les paths d'AUCUNE tache — dont scripts/gates/gov-pr.ts lui-meme, et tests/unit/gouvernance/vues-derivees.spec.ts, promis par DEUX tests{}. Une garde qui confronte les fichiers TOUCHES par une PR aux paths declares par ses taches, avec un temoin vu rougir sur ces dix-la.

**Tests.** `tests/unit/gouvernance/attributions-resolvent.spec.ts`

### GOV-030 — `gov:check` designe DEUX choses, et aucune ne fait ce que six documents lui pretent

`1 j` · zone `gouvernance` · depend de `GOV-013`

Couvre : `REQ-DM-003`, `REQ-INT-004`

**Acceptation.** UN SEUL NOM POUR UNE SEULE CHOSE. Aujourd'hui `gov:check` en designe DEUX. (1) L'entree de docs/gates.json decrit une garde de TERMES INTERDITS dont le script scripts/gates/gov-check.ts N'EXISTE PAS, et aucun autre script ne fait ce travail. (2) package.json declare sous le meme nom une CHAINE de gardes de gouvernance qu'AUCUN workflow n'appelle. Six affirmations du depot s'appuient sur la premiere — docs/GLOSSAIRE.md, docs/CONVENTIONS.md, docs/REGLES-MAISON.md (RM-06), packages/contracts/events.ts, REQ-GOV-001 et la vue docs/GATES.md — et la tache qui les promettait, GOV-000, est FUSIONNEE : son acceptance promet le fichier et l'etape de CI, et ni l'un ni l'autre n'existe. A livrer : (1) scripts/gates/gov-check.ts existe, expose un controler() PUR sur une vue INJECTEE et un mode --prove avec un temoin ROUGE par famille et des contre-temoins VERTS, et couvre ce que le registre annonce — termes d'axionia invalides, noms d'evenements en anglais la ou l'exigence impose le francais, listes litterales d'etats hors de leur exigence, synonymes interdits du glossaire, et tout nom d'evenement litteral hors du paquet de contrats ; (2) un CONTRE-TEMOIN prouve que les documents qui EXPLIQUENT la regle peuvent ecrire son contre-exemple entre accents graves — sans quoi la garde interdirait sa propre documentation, defaut deja rencontre et corrige sur gov:identifiants ; (3) le perimetre est IMPRIME avec son compte, `src/` etant vide en phase -1, et « 0 fichier balaye » ne se lit pas comme « aucun defaut » ; (4) l'etape de Gate A qui l'appelle ne porte pas `continue-on-error` ; (5) l'entree du registre recoit sa preuveRouge et docs/GATES.md est regeneree ; (6) les six affirmations disent l'etat REEL de la garde au jour de la livraison. ⚠️ Le choix entre renommer la chaine de package.json et renommer l'entree du registre engage un identifiant que six documents citent : il se tranche par un ADR, pas dans la PR.

**Tests.** `tests/unit/gouvernance/termes-interdits.spec.ts`

### GOV-031 — eslint.config.mjs porte « CE FICHIER N'A JAMAIS ETE EXECUTE », et c'etait vrai

`1 j` · zone `gouvernance` · depend de `GOV-014`

Couvre : `REQ-GOV-018`

**Acceptation.** GOV-014 a livre eslint.config.mjs, .prettierrc.json et .prettierignore, et son propre en-tete avertissait : « CE FICHIER N'A JAMAIS ETE EXECUTE. » Il l'a ete le 2026-09-05, dans un bac d'essai avec les cinq paquets installes : `eslint .` rend 46 erreurs sur 7 fichiers (no-undef 28, no-console 8, no-explicit-any 6, no-irregular-whitespace 2, no-require-imports 2) et `prettier --check .` rend 105 fichiers non formates. Les causes sont dans la CONFIGURATION, pas dans le code : languageOptions.globals absent, donc les globales de Node sont inconnues des scripts ; aucune derogation pour tests/**, donc no-console y frappe ; et scripts/lot/lot.workflow.js est un langage dedie dont les symboles sont injectes par son moteur, il releve d'un `ignores` et non d'un correctif. Le correctif minimal mesure (globals Node + derogation tests) ramene 46 a 25. C'est pourquoi le lot L-1-07 a cable la variante PRUDENTE : les deux etapes gov:conventions, et NI `lint` NI `format:check` — ni comme scripts, ni comme etapes de CI, ni comme devDependencies. La famille outillage_non_epingle ne s'arme que si une etape de CI lance l'outil ; sans etape, rien ne ment. A livrer : (1) la configuration corrigee, chaque derogation portant son motif ; (2) les 5 devDependencies epinglees et les scripts `lint`, `format:check`, `format` ; (3) les etapes de Gate A, SANS continue-on-error ; (4) `pnpm lint` et `pnpm format:check` verts sur le depot, ou tout ecart restant porte une derogation NOMMEE et motivee — jamais une regle desactivee en bloc. Une CI qu'on rend verte en eteignant la regle mesure la regle eteinte.

**Tests.** `tests/unit/gouvernance/gardes-transposees.spec.ts`

### GOV-038 — Attester une livraison faite dans un autre depot, et qualifier toute reference de PR ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-017a`, `GOV-020`

Couvre : `REQ-GOV-008`, `REQ-GOV-025`, `REQ-GOV-026`

**Acceptation.** Un champ attestation { pr, sha entier de 40 hex, fusionneeAt UTC } porte la livraison d une tache dont le repo n est pas partners ; le depot n y est PAS recopie, il se derive de repo par DEPOTS (RM-01). gov:tasks porte sept familles nouvelles, chacune vue rougir, trois contre-temoins verts. Toute reference de PR de tache passe par referencePr() : PR#31 ici, will383842/axion-ia#998 (41d71a7) ailleurs, JAMAIS PR#998 — un numero nu est lu comme une PR de CE depot-ci partout ou il est rendu, et repos/will383842/axion-apporteurs/pulls/998 ne resout pas. gov:inventaire accepte l attestation comme troisieme forme de preuve. gov:trace ne confronte plus au disque local les tests d une tache livree ailleurs et le DIT dans son resume. La resolution EN LIGNE du SHA est dans un mode separe, gov:attestation --en-ligne, hors de pnpm test et de gov:check, et ce mode REFUSE de tourner sans son drapeau : sans ce refus quelqu un le cablerait un jour pour etre complet, et une garde qui lance gh rend la suite non deterministe. AFFAIBLISSEMENT ASSUME ET NOMME : un SHA de 40 hex qui ne designe rien passe gov:tasks — mesure, 0000...0000 passe la forme et --en-ligne le rejette en HTTP 422.

**Tests.** `tests/unit/gouvernance/attestation-inter-depot.spec.ts`

## Phase 0 — Socle technique

### JUR-T02 — SSOT des seuils et **de TOUS les délais du contrat** + garde « aucun littéral »

`0.75 j` · zone `juridique` · sensible : argent, rgpd · depend de `GOV-000`, `JUR-T01` · decisions `W9`

Couvre : `REQ-EXT-028`, `REQ-JUR-015`, `REQ-JUR-029`

**Acceptation.** chaque constante est **nommée d'après son article** — `PRISE_DE_CONTACT_JOURS_OUVRES = 2 // art. 3.2`, `CONFIRMATION_TACITE_JOURS = 30 // art. 3.2`, `FILE_FENETRE_REDECLARATION_JOURS = 15` et `FILE_EXPIRATION_MOIS = 12 // art. 3.5`, `SUSPENSION_MAX_JOURS = 15 // art. 3.7`, `ANTERIORITE_CLIENT_MOIS = 24` et `ANTERIORITE_DEVIS_MOIS = 6 // art. 3.3`, `PEREMPTION_JOURS = 90 // art. 3.4`, `PROLONGATION_DEVIS_MOIS = 3 // art. 3.4 (W9)`, `MISE_EN_DEMEURE_JOURS = 15 // art. 11.2`, `REPONSE_CONTESTATION_JOURS = 15 // art. 3.3 et 5.6`, `CONTESTATION_FACTURE_JOURS = 30 // art. 5.2`, `FORCLUSION_CONTESTATION_MOIS = 12 // art. 5.5`, `REPRISE_MOIS = 12 // art. 4.5`, `VERSEMENT_JOURS_OUVRES = 10` et `VERSEMENT_PLAFOND_JOURS = 60 // art. 5.3`, `SEUIL_VERSEMENT`, `SEUIL_VIGILANCE`, `PREAVIS_JOURS = 30 // art. 11.1`, `PALIER_HORS_GRILLE_JOURS = 60 // annexe A1.7`, `MANDAT_DENONCIATION_JOURS = 30 // annexe 2.5`, `CONFIDENTIALITE_ANS = 2 // art. 9`, `FORCE_MAJEURE_MOIS = 3 // art. 15`. **Aucune constante de gradation ni de contradictoire** n'y figure (décision du 2026-09-03).

### QA-T01 — Squelette de tests et Gate A bloquante

`0.5 j` · zone `qualite` · depend de `GOV-014`

Couvre : `REQ-QA-001`, `REQ-QA-002`, `REQ-QA-013`

**Tests.** `aucune-gate-en-continue-on-error.spec.ts`

### SEC-01 — Secrets distincts et validation d'environnement au boot

`0.5 j` · zone `securite` · depend de `QA-T01`

Couvre : `REQ-SEC-028`

### SEC-02 — En-têtes de sécurité et CSP par nonce

`0.5 j` · zone `securite` · sensible : attribution · depend de `QA-T01`

Couvre : `REQ-SEC-029`

### SEC-10 — Bibliothèque rate-limit avec garde de famille, honeypot observable

`0.5 j` · zone `securite` · depend de `QA-T01`

Couvre : `REQ-SEC-016`, `REQ-SEC-035`

### QA-T08 — Logger pino structuré, redaction PII, Sentry, notify

`0.5 j` · zone `qualite` · sensible : espace, rgpd · depend de `QA-T01`

Couvre : `REQ-QA-024`

### DM-01 — Socle du schéma Partners : conventions, enums de base, journal Evenement chaîné immuable

`1 j` · zone `domaine` · sensible : rgpd · depend de `QA-T01`

Couvre : `REQ-DM-001`, `REQ-DM-024`, `REQ-DM-038`, `REQ-DM-041`, `REQ-JUR-026`, `REQ-SEC-027`

### DM-02 — Gates de schéma : enums, centimes, index partiels, migrations additives

`0.5 j` · zone `domaine` · depend de `DM-01`

Couvre : `REQ-DM-001`, `REQ-DM-003`, `REQ-DM-037`, `REQ-DM-038`, `REQ-JUR-027`

### QA-T02 — Harnais d'intégration testcontainers

`1 j` · zone `qualite` · sensible : attribution · depend de `DM-01`, `QA-T01`

Couvre : `REQ-QA-006`

### QA-T04 — env.ts Zod fail-fast, /api/livez, /api/readyz, entrypoint bloquant, Dockerfile + HEALTHCHECK

`1 j` · zone `qualite` · `schema` · depend de `QA-T02`, `SEC-01`

Couvre : `REQ-CPL-021`, `REQ-QA-019`, `REQ-QA-020`, `REQ-QA-030`

### QA-T03 — Traçabilité REQ→test : requirements.yaml, @req, req:check

`0.5 j` · zone `qualite` · depend de `GOV-011`, `QA-T01`

Couvre : `REQ-QA-014`

**Acceptation.** `req:check` vérifie la PAIRE (tâche, REQ) → test nommé existant, annoté, vert.

**Tests.** `req-check.spec.ts`

### QA-T07 — Gate sécurité : semgrep

`0.5 j` · zone `qualite` · depend de `QA-T01`

Couvre : `REQ-QA-011`, `REQ-QA-013`

### QA-T30 — Stryker sur `src/domain` : seuil aligné sur la mesure puis ≥ 80 % bloquant sur fichiers touchés, complet en nightly

`0.5 j` · zone `qualite` · depend de `QA-T01`

Couvre : `REQ-QA-002`

### CPL-T22 — Job CI « red-first »

`0.5 j` · zone `gouvernance` · depend de `QA-T01`

Couvre : `REQ-CPL-022`

**Acceptation.** tests nouveaux de la PR exécutés contre `main`, doivent échouer sauf `@no-red-first` justifié.

### SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma

`1 j` · zone `securite` · sensible : rgpd · depend de `DM-02`, `SEC-01`

Couvre : `REQ-SEC-024`

### QA-T05 — Pipeline GHCR privé → Coolify pull

`1 j` · zone `qualite` · depend de `QA-T04` · decisions `HYP-E1-5`

Couvre : `REQ-QA-018`, `REQ-QA-032`, `REQ-QA-033`

### QA-T11 — Gate D migrations : base vierge, dump N-1, migrate diff vide, image N-1, lint expand/contract

`1 j` · zone `qualite` · depend de `QA-T05`

Couvre : `REQ-QA-021`

### QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe

`1 j` · zone `qualite` · depend de `QA-T05`

Couvre : `REQ-QA-015`

### QA-T12 — Sauvegarde horaire R2 + drill mensuel

`0.5 j` · zone `qualite` · depend de `DM-01`, `QA-T05`

Couvre : `REQ-QA-023`

### QA-T13 — Workflow rollback + runbooks socle exercés en preview

`0.5 j` · zone `qualite` · depend de `QA-T05`, `QA-T06`

Couvre : `REQ-QA-022`, `REQ-QA-030`, `REQ-QA-034`

### DM-03-A — Export de la grille : GrilleCommission versionnée dérivée de COMMERCIAL_COMMISSIONS + extension SSOT

`0.5 j` · zone `domaine` · `axionia` · sensible : argent · depend de `INT-T01b` · decisions `DEC-BEB-A12`, `HYP-W6`, `W6`

Couvre : `REQ-ARG-031`, `REQ-DM-014`, `REQ-GOV-019`, `REQ-INT-017`, `REQ-JUR-019`

**Acceptation.** garde de COHÉRENCE : chaque id de `pricing.ts` a soit un taux, soit une entrée `bareme_indefini` explicite et datée (HYP-W6) ; ligne absente → rouge ; toute ligne de `PRICING_CATEGORIES` sans `commissionId` → `bareme_indefini` bloquant + alerte au boot.

### DM-03-P — Import de la grille côté Partners : `GrilleCommission` versionnée, `partners:grille:check`

`0.5 j` · zone `domaine` · sensible : argent · depend de `DM-01`, `DM-03-A`

Couvre : `REQ-ARG-031`, `REQ-DM-014`, `REQ-INT-017`

### DM-04 — Fonction pure de calcul de commission et de prorata entier

`0.75 j` · zone `domaine` · sensible : argent, attribution · depend de `DM-03-P`

Couvre : `REQ-ARG-004`, `REQ-ARG-006`, `REQ-ARG-007`, `REQ-ARG-017`, `REQ-DM-015`, `REQ-DM-017`, `REQ-DM-040`

### INT-T02 — Outbox Partners côté axionia

`1 j` · zone `integration` · `axionia` · depend de `INT-T01b`

Couvre : `REQ-INT-001`, `REQ-INT-002`, `REQ-INT-008`, `REQ-INT-009`, `REQ-INT-012`, `REQ-INT-031`

**Tests.** `outbox-produit-des-evenements-valides.spec.ts`

### INT-T03 — Producteurs `client.*` + normalisation SIREN

`0.5 j` · zone `integration` · `axionia` · `schema` · sensible : attribution · depend de `INT-T02`

Couvre : `REQ-DM-021`, `REQ-INT-007`, `REQ-INT-015`

### INT-T04 — Producteur `devis.signe` unifié

`1 j` · zone `integration` · `axionia` · sensible : argent · depend de `DM-03-A`, `INT-T02`

Couvre : `REQ-INT-006`, `REQ-INT-007`

### INT-T05 — Producteurs `facture.emise`, `facture.annulee`, `avoir.emis`, `paiement.recu`, `paiement.rembourse`

`1 j` · zone `integration` · `axionia` · `schema` · sensible : argent, auth · depend de `INT-T02`

Couvre : `REQ-ARG-001`, `REQ-ARG-005`, `REQ-ARG-030`, `REQ-DM-039`, `REQ-INT-004`, `REQ-INT-005`, `REQ-INT-007`, `REQ-INT-032`

### INT-T22 — Producteur `candidature.recue`

`0.5 j` · zone `integration` · `axionia` · depend de `INT-T02`

Couvre : `REQ-CPL-015`, `REQ-DM-035`, `REQ-INT-032`, `REQ-QA-035`

**Acceptation.** émission depuis l'écrivain de `Submission` (cliquet nominatif) ; payload `{candidatureId, reponsesJson, scoreInitial, scorePartsJson, scoreBaremeVersion, sourceCanal, utm, campagneId, parrainCodeCapture}`.

### SEC-06 — Réception des webhooks axionia : signature, tolérance, outbox, rejeu, attente de dépendance, worker

`1 j` · zone `securite` · depend de `INT-T01a`, `INT-T01b`, `QA-T02`, `SEC-01`

Couvre : `REQ-ARG-002`, `REQ-ARG-003`, `REQ-DM-036`, `REQ-INT-010`, `REQ-INT-011`, `REQ-QA-008`, `REQ-QA-009`, `REQ-SEC-010`, `REQ-SEC-011`

### SEC-07 — API entrantes pour axionia : jeton dédié/HMAC, allowlist, réponse minimale, journal

`0.5 j` · zone `securite` · sensible : auth · depend de `SEC-01`

Couvre : `REQ-INT-014`, `REQ-SEC-012`

### SEC-03 — Lien magique apporteur

`1 j` · zone `securite` · sensible : auth · depend de `SEC-01`, `SEC-08`, `SEC-10`

Couvre : `REQ-SEC-001`, `REQ-SEC-002`, `REQ-SEC-016`

### SEC-04 — Sessions révocables en base, `sessionVersion`, step-up

`1 j` · zone `securite` · sensible : auth · depend de `SEC-03`

Couvre : `REQ-SEC-003`, `REQ-SEC-004`

### SEC-05 — Couche d'accès `forApporteur

`1 j` · zone `securite` · depend de `QA-T07`, `SEC-04`

Couvre : `REQ-ARG-029`, `REQ-QA-010`, `REQ-QA-011`, `REQ-QA-012`, `REQ-SEC-008`, `REQ-SEC-009`, `REQ-SEC-022`, `REQ-UX-006`

### SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST

`1 j` · zone `securite` · `schema` · sensible : attribution, espace · depend de `SEC-04`

Couvre : `REQ-SEC-023`, `REQ-UX-024`

### INT-T09 — Client recherche-entreprises : proxy, cache, limiteur, circuit-breaker, repli manuel, minimisation, fixtures enregistrées, contrat nightly

`1 j` · zone `integration` · depend de `GOV-015`, `SEC-10`

Couvre : `REQ-INT-020`, `REQ-INT-021`, `REQ-QA-028`, `REQ-SEC-013`, `REQ-UX-020`

### INT-T10 — Émetteur e-mail Partners : agent ZeptoMail, domaine, DKIM, drapeau DMARC, webhook rebonds

`0.5 j` · zone `integration` · depend de `SEC-01` · decisions `DEC-INT-002`

Couvre : `REQ-INT-022`, `REQ-INT-023`

### INT-T11 — Adaptateur MCP `partners` : porte, serrure, contrat porté, harnais 9 contrôles, manifeste vide

`1 j` · zone `integration` · depend de `SEC-01`

Couvre : `REQ-INT-026`

### INT-T14 — Alertes console par bot Telegram dédié

`0.5 j` · zone `integration` · sensible : espace, rgpd · depend de `QA-T08`

Couvre : `REQ-INT-024`

### DM-06 — Entité Apporteur : statut enum + matrice, snapshot candidature/score, codeParrainage, JetonDepot, `isTest`, `IdentitesFacturation

`1 j` · zone `domaine` · `schema` · sensible : auth · depend de `DM-01`, `DM-02` · decisions `DEC-DM-013`

Couvre : `REQ-CPL-005`, `REQ-CPL-020`, `REQ-CPL-027`, `REQ-DM-010`, `REQ-DM-011`, `REQ-DM-012`, `REQ-DM-035`, `REQ-QA-035`

### JUR-T01 — Gabarit de contrat v1 complet

`0.5 j` · zone `juridique` · depend de `CPL-T01`

Couvre : `REQ-CPL-012`, `REQ-JUR-003`, `REQ-JUR-007`, `REQ-JUR-023`

**Acceptation.** le gabarit reprend `CONTRAT-APPORTEUR-V1.md` **dans sa version corrigée par les cinq examens du 2026-09-03** (12 bloquants + 30 majeurs), annoté des identifiants `CL-*` ; `docs/DECISIONS.md` porte une valeur **tranchée et datée** pour chacune des lignes marquées `avenant` du registre (C1, C12, D9, D11, D14, horodatage E.1-12, point de départ des 12 mois E.1-9). 🔴 **Complétée le 2026-09-03 (synthèse M-20 et P-4).** (1) **Six acceptations distinctes**, et la **note encadrée** qui les signale figure **dans le corps** sous chacun des articles 3.7, 4.5, 5.2, 7, 12 **et** 14 — le corps ne la portait que sous l'art. 14, et la mention « très apparente » de l'art. 48 CPC était renvoyée à une note **hors clause**. (2) La variable `{{APPORTEUR_QUALITE}}` est **alimentée depuis le statut d'exercice recueilli au KYC** (DM-11), jamais saisie à la main : la validité de la clause attributive dépend d'un fait — la qualité de commerçant des deux parties — qu'une part significative des 300 apporteurs (professions libérales, retraités en cumul, associations) ne remplira pas. (3) **Gate lexicale étendue au gabarit de contrat** (P-4 ; elle ne couvrait que `micro-copy/**`, `emails/apporteur/**`, `src/app/(espace)/**`), liste noire : `L.134-12`, `L.134-16`, « indemnité de fin de contrat », « indemnité de clientèle », « renonce », « renonciation » (hors le titre de l'art. 19, exclu nommément), « kit de vente ». C'est le seul moyen d'empêcher qu'une relecture future « améliore » l'art. 11.3 : **une renonciation par avance à un droit d'ordre public est sans effet**, et sa seule présence affaiblit rétrospectivement la portée des articles 1 et 2.

**Tests.** `contract-template-complete.spec.ts`

### JUR-T03 — Corriger la copy publique d'axionia + garde lexicale des textes apporteurs et gate financement inconditionnelle

`1 j` · zone `juridique` · `axionia` · aucune dependance

Couvre : `REQ-JUR-001`, `REQ-JUR-002`, `REQ-JUR-024`

**Acceptation.** `COMMERCIAL_OPPORTUNITY` corrigé (l. 103 et 274 de `commercial-offer.ts`, « n'a parfois même pas à avancer les fonds ») sans lire le drapeau `QUALIOPI_CERTIFICATION_OBTENUE` ; formulation SSOT = phrase validée par Will le 2026-08-19 ; gate lexicale INCONDITIONNELLE sur « prise en charge à 100 % », « financé par Qualiopi », « sans avance de frais », « Qualiopi » nu et toute périphrase ; liste d'exclusion `src/content/keywords/**` (« commercial » toléré seulement là et dans une phrase de désambiguïsation) et badge « N°1 en France » (assumé par Will, hors périmètre).

**Tests.** `vocabulaire-apporteur.spec.ts`

### JUR-T04 — Registre RGPD, LIA, AIPD, mention art. 14, politique de confidentialité

`1.5 j` · zone `juridique` · sensible : attribution, rgpd · depend de `JUR-T02`

Couvre : `REQ-CPL-009`, `REQ-JUR-009`, `REQ-JUR-025`, `REQ-SEC-030`

**Acceptation.** push PWA (APNs/FCM) et Telegram = sous-traitants hors UE, payload sans PII, registre art. 30 + AIPD.

### UX-P0-01 — Vocabulaire et micro-copy SSOT

`0.75 j` · zone `espace` · sensible : attribution · depend de `GOV-006`

Couvre : `REQ-UX-002`, `REQ-UX-003`, `REQ-UX-019`

**Acceptation.** la partie enums et vocabulaire est livrable dès GOV-006 ; les libellés d'états d'attribution sont ajoutés une fois DM-07 livré, dans une PR de suite portant le même identifiant. ⚠️ **Seule exception au contrôle « aucune tâche ne dépend d'une tâche de phase strictement supérieure »** (GOV-017a) : elle est déclarée ici et dans la table de résolution en tête de fichier, et doit être portée par une entrée explicite d'exemption dans `docs/tasks.json` — jamais par un contrôle affaibli. Si l'exemption gêne, la bonne réponse est de découper en `UX-P0-01a` (phase 0, vocabulaire) et `UX-P0-01b` (phase 1, libellés d'états), pas de rendre la garde muette.

### UX-P0-02 — Maquettes des 6 écrans clés + charte de l'espace

`1 j` · zone `espace` · sensible : argent, espace · aucune dependance · decisions `HYP-E1-10`

Couvre : `REQ-UX-008`, `REQ-UX-017`, `REQ-UX-034`

**Acceptation.** `docs/maquettes/<ecran>.html` + `docs/maquettes/VALIDATION.md` (écran · date · validé par Will) ; `docs/ESPACE-ROUTES.md` (route · écran · onglet · REQ · maquette ; HYP-E1-10 : un champ sur `/`, résultat `/entreprise?q=`, onglets Accueil · Mes entreprises · Mes commissions · Plus).

**Tests.** `maquettes-validees.spec.ts`

### UX-P0-03 — Harnais a11y et mobile

`1 j` · zone `espace` · depend de `QA-T01`

Couvre : `REQ-QA-016`, `REQ-UX-017`, `REQ-UX-018`

### QA-T20 — Budget bundle absolu par route + LHCI lab mobile — configuration

`0.5 j` · zone `qualite` · depend de `GOV-019`, `QA-T05`

Couvre : `REQ-QA-031`, `REQ-UX-033`

**Acceptation.** budget 75 KB gz par route mesuré par script maison sur `.next/static/chunks/app/` (une entrée par route) ; non bloquant jusqu'à QA-T20b (seuil aligné d'abord, blocage ensuite).

### JUR-T29 — Copy publique de rémunération en formulation indicative

`0.5 j` · zone `juridique` · `axionia` · sensible : argent · depend de `JUR-T03` · decisions `W12`

Couvre : `REQ-JUR-001`, `REQ-JUR-002`, `REQ-JUR-019`, `REQ-JUR-041`

**Acceptation.** toute mention de rémunération d'apporteur dans la copy publique d'axionia — pages, landings, **documents de présentation** (l'expression « kit de vente » est bannie, REQ-JUR-041 / JUR-T30 : le contrat ne peut pas nommer « vente » ce que l'art. 1.2 dit n'être pas une vente), micro-copy, blocs JSON-LD — passe en formulation **indicative** (« à partir de », « selon profil », « à titre indicatif ») ; aucun taux ni montant présenté comme ferme ; les blocs JSON-LD ne portent aucune valeur de commission ; garde `jur:remuneration-indicative` importée de la SSOT, qui rougit sur une formulation ferme (un montant, un taux, « vous touchez », « commission de X % ») **non accompagnée** d'une mention indicative.

**Tests.** `remuneration-indicative.spec.ts`

### CPL-T13 — Module `temps` : Clock injectable, Europe/Paris, calendrier fériés FR, SLA commun, règle D3 en fonction pure

`1 j` · zone `gouvernance` · depend de `QA-T01`

Couvre : `REQ-CPL-013`, `REQ-CPL-026`, `REQ-QA-027`, `REQ-UX-022`, `REQ-UX-028`

**Acceptation.** `seuilPrioritaire()` = `min(palierConfiance, capaciteRestante)` ; `surchargeManuelle > 0` remplace le min ; une seule fonction pure, consommée par DM-09 et UX-P1-07.

### JUR-T26 — Gates structurelles de la charte relationnelle

`0.5 j` · zone `juridique` · sensible : espace · depend de `QA-T01`, `SEC-17`

Couvre : `REQ-JUR-034`, `REQ-JUR-035`, `REQ-JUR-036`, `REQ-JUR-037`

**Acceptation.** `jur:aucun-agregat-reseau` (analyse AST des DTO de l'espace), `jur:aucune-progression` (noms et types interdits), gate lexicale durcie sur `src/app/(espace)/**` + `emails/apporteur/**` + `micro-copy/**` + ressources, et label `apporteur-facing` → revue `juriste` bloquante déclarée dans CODEOWNERS.

### JUR-T27 — Gabarit de contrat sobre : retrait de la déchéance, du barème gradué et du vocabulaire disciplinaire

`0.5 j` · zone `juridique` · sensible : attribution, espace, rgpd · depend de `JUR-T01` · decisions `HYP-D11`, `W11`

Couvre : `REQ-JUR-031`

**Acceptation.** le gabarit ne contient plus « déchéance », « sanction », « faute grave », « contradictoire », ni aucun barème de gradation ; il conserve les clauses de protection (SIREN, 12 mois, absence d'exclusivité et de mandat, premier déclarant, parrainage sur ventes, CPF, RGPD, autofacturation, compétence).

**Tests.** `contrat-sobre.spec.ts`

### GOV-039 — Quatre-vingt-huit titres de test etiquetes par l'exigence d'un AUTRE sujet

`0.5 j` · zone `gouvernance` · depend de `GOV-037`

Couvre : `REQ-QA-014`

**Acceptation.** Le fichier de la garde d ARGENT porte 88 titres etiquetes REQ-CPL-018 — « ADR mono-tenant en V1, aucune colonne tenant » — alors qu ils parlent d IBAN, de BIC, de SIREN et de corps de PR. La 89e occurrence, ligne 267, la teste legitimement et NE DOIT PAS bouger. ⚠️ CE QUI REND CETTE TACHE PARTICULIERE : ce n est PAS une dette heritee. La lentille exactitude l a mesure — git cat-file -e 794245c:<fichier> rend 128, le fichier est AJOUTE par la PR 31 — et l orchestrateur avait affirme le contraire dans un message de commit et dans trois consignes d agents. Le report a ete juge tenable par DEUX lentilles au huitieme tour (« 84 titres reecrits au huitieme tour serait pire », et « rien de faux ne passe une gate » : gov:trace rend au grain du FICHIER, aucun compte de 89 n est publie, l exigence est couverte au fond). A livrer : chaque titre porte l identifiant de l exigence qu il teste reellement ; le mapping CPL-T01.tests suit ; docs/TRACABILITE.md re-derive ; et la ligne 267 reste intacte, avec un temoin qui la protege. ⚠️ AUCUNE GARDE NE PEUT VERIFIER CE TRAVAIL : confronter « ce it() teste un IBAN » au TEXTE de l exigence n est pas mecanisable — c est ce qui l a fait sortir du perimetre de GOV-037, et c est pourquoi cette tache exige une relecture nommee plutot qu un vert. La mesure de la lentille exactitude borne le probleme : sur les 29 fichiers de spec, AUCUN AUTRE n est dans ce cas (la deuxieme concentration est de 47 titres sur trois fichiers, et sur son propre sujet). ⚠️ L EXIGENCE JUSTE EST REQ-GOV-005, et elle etait sous les yeux : « la matrice de tracabilite est DERIVEE (jamais redigee a la main) : les TITRES it() CONTIENNENT L IDENTIFIANT REQ ». Les 88 titres la violent donc a la lettre. Et cela eclaire ce que la lentille mutation a mesure : gov:trace implemente la FORME de cette exigence — un titre contient un identifiant — et jamais sa RESOLUTION. Pire, elle PROPAGE la faute : une fausse attribution fait rougir gov:trace pour la mauvaise raison (vue_divergente), et le geste que ce rouge prescrit — gov:trace --render — rend l attribution OFFICIELLE et tout repasse au vert. A livrer donc, en plus de la correction des titres : tests/unit/gouvernance/titres-de-test-resolvent.spec.ts , qui confronte l identifiant qu un titre s attribue au TEXTE de l exigence nommee, avec un temoin vu rougir sur les 88 cas reels et des contre-temoins verts sur les titres justes. ⚠️ Ma premiere redaction de cette tache declarait REQ-GOV-021, testee par entite-registre.spec.ts — un fichier qui ne cite JAMAIS cette exigence. gov:trace l a refuse en req_non_citee_par_son_test. La tache qui denonce les mauvaises attributions en portait une. ⚠️⚠️ DEUXIEME MAUVAISE ATTRIBUTION DANS LA TACHE QUI LES DENONCE, et la lentille schema l a trouvee en ACCEPTANT. Ma premiere redaction declarait REQ-GOV-021, que le fichier promis ne cite jamais — gov:trace l a refusee. J ai alors ecrit « l exigence juste etait sous mes yeux, REQ-GOV-005 » : elle est ABSORBEE (remplaceePar REQ-QA-014), et la clause dont je me servais pour la justifier — « les titres it() contiennent l identifiant REQ » — ne vit QUE dans le texte absorbe. REQ-QA-014, le texte EN VIGUEUR, parle d annotations @req et de req:check, JAMAIS des titres it(). J avais donc ancre cette tache sur une exigence morte et l avais justifiee par une clause sans porteur vivant. L exigence portee est desormais REQ-QA-014. ⚠️ CE QUE CELA REVELE, et qui est le vrai livrable de cette tache : la clause sur les titres it() a ete PERDUE a l absorption. Une exigence absorbee emporte avec elle ce que sa remplacante ne reprend pas, et rien ne le signale. Le gardien-spec doit trancher : ou bien la clause revient dans REQ-QA-014, ou bien elle est abandonnee sciemment — mais elle ne peut pas rester dans un texte que le depot declare remplace. ⚠️⚠️ MA PREMISSE ETAIT FAUSSE, ET LA LENTILLE schema L'A MESURE AU 10e TOUR. J'avais ecrit que la clause « les titres it() contiennent l'identifiant REQ » avait ete PERDUE a l'absorption de REQ-GOV-005. Elle n'a pas ete perdue : elle est dans le TEXTE DECIDE. docs/REQUIREMENTS-ANNEXE-FUSIONS.md porte l'arbitrage rendu — « garder REQ-QA-014, absorber REQ-GOV-005 -> Chaque exigence est referencee par >= 1 test vert DONT LE TITRE it() CONTIENT SON IDENTIFIANT (marqueur unique, pas d'annotation parallele) ; les corps de PR listent Couvre: REQ-… ; pnpm req:check derive la matrice ». Le texte APPLIQUE dans docs/requirements.json dit l'INVERSE : « via l'annotation @req ». LE GARDIEN-SPEC N'A DONC RIEN A TRANCHER — il a a APPLIQUER un arbitrage deja rendu, ou a le rouvrir par un ADR. Et la perte est de QUATRE clauses, pas d'une : sur 321 exigences actives, ZERO contient gov:trace, ZERO contient Couvre:, UNE contient it(). ⚠️ LA FAMILLE EST DE 34 ABSORBEES, et la confrontation est MECANISABLE — c'est RM-01 applique aux exigences : le texte SURVIVANT doit contenir le texte DECIDE. A livrer donc, en plus des titres : une garde qui confronte docs/REQUIREMENTS-ANNEXE-FUSIONS.md a docs/requirements.json sur les 34 fusions, avec un temoin vu rougir sur REQ-QA-014 telle qu'elle est aujourd'hui. C'est cette garde qui aurait rendu la tache inutile, et c'est elle qui manque.

**Tests.** `tests/unit/gouvernance/titres-de-test-resolvent.spec.ts`

### GOV-040 — Le registre d'exemptions n'a AUCUNE des deux surfaces qui arment une machine

`0.5 j` · zone `gouvernance` · depend de `GOV-023`

Couvre : `REQ-GOV-031`

**Acceptation.** Mesure de la lentille schema au 8e tour de la PR 31 : des CINQ surfaces de gouvernance que partners/ADR-0010 prend pour etalon, DEUX SEULEMENT arment une machine — le deny de .claude/settings.json et le label du §7 de la charte. config/exemptions-corps-publie.json — le seul fichier du depot qui puisse ABSOUDRE un rouge bloquant de Gate A — est passe de 0/5 a 3/5 SANS OBTENIR NI L UNE NI L AUTRE : .github/CODEOWNERS porte deja un attrape-tout au meme proprietaire, donc la ligne ajoutee ne declenche aucune demande de revue nouvelle, et le label du §7 vaut « — ». Ce qui protege aujourd hui est la lentille securite, exigee sur TOUTE PR (DEUX_PREMIERES dans scripts/lot/revues.ts) — un controle reel mais qui ne vise pas ce fichier en particulier. A livrer : le deny sur ce chemin dans .claude/settings.json, plus le temoin qui rougit s il disparait. ⚠️ CE TRAVAIL NE PEUT PAS SE FAIRE EN SESSION : .claude/settings.json est precisement le fichier qu aucun agent en session n a le droit d ecrire (charte §7), et il s ecrit par le lot dedie lance avec --settings surcharge, comme GOV-000 et GOV-023. Le §7 ne l interdit pas : IL LE DESIGNE. C est cette lecture qui a manque a l orchestrateur, qui avait pris le panneau pour un mur. ⚠️ Cette tache a ete ecrite avec le defaut qu elle cotoie : ses paths ne portaient que .claude/settings.json alors que son tests{} promet un temoin dans un AUTRE fichier — ce que j'ai d'abord pris pour la lacune par laquelle verrou-de-phase.spec.ts etait devenu orphelin, et que j'ai declare « fermee sur CPL-T01 le jour meme » — CETTE PHRASE ETAIT FAUSSE, la lentille exactitude l'a mesure au 10e tour et ma propre mesure est pire que la sienne : 9 taches sur 9 de la PR 31 sont dans ce cas, GOV-037 comprise. Ce n'est donc pas une negligence mais LA CONVENTION du depot — paths porte la SOURCE, tests{} porte les SPECIFICATIONS, deliberement disjoints. scripts/lot/composer.ts compare t.paths pour detecter les collisions de lot : le fichier promis lui serait reste invisible. Mesure : ni gov:tasks ni gov:trace ne rougissent sur ce cas — AUCUNE GARDE NE CONFRONTE LE FICHIER QU UNE TACHE PROMET DE TESTER A CEUX QU ELLE DECLARE TOUCHER. Cette confrontation-la, contrairement a celle des titres, EST mecanisable : elle appartient a GOV-037.

**Tests.** `tests/unit/gouvernance/entite-registre.spec.ts`

### GOV-041 — La cloture ecrit un statut sur une entree qu'elle n'a pas verifiee

`0.5 j` · zone `gouvernance` · depend de `GOV-038`

Couvre : `REQ-GOV-021`, `REQ-GOV-026`

**Acceptation.** Deux trous de `scripts/lot/cloture.ts`, mesures le 2026-09-09, aucun introduit par une PR, aucun corrige alors (charte A11). (1) UNE TACHE ETRANGERE AU LOT PASSE : un dixieme resultat pour GOV-035, jamais dans la PR, a fait ecrire dix `fusionnee` sans un mot, puis `gov:check` 15/15 et vitest 614/614 ; la cloture pose `t.lot = lotId` INCONDITIONNELLEMENT. (2) UN `lotId` ABSENT EST PERMIS la ou un `lotId` FAUX est refuse : le controle s'ecrit `if (rendu.lotId && ...)` — une absence lue comme une autorisation. Les deux se ferment par des refus NOMMES, chacun vu rougir avec son message verbatim, et un contre-temoin vert par refus. PERIMETRE, ET IL A ETE RETRECI APRES MESURE : le troisieme trou de la liste du 2026-09-09 — « un sha inexistant passe » — n'est plus vrai tel qu'il etait ecrit. La PR 33, que ce lot clot, a livre le champ `attestation { pr, sha, fusionneeAt }` et un refus qui bloque le passage `fusionnee` sans les trois. Mais ce refus ne s'arme QUE si le depot de la tache n'est pas `partners`, et une seule tache du backlog porte une attestation (INT-T01b, livree chez axionia) : pour une tache LOCALE, rien n'ecrit ni ne verifie le sha. Ce reste-la est porte par GOV-042, qui etend l'attestation aux taches locales ; il n'est pas traite ici, et cette tache ne le recouvre plus.

**Tests.** `tests/unit/gouvernance/cloture-refuse-ce-qu-elle-n-a-pas-mesure.spec.ts`

### GOV-042 — L'attestation d'une livraison existe pour l'autre depot, pas pour celui-ci

`1 j` · zone `gouvernance` · `schema` · depend de `GOV-038`

Couvre : `REQ-GOV-026`

**Acceptation.** ETAT MESURE le 2026-09-12. Le champ `attestation { pr, sha de 40 hex, fusionneeAt }` EXISTE, il est declare au schema, `lot:cloture` REFUSE le passage `fusionnee` sans ses trois valeurs, et `gov:tasks` en juge la forme (familles attestation_sha_non_conforme, attestation_date_non_conforme). Mais tout cela ne s'arme QUE si le depot de la tache n'est pas `partners` : la condition est dans `scripts/lot/cloture.ts` et gouverne tout le bloc. Mesure : 1 tache porte une attestation (INT-T01b, chez axionia) ; 33 taches `fusionnee` en `repo: partners`, ZERO avec un sha. Une tache locale passe donc `fusionnee` avec un `pr` nu, et rien ne conserve la trace du commit qui l'a fait atterrir. Consequence mesuree le 2026-09-09 sur la chaine de gardes d'alors : GOV-035 passee `fusionnee` A LA MAIN dans `docs/tasks.json`, sans aucun `resultat.json`, la laissait entierement verte — le `deny` de `.claude/settings.json` protege l'outil d'un agent, il ne protege pas le fichier. Et l'invariant qui aurait pu le voir est tenu par un fichier que le depot ne VOIT pas : `docs/lots/` est gitignore, verifie par `git log --all --diff-filter=A -- docs/lots` qui ne rend rien sur aucune branche, et seul `rendre-resultat-lot.mjs`, hors depot, mesure `git merge-base --is-ancestor`. LA TACHE ETEND l'attestation aux taches locales — elle n'en invente pas une deuxieme forme (RM-01) — et une garde confronte les deux populations dans les DEUX SENS : un statut `fusionnee` sans attestation, une attestation sans statut. Contre-temoin obligatoire : les taches livrees hors depot, qui portent deja la leur, doivent RESTER vertes. CE QUE CETTE TACHE NE DEMANDE PLUS, ET POURQUOI : une premiere redaction ordonnait de corriger un commentaire de `scripts/lot/revues.ts` cense affirmer a tort que `lot:cloture` verifie l'atterrissage. La lentille exactitude a mesure que ce commentaire ne parle pas de `lot:cloture` mais de `rendre-resultat-lot.mjs`, qui mesure bel et bien l'atterrissage : il est VRAI, et la correction demandee etait une faute. Elle est retiree.

**Tests.** `tests/unit/gouvernance/un-statut-fusionnee-porte-sa-preuve.spec.ts`

### GOV-043 — Le controle compensatoire de la tracabilite ne couvre qu'un quart du backlog

`0.75 j` · zone `gouvernance` · depend de `GOV-038`

Couvre : `REQ-GOV-005`

**Acceptation.** `gov:trace` est le controle compensatoire invoque chaque fois qu'un trou de `lot:cloture` est juge tolerable. Mesure du 2026-09-09 : il couvre 48 taches sur 209 ; SEC-01, SEC-02 et INT-T01b en sont absentes ; et `gov:inventaire` compte une tache FABRIQUEE comme portant une preuve qui resout. La tache n'etend PAS la couverture. Elle exige que la garde RENDE son perimetre et son complement, chiffre par chiffre, dans son resume, et qu'un PLANCHER declare rougisse quand la couverture baisse. RM-02 : le plancher est vu rougir en le franchissant par le bas, et un contre-temoin verifie qu'il reste vert quand la couverture monte.

**Tests.** `tests/unit/gouvernance/trace-dit-ce-qu-elle-ne-couvre-pas.spec.ts`

### GOV-044 — Une garde absente du registre s'exempte elle-meme de la garde qui verifie qu'on l'appelle

`0.5 j` · zone `gouvernance` · depend de `GOV-038`

Couvre : `REQ-GOV-012`

**Acceptation.** Mesure du 2026-09-12 : `scripts/gates/gov-attestation.ts` est le SEUL des 24 scripts de garde du disque absent de `docs/gates.json`. La famille `garde_ecrite_jamais_appelee` derive son perimetre du REGISTRE : un script absent du registre n'est donc jamais confronte a la question de savoir si quelqu'un l'appelle. C'est la forme exacte du defaut que le lot L-1-05 vient de renverser ailleurs (GARDES_QUI_BALAIENT), reintroduite le meme jour — une population DERIVEE DE LA PRESENCE DU CORRECTIF ne verra jamais celui qui le PERD. Le perimetre se derive du DISQUE (`scripts/gates/*.ts` suivis par git) et le registre devient ce qu'on lui confronte, pas ce dont on part ; le decompte des deux populations est RENDU. Une garde du disque absente du registre est un refus NOMME, vu rouge sur `gov-attestation.ts` lui-meme avant sa correction. L'inverse — une entree de registre sans script — reste le refus `script_introuvable` deja en place, et un contre-temoin verifie qu'il n'a pas bouge.

**Tests.** `tests/unit/gouvernance/perimetre-des-gardes-derive-du-disque.spec.ts`

### GOV-045 — Le cliquet des refus garde un COMPTE, jamais une IDENTITE

`0.75 j` · zone `gouvernance` · depend de `GOV-038`

Couvre : `REQ-GOV-012`, `REQ-GOV-024`

**Acceptation.** Le cliquet compte les sorties non nulles sous `scripts/` et les confronte a un registre DECLARE. MESURE SUR CE SHA, et DEUX de mes affirmations precedentes etaient FAUSSES — la lentille exactitude les a dementies, la seconde PAR MUTATION. L'ETAT : 12 fichiers declares, somme des `total` = 35, somme des `porte` = 71 ; 12 fichiers sur les 33 qui portent une sortie non nulle, sur 45 scripts suivis. PREMIERE CORRECTION : j'avais ecrit « 8 entrees a delta nul ». Le 8 comptait les entrees ou `total` egale `porte`, ce qui n'est pas un delta. Le delta que le cliquet lit est celui du DIFF COURANT : sur cette tete, `main` ayant absorbe les PR 31 et 32, les DOUZE entrees sur douze ont un delta de zero. Le registre n'est pas un journal du diff, c'est la DETTE du depot. SECONDE CORRECTION, et elle change la nature du defaut : j'avais ecrit que « retirer un refus et en ajouter un autre AILLEURS laisse le cliquet vert ». C'est FAUX, et la mutation le montre — un echange ENTRE FICHIERS est ROUGE et NOMME le fichier, parce que le controle exige `total === n` fichier par fichier sur ce que le diff ajoute. Ce qui reste vert est l'echange DANS UN MEME FICHIER, et il porte sur les 71 sorties absolues, pas sur un ecart de 36. LE DEFAUT REEL, DONC, EST PLUS ETROIT ET PLUS PRECIS QUE CE QUE J'ANNONCAIS : a l'interieur d'un fichier declare, les sorties sont interchangeables ; et 21 fichiers sur 33 ne sont gardes que par le total global. La tache attache a chaque sortie declaree un TEMOIN NOMME : retirer un refus doit faire rougir CE refus-la, pas seulement son fichier. RM-02 sur chacun, par MUTATION : retirer une sortie precise et constater QUEL test tombe, pas seulement QU'UN test tombe. Elle NOMME et COMPTE les fichiers qu'elle laisse hors registre. Tous les chiffres ci-dessus sont DATES du 2026-09-12 : ils se remesurent, ils ne se recopient pas — c'est en les recopiant que je me suis trompe deux fois.

**Tests.** `tests/unit/gouvernance/cliquet-nomme-chaque-refus.spec.ts`

### GOV-046 — Un septieme faux vert de la meme famille, sans porteur ni temoin de famille

`0.5 j` · zone `gouvernance` · depend de `GOV-019`

Couvre : `REQ-GOV-012`

**Acceptation.** `scripts/gates/perf-budgets.ts` porte `if (!existsSync(racine)) return []` : un chemin absent rend une liste VIDE, donc zero violation, donc vert. C'est la septieme occurrence de la famille fermee par la PR 31 (cinq gardes) puis par la PR 33 (`gov-conventions.ts`, arrivee SANS conflit parce qu'un fichier ajoute d'un seul cote ne se confronte a rien), et la seule qu'aucune tache ne porte. Elle se ferme comme les six autres, par la source unique du perimetre, qui REFUSE plutot que de rendre vide, vue rougir sur une racine absente avant correction ; le contre-temoin est le cas legitime ou le dossier existe et ne porte aucune violation, qui doit RESTER vert. LE VRAI LIVRABLE EST LE TEMOIN DE FAMILLE, et c'est la mesure de la lentille simplicite qui l'exige : le temoin actuel ne balaie que les gardes qui IMPORTENT DEJA la primitive du perimetre, donc il ne verra jamais un `existsSync(racine) => return []` NEUF, ecrit demain dans une garde qui n'importe rien. La famille se derive du DISQUE — toute garde de `scripts/gates/` qui rend une liste depuis un chemin — et le temoin est vu rougir sur une occurrence FABRIQUEE dans une garde qui n'importait pas la primitive.

**Tests.** `tests/unit/gouvernance/perf-budgets-refuse-un-perimetre-absent.spec.ts`

### GOV-047 — Six porteurs ordonnent une commande qui n'existe pas, dont un qui l'injecte dans chaque prompt

`0.5 j` · zone `gouvernance` · depend de `GOV-000`

Couvre : `REQ-GOV-013`

**Acceptation.** Mesure du 2026-09-12, RECTIFIEE DEUX FOIS PAR LA MEME LENTILLE. Premiere redaction : « quatre documents », dont un qui N'EXISTE PAS (`docs/PROMPTS/dev-partners.md`). Deuxieme : « cinq porteurs suivis par git », alors que le balayage qu'elle exige elle-meme, `git grep -l prevol`, rend NEUF fichiers. L'ECART EST LE SUJET DE LA TACHE. Sur ces neuf, SIX sont des porteurs reels : `.claude/agents/dev-partners.md`, `docs/agents.json` qui en est la source, `docs/CHARTE-AGENTS.md`, `docs/CONVENTIONS.md`, `docs/PROMPTS/developpeur.md`, et le plus mordant `scripts/lot/lot.workflow.js`, qui INJECTE la commande introuvable dans le prompt de chaque developpeur de lot. Les TROIS autres sont `docs/tasks.json` et ses vues derivees `docs/TASKS.md` et `docs/paths-proposes.json`, qui portent la chaine UNIQUEMENT PARCE QUE CETTE TACHE Y EST VERSEE : une tache qui se compte elle-meme fausse son propre balayage. Le balayage livre EXCLUT donc le backlog et ses vues derivees, et il le DIT dans son resume, avec les deux comptes. Le script n'existe pas : chaque agent qui suit sa fiche lance une commande introuvable. C'est la seule des trois clauses non tenues de GOV-000 qui MORD aujourd'hui. La tache livre `pnpm prevol` et le cable. IL NE DECLARE RIEN DE NEUF : la chaine qu'il enchaine se DERIVE de `docs/gates.json` et du script `gov:check` de `package.json` (RM-01) — une deuxieme declaration de « ce qui doit etre vert avant une PR » serait exactement la faute que ce lot passe sa vie a fermer. Il DIT ce qu'il a lance, et il REFUSE — sortie non nulle — plutot que de rendre vert un maillon qu'il n'a pas pu jouer. Une garde confronte les porteurs a l'existence du script, DANS LES DEUX SENS : un porteur qui ordonne une commande absente rougit, et le retrait du script rougit AVANT que le prochain agent ne le decouvre. Ce que la tache ne fait pas : elle ne rouvre pas GOV-000, dont les deux autres clauses restent a arbitrer.

**Tests.** `tests/unit/gouvernance/prevol-existe-et-refuse.spec.ts`

### GOV-048 — La garde des affirmations envoie le code de CE depot dans le registre du depot VOISIN

`0.5 j` · zone `gouvernance` · depend de `GOV-038`

Couvre : `REQ-GOV-004`

**Acceptation.** Mesure du 2026-09-12, rendue par la garde elle-meme : le versement des taches GOV-041 a GOV-047 a fait rougir `source_axionia_sans_repere` SEPT fois, sur des chemins qui sont TOUS ceux du depot Partners — `scripts/lot/cloture.ts`, `scripts/lot/revues.ts`, `scripts/gates/perf-budgets.ts`, `docs/CHARTE-AGENTS.md`, `docs/CONVENTIONS.md`, `docs/PROMPTS/developpeur.md`. La garde exige pour chacun un repere AFF-nn de `docs/AFFIRMATIONS-AXIONIA.md`, dont l'en-tete declare pourtant un objet unique : « Depot axionia, branche main, commit ad53f14a81f559c806500a78a6e545bba20ada88 ». Y inscrire du code de Partners aurait rendu cet en-tete FAUX. La garde est trop large d'un depot : elle lit le motif `chemin.ext:ligne` sans regarder DE QUEL depot le chemin parle. CONTOURNEMENT PRIS le 2026-09-12, et c'est pourquoi cette tache existe : les sept numeros de ligne ont ete RETIRES des acceptances plutot qu'inscrits au mauvais registre — le fait reste vrai et localisable, la precision est perdue. La tache distingue les deux depots : une affirmation sur du code de Partners se prouve par l'historique de Partners (un sha de CE depot), une affirmation sur axionia garde son repere AFF-nn. Vue rougir dans les DEUX sens : un chemin d'axionia sans repere reste refuse — contre-temoin sur REQ-JUR-024 / AFF-47, qui ne doit pas bouger — et un chemin de Partners cite avec sa ligne sans preuve datee rougit de son propre refus, distinct et nomme.

**Tests.** `tests/unit/gouvernance/sonde-distingue-les-deux-depots.spec.ts`

### GOV-049 — Une tache en cours sans lot est invisible de TOUTES les gardes, et c'est ce lot qui l'a rencontre

`0.5 j` · zone `gouvernance` · `schema` · depend de `GOV-038`

Couvre : `REQ-GOV-021`

**Acceptation.** LE NEUVIEME TROU, ET LE SEUL QUE LE LOT L-1-05 A RENCONTRE EN FAISANT SON TRAVAIL — les huit autres etaient connus depuis le 2026-09-09. GOV-038, `en_cours`, portait `lot: null` : nee sur une branche orpheline avant le passage du composeur. La liste des taches d'une cloture se DERIVE du champ `lot` (`rendre-resultat-lot.mjs`, refus 1), parce que `docs/lots/` est hors git. Une tache `en_cours` sans lot n'est donc vue par AUCUNE cloture, et resterait `en_cours` pour toujours. MESURE PAR MUTATION le 2026-09-12, PUIS REFAITE INDEPENDAMMENT par la lentille exactitude sur un clone avec historique — les deux concordent : l'etat d'avant la PR reconstitue (GOV-038 remise a `lot: null`, statut `en_cours`), quatre vues regenerees, `pnpm gov:check` rend 16 bannieres vertes, exit 0 ; et dans la variante ou le statut est laisse `fusionnee`, il reste vert sans meme regenerer. Aucune famille de `gov-tasks.ts` ni de `gov-etat.ts` ne couvre le cas. LA REGLE VA AU SCHEMA, et c'est un changement de la premiere redaction, exige par la lentille simplicite : une clause JUMELLE y vit deja (`fusionnee` implique `owner` et `branch` requis), et GOV-050, versee dans la meme PR, argumente qu'une regle de cette forme va au schema — la poser dans une garde aurait rendu les deux taches contradictoires. Le schema exige donc un `lot` des que le statut vaut `en_cours` ou au-dela. Vu rougir sur l'etat reconstitue ci-dessus. Contre-temoin : les taches `a_faire`, qui n'ont legitimement pas de lot, restent vertes — un refus qui les condamnerait bloquerait tout le backlog. A NOMMER dans l'acceptance de la livraison si le cas est laisse ouvert : le symetrique, un `lot` porte par une tache `a_faire`.

**Tests.** `tests/unit/gouvernance/une-tache-en-cours-appartient-a-un-lot.spec.ts`

### GOV-050 — Le champ paths n'a AUCUNE forme : un chemin hors du depot traverse toute la chaine

`0.5 j` · zone `gouvernance` · `schema` · depend de `GOV-038`

Couvre : `REQ-GOV-021`

**Acceptation.** LE DEFAUT, MESURE PAR MUTATION le 2026-09-12 : le schema ne pose sur `paths` que `items: { type: string }` — aucune forme. Un chemin remontant hors du depot traverse alors toute la chaine : ecrivain exit 0, `gov:tasks` exit 0, `pnpm gov:check` 16/16 exit 0 apres regeneration des vues. Refait independamment par une seconde lentille. Le champ EST lu — la famille `isolation_depot` tire sur un chemin d'axionia — c'est la FORME qui manque, pas la lecture. LA TACHE POSE LA FORME AU SCHEMA, la ou tous les ecrivains la rencontrent. LE CRITERE, ENONCE POSITIVEMENT — un chemin normal : (a) ne porte AUCUN caractere de la classe Unicode C ; (b) ne porte AUCUN blanc Unicode en bordure d'AUCUN SEGMENT ; (c) ne porte AUCUNE sequence percent-encodee ; (d) est EGAL a sa forme canonique, et ne sort pas du depot — pas de remontant en tete, pas de racine, pas de lettre de lecteur, pas d'antislash. ⚠️ LA CLAUSE (b) NE PARLE QUE DES SEGMENTS, ET C'EST UNE CORRECTION MESUREE : une redaction ajoutait « en bordure de la CHAINE ni d'aucun segment », et le test separe des bords de la chaine etait du CODE MORT — les 25 caracteres White_Space d'Unicode joues dans 8 positions, 200 formes, changent ZERO verdict quand on le desarme, parce que le premier segment commence ou commence la chaine. Une clause annoncee qui ne tient rien est un invariant que rien ne tient : la poser AU SCHEMA serait le figer. Aucune lentille ne l'exigeait ; c'est la mesure qui a decide. Chaque clause est une CLASSE FERMEE ou une PROPRIETE VERIFIABLE, jamais une enumeration de membres : c'est le point sur lequel quatre redactions successives de l'ecrivain provisoire ont echoue, chacune mesuree fausse par une lentille. Trois precisions qui ont chacune coute un tour : c'est `\p{C}` et non `\p{Cf}`, sans quoi `Cn` et `Co` passent ; c'est `White_Space` et non `\s`, qui n'en est que la moitie ; et un remontant EN TETE survit a la normalisation, donc le controle du segment reste necessaire a cote. LE CONTRE-TEMOIN EST LE VRAI LIVRABLE, ET IL A TUE QUATRE REDACTIONS. Il balaie TOUS les chemins que le depot declare — l'UNION de ceux de `docs/tasks.json` et de `docs/paths-proposes.json` — et exige ZERO refus, en RENDANT le compte au lieu de l'attendre. ⚠️ AUCUN NOMBRE N'EST GRAVE ICI, et c'est une lecon payee : une redaction precedente citait « 396 + 281 » ; ce compte etait celui de la tete de la veille, c'etait une SOMME la ou 69 chemins appartiennent aux deux corpus, et la tache GOV-051 versee dans le MEME commit en ajoutait un. Une acceptance qui fige un compte que son propre commit fait bouger se perime toute seule. Le contre-temoin doit AUSSI laisser passer les formes qu'une lentille a jugees sans consommateur : les refuser serait retomber dans la premiere redaction, qui interdisait du legitime en silence. TROIS LIMITES DE FOND, MESUREES, ET LA TROISIEME EST LA PLUS IMPORTANTE. Ce controle est SYNTAXIQUE : il refuse la forme percent-encodee sans jamais DECODER, et il ne verra jamais un lien symbolique. ET IL NE FERMERA JAMAIS LES HOMOGLYPHES — un `a` cyrillique desarme le meme consommateur, et c'est une lettre ordinaire. Deux lentilles l'ont mesure separement et ont REFUSE d'en faire un motif, au meme argument : l'exiger serait demander l'article suivant d'un inventaire, c'est-a-dire reproduire le defaut quatre fois constate. LA PROPRIETE PROTEGEE N'EST PAS UNE PROPRIETE DU CHEMIN, C'EST UNE PROPRIETE DE LA COMPARAISON : c'est GOV-051 qui la porte, et cette tache-ci ne pretend pas la fermer. L'HISTOIRE DES QUATRE REDACTIONS N'EST PAS ICI, ET C'EST VOULU : une acceptance ne contient que ce qu'un developpeur peut verifier point par point le jour de la livraison. Le recit appartient a l'entree de journal de la PR 34, a sa cloture.

**Tests.** `tests/unit/gouvernance/un-path-designe-ce-depot-ci.spec.ts`

### GOV-051 — Une garde qui compare des chemins compare des chaines brutes, et cinq familles la defont

`0.5 j` · zone `gouvernance` · depend de `GOV-050`

Couvre : `REQ-GOV-029`

**Acceptation.** CE QUE CINQ REDACTIONS D'UN CONTROLE DE FORME ONT ENSEIGNE, et c'est une lentille qui l'a nomme : « la propriete protegee n'est pas une propriete du CHEMIN, c'est une propriete de la COMPARAISON ». Elle ajoutait, sur elle-meme : « j'ai passe deux tours a apporter un codepoint de plus au mauvais endroit. » LE FAIT MESURE le 2026-09-12 : `scripts/gates/gov-conventions.ts` decide si un chemin appartient au depot voisin par `p.startsWith('axionia/')` — une comparaison BRUTE, par prefixe, sensible a la casse, non normalisee. CINQ FAMILLES la defont, toutes jouees de bout en bout, chacune amenant `pnpm gov:check` de exit 1 a exit 0 sur une tache qui revendique un fichier du depot voisin : (1) un caractere de la classe Unicode C en tete ; (2) un caractere SANS GLYPHE hors de cette classe — remplisseur hangul, braille vide, marque non espacante ; (3) un HOMOGLYPHE, un `a` cyrillique par exemple, qui est une lettre ordinaire ; (4) la CASSE, `AXIONIA/` ; (5) une forme NON CANONIQUE, `./axionia/` ou `axionia//`. ⚠️ PRECISION MESUREE par la lentille mutation : depuis que l'ecrivain exige la forme canonique, la famille (5) n'amene plus `gov:check` a exit 0 PAR CET ECRIVAIN-LA. Elle reste entiere pour la propriete de comparaison, qui est le sujet de cette tache : une garde qui compare des chaines brutes reste defaite par deux orthographes du meme chemin, quel que soit l'ecrivain qui les a produites. AUCUNE CLAUSE DE FORME NE FERMERA CETTE FAMILLE, et c'est le coeur de la tache : GOV-050 ferme (1) et (5) au schema, et deux lentilles ont REFUSE d'exiger la fermeture de (2) et (3) en mesurant que ce serait « demander l'article suivant d'un inventaire », c'est-a-dire reproduire le defaut quatre fois constate. Le remede est ailleurs. LA TACHE : toute garde qui compare un chemin NORMALISE avant de comparer — forme canonique, normalisation Unicode, casse tranchee explicitement — et la comparaison passe par une primitive UNIQUE (RM-01), jamais par un `startsWith` recopie. Le temoin negatif porte LES CINQ FAMILLES, chacune vue rougir, et le contre-temoin verifie que les chemins legitimes du depot restent verts. A NOMMER DANS LA LIVRAISON : les autres gardes qui comparent des chemins par egalite ou par prefixe — `scripts/lot/composer.ts` detecte les collisions PAR EGALITE DE CHAINE — et si elles ne sont pas toutes converties, la liste de celles qui restent, comptee, jamais tue. CE QUE LA TACHE NE PRETEND PAS : elle ne rend pas la comparaison infaillible. Elle deplace la defense de la FORME de la donnee vers la LECTURE qu'on en fait, ce qui est le seul endroit ou un homoglyphe peut etre vu.

**Tests.** `tests/unit/gouvernance/comparer-un-chemin-c-est-le-normaliser.spec.ts`

### GOV-052 — L'entree de journal d'une PR n'est exigee qu'APRES sa fusion : la seule victime possible est main

`0.5 j` · zone `gouvernance` · aucune dependance

Couvre : `REQ-GOV-023`

**Acceptation.** MESURE QUI OUVRE LA TACHE, refaite avant d'ecrire une ligne : pour chaque commit de fusion de main, `git show <commit>:docs/journal/2026-09.md | grep -qE "^## PR #<n> "`. Au 2026-09-13 : #28, #33 et #34 ROUGES a leur fusion ; #29, #30, #31, #32 vertes. La regle a donc tenu QUATRE fusions d'affilee puis s'est perdue, sans que rien le voie. Ne PAS recopier ces nombres dans le code ni dans un test : les rejouer.

CE QUI EST DEJA ECRIT, ET QUI N'A PAS SUFFI. La regle existe a trois endroits en prose : `docs/journal/README.md` section « Quand elle s'ecrit » (« Avant la fusion, jamais apres … Le numero de PR existe des son ouverture »), `docs/REPRISE-SESSION.md`, et `docs/LECONS.md` LEC-15 qui en tire deja la lecon et porte « Regle maison. Aucune a ce jour ». Une quatrieme redaction en prose est REFUSEE d'avance : c'est le defaut, pas le remede.

ACCEPTATION — ELLE EST LA GARDE, ET RIEN D'AUTRE. La tache n'est PAS acceptee sur « RM-15 est ecrite ». Elle est acceptee sur un temoin qui rougit et son contre-temoin qui verdit :
  (a) ROUGE : `pnpm gov:pr --pr <n>` sort 1 et NOMME le numero, sur une branche de PR dont `docs/journal/` ne porte pas d'entree citant ce numero. Fabriquer la panne (retirer l'entree), jamais la constater (RM-02).
  (b) VERT : la meme commande sort 0 des que l'entree est posee sur la branche.
  (c) Le moment est le sujet (LEC-15) : la famille s'evalue AVANT la fusion, la ou c'est encore reparable. `pr_fusionnee_sans_journal` de `gov:etat` reste en place — elle nomme l'incident sur main ; celle-ci l'empeche. Les deux coexistent, aucune ne remplace l'autre.

SOURCE UNIQUE (RM-01). La regle est declaree UNE fois, comme RM-15 dans `docs/REGLES-MAISON.md`. La garde CITE `RM-15` et n'en retape pas l'obligation ; le champ « Regle maison » de LEC-15 dans `docs/LECONS.md` recoit l'IDENTIFIANT, il ne duplique pas la phrase. Une seule frappe de l'obligation dans tout le depot.

LA GARDE S'ADRESSE A UN FICHIER, PAS A UN LECTEUR — c'est pour cela que les trois endroits actuels ont echoue. Elle ne relit aucune prose pour en tirer son comportement. Le precedent a suivre est dans le depot : `scripts/gates/gov-etat.ts` DERIVE le plancher du journal de `docs/journal/README.md` (voir le commentaire « Le plancher est DERIVE … le deplacer se fait a un seul endroit ») au lieu de le recopier. Meme altitude ici.

TROU RECIPROQUE, mesure par A09 securite sur la PR 35 et a fermer dans la meme tache : une entree `## PR #99` pour une PR QUI N'EXISTE PAS passe les neuf familles, exit 0. Le journal d'un depot PUBLIC peut donc affirmer un atterrissage qui n'a jamais eu lieu. Temoin attendu : une entree citant un numero inexistant ou non fusionne rougit en le nommant.

**Tests.** `tests/unit/gouvernance/une-pr-porte-son-entree-de-journal.spec.ts`

### GOV-053 — Le classement des vues est par RUBRIQUE, la volatilite est par LIGNE

`0.5 j` · zone `gouvernance` · aucune dependance

Couvre : `REQ-GOV-032`

**Acceptation.** MESURE QUI OUVRE LA TACHE, jouee par A10 mutation au tour de revue de la PR 36, a refaire avant d'ecrire une ligne : reecrire la rubrique « Prochain pas » de docs/PLAN-STATE.md en « la phase -1 est TERMINEE, 39/39 taches, plus aucune tache eligible », puis `pnpm plan-state:verifier` -> EXIT 0. Le mensonge passe.

POURQUOI. `plan-state:verifier` classe les rubriques en `comparee` ou `volatile`, et « Prochain pas » est declaree volatile parce qu'elle depend de la tete de la file de fusion. Mais sa DEUXIEME ligne se derive de `docs/tasks.json` SEUL — `statut === 'a_faire' && phase === phaseCourante && externe === null && deps.every(livrees)` — sans le moindre appel a la forge. Une rubrique qui mele une source vivante et une source du depot est donc declaree volatile EN ENTIER, et sa part derivable sort du controle avec le reste.

LA LECON, et elle deborde ce fichier : le classement est par RUBRIQUE, la volatilite est par LIGNE. Le bloc de reprise est deja traite ligne a ligne — c'est la bonne granularite, elle n'a simplement pas ete appliquee aux rubriques.

CE QUI N'A PAS ETE FAIT DANS LA PR 36, ET POURQUOI. Decouper « Prochain pas » demande de separer sa ligne derivable de sa ligne vivante DANS LE GENERATEUR, donc de changer ce que la vue AFFICHE. C'est un arbitrage de rendu, pas une correction de garde : verse plutot que glisse (charte A11).

ACCEPTATION — ELLE EST LA GARDE.
  (a) ROUGE : falsifier la part DERIVABLE d'une rubrique par ailleurs volatile fait sortir 1, et l'ecart est nomme en unites du domaine. Fabriquer la panne, jamais la constater (RM-02).
  (b) VERT : falsifier la part VIVANTE de la meme rubrique reste vert, et le message le DIT — un vert muet promet plus qu'il ne tient.
  (c) Le vert final annonce le compte des lignes REELLEMENT confrontees, jamais la longueur d'une liste declaree. C'est le defaut que la PR 36 a corrige au niveau des rubriques ; il ne doit pas revenir au niveau des lignes.

CE QUI EST DEJA FERME, et qu'il ne faut pas refaire : les cinq rubriques volatiles sont declarees avec, chacune, la source vivante qui l'en empeche ; le bloc de reprise est compare dans les DEUX sens ; une question dupliquee est un refus ; une prose non declaree est un refus. Cette tache ne porte QUE la granularite des rubriques.

**Tests.** `tests/unit/gouvernance/volatilite-par-ligne.spec.ts`

### GOV-054 — Le cliquet ne voit pas `process.exitCode = 1`, et deux refus neufs sont passes dessous

`0.5 j` · zone `gouvernance` · aucune dependance

Couvre : `REQ-GOV-012`

**Acceptation.** MESURE QUI OUVRE LA TACHE, trouvee par A10 mutation au tour de revue de la PR 36 : le cliquet compte `/process\.exit\(\s*(?!0\s*\))/g` sous `scripts/`. La PR 36 ajoute DEUX refus a `scripts/plan-state/build.ts`, tous deux ecrits `process.exitCode = 1` — une forme que ce motif ne voit pas. Le compte reste donc a 179 et le cliquet ne bouge pas.

CE QUI EST GRAVE N'EST PAS LE CHIFFRE. « 179 -> 179 » etait EXACT, et exact pour une raison que la PR ne disait pas. Le cliquet est cense compter les sorties non nulles AJOUTEES pour qu'aucune n'entre sans etre declaree et couverte par un temoin d'effet. Deux sorties sont entrees sans passer devant lui.

LES DEUX FORMES SONT LEGITIMES et ne doivent PAS etre unifiees a l'aveugle : `process.exit(n)` sort immediatement, `process.exitCode = n` laisse le processus finir — c'est la bonne forme quand il reste des lignes a imprimer. Le defaut est que le cliquet n'en voit qu'une.

ACCEPTATION — ELLE EST LA GARDE.
  (a) ROUGE : ajouter un `process.exitCode = 1` non declare sous `scripts/` fait rougir le cliquet, en NOMMANT le fichier et l'ecart, exactement comme il le fait deja pour `process.exit(1)`. Fabriquer la panne (RM-02).
  (b) VERT : le contre-temoin, un `process.exitCode = 0`, ne compte pas.
  (c) Le total declare est recalcule UNE fois, ARBITRE et non subi, et le commentaire dit d'ou vient l'ecart — le fichier porte deja cette discipline pour les trois arbitrages precedents (25 -> 26 -> 27 -> 35).

ATTENTION AU SEUIL. Il est GLOBAL : il somme tout ce qui atterrit, jamais le sommet d'une branche. Recompter APRES avoir lu le rouge, jamais declarer d'avance — « le total ne bouge pas sans qu'on l'ecrive » est ecrit dans le fichier meme.

**Tests.** `tests/unit/gouvernance/cliquet-sorties-differees.spec.ts`

### GOV-055 — Comparer un generateur a lui-meme ne voit jamais ce qu'il a CESSE de produire

`0.5 j` · zone `gouvernance` · aucune dependance

Couvre : `REQ-GOV-032`

**Acceptation.** TROIS MESURES QUI OUVRENT LA TACHE, jouees par A10 mutation et A09 exactitude au 2e tour de la PR 36, a refaire avant d'ecrire une ligne. Toutes rendent EXIT 0 :
  (1) neutraliser `lignes.push('## Bloquees')` dans le generateur, puis `plan-state:build`, puis `plan-state:verifier` -> « ✅ 8 rubrique(s) comparee(s) ». La couverture tombe de 9 a 8 EN SILENCE.
  (2) renommer `## Bloquees` en `## Dernier atterrissage` — un nom EXACTEMENT volatile — puis regenerer : la rubrique bascule du cote exempte, meme chute silencieuse. Le prefixe est ferme, le nom exact non.
  (3) supprimer du generateur la ligne comparee « Derniere entree de journal » : « ✅ 2 ligne(s) CONFRONTEES » au lieu de 3.

POURQUOI CE N'EST PAS REPARABLE DANS LA PR 36. Le verificateur compare ce que le generateur PRODUIT a ce qui est sur le DISQUE. Si le generateur cesse de produire un element, les deux cotes le perdent ensemble et l'ecart n'existe pas. Un temoin qui derive son attendu du rendu ne peut pas voir ce que le rendu a perdu — c'est exactement le defaut du temoin de couverture ecrit dans la PR 36, qui PRETENDAIT fermer (1) et ne le fermait pas. La correction faite : ce temoin dit desormais ce qu'il garde vraiment, et renvoie ici.

IL FAUT UNE SOURCE EXTERIEURE, et elle n'existe pas encore. REQ-GOV-006 enumere six elements de PLAN-STATE — SHA de main, PR en vol et file de fusion, tache revendiquee, decisions du jour, prochain pas, bloc REPRENDRE EN 30 SECONDES — toutes VOLATILES. Aucune source ne nomme les rubriques COMPAREES dues (Taches, Chemin critique, Bloquees, Questions ouvertes, Hypotheses, Journal, Dette declaree).

ACCEPTATION — ELLE EST LA GARDE.
  (a) La liste des elements DUS est declaree UNE fois, dans une source du domaine (candidat : etendre REQ-GOV-006, qui en nomme deja six), jamais dans le script qui la verifie — sinon le script se compare encore a lui-meme.
  (b) ROUGE : chacune des trois mesures ci-dessus sort 1 et NOMME l'element disparu. Fabriquer les trois pannes, jamais les constater (RM-02).
  (c) VERT : le contre-temoin, un rendu complet, reste vert et ANNONCE le compte attendu a cote du compte observe.
  (d) La famille neuve entre dans la population du temoin `RM-02 · CHAQUE famille que la gate sait emettre a ete VUE ROUGE` — sinon ce temoin la denoncera, ce qui est son office.

DEUX RESIDUS DE LA MEME FAMILLE, a traiter ici ou a verser a part :
  - la couche des mesures du domaine peut etre desarmee SELECTIVEMENT (`if (nom !== '<la seule mesure observee>') continue;`) : 22 mesures sur 23 meurent sans que le temoin exclusif rougisse. Le temoin observe UNE mesure, pas la population.
  - l'exemption de la prose « Ce qu'on tape maintenant » est plus LARGE que sa justification : seule sa premiere clause depend de la file de fusion, sa queue est une constante du generateur. La reecrire passe.

**Tests.** `tests/unit/gouvernance/couverture-attendue.spec.ts`

## Phase 1 — Operationnel

### JUR-T01b — Contrat v1 arrêté par Will — **attente_externe**

`0 j` · zone `juridique` · `externe` · depend de `CPL-T01`, `JUR-T01` · decisions `W11`

Couvre : `REQ-GOV-015`, `REQ-JUR-003`, `REQ-JUR-007`

**Acceptation.** relecture du gabarit v1 et des décisions « avenant » (C1, C12, D9, D11, D14, horodatage E.1-12, point de départ E.1-9 `fenetreFinAt = confirmeeAt + 12 mois`, sort d'une ligne acquise bloquée pour KYC à 12 mois) reçue et consignée dans `docs/DECISIONS.md` avant INT-T12.

**Tests.** `decisions-ouvertes.spec.ts`

### JUR-T01c — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre — **attente_externe**

`0 j` · zone `juridique` · `externe` · depend de `CPL-T01`, `JUR-T01` · decisions `HYP-D9`

Couvre : `REQ-ARG-018`, `REQ-JUR-017`

**Acceptation.** mandat d'autofacturation (art. 289 CGI) relu par l'expert-comptable AVANT le premier envoi DocuSeal ; avis consigné dans `docs/DECISIONS.md`.

### DM-07 — Entité Attribution : colonnes structurées, chiffrement + hashes du contact, index unique partiel occupant et file

`1 j` · zone `domaine` · `schema` · sensible : attribution, rgpd · depend de `DM-01`, `DM-02`, `DM-06`, `QA-T02`, `SEC-08`

Couvre : `REQ-DM-002`, `REQ-DM-003`, `REQ-DM-004`, `REQ-DM-005`, `REQ-DM-030`, `REQ-DM-031`, `REQ-SEC-014`

### DM-08 — Machine à états d'attribution : matrice, délais recalculés, **file d'attente sans promotion automatique**, événement en transaction

`1.25 j` · zone `domaine` · sensible : attribution · depend de `DM-07` · decisions `HYP-E1-9`

Couvre : `REQ-DM-004`, `REQ-DM-006`, `REQ-DM-007`, `REQ-DM-022`, `REQ-QA-004`

### DM-24 — Cron de **confirmation tacite à trente jours** — le porteur manquant

`0.5 j` · zone `domaine` · sensible : attribution · depend de `CPL-T13`, `DM-08`, `DM-09`, `JUR-T02` · decisions `HYP-C1`

Couvre : `REQ-DM-006`, `REQ-DM-008`, `REQ-DM-042`

**Acceptation.** cron quotidien, horloge injectée, qui promeut en `active` toute `provisoire` de plus de `CONFIRMATION_TACITE_JOURS` (30) **sans Qualification `confirme` ni `non_confirme`** — y compris `injoignable` et `ne_se_souvient_pas` —, écrit `attribution.confirmee_tacitement` **dans la même transaction** et fait courir `fenetreFinAt` à compter de cette date ; c'est la **seule** conséquence attachée au défaut ou au retard de contact.

### DM-25 — Antériorité établie **après** l'enregistrement + contestation écrite d'un refus

`0.5 j` · zone `domaine` · sensible : argent, attribution, espace · depend de `DM-08`, `DM-10-P`, `SEC-17`, `UX-P1-10`

Couvre : `REQ-DM-043`, `REQ-JUR-007`, `REQ-SEC-022`, `REQ-UX-002`

**Acceptation.** un job quotidien rapproche les nouvelles lignes d'`EntrepriseConnue` des attributions occupantes ; en cas d'antériorité établie après coup, l'attribution passe `annulee` (événement écrit), l'apporteur est **informé avec le motif**, **aucune commission nouvelle n'est due** et **les commissions déjà acquises restent acquises** (aucune reprise, aucun `dechue` — REQ-JUR-007) ; **tout refus de dépôt et toute annulation sont contestables par écrit**, la contestation ouvre une entrée console et la Société **répond de façon motivée dans `REPONSE_CONTESTATION_JOURS` (15 j)**, réponse journalisée.

### INT-T07-P — API 1 `GET /api/integrations/axionia/attributions?siren=` côté Partners : réponse `{statut: libre|attribuee|cliente, until: 'AAAA-MM'|null, apporteurRef: opaque|null}`, jamais nom, prénom, e-mail

`0.5 j` · zone `integration` · sensible : attribution, auth · depend de `DM-08`, `SEC-06`, `SEC-07`

Couvre : `REQ-INT-014`, `REQ-INT-015`

### INT-T07-A — Client API 1 côté axionia : timeout 2 s, cache 5 min, échec ouvert

`0.5 j` · zone `integration` · `axionia` · sensible : attribution · depend de `INT-T03`, `INT-T07-P`

Couvre : `REQ-INT-014`, `REQ-INT-015`

### INT-T08-A — Relecture par `sequence` + endpoint Σ HT par SIREN pour la réconciliation quotidienne

`0.5 j` · zone `integration` · `axionia` · sensible : attribution · depend de `INT-T02`

Couvre : `REQ-INT-012`, `REQ-INT-013`, `REQ-INT-030`

### INT-T08-P — Job quotidien de réconciliation

`0.5 j` · zone `integration` · depend de `INT-T08-A`, `SEC-06`

Couvre : `REQ-INT-012`, `REQ-INT-013`, `REQ-INT-030`, `REQ-QA-026`

### SEC-11 — Jeton de dépôt privé : émission, hash, révocation, régénération, accusé « ce n'est pas moi »

`1 j` · zone `securite` · sensible : attribution, auth · depend de `DM-01`, `DM-06`, `SEC-08`, `SEC-10` · decisions `HYP-C6`

Couvre : `REQ-SEC-005`, `REQ-SEC-006`, `REQ-SEC-007`

### SEC-12 — Contrôles de dépôt atomiques : verrous, index partiel, quota glissant, file M2, horodatage µs, relecture du statut, case RGPD serveur, **motifs de refus alignés sur les articles 3.3 et 3.3 bis**, lien

`1.25 j` · zone `securite` · sensible : attribution, rgpd · depend de `DM-08`, `DM-10-P`, `INT-T09`, `SEC-11`

Couvre : `REQ-CPL-008`, `REQ-DM-010`, `REQ-JUR-008`, `REQ-JUR-023`, `REQ-SEC-014`, `REQ-SEC-015`, `REQ-SEC-020`, `REQ-SEC-022`, `REQ-SEC-032`, `REQ-UX-002`, `REQ-UX-039`

### DM-09 — Qualification append-only, dérivation du palier et du seuil, verrou optimiste

`1 j` · zone `domaine` · sensible : attribution, auth, espace · depend de `CPL-T13`, `DM-08` · decisions `HYP-C1`

Couvre : `REQ-CPL-024`, `REQ-DM-008`, `REQ-DM-009`, `REQ-DM-010`, `REQ-JUR-006`

**Acceptation.** le seuil prioritaire est lu depuis `seuilPrioritaire()` de CPL-T13 (règle D3 : `min(palierConfiance, capaciteRestante)`, surcharge manuelle > 0 remplace le min), jamais recalculé ici ; **aucun compteur de gradation, aucun rang, aucun délai de « contradictoire »** (décision du 2026-09-03) — une déclaration `non_confirme` suspend, c'est SEC-15 qui porte la suspension. 🔴 **Complétée le 2026-09-03 (synthèse A-3 et M-7) : les QUATRE résultats de contact n'ont pas les mêmes effets.** Seul `non_confirme` — le représentant indique **expressément** n'avoir eu aucun échange — éteint l'attribution et ouvre l'article 3.7 ; `injoignable`, `ne_se_souvient_pas`, le changement d'interlocuteur et le refus de répondre **maintiennent l'attribution `provisoire`** et ne sont imputables à personne : aucune suspension, aucun signal défavorable, aucune invalidation. La Qualification **journalise la date, la personne interrogée et les termes** de la réponse, et l'extrait en est communiqué à l'apporteur sur sa demande (route cloisonnée). `premierContactAt` est posé ici et c'est lui qui démarre le chrono de péremption (DM-13).

### DM-10-P — EntrepriseConnue

`0.5 j` · zone `domaine` · `schema` · sensible : argent, attribution · depend de `DM-07`, `INT-T05`

Couvre : `REQ-DM-028`, `REQ-DM-029`, `REQ-SEC-022`

**Acceptation.** évaluation **locale**, sans appel réseau au dépôt (la dépendance à DM-10-A est retirée) ; `origine` enum réduit à **{client, devis, financeur}** — **`demande_entrante` est retirée**, aucun des cinq événements arrêtés ne la transporte ; **deux fenêtres distinctes** alignées sur l'art. 3.3 réécrit, `ANTERIORITE_CLIENT_MOIS = 24` (prestation **facturée**) et `ANTERIORITE_DEVIS_MOIS = 6` (**devis** émis), toutes deux en SSOT (JUR-T02), jamais un paramètre unique ; `financeur` est alimentée par la liste tenue par la Société (DM-028), **dont l'existence et le principe sont portés à la connaissance de l'apporteur** (art. 3.3 bis b) et dont le refus est notifié avec sa **catégorie**.

### DM-11 — Contrat versionné

`1.5 j` · zone `domaine` · sensible : argent, attribution, espace, rgpd · depend de `DM-03-P`, `DM-06`, `INT-T09`, `SEC-17` · decisions `HYP-RESIDENCE`

Couvre : `REQ-CPL-004`, `REQ-CPL-005`, `REQ-DM-013`, `REQ-DM-027`, `REQ-JUR-018`, `REQ-JUR-022`, `REQ-JUR-029`, `REQ-SEC-026`

**Acceptation.** se limite aux données KYC et à `PieceKyc.valideJusquAu` ; la règle de vigilance et le blocage du versement sont la propriété de JUR-T16 (`controlesVersement()`). 🔴 **Complétée le 2026-09-03 (synthèse A-10 et M-20).** (1) **`rc_pro` porte `expireAt NOT NULL`** et un rappel d'échéance annuel (contrat art. 6.4 : attestation à la signature puis à chaque échéance, information de toute résiliation de police sous 15 jours) — **sans être ajoutée à `piecesBloquantPaiement()` ni à `controlesVersement()`** : l'art. 5.4 réécrit ferme la liste des pièces pouvant différer un versement. (2) Le KYC recueille et stocke le **statut d'exercice** de l'apporteur (`qualiteExercice`), qui alimente `{{APPORTEUR_QUALITE}}` du gabarit (JUR-T01) et la déclaration de l'art. 23 (« exercer sous un statut régulièrement déclaré l'autorisant à percevoir et à facturer les commissions », « ne faire l'objet ni d'une liquidation judiciaire ni d'une interdiction de gérer », M-29).

### DM-12 — Verification, AlerteLiberation, Anomalie, RattachementManuel

`0.5 j` · zone `domaine` · depend de `DM-07`, `DM-08`

Couvre : `REQ-DM-032`, `REQ-DM-033`, `REQ-DM-034`

### DM-13 — Crons péremption 90 j **depuis le premier contact**, expiration 12 mois, injoignable ×3, **file d'attente

`0.75 j` · zone `domaine` · sensible : attribution, rgpd · depend de `CPL-T13`, `DM-08`, `DM-12`

Couvre : `REQ-DM-004`, `REQ-DM-006`, `REQ-DM-007`, `REQ-DM-031`, `REQ-DM-042`, `REQ-QA-027`, `REQ-UX-038`

### SEC-14 — Détecteurs de sincérité : **5 signaux de CONTENU**, score, ouverture d'Anomalie

`1 j` · zone `securite` · sensible : attribution, auth, espace · depend de `INT-T09`, `SEC-12`, `SEC-17`

Couvre : `REQ-DM-033`, `REQ-JUR-031`, `REQ-JUR-040`, `REQ-SEC-017`, `REQ-SEC-020`, `REQ-SEC-036`, `REQ-SEC-038`

**Acceptation.** le score ne se compose que de signaux qui décrivent **CE QUI EST DÉCLARÉ** — leur liste et leurs seuils vivent en configuration hors dépôt (REQ-GOV-031) ; **tout signal portant sur le RYTHME, l'HORAIRE ou le LIEU du travail est exclu du score**, conformément à REQ-JUR-031 et à la phrase du contrat « elle n'obéit à aucun barème, à aucun compteur et à aucun seuil » ; le test de cette tâche porte sur la NATURE des signaux retenus, pas sur leurs valeurs ; ils ne subsistent que comme **critères de priorisation d'une revue humaine en console**, hors score, hors alerte automatique, hors DTO exposé. 🔴 **Le franchissement du seuil OUVRE une Anomalie `ouverte` et ne pose AUCUN gel** : `gele_fraude` n'est posé que par une Anomalie **confirmée par un humain** (SEC-15, REQ-DM-033).

### SEC-15 — Suspension de vérification : **faculté** posée par un rôle, point d'entrée unique, portée limitée, levée de plein droit à 15 jours

`1 j` · zone `securite` · `schema` · sensible : argent, attribution, auth, espace · depend de `DM-09`, `SEC-14`, `SEC-17`

Couvre : `REQ-JUR-031`, `REQ-SEC-018`, `REQ-SEC-019`, `REQ-SEC-038`

**Acceptation.** (1) **c'est une FACULTÉ, pas un automatisme** — une déclaration `non_confirme` ouvre une entrée console, elle ne suspend rien toute seule ; la mesure est **posée par un rôle habilité**, notifiée avec les faits qui la motivent (le contrat écrit « la Société **peut** suspendre » ; le produit exécutait de plein droit) ; (2) **enum de gel à TROIS valeurs** — `libre`, `gele_non_confirmation`, `gele_fraude` : `gele_anomalie` est renommée, **`gele_manuel` est supprimée** ; (3) **un seul point d'entrée**, la fonction typée sur ces deux motifs, gardée par `jur:suspension-motifs-fermes` **et par le test-cliquet nominatif des appelants** (SEC-28) ; (4) **portée strictement limitée à l'enregistrement de nouvelles déclarations** : sans effet sur les attributions en cours, provisoires ou définitives, sur les commandes signées, sur les commissions acquises ou à venir, et **sur l'accès à l'espace** — aucun jeton révoqué, `sessionVersion` inchangé, aucune attribution annulée ; les `provisoire` restent `provisoire` avec `verificationPrioritaire` ; (5) **quinze jours maximum** (`SUSPENSION_MAX_JOURS`) — un cron lève de plein droit, écrit l'événement et notifie, la Société demeurant libre de résilier selon l'art. 11 ; **aucun seuil, aucun compteur, aucun rang**, et aucune conséquence attachée au nombre de suspensions antérieures (REQ-JUR-031, M-17).

### SEC-28 — Test-cliquet nominatif des poseurs et leveurs de gel + cron de levée de plein droit à 15 jours

`0.5 j` · zone `securite` · `schema` · sensible : attribution · depend de `DM-13`, `QA-T01`, `SEC-15`

Couvre : `REQ-INT-007`, `REQ-SEC-019`, `REQ-SEC-038`

**Acceptation.** sur le modèle de REQ-INT-007, un test-cliquet **énumère nominativement** tous les écrivains de `Apporteur.depotsGelesDepuis` et de l'enum de gel dans `src/` et `scripts/` et **rougit** si l'un d'eux n'appelle pas la fonction unique de SEC-15 ; le même cliquet couvre la **levée** ; un cron quotidien (horloge injectée, CPL-T13) lève tout gel de plus de `SUSPENSION_MAX_JOURS` jours, écrit l'événement et enfile la notification.

### SEC-16 — « Vérifier une entreprise » : session seule, doubles limites, journal, DTO 4 états {libre, suivie_place_disponible, suivie_file_complete, non_disponible}, messages non-oracle

`0.5 j` · zone `securite` · sensible : attribution, auth · depend de `DM-12`, `INT-T09`, `SEC-05`, `UX-P0-01`

Couvre : `REQ-JUR-011`, `REQ-QA-012`, `REQ-SEC-021`, `REQ-SEC-022`, `REQ-UX-007`

### SEC-18 — Anti auto-parrainage par hash, à la candidature et au RIB

`0.5 j` · zone `securite` · depend de `DM-06`, `SEC-08`

Couvre : `REQ-JUR-021`, `REQ-SEC-031`

### SEC-19 — **Résiliation** : transaction unique de coupure + session en lecture seule survivante

`0.75 j` · zone `securite` · `schema` · sensible : argent, attribution, auth · depend de `DM-08`, `SEC-04`, `SEC-11`, `SEC-17`

Couvre : `REQ-DM-011`, `REQ-JUR-042`, `REQ-SEC-003`, `REQ-SEC-005`, `REQ-SEC-032`

**Acceptation.** (1) **la coupure appartient à la RÉSILIATION seule** — la suspension n'en produit aucun effet (SEC-15) ; le nom de la tâche et le module cessent de traiter les deux ensemble ; (2) après résiliation, une **session en LECTURE SEULE survit** : l'apporteur accède à ses relevés, factures, motifs de blocage et au journal de ses propres déclarations **jusqu'à l'extinction de ses droits** (contrat art. 12.3), ou les reçoit par e-mail à sa dernière adresse déclarée (UX-P1-10) — sans quoi la Société notifierait valablement dans un espace fermé et devrait payer des commissions que l'apporteur ne peut plus lire ; aucune écriture n'est ouverte ; (3) `resiliationMotif` reste l'enum **fermé** `{ordinaire_apporteur, ordinaire_axion, manquement_grave}`, **aucun motif d'inactivité**, ni en liste ni en texte libre (REQ-JUR-042).

### INT-T12 — DocuSeal Partners : client REST, gabarit versionné, cases d'acceptation distinctes, webhook strict, archivage PDF + audit trail + SHA-256, rattrapage 24 h, blocage du dépôt avant signature

`1.5 j` · zone `integration` · sensible : attribution · depend de `DM-11`, `JUR-T01`, `JUR-T01b`, `JUR-T01c`, `SEC-03`, `SEC-06` · decisions `DEC-INT-001`

Couvre : `REQ-INT-018`, `REQ-INT-019`, `REQ-JUR-004`, `REQ-JUR-005`, `REQ-SEC-034`

### INT-T13 — Outils MCP `partners.verifier_entreprise` et `partners.contacts_a_qualifier`

`1 j` · zone `integration` · depend de `DM-12`, `INT-T09`, `INT-T11`

Couvre : `REQ-INT-027`

### INT-T21-A — Relecture pour backfill : fenêtre depuis le 2026-08-13, clients avec SIREN, devis signés, candidatures reçues

`0.5 j` · zone `integration` · `axionia` · sensible : attribution · depend de `INT-T02`

Couvre : `REQ-INT-011`, `REQ-INT-012`

### INT-T21-P — Backfill des clients, devis signés et candidatures reçues via l'API de relecture

`0.5 j` · zone `integration` · sensible : argent, attribution · depend de `INT-T12`, `INT-T21-A`, `SEC-06` · decisions `DEC-INT-010`

Couvre : `REQ-CPL-016`, `REQ-INT-011`, `REQ-INT-012`

### SEC-21 — Code public de parrainage ≥ 25 bits, `?p=` inconnu silencieux, propagation sans cookie persistant

`0.25 j` · zone `securite` · depend de `SEC-10` · decisions `HYP-C6`

Couvre : `REQ-JUR-028`, `REQ-SEC-037`

### JUR-T09 — Information art. 14 du prospect dans le script de qualification + e-mail journalisé

`0.5 j` · zone `juridique` · depend de `JUR-T04`, `UX-P1-06`

Couvre : `REQ-JUR-009`

### JUR-T13 — Audit de la charte relationnelle sur les écrans et e-mails + garde lexicale textes apporteurs

`0.5 j` · zone `juridique` · sensible : espace · depend de `JUR-T03`, `UX-P0-01`

Couvre : `REQ-JUR-012`, `REQ-JUR-013`

**Tests.** `textes-apporteurs-charte-relationnelle.spec.ts`

### CPL-T06 — Étape 3 du cycle : `DecisionCandidature`, présence webinaire déclarative, seuil initial, séquence vivier

`1 j` · zone `gouvernance` · depend de `DM-06`, `INT-T10`

Couvre : `REQ-CPL-006`

### UX-P1-04 — Lien magique mobile : code 6 chiffres, page « lien déjà utilisé », détection standalone

`1 j` · zone `espace` · sensible : auth, rgpd · depend de `SEC-03`, `SEC-04`

Couvre : `REQ-SEC-003`, `REQ-UX-015`

### UX-P1-01 — Écran unique Entreprise : recherche, carte 4 états, « Déposer » pré-remplie, compteur 30/j

`1 j` · zone `espace` · sensible : attribution, espace · depend de `INT-T09`, `SEC-16`, `UX-P0-01`, `UX-P0-02`

Couvre : `REQ-UX-001`, `REQ-UX-007`

**Acceptation.** route citée depuis `docs/ESPACE-ROUTES.md` (un champ sur `/`, résultat `/entreprise?q=`).

### UX-P1-02 — Formulaire de dépôt : autocomplétion < 300 ms, tolérance, ville, repli, **rendu de chaque issue de `IssueDepot`**, case facultative de lien d'intérêt

`1 j` · zone `espace` · sensible : attribution, espace · depend de `INT-T09`, `SEC-12`, `UX-P0-01`

Couvre : `REQ-UX-001`, `REQ-UX-002`, `REQ-UX-039`

### UX-P1-03 — Dépôt sans connexion par lien privé + brouillon hors-ligne

`1 j` · zone `espace` · sensible : attribution, auth · depend de `SEC-11`, `UX-P1-02` · decisions `HYP-E1-12`

Couvre : `REQ-SEC-033`, `REQ-UX-013`

### UX-P1-05 — Mes entreprises : `statutApporteur

`1 j` · zone `espace` · sensible : attribution, espace · depend de `CPL-T13`, `DM-08`, `DM-09`, `UX-P0-01`

Couvre : `REQ-UX-004`, `REQ-UX-023`

### UX-P1-06 — Fiche de qualification console

`1 j` · zone `espace` · sensible : espace · depend de `DM-09`, `SEC-17`

Couvre : `REQ-CPL-024`, `REQ-UX-021`

### UX-P1-07 — File de qualification : tri prioritaire > `aQualifierDepuis`, chrono SLA 48 h ouvrées, fiche inline, alertes

`1 j` · zone `espace` · depend de `CPL-T13`, `DM-08`, `UX-P1-06`

Couvre : `REQ-UX-022`

### UX-P1-08 — Accueil et navigation : 3 chiffres, 1 alerte priorisée, 1 champ, barre 4 onglets, Plus, états vides

`1 j` · zone `espace` · sensible : rgpd · depend de `UX-P0-02`, `UX-P0-03`, `UX-P1-01`

Couvre : `REQ-UX-008`, `REQ-UX-019`, `REQ-UX-033`

### QA-T20b — Armement bloquant budget/LHCI

`0.25 j` · zone `qualite` · depend de `QA-T20`, `UX-P1-08`

Couvre : `REQ-QA-031`

**Acceptation.** seuil aligné sur la première mesure de la première route de l'espace, puis bloquant.

### UX-P1-09 — Ma conformité + Mon profil : pièces, changement de RIB sécurisé, changement d'e-mail sécurisé, dernières connexions, préférences

`1 j` · zone `espace` · sensible : argent, espace, rgpd · depend de `DM-11`, `SEC-04`, `UX-P1-08`

Couvre : `REQ-CPL-019`, `REQ-UX-016`, `REQ-UX-027`, `REQ-UX-031`

### UX-P1-15 — Mon profil : **personnes agissant pour le compte de l'apporteur**

`0.5 j` · zone `espace` · sensible : attribution, auth, espace · depend de `SEC-12`, `UX-P1-02`, `UX-P1-09` · decisions `W4`

Couvre : `REQ-CPL-029`, `REQ-UX-039`

**Acceptation.** `PersonneDeclaree {apporteurId, nom, qualite, declareeAt, retireeAt}` — **liste déclarative éditable dans Mon profil, sans compte, sans session, sans jeton de dépôt, sans code de parrainage, sans DTO propre** (la décision **W4 « un apporteur = une personne » est intacte**) ; le champ « personne ayant rencontré » du dépôt propose cette liste, l'apporteur restant seul titulaire et seul responsable. (2) **Case facultative de lien d'intérêt** au dépôt (art. 8.4) : « j'ai une relation d'affaires ou d'intérêt avec cette entreprise » + champ libre court, **sans effet sur l'issue** — jamais un refus, jamais un signal, jamais un compteur, jamais une entrée dans le score ; visible en console et journalisé.

### UX-P1-10 — Table SSOT des notifications + e-mail + liens profonds + **drapeau `faitCourirUnDelai`**

`1.25 j` · zone `espace` · sensible : argent, attribution · depend de `INT-T10`, `JUR-T02`, `UX-P0-01`

Couvre : `REQ-JUR-033`, `REQ-JUR-039`, `REQ-JUR-042`, `REQ-UX-003`, `REQ-UX-016`, `REQ-UX-038`

### UX-P1-11 — Onboarding J0/J2/J7 depuis Partners

`1 j` · zone `espace` · sensible : attribution · depend de `DM-03-P`, `INT-T12`, `SEC-11`, `UX-P1-10`

Couvre : `REQ-JUR-012`, `REQ-JUR-013`, `REQ-JUR-041`, `REQ-SEC-005`, `REQ-UX-016`

**Acceptation.** déclenché par `contrat.signe`, BullMQ delay ; J0 = **documents de présentation** (jamais « kit de vente », REQ-JUR-041) **en PDF non modifiable, sans aucun fichier de logo, de charte ni de gabarit de signature** (art. 22 réécrit : aucun droit d'usage de la dénomination n'est concédé) + grille snapshotée **de l'apporteur** + code de parrainage + lien de dépôt privé + règle du premier déclarant ; J2 = rappel ; J7 → dépôt.

### UX-P1-12 — Console Apporteurs : liste, fiche 5 blocs

`1 j` · zone `espace` · `schema` · sensible : espace · depend de `DM-06`, `DM-09`, `SEC-15`, `SEC-17`, `SEC-19`

Couvre : `REQ-CPL-027`, `REQ-JUR-031`, `REQ-JUR-042`, `REQ-UX-036`

### UX-P1-13 — Console Attributions + Contrats : filtres état/département/apporteur, rattachement manuel motivé, versions signées

`1 j` · zone `espace` · sensible : attribution, espace · depend de `DM-08`, `DM-12`, `INT-T12`, `SEC-17`

Couvre : `REQ-UX-037`

### DM-23 — Grille par contrat : `GrilleContrat`, `GrilleModele`, une ligne par palier

`1 j` · zone `domaine` · `schema` · sensible : argent · depend de `DM-03-P`, `DM-06`, `DM-11` · decisions `W6`

Couvre : `REQ-DM-013`, `REQ-EXT-021`, `REQ-EXT-022`, `REQ-EXT-023`, `REQ-EXT-024`, `REQ-EXT-025`, `REQ-EXT-026`, `REQ-EXT-027`, `REQ-JUR-019`, `REQ-JUR-023`

**Acceptation.** `GrilleContrat` (une par contrat, figée à la signature, `Contrat.grilleId` **non nul**) et `GrilleModele` (jeu complet nommé et réutilisable : « Standard », « Tête de réseau », « Zone difficile »…) ; la granularité n'est pas la famille mais **le palier** — les quatre familles commissionnées (W6, tranchée le 2026-09-03) comptent **30 paliers vendables** dans `pricing.ts`, la durée y étant un axe distinct ; une ligne porte `prestationPalier`, `type ∈ {forfait, pourcentage, aucune}`, `montantCents` entier si `forfait`, `tauxBps` entier en points de base si `pourcentage` (le point de base vaut un centième de pour cent), jamais un flottant, **`cpfEligible` Boolean NOT NULL dérivé de `pricing.ts` par le script d'export (jamais saisi — 🔴 ce champ MANQUAIT et toute la garde CPF de REQ-JUR-023 reposait dessus : la gate n'avait aucune donnée à lire, synthèse M-15)**, et `motifEcart` **obligatoire dès que la ligne diffère de la grille publiée** ; 🔴 **un forfait est dû UNE FOIS par commande portant le palier — la durée est déjà dans le palier, `montantCents` n'est jamais multiplié par les journées** (DM-04, synthèse A-2) ; les cinq familles non commissionnées (développement web, maintenance, coaching récurrent, conférences, interventions sur demande) n'ont aucune ligne et sont énoncées dans l'annexe 1 ; **séquence verrouillée** KYC complet → grille complète 30/30 → génération du contrat → envoi DocuSeal : la fonction de génération refuse une grille incomplète, la fonction d'envoi refuse un contrat sans grille figée ; annexe 1 **générée** depuis la grille, jamais retapée ; une grille figée ne se modifie que par avenant (INT-T23), les lignes de commission déjà nées gardant leur `grilleVersionId` ; un palier créé au catalogue **après** la signature n'existe dans aucune grille figée → ligne `bloquee` motif **`a_qualifier`** (le cas « barème indéfini » ; `bareme_indefini` n'est pas une valeur de l'enum, arbitrage l. 410), libellé apporteur « Prestation hors grille de commissions », jamais un taux deviné, jamais u

### UX-P1-14 — Éditeur de grille en console : modèles, édition en masse, complétude 30/30 bloquante

`1 j` · zone `espace` · sensible : argent, espace · depend de `DM-23`, `SEC-17`, `UX-P1-13` · decisions `W12`

Couvre : `REQ-EXT-023`, `REQ-EXT-024`, `REQ-EXT-027`, `REQ-UX-026`

**Acceptation.** édition réservée au rôle `admin`, journalisée, **inaccessible tant que le KYC n'est pas complet** ; départ depuis un `GrilleModele`, puis ajustement ; **édition en masse** (« toutes les formations à 300 € », « tous les audits à 25 % ») puis dérogation ligne par ligne — 30 lignes à saisir à la main à chaque recrutement est intenable, et une ligne oubliée devient une commission bloquée le jour d'une vente ; valeur publiée pré-remplie et rappelée en regard de chaque ligne ; ligne inférieure à la grille publiée → **avertissement non bloquant** « cette ligne est inférieure à la grille publiée » (W12 : c'est permis) **assorti d'un motif obligatoire** — l'avertissement n'empêche pas l'envoi, il oblige à le regarder ; compteur de complétude **30/30 bloquant** : le bouton de génération du contrat reste inactif tant qu'une ligne est indéfinie ; l'écran Contrats montre la grille de chaque apporteur, l'écart à la grille publiée, le motif, qui l'a fixée et quand. 🔴 **L'écart et son motif sont en outre portés à la connaissance de l'APPORTEUR AVANT la signature** (contrat art. 4.1 al. nouveau, synthèse M-9) : le produit stockait déjà `motifEcart` mais rien n'obligeait à le montrer à celui qui signe, ce qui est le cas d'école de l'art. 1112-1 C. civ. dans un contrat d'adhésion. Le **document de présentation qui accompagne l'enveloppe DocuSeal** est **généré** (jamais retapé) et liste chaque ligne en écart avec sa valeur publiée, sa valeur contractuelle et son motif ; **l'envoi de l'enveloppe est refusé si une ligne en écart n'y figure pas**.

### INT-T24 — Cycle de vie de l'enveloppe DocuSeal : relances, alerte, refus, expiration, réémission, repli

`0.75 j` · zone `integration` · sensible : attribution, auth, espace · depend de `INT-T12`, `SEC-17`, `UX-P1-10`

Couvre : `REQ-CPL-028`, `REQ-INT-018`, `REQ-INT-019`, `REQ-UX-016`

**Acceptation.** relance automatique à **J+3** puis **J+7**, alerte console à **J+10**, trois relances au maximum ; refus dans DocuSeal → statut `refuse`, la candidature revient en `retenu`, alerte console, **aucun accès ouvert** ; expiration à **30 jours** → statut `expire`, la réémission est une action de console tracée ; action `admin` « **renvoyer à une adresse corrigée** » — une faute de frappe dans l'e-mail bloquerait sinon l'apporteur définitivement — qui annule l'enveloppe, en crée une nouvelle et **journalise l'ancienne et la nouvelle adresse** ; DocuSeal indisponible → l'envoi part en file d'attente et est réessayé, l'apporteur n'est jamais laissé sans nouvelle, alerte console si le service est muet plus d'une heure ; l'envoi reste **impossible** tant que le KYC n'est pas complet et la grille (DM-23) pas figée.

### GOV-021 — Revue adversariale outillée : scénario du squatteur et checklist « Attaque » sur chaque PR argent/attribution/auth

`0.5 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-007`, `GOV-017a`, `GOV-017b`, `SEC-12`

Couvre : `REQ-GOV-011`

**Tests.** `revue-adversariale-exigee.spec.ts` · `tests/e2e/squatteur.spec.ts`

### QA-T16 — E2E Playwright : espace sur iPhone/Pixel

`1 j` · zone `qualite` · sensible : attribution, auth, espace · depend de `QA-T06`, `SEC-05`, `UX-P1-07`, `UX-P1-08`

Couvre : `REQ-QA-016`, `REQ-QA-017`, `REQ-QA-031`

### QA-T19 — Métriques métier, heartbeats, alertes Telegram, carte de santé, job nightly ZAP baseline

`1 j` · zone `qualite` · depend de `DM-13`, `INT-T08-P`, `QA-T08`

Couvre : `REQ-INT-030`, `REQ-QA-025`, `REQ-QA-026`

### EXT-T08 — Coordonnées géographiques au dépôt + projection serveur

`0.5 j` · zone `espace` · sensible : attribution · depend de `DM-07`, `INT-T09`

Couvre : `REQ-EXT-015`

**Acceptation.** `latitude`/`longitude` capturées depuis le siège renvoyé par l'API publique, projection Lambert-93 → coordonnées d'affichage en fonction pure côté serveur.

### EXT-T01 — Fiche prospect et suivi des échanges, espace apporteur

`1.5 j` · zone `espace` · sensible : attribution, espace, rgpd · depend de `DM-07`, `DM-08`, `SEC-05`, `UX-P0-01`, `UX-P1-05`

Couvre : `REQ-EXT-001`, `REQ-EXT-002`, `REQ-EXT-003`, `REQ-EXT-004`, `REQ-JUR-025`

**Acceptation.** une frise unique (événements Axion-IA + échanges), formulaire d'échange à 4 champs, **mention explicite avant la première saisie que les échanges sont visibles de la Société** (reprise dans la politique de confidentialité, JUR-T04), purge branchée sur le cron d'attribution.

### EXT-T02a — Fiche prospect console : échanges, fiche de qualification, journal

`0.5 j` · zone `espace` · sensible : argent, espace · depend de `EXT-T01`, `SEC-17`

Couvre : `REQ-EXT-003`, `REQ-EXT-005`

### EXT-T03 — Candidatures multi-canal : origine, canal, campagne, anti-doublon

`1 j` · zone `espace` · `schema` · sensible : espace · depend de `DM-06`, `INT-T22`

Couvre : `REQ-EXT-008`, `REQ-EXT-009`, `REQ-EXT-010`

**Acceptation.** enum `origine`, `canal` contraint par `CampagneRecrutement`, hash e-mail et téléphone normalisés, rattachement au lieu de création.

### EXT-T04 — Saisie manuelle en console + pièce jointe CV

`1 j` · zone `espace` · sensible : espace, rgpd · depend de `EXT-T03`, `SEC-08`, `SEC-17`

Couvre : `REQ-EXT-011`, `REQ-EXT-012`, `REQ-EXT-014`

**Acceptation.** formulaire console reprenant les champs du tunnel, upload CV, type réel vérifié par octets d'en-tête, stockage privé + URL signée courte, purge à 2 ans avec la candidature.

### EXT-T06 — Signal « déjà travaillée » + détecteur de ramassage

`0.5 j` · zone `espace` · sensible : attribution · depend de `DM-12`, `SEC-14`, `SEC-16` · decisions `HYP-W7`, `W7`

Couvre : `REQ-EXT-006`, `REQ-EXT-007`

**Acceptation.** cinquième état `libre_deja_travaillee` dans le DTO de vérification ; signal d'anomalie au-delà du seuil de configuration prévu pour la part de dépôts sur des entreprises déjà travaillées (valeur hors dépôt, REQ-GOV-031).

### JUR-T24 — Reformulation de la suspension et du palier + **verrou « aucune résiliation pour inactivité »**

`0.75 j` · zone `juridique` · `schema` · sensible : attribution, espace, rgpd · depend de `DM-09`, `JUR-T26`, `SEC-15`, `SEC-19`, `UX-P0-01`

Couvre : `REQ-CPL-027`, `REQ-DM-010`, `REQ-JUR-031`, `REQ-JUR-032`, `REQ-JUR-042`

**Acceptation.** l'entrée de `suspendreDeclarations()` n'accepte que `non_confirme | fraude` (type fermé) ; aucun compteur de gradation dans l'espace ; libellés « déclaration non confirmée » / « contrôle de sincérité ». 🔴 **Deux corrections du 2026-09-03.** (1) **Le libellé de plafond est RETIRÉ** (synthèse P-2) : « vous pouvez déclarer jusqu'à 15 entreprises par semaine » annonçait un plafond que REQ-DM-010 ne pose pas — « aucun dépôt n'est refusé pour dépassement de seuil » ; soit l'espace mentait sur l'étendue des droits (art. 1112-1 C. civ., al. 5 d'ordre public, que l'art. 17 ne peut pas écarter), soit le plafond existait et était inopposable. Libellé unique, qui ne promet ni ne restreint : « **Vos déclarations au-delà de quinze par semaine font l'objet d'une vérification prioritaire ; aucune n'est refusée.** » (2) **Verrou « aucune résiliation pour inactivité »** (synthèse §B.2, arbitré par Will) — l'art. 11.1 permet déjà de résilier à tout moment sans motiver sous 30 jours, donc la clause n'apporterait **rien** et ajouterait le risque : `resiliationMotif` reste l'enum fermé `{ordinaire_apporteur, ordinaire_axion, manquement_grave}` sous **test-cliquet** ; l'écran de résiliation n'offre **aucun** motif d'inactivité ; **aucun gabarit d'e-mail de résiliation ne mentionne l'absence de dépôt** ; `dormant` reste un indicateur de console et **n'entre dans aucun DTO exposé** (REQ-CPL-027, JUR-T25, UX-P3-06).

### JUR-T30 — Gates de l'article 2.7 et de `dateContact` + bannissement de « kit de vente »

`0.5 j` · zone `juridique` · sensible : auth, espace, rgpd · depend de `JUR-T26`, `SEC-14`, `UX-P1-10`

Couvre : `REQ-JUR-039`, `REQ-JUR-040`, `REQ-JUR-041`

**Acceptation.** trois gardes, chacune **vue rougir** sur un témoin. (a) `jur:aucune-instruction` — aucun message, notification, contenu ou fonctionnalité n'est une instruction, une consigne de méthode ou une **demande de compte rendu** (l'art. 17 les privait de valeur *contractuelle*, pas de leur qualité de **faits**, et le juge apprécie des faits) ; **`lastSeenAt`, `dernierUsageAt` et les délais de réponse n'entrent dans aucun score, aucun indicateur restitué, aucun DTO exposé et aucun déclencheur** — aucune relance ne naît de l'absence de connexion ou de réponse. (b) `jur:date-contact-inerte` — `dateContact` est la **seule** donnée du contrat d'où un rythme d'activité peut être reconstitué, et le signal `nocturne` prouve que le produit savait l'exploiter : toute lecture hors de l'affichage de la fiche prospect et du contrôle de sincérité humain → **rouge** (témoin : un `groupBy` par tranche horaire). (c) `jur:supports-de-presentation` — **aucun fichier de logo, de charte, de gabarit de signature électronique, de visuel de profil ou de carte** n'est mis à disposition (l'ancien art. 22 concédait un droit d'usage du nom et du logo : autoriser à *présenter l'offre* est précisément ce qui caractérise la négociation depuis CJUE C-828/18 et Cass. com. 2 déc. 2020, et le port du nom crée un mandat apparent, art. 1156 C. civ.) ; les documents sont servis en **PDF non modifiable**, transmissibles **en l'état** ; **l'expression « kit de vente » est bannie** de tout support, écran, REQ et tâche au profit de « documents de présentation » (glossaire, GOV-006) — le contrat ne peut pas nommer « vente » ce que l'art. 1.2 dit n'être pas une vente.

## Phase 2 — Argent

### JUR-T16 — Garde de versement `controlesVersement

`0.5 j` · zone `juridique` · sensible : argent, attribution · depend de `DM-11`, `INT-T12`, `JUR-T02` · decisions `HYP-D7`

Couvre : `REQ-ARG-016`, `REQ-ARG-025`, `REQ-ARG-034`, `REQ-DM-027`, `REQ-JUR-018`

**Acceptation.** un seul module exporte `controlesVersement` ; il ne connaît que **trois** contrôles — SIREN valide et actif, coordonnées bancaires valides au nom de l'apporteur, attestation de vigilance **lorsque le cumul atteint `SEUIL_VIGILANCE`** (L.8222-1 et D.8222-5 C. trav.) ; sous le seuil, l'absence d'attestation **ne bloque rien** et lève une alerte. **Aucune autre pièce ne peut différer un versement** : `rc_pro` porte une échéance et un rappel mais **n'entre pas** dans la liste (A-10), et `commission_sup_ht`, `a_qualifier`, `non_resolue` sont des **alertes** qui ne peuvent différer au-delà de soixante jours (REQ-ARG-034, art. 5.4). Gate : toute comparaison à `SEUIL_VIGILANCE` hors de ce module rougit ; **tout ajout à la liste des pièces bloquantes rougit** (test-cliquet nominatif sur son contenu).

### T-ARG-010 — Modèle Prisma argent : `LigneCommission`

`1 j` · zone `argent` · `schema` · sensible : argent, attribution · depend de `DM-03-P`, `DM-04`, `DM-08`, `INT-T01a`

Couvre : `REQ-ARG-017`, `REQ-ARG-021`, `REQ-ARG-027`, `REQ-ARG-033`, `REQ-CPL-010`, `REQ-DM-020`, `REQ-DM-026`

### T-ARG-034 — Triggers anti-UPDATE/DELETE sur les tables d'argent

`0.5 j` · zone `argent` · `schema` · depend de `T-ARG-010`

Couvre : `REQ-ARG-028`

### DM-15 — Résolution des encaissements et reprises : `paiement.recu` → acquise au prorata ; `avoir.emis`/`facture.annulee` → recalcul de l'attendu ; `paiement.rembourse` → reprise ; blocage `siren_manquant`/`ba

`1.5 j` · zone `domaine` · sensible : argent, attribution, auth, espace · depend de `DM-04`, `DM-10-P`, `SEC-06`, `T-ARG-010`

Couvre : `REQ-ARG-001`, `REQ-ARG-005`, `REQ-ARG-008`, `REQ-ARG-009`, `REQ-ARG-010`, `REQ-ARG-027`, `REQ-ARG-030`, `REQ-DM-016`, `REQ-DM-017`, `REQ-DM-018`, `REQ-DM-019`, `REQ-DM-021`, `REQ-DM-022`, `REQ-INT-032`, `REQ-SEC-011`

### DM-16 — Parrainage : entité, identité distincte, lignes parrainage, propagation des reprises, un seul niveau, **bonus filleul verrouillé fermé**, DTO sans activité du filleul

`1 j` · zone `domaine` · sensible : argent, attribution, espace, rgpd · depend de `DM-06`, `DM-15`, `SEC-18`, `T-ARG-010` · decisions `HYP-D14`, `HYP-E1-19`

Couvre : `REQ-ARG-011`, `REQ-ARG-012`, `REQ-ARG-013`, `REQ-DM-023`, `REQ-JUR-020`, `REQ-JUR-021`, `REQ-UX-006`

### DM-18 — Effets de suspension/résiliation sur attributions et lignes, en une transaction

`0.5 j` · zone `domaine` · `schema` · sensible : argent, attribution · depend de `DM-09`, `DM-15`, `SEC-19`

Couvre : `REQ-ARG-026`, `REQ-DM-011`

**Acceptation.** les effets sont les **mêmes quel que soit le motif de résiliation** — il n'existe aucune conséquence pécuniaire différenciée (décision du 2026-09-03, `dechue` retiré de l'enum).

### T-ARG-015 — Job de gel mensuel : relevé par apporteur, seuil de versement minimal **au stade de la facturation**, trois contrôles bloquants, mode ombre, notification

`1 j` · zone `argent` · sensible : argent, attribution · depend de `CPL-T13`, `DM-11`, `DM-15`, `JUR-T16`, `T-ARG-010` · decisions `HYP-E1-17`, `HYP-E1-22`

Couvre : `REQ-ARG-014`, `REQ-ARG-015`, `REQ-ARG-016`, `REQ-ARG-017`, `REQ-ARG-034`, `REQ-CPL-011`, `REQ-CPL-020`, `REQ-DM-025`, `REQ-QA-027`

### T-ARG-016 — Autofacture : série par apporteur, PDF, CII EN 16931, mentions L.441-9, régime TVA figé, hash, **repli « facture de l'apporteur » sans mandat**

`1.5 j` · zone `argent` · sensible : argent, attribution · depend de `DM-11`, `JUR-T01c`, `T-ARG-015`, `T-ARG-034` · decisions `HYP-D9`

Couvre : `REQ-ARG-018`, `REQ-ARG-028`, `REQ-ARG-033`, `REQ-ARG-035`, `REQ-JUR-017`

### SEC-22 — IBAN : chiffrement, masquage, step-up, carence 72 h, exclusion du lot, alertes

`1 j` · zone `securite` · sensible : rgpd · depend de `SEC-04`, `SEC-08`, `SEC-17`, `T-ARG-015`

Couvre : `REQ-SEC-004`, `REQ-SEC-025`, `REQ-UX-027`

### T-ARG-017 — Écran et actions « Lot du mois » : états, approbation journalisée, anomalies au-delà de l'écart configuré, no-op double approbation

`0.5 j` · zone `argent` · sensible : argent, espace · depend de `SEC-17`, `T-ARG-016`

Couvre : `REQ-ARG-019`, `REQ-UX-025`

### T-ARG-018 — Générateur SEPA pain.001 pur, XSD, hash, ré-export identique

`1 j` · zone `argent` · sensible : argent, attribution · depend de `CPL-T01`, `GOV-015`, `T-ARG-017`

Couvre : `REQ-ARG-020`, `REQ-ARG-021`, `REQ-CPL-001`, `REQ-CPL-002`, `REQ-QA-029`

### T-ARG-019 — Rapprochement bancaire : import CSV, match EndToEndId puis heuristique, rejets, `payee`

`1 j` · zone `argent` · sensible : argent · depend de `T-ARG-018`

Couvre : `REQ-ARG-021`, `REQ-ARG-022`, `REQ-DM-026`

### DM-19 — Cumuls dérivés : DAS2 par bénéficiaire/année, cumul contrat, cumul de vigilance, vues SQL

`0.5 j` · zone `domaine` · sensible : argent · depend de `T-ARG-019`

Couvre : `REQ-ARG-024`, `REQ-DM-027`, `REQ-JUR-016`

### T-ARG-032 — Attestation de vigilance + immatriculation + **échéance RC pro non bloquante** : modèle, cumul, 6 mois, blocage **au seuil légal**, rappels

`1 j` · zone `argent` · sensible : argent, espace · depend de `DM-11`, `DM-19`, `JUR-T16`, `T-ARG-015`

Couvre : `REQ-ARG-016`, `REQ-ARG-025`, `REQ-DM-027`, `REQ-JUR-014`, `REQ-JUR-018`

### UX-P2-03 — Console Lot de paiement : machine d'états, export unique, régénération motivée, rapprochement CSV

`1 j` · zone `espace` · sensible : argent, espace · depend de `JUR-T16`, `SEC-17`, `T-ARG-018`, `T-ARG-019`

Couvre : `REQ-UX-024`, `REQ-UX-025`

### T-ARG-022 — Rejeu complet golden + hash de registre

`0.5 j` · zone `argent` · depend de `DM-15`, `DM-16`, `T-ARG-015`

Couvre : `REQ-ARG-002`, `REQ-ARG-003`, `REQ-QA-009`

### QA-T21 — Property-based sur l'argent : prorata, arrondis, reprises, parrainage, seuil de versement minimal, cofinancement

`1 j` · zone `qualite` · sensible : argent · depend de `DM-15`, `DM-16`, `T-ARG-015`

Couvre : `REQ-QA-003`

### T-ARG-036 — Contre-calcul SQL indépendant + 50 scénarios nommés

`1 j` · zone `argent` · sensible : argent · depend de `DM-15`, `T-ARG-010`

Couvre : `REQ-ARG-004`

**Acceptation.** `tests/argent/contre-calcul.sql` (recalcul des lignes depuis les événements reçus, sans passer par le code applicatif), `scenarios/*.json` (50 scénarios nommés : prorata, reprises, cofinancement, parrainage, blocages), gate `argent:contre-calcul` diff = 0 ; dépendance de la gate de phase 2.

### T-ARG-037 — Le moteur de commissions lit `contrat.grilleId`, jamais la grille globale

`0.5 j` · zone `argent` · sensible : argent, attribution · depend de `DM-15`, `DM-23`, `T-ARG-010`

Couvre : `REQ-ARG-004`, `REQ-ARG-008`, `REQ-EXT-022`, `REQ-EXT-025`

**Acceptation.** la fonction de calcul reçoit **la grille du contrat** sous lequel l'attribution a été confirmée, et rien d'autre ; aucun chemin de code ne lit la grille publiée (`GrilleCommission` importée par DM-03-P) pour calculer une ligne — cette dernière ne sert plus que de valeur par défaut à l'éditeur ; palier absent de la grille du contrat → ligne `bloquee` motif **`a_qualifier`** (cas « barème indéfini ») + alerte, **jamais un taux de repli immédiat, jamais 0** ; garde AST : toute lecture de la grille publiée hors du module d'import, de l'éditeur **et du cron de règlement à 60 jours** rougit. 🔴 **Deux corrections du 2026-09-03.** (a) **Le pivot de version est la date de CONFIRMATION de l'attribution, jamais `dateRef`** (REQ-ARG-008, synthèse M-9) : le contrat rattache la commission à la grille en vigueur à la confirmation, le code la rattachait à la signature du devis — **jusqu'à quinze mois séparent les deux, soit deux montants pour une même vente** ; le contrat est signé et plus protecteur, c'est lui qui gagne. (b) **Règlement à soixante jours** (annexe A1.7 réécrite, synthèse A-11) : `PALIER_HORS_GRILLE_JOURS` court depuis l'encaissement ; **à défaut de décision de la Société dans ce délai, la commission est due au taux ou au forfait que la GRILLE PUBLIÉE portait à la date de la vente** — un cron l'applique, écrit l'événement et débloque la ligne. Sans ce terme, la commission restait suspendue **indéfiniment à la seule volonté du débiteur** (art. 1304-2 C. civ.), les deux issues dépendant entièrement de la Société alors que l'art. 13.3 garantit à l'apporteur qu'il n'a pas à signer l'avenant. Ce repli est une **valeur écrite et opposable**, jamais un taux fabriqué par proximité de prix (arbitrage C-6).

### UX-P2-07 — Écran console « N contrats ne couvrent pas la prestation X »

`0.5 j` · zone `espace` · sensible : argent, espace · depend de `DM-23`, `SEC-17`, `T-ARG-037`

Couvre : `REQ-EXT-025`, `REQ-UX-026`

**Acceptation.** liste des paliers apparus au catalogue **après** signature, avec pour chacun le nombre de contrats dont la grille figée ne le couvre pas et les lignes `bloquee` motif **`a_qualifier`** (cas « barème indéfini ») qui en découlent ; 🔴 **chaque ligne affiche son échéance de règlement à soixante jours de l'encaissement** (`PALIER_HORS_GRILLE_JOURS`, annexe A1.7 réécrite, synthèse A-11) ; deux sorties explicites par palier — **avenant** (déclenche la campagne de re-signature INT-T23 sur les contrats visés) ou **décision écrite « non commissionnée pour ces contrats »**, motivée, journalisée **et portée à la connaissance de l'apporteur avec son motif** ; 🔴 **à défaut de décision dans le délai, la commission est due au taux ou au forfait de la GRILLE PUBLIÉE à la date de la vente**, appliqué par le cron de T-ARG-037 — jamais un taux deviné, jamais une fermeture silencieuse, jamais une suspension sans terme.

### INT-T17 — API 2 relevé mensuel signé `GET /api/integrations/axionia/apporteurs/:ref/releve/:mois`

`1 j` · zone `integration` · sensible : argent · depend de `INT-T11`, `SEC-07`, `T-ARG-016`

Couvre : `REQ-ARG-029`, `REQ-INT-016`, `REQ-INT-027`

### UX-P2-01 — Mes commissions : ventilation par payeur, échéance ou délai habituel, prévisionnel, bloquées avec motif, **« Prestation hors grille de commissions » avec son échéance à 60 jours**, remontée à l'encais

`1 j` · zone `espace` · sensible : argent, espace · depend de `DM-15`, `INT-T05`, `T-ARG-037`, `UX-P1-08`

Couvre : `REQ-ARG-017`, `REQ-ARG-032`, `REQ-UX-005`, `REQ-UX-010`, `REQ-UX-011`, `REQ-UX-012`

### UX-P2-02 — Tuile « à verser » à 4 états + accueil argent

`0.5 j` · zone `espace` · depend de `T-ARG-015`, `UX-P2-01`

Couvre : `REQ-UX-009`

### UX-P2-04 — Mes documents + Mes filleuls : contrats, relevés, autofactures, attestation, export RGPD, parrainage agrégé, lien partageable

`1 j` · zone `espace` · sensible : argent, attribution, espace, rgpd · depend de `INT-T12`, `SEC-19`, `T-ARG-016`, `UX-P1-08`

Couvre : `REQ-ARG-035`, `REQ-EXT-029`, `REQ-UX-006`, `REQ-UX-030`, `REQ-UX-032`

### UX-P2-05 — Paramètres console : grille lecture seule

`0.75 j` · zone `espace` · sensible : espace · depend de `DM-03-P`, `DM-11`, `SEC-17`

Couvre : `REQ-CPL-007`, `REQ-UX-011`, `REQ-UX-026`

### UX-P2-06 — Test de cloisonnement automatisé complet

`0.75 j` · zone `espace` · sensible : auth · depend de `SEC-05`, `UX-P2-01`, `UX-P2-04`

Couvre : `REQ-SEC-009`, `REQ-UX-005`, `REQ-UX-006`

### CPL-T12 — Contestation : **deux délais distincts**

`0.75 j` · zone `gouvernance` · sensible : argent, attribution, espace · depend de `JUR-T02`, `T-ARG-010`, `T-ARG-015`, `UX-P1-10`

Couvre : `REQ-ARG-017`, `REQ-CPL-010`, `REQ-CPL-012`

### CPL-T14-A — Producteur `client.fusionne`

`0.25 j` · zone `gouvernance` · `axionia` · depend de `INT-T05`

Couvre : `REQ-CPL-014`

### CPL-T14-P — Re-résolution des attributions et lignes après `client.fusionne`

`0.25 j` · zone `gouvernance` · sensible : argent, attribution · depend de `CPL-T14-A`, `DM-15`

Couvre : `REQ-CPL-014`

### INT-T23 — Avenant et campagne de re-signature

`1 j` · zone `integration` · sensible : argent, attribution · depend de `DM-03-P`, `DM-11`, `INT-T12`, `UX-P1-10`

Couvre : `REQ-CPL-007`, `REQ-CPL-028`, `REQ-DM-013`, `REQ-JUR-004`

**Acceptation.** nouvelle version de gabarit ou de grille → soumission DocuSeal à chaque contrat `signe` ; ancien contrat `signe → remplace`  **à la signature du nouveau, et à elle seule** ; 🔴 **le refus ou l'absence de signature ne bloque RIEN** — aucun état `contrat_a_resigner`, aucun délai de grâce, aucun dépôt refusé (contrat art. 13.3, REQ-CPL-028, corrigé le 2026-09-03) ; lignes antérieures gardent `grilleVersionId`.

### T-ARG-035 — Console « Commissions » : registre filtrable, traçabilité snapshot, saisie journalisée des lignes bloquées, rattachement manuel

`1 j` · zone `argent` · sensible : argent, attribution, espace · depend de `DM-12`, `DM-15`, `T-ARG-034`

Couvre : `REQ-ARG-006`, `REQ-ARG-027`, `REQ-ARG-030`, `REQ-DM-034`

### T-ARG-038 — **Après la fin du contrat, quelqu'un peut encore payer** : survie du mandat, mode « facture de l'apporteur », dernier relevé sans seuil

`1 j` · zone `argent` · sensible : argent · depend de `DM-18`, `SEC-19`, `T-ARG-015`, `T-ARG-016` · decisions `HYP-E1-17`

Couvre : `REQ-ARG-015`, `REQ-ARG-016`, `REQ-ARG-018`, `REQ-ARG-026`, `REQ-ARG-035`, `REQ-SEC-032`

**Acceptation.** (1) `Mandat.surviePostContrat` vrai de plein droit tant qu'il reste une ligne `prevue` ou `acquise` non payée au titre de l'art. 12.3 ; (2) à défaut de mandat — dénonciation avec préavis de `MANDAT_DENONCIATION_JOURS`, ou extinction — le relevé bascule en **mode « facture de l'apporteur »** : mise à disposition, facture établie par l'apporteur, paiement dans les trente jours de la réception conforme, lot de paiement acceptant ce mode ; (3) **dernier relevé produit sans le seuil** (HYP-E1-17) ; (4) l'apporteur conserve l'**accès en lecture** ou reçoit relevés, factures et motifs par e-mail à sa dernière adresse déclarée (SEC-19, UX-P1-10).

### T-ARG-039 — Délai de versement mesuré et **plafond de 60 jours** alerté

`0.5 j` · zone `argent` · sensible : argent, espace · depend de `CPL-T13`, `T-ARG-015`, `T-ARG-017`

Couvre : `REQ-ARG-017`, `REQ-ARG-018`, `REQ-ARG-034`

**Acceptation.** un indicateur **par relevé** affiche l'âge depuis l'établissement et depuis l'émission de la facture ; **alerte console à J+45** depuis l'émission ; tout relevé non payé à **J+60** est une anomalie de premier rang, nommée, quel que soit son motif ; **aucun motif de la liste « alertes » de REQ-ARG-017 (`commission_sup_ht`, `a_qualifier`, `non_resolue`) ne peut porter un relevé au-delà** ; les pénalités de retard et l'indemnité de 40 € sont dues de plein droit et figurent aux mentions de T-ARG-016.

### QA-T25 — Runbooks argent

`0.5 j` · zone `qualite` · sensible : argent · depend de `QA-T13`, `T-ARG-017`, `T-ARG-022`

Couvre : `REQ-QA-034`

### QA-T29 — Test de charge léger : 50 dépôts simultanés même SIREN

`0.25 j` · zone `qualite` · sensible : attribution · depend de `QA-T06`, `SEC-12`

Couvre : `REQ-QA-005`

### CPL-T11 — Mois « à blanc » : gate de phase 2 → 3

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `T-ARG-015`, `T-ARG-018`

Couvre : `REQ-CPL-011`

**Acceptation.** un cycle complet en mode ombre, écart 0 centime vs feuille manuelle sur ≥ 5 apporteurs réels — feuille manuelle produite par l'expert-comptable ou Will, jamais par un agent —, consigné dans PLAN-STATE avant d'ouvrir `SEPA_EXPORT_ENABLED` (paramètre en base `Parametre.sepaArmeLe` modifiable par `admin` + step-up + journal chaîné ; l'env ne peut que le fermer ; boot prod avec drapeau ouvert sans `MOIS_A_BLANC_VALIDE_LE` → exit ≠ 0).

### CPL-T23 — Pilote : 3 à 5 apporteurs réels, un cycle calendaire, feuille de contre-calcul externe

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `CPL-T11`

Couvre : `REQ-CPL-011`, `REQ-GOV-027`

**Acceptation.** gate de phase 2 → 3 avec CPL-T11 ; encaissements attribués autorisés sous `SEPA_EXPORT_ENABLED=false` ; écart 0 centime vs feuille de contre-calcul externe (EC ou Will) ; premier VERSEMENT seulement après clôture de phase 2.

### EXT-T02b — Double navigation commission ↔ fiche ↔ encaissement

`0.25 j` · zone `espace` · sensible : argent · depend de `EXT-T02a`, `T-ARG-010`

Couvre : `REQ-EXT-005`

**Acceptation.** depuis une ligne de commission on atteint la fiche prospect, et réciproquement ; l'encaissement qui a produit la ligne est atteignable depuis les deux.

### EXT-T07 — Prolongation de fenêtre si un devis est en cours

`0.5 j` · zone `espace` · depend de `DM-08`, `DM-15`, `INT-T04` · decisions `W9`

Couvre : `REQ-EXT-020`

**Acceptation.** prolongation unique de 3 mois, automatique, notifiée aux deux parties, journalisée.

### JUR-T28 — Résiliation sans barème : suspension de fait + résiliation motivée avec préavis

`0.5 j` · zone `juridique` · sensible : argent · depend de `DM-18`, `JUR-T24`, `SEC-19` · decisions `HYP-D11`

Couvre : `REQ-JUR-031`

**Acceptation.** plus aucun compteur de gradation nulle part ; la suspension est une mesure de vérification (motif fermé `non_confirme | fraude`) ; la résiliation exige un motif écrit et un préavis ; **aucune déchéance de commission** — les acquises sont payées, les autres suivent la règle ordinaire.

## Phase 3 — Pilotage et conformite

### T-ARG-030 — Export comptable équilibré

`1 j` · zone `argent` · sensible : argent · depend de `T-ARG-019` · decisions `DEC-INT-004`

Couvre : `REQ-ARG-023`, `REQ-INT-016`

### T-ARG-033 — Sortie de collaboration côté argent : dernier relevé sans seuil, **survie du mandat et mode facture de l'apporteur**, créance, attestation de fin, export RGPD, purge

`1 j` · zone `argent` · `schema` · sensible : argent, rgpd · depend de `DM-18`, `JUR-T28`, `SEC-19`, `T-ARG-015`, `T-ARG-030`, `T-ARG-038`

Couvre : `REQ-ARG-015`, `REQ-ARG-026`, `REQ-ARG-035`, `REQ-CPL-025`, `REQ-JUR-007`, `REQ-JUR-025`, `REQ-JUR-029`

**Acceptation.** aucune ligne ne peut prendre le statut `dechue` — la valeur n'existe plus dans l'enum ; les `acquise` sont payées au dernier relevé **sans le seuil de versement minimal**, les `prevue` suivent la règle ordinaire (contrat art. 12.3). 🔴 **Complétée le 2026-09-03 (synthèse A-4)** : la **chaîne de paiement survit à la fin du contrat** (T-ARG-038) — mandat survivant de plein droit pour les commissions restant à acquérir, ou bascule en mode « facture de l'apporteur » ; l'apporteur conserve un **accès en lecture** ou reçoit relevés, factures et motifs par e-mail à sa dernière adresse (SEC-19, UX-P1-10) ; l'**attestation de fin** énumère les droits restant à acquérir et la voie de paiement retenue.

### DM-20 — RGPD data-level : export art. 15, purge des journaux, vérification de chaîne, effacement tiers, registre, cron de purge

`1 j` · zone `domaine` · sensible : rgpd · depend de `DM-01`, `DM-12`, `DM-13`, `SEC-08`

Couvre : `REQ-DM-024`, `REQ-DM-031`, `REQ-DM-041`, `REQ-JUR-010`, `REQ-SEC-027`, `REQ-SEC-030`

### DM-21 — Vues territoriales et sectorielles + paramètre « saturé »

`0.5 j` · zone `domaine` · `schema` · depend de `DM-07`, `DM-15`

Couvre : `REQ-DM-030`

### CPL-T15 — Indicateurs d'activité et funnel par canal/cohorte, `CampagneRecrutement`, € / actif

`1 j` · zone `gouvernance` · depend de `DM-06`, `DM-21`, `INT-T21-P`

Couvre : `REQ-CPL-015`, `REQ-UX-035`

### UX-P3-01 — PWA : manifest, SW, écran hors-ligne, push opt-in différé, liens profonds, Telegram/SMS

`1 j` · zone `espace` · sensible : auth, espace · depend de `UX-P1-03`, `UX-P1-10`

Couvre : `REQ-INT-025`, `REQ-UX-014`, `REQ-UX-016`, `REQ-UX-033`

### UX-P3-02 — Mon activité + Ressources par palier

`1 j` · zone `espace` · depend de `CPL-T15`, `JUR-T13`, `JUR-T30`, `UX-P1-08`

Couvre : `REQ-CPL-023`, `REQ-JUR-041`, `REQ-UX-003`, `REQ-UX-029`

### UX-P3-03 — Aide / Messages : fil à états, FAQ-first, engagement 2 j ouvrés

`1 j` · zone `espace` · depend de `CPL-T13`, `UX-P1-10`

Couvre : `REQ-UX-028`

### UX-P3-04 — Console Pilotage : funnel, Territoire tableau

`1 j` · zone `espace` · sensible : espace · depend de `CPL-T15`, `INT-T05`, `SEC-17`

Couvre : `REQ-UX-018`, `REQ-UX-035`

### UX-P3-05 — Console Conformité + Anomalies : apporteurs × pièces, échéances, DAS2, signaux F8, gel/levée par rôle

`1 j` · zone `espace` · sensible : argent, attribution, espace · depend de `DM-11`, `DM-19`, `SEC-14`, `SEC-17`

Couvre : `REQ-UX-002`, `REQ-UX-024`, `REQ-UX-031`

### UX-P3-06 — Ré-engagement : dérivation `actif`/`dormant`

`1 j` · zone `espace` · sensible : espace · depend de `CPL-T13`, `CPL-T15`, `JUR-T25`, `UX-P1-10`

Couvre : `REQ-CPL-027`, `REQ-JUR-033`, `REQ-UX-016`

### JUR-T22 — Page « Retraité » gatée par validation EC

`0.25 j` · zone `juridique` · `axionia` · aucune dependance

Couvre : `REQ-JUR-030`

### SEC-26 — Notifications sans PII ni montant ; brouillon hors-ligne minimal

`0.5 j` · zone `securite` · sensible : rgpd · depend de `SEC-11`, `UX-P1-10`

Couvre : `REQ-SEC-033`

### QA-T27 — Résilience : axionia indisponible 3 j, Redis perdu, API gouv en panne — drill trimestriel

`1 j` · zone `qualite` · depend de `QA-T19`, `T-ARG-022`

Couvre : `REQ-QA-009`, `REQ-QA-026`

### QA-T28 — Audit sécurité pré-lancement : ZAP authentifié sur preview, `/security-review`, revue semgrep, charge

`1 j` · zone `qualite` · sensible : auth · depend de `QA-T06`, `QA-T16`, `SEC-05`

Couvre : `REQ-QA-005`, `REQ-QA-013`

### GOV-022 — Audit de traçabilité de fin de phase + rapport de décisions restantes

`0.5 j` · zone `gouvernance` · depend de `GOV-010`, `GOV-011`, `GOV-017a`, `GOV-017b`

Couvre : `REQ-GOV-005`, `REQ-GOV-009`, `REQ-GOV-015`, `REQ-GOV-027`, `REQ-JUR-038`

### EXT-T09 — Carte console : couverture, activité, détail

`1.5 j` · zone `espace` · sensible : espace · depend de `DM-21`, `EXT-T08`, `SEC-17`, `UX-P3-04`

Couvre : `REQ-EXT-016`, `REQ-EXT-017`, `REQ-EXT-018`

**Acceptation.** SVG des départements simplifié au build, 3 couches, filtre par apporteur avec surbrillance, agrégation serveur au-delà de 2 000 points, segment chargé à la demande.

### EXT-T10 — Carte de l'espace apporteur

`0.5 j` · zone `espace` · sensible : espace · depend de `EXT-T09`, `SEC-05`

Couvre : `REQ-EXT-019`

### EXT-T05 — Import CSV de jobboard

`0.5 j` · zone `espace` · depend de `EXT-T03`

Couvre : `REQ-EXT-008`, `REQ-EXT-009`

**Acceptation.** import idempotent, colonnes mappées, rapport de rattachements et de rejets.

### EXT-T11 — Extraction assistée de CV, derrière drapeau fermé

`1 j` · zone `espace` · sensible : espace · depend de `EXT-T04`, `JUR-T04` · decisions `W10`

Couvre : `REQ-EXT-013`

**Acceptation.** extraction de faits vers les champs du formulaire, chacun modifiable, aucune écriture sans validation humaine, **aucun score, aucun rang, aucun avis** (l'extraction est une aide à la lecture), journal du proposé et du corrigé.

### JUR-T25 — Lettre du réseau, en remplacement de la relance de dormance

`0.5 j` · zone `juridique` · sensible : attribution, espace · depend de `INT-T10`, `JUR-T26`, `UX-P1-10`

Couvre : `REQ-JUR-033`

**Acceptation.** envoi à intervalle fixe, **contenu identique pour tous**, la fonction d'envoi ne reçoit aucun filtre d'activité (signature sans paramètre de date de dernier dépôt) ; désinscription ; « dormant » reste un indicateur de console.

