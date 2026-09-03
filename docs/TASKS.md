# Taches par phase — Axion Apporteurs

> ⚠️ **Ce fichier est une VUE. La source est `docs/tasks.json`.**
> Regenere par `pnpm gov:tasks --render`, jamais edite a la main : une correction tapee ici
> disparait au rendu suivant. Trois comptages differents ont circule dans la version tenue
> a la main, tous faux — les nombres ci-dessous sont comptes a la generation.
>
> Une tache = une PR, **≤ 1,5 jour**. Le plafond est porte par la garde `gov:tasks`.

**197 taches · 149.00 j estimes.**

| Phase | Taches | Jours | Terminees |
| --- | ---: | ---: | ---: |
| -1 — Gouvernance (prealable bloquant) | 26 | 16.50 | 5 |
| 0 — Socle technique | 50 | 37.75 | 0 |
| 1 — Operationnel | 60 | 47.25 | 0 |
| 2 — Argent | 40 | 29.75 | 0 |
| 3 — Pilotage et conformite | 21 | 17.75 | 0 |

## Phase -1 — Gouvernance (prealable bloquant)

### GOV-000 — Dépôt axion-partners, CI minimale, outillage d'autopilote ✅ **fusionnee**

`1 j` · zone `gouvernance` · sensible : attribution · aucune dependance · decisions `W13`

Couvre : `REQ-CPL-021`, `REQ-GOV-014`, `REQ-GOV-031`, `REQ-QA-001`

**Acceptation.** dépôt public (W13) ; `main` protégée (strict, `required_linear_history`, check requis **`gate-a`**) ; `package.json` déclarant les scripts que le SKILL et le workflow appellent — **`plan-state:build`, `lot:composer`, `lot:cloture`, `prevol`, `deploy:verify`, `gov:check`, `gov:autonomie`, `gov:issues`** — plus vitest ; `.github/workflows/ci.yml` avec un job **`name: gate-a`** exécutant `pnpm gov:check`, le check requis de la protection de branche portant **ce nom exact** (sinon GitHub reste en « Expected — Waiting for status », `gh pr checks --watch` n'aboutit jamais et la file se bloque dès la PR témoin) ; `scripts/gates/gov-check.ts` et `scripts/gates/gov-autonomie.ts` écrits, chacun avec sa fixture rouge archivée (`gates.json` les attribue à GOV-000) ; `scripts/gates/hook-env.js` ; `.claude/settings.json` (matrice d'autonomie : `permissions.allow`/`deny`, hook `PreToolUse` → `scripts/gates/hook-env.js` refusant toute `DATABASE_URL` non locale ou `NOTIFY_SINK ≠ true`) ; `scripts/lot/{composer.ts,lot.workflow.js,tasks.schema.json}` ; `scripts/plan-state/build.ts` ; `scripts/lot/cloture.ts` (écrivain de statut : `pnpm lot:cloture --lot <id>` écrit `statut`, `pr`, `branch`, `owner` dans `docs/tasks.json` d'après le retour du workflow, puis commite — sans lui la boucle ne progresse jamais) ; `.claude/skills/lot/SKILL.md` ; **`.claude/agents/` (15 fiches de rôle)** ; `docs/PLAN-STATE.md` v0 ; **`docs/tasks.json` amorcé avec les tâches de phase −1 au statut `a_faire`** (sans quoi GOV-017a n'est atteignable par aucun outillage : `build.ts` et `composer.ts` commencent par le lire) ; déplacement de `axionia/docs/partners/*` + du plan vers `axion-partners/docs/` avec `README.md` de renvoi. Toutes les tâches de phase −1 en dépendent (directement pour les racines GOV-007, GOV-001, JUR-T02 ; par transitivité pour les autres).

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:publication' > sait rougir : ses 7 familles ont chacune un témoin`

### GOV-007 — Charte des agents, gabarit de PR

`0.5 j` · zone `gouvernance` · `schema` · depend de `GOV-000`

Couvre : `REQ-GOV-010`, `REQ-GOV-011`, `REQ-GOV-012`, `REQ-GOV-013`

**Acceptation.** `CHARTE-AGENTS.md` (~15 rôles de sous-agents, fiches générées par GOV-023), `PULL_REQUEST_TEMPLATE.md` (8 cases, `Auteur:`, `Relecteur:`, `Couvre:`, bloc ROUGE/VERT), CODEOWNERS (`prisma/** @A02`, `packages/contracts/** @A02`) ; suppléant A12 pour les PR de A04 ; toute PR modifiant `prisma/**` ou `packages/contracts/**` porte le label `schema` et A02 est troisième relecteur bloquant.

**Tests.** `tests/gov/charte-pr.spec.ts`

### GOV-001 — Registre d'exigences consolidé ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-000`

Couvre : `REQ-GOV-001`, `REQ-GOV-026`

**Acceptation.** `REQUIREMENTS.md` + `requirements.json` avec toutes les REQ de ce rapport (B.1-B.9), champs `phase`, `module (1-21)`, `etape (1-12)` ; premier livrable `docs/partners/REQUIREMENTS-ANNEXE-FUSIONS.md` (couples de REQ fusionnées avec la REQ survivante, préséance DM > INT > SEC).

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:requirements' > sait rougir : ses 11 familles ont chacune un témoin`

### GOV-018 — Règles maison et leçons dans le dépôt

`0.25 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-007`

Couvre : `REQ-GOV-024`

**Acceptation.** `REGLES-MAISON.md` RM-01… (9 + 3), `LECONS.md`, ligne « Règle maison appliquée » dans le gabarit.

**Tests.** `regles-maison.spec.ts`

### GOV-008 — PLAN-STATE vivant, protocole de session, verrou d'écriture

`0.5 j` · zone `gouvernance` · sensible : auth · depend de `GOV-007`

Couvre : `REQ-GOV-006`, `REQ-GOV-007`, `REQ-GOV-023`

**Tests.** `plan-state-frais.spec.ts` · `une-tache-un-owner.spec.ts`

### GOV-002 — Table de préséance et bandeaux

`0.5 j` · zone `gouvernance` · depend de `GOV-001`

Couvre : `REQ-GOV-002`, `REQ-GOV-030`

**Acceptation.** ≥ 7 couples ; bandeaux sur fonctionnement §3.2/R3/R5/§9, contrat art. 1.2/1.5.

**Tests.** `preseance.spec.ts`

### GOV-003 — Identifiants qualifiés + gate anti-identifiant nu ✅ **fusionnee**

`0.5 j` · zone `gouvernance` · depend de `GOV-001`

Couvre : `REQ-GOV-003`

**Acceptation.** Garde `gov:identifiants` : un identifiant nu de la forme lettre + un ou deux chiffres (`D3`, `C12`, `D11`) est refusé dans tout fichier suivi. Deux distinctions sont portées par le code, parce que l'énoncé de REQ-GOV-003 les confondait : (a) `A` suivi de DEUX chiffres est un code de POSTE d'agent, espace de noms déclaré par `tasks.schema.json` (`^A[0-9]{2}$`), non un identifiant de décision ; (b) un identifiant entre guillemets est une CITATION, pas une référence — les documents qui expliquent la règle doivent pouvoir écrire son contre-exemple. Trois témoins vus rougir, dix contre-témoins vus rester verts.

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:identifiants' > sait rougir : 3 témoins et 10 contre-témoins`

### GOV-004 — Vérification des affirmations sur le code d'axionia

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `GOV-001`

Couvre : `REQ-GOV-004`

**Acceptation.** ≥ 25 affirmations avec « vérifié le » ; fausses marquées (Invoice, Refund, payerSiret, HT encaissé, C3 codé, patron Calendly, EmargementToken index, score non snapshoté…).

**Tests.** `affirmations-verifiees.spec.ts`

### GOV-005 — Registre des décisions ouvertes, hypothèses par défaut, tests HYP-* ✅ **fusionnee**

`1 j` · zone `gouvernance` · `schema` · depend de `GOV-001`, `GOV-003` · decisions `W1`, `W3`, `W4`, `W6`

Couvre : `REQ-GOV-003`, `REQ-GOV-015`

**Acceptation.** toutes les questions de la section E avec hypothèse, propriétaire, impact, phase bloquée ; livrable `docs/DECISIONS.md` (= `DECISIONS-INDEX.md` de REQ-GOV-003, un seul nom) avec table `DEC-*` ← identifiants d'origine (INT-Q01, INT-Q02, INT-Q04, INT-Q10, C12, A12-A16, F-DM-13, D12…) et champ `reversibilite ∈ {parametre, migration, avenant}` ; W1, W3, W4, W6 sans valeur par défaut.

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:hypotheses' > sait rougir : ses 10 familles ont chacune un témoin`

### GOV-006 — Glossaire + gate schéma enum

`0.5 j` · zone `gouvernance` · `schema` · sensible : attribution · depend de `GOV-002`

Couvre : `REQ-DM-003`, `REQ-GOV-016`, `REQ-JUR-027`

**Acceptation.** `docs/GLOSSAIRE.md` (13 états d'attribution, `EvenementRecu`, « Déposer » retenu contre « Déclarer », rôle `qualifieur`, `ETATS_OCCUPANTS` à 7 états dérivés de REQ-DM-003).

**Tests.** `glossaire-enums.spec.ts`

### GOV-009 — Squelette ADR + 6 ADR fondateurs

`1 j` · zone `gouvernance` · depend de `GOV-005` · decisions `HYP-BEB-D2`, `HYP-TENANT`

Couvre : `REQ-CPL-018`, `REQ-GOV-008`

**Acceptation.** ADR-0001 stack (HYP-BEB-D2), 0002 frontière/sources de vérité/mono-tenant (REQ-CPL-018), 0003 grille publiée, 0004 auth + rôles défaut refus, 0005 gouvernance, 0006 fusion.

**Tests.** `adr-index-derive.spec.ts`

### GOV-010 — Gate ADR ↔ assertion

`0.5 j` · zone `gouvernance` · depend de `GOV-009`

Couvre : `REQ-GOV-009`

### GOV-011 — Matrice de traçabilité dérivée

`1 j` · zone `gouvernance` · depend de `GOV-001`, `GOV-007`

Couvre : `REQ-GOV-005`

**Tests.** `tracabilite.spec.ts`

### GOV-012 — Protocole de fusion, release manager, protection de main

`0.5 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-007`

Couvre : `REQ-GOV-014`

**Acceptation.** squash + `required_linear_history` ; gate `gov:depot-visibilite` (`gh repo view --json visibility` ≠ la valeur decidee par W13, ou check requis `gate-a` absent → rouge).

**Tests.** `aucun-workflow-ne-pousse-sur-main.spec.ts` · `tout-check-est-cable.spec.ts`

### GOV-013 — Gate lexicale « commercial »

`0.25 j` · zone `gouvernance` · depend de `GOV-012`

Couvre : `REQ-GOV-017`

**Tests.** `lexique.spec.ts`

### GOV-014 — Conventions + sélection des gardes d'axionia

`1 j` · zone `gouvernance` · depend de `GOV-012`, `GOV-013`

Couvre : `REQ-GOV-018`, `REQ-GOV-029`

**Acceptation.** `docs/CONVENTIONS.md` (branches `t/<id-en-minuscules>`, worktrees `../axion-partners-wt/<id>`, titre de PR `<type>(<ID-TÂCHE>): <titre>`, commits `<type>(<domaine>): …` ≤ 100 car., camelCase français, suffixes `…Cents`/`…At`, snake_case Postgres par `@map`, `pnpm perf:bundle -- <route>`, `pnpm prevol`, « les hooks locaux ne font pas foi », jamais de jonction `node_modules` en worktree).

**Tests.** `gardes-transposees.spec.ts`

### GOV-015 — Fiches tiers

`0.5 j` · zone `gouvernance` · sensible : argent · depend de `GOV-001`

Couvre : `REQ-CPL-002`, `REQ-GOV-022`

**Tests.** `fiches-tiers.spec.ts`

### INT-T01a — Contrat d'événements, enveloppe et nomenclature : Zod + JSON Schema + `schemaVersion` + hash

`0.5 j` · zone `integration` · `schema` · depend de `GOV-004`, `GOV-009`, `GOV-015`

Couvre : `REQ-GOV-020`, `REQ-INT-003`, `REQ-INT-004`, `REQ-INT-029`, `REQ-QA-007`

**Acceptation.** nomenclature unique (REQ-INT-004 : liste fermée des 11 types littéraux, source unique `packages/contracts/events.ts`), enveloppe camelCase (REQ-INT-003), schéma Zod + JSON Schema + `schemaVersion` + hash ; `pnpm contracts:export` → `contracts.v<N>.json` + `contracts.sha256` copié à hash identique dans `axionia/src/server/partners-sync/contracts/` (jamais retapé).

**Tests.** `contrat-hash.spec.ts`

### INT-T01b — Contrat d'événements, payloads et fixtures produites par le producteur réel

`1 j` · zone `integration` · `axionia` · depend de `INT-T01a`

Couvre : `REQ-ARG-002`, `REQ-ARG-005`, `REQ-ARG-006`, `REQ-ARG-030`, `REQ-CPL-015`, `REQ-DM-018`, `REQ-DM-036`, `REQ-DM-039`, `REQ-DM-040`, `REQ-INT-005`, `REQ-INT-006`, `REQ-INT-032`, `REQ-QA-008`

**Acceptation.** payloads (REQ-INT-005/006/032, REQ-DM-039/040, K-18 payers[], `client.fusionne`, `candidature.recue`), dérivation HT, deux formes de remboursement ; `pnpm partners:fixtures` (dans axionia, `scripts/partners/fixtures.ts`, base de dev port 5434, pseudonymisation, sortie commitée dans Partners avec `Source:`) — **aucune fixture écrite à la main, aucun helper qui « complète » un champ manquant**.

### GOV-017a — Backlog converti en `docs/tasks.json` : champs déjà écrits, acyclique ✅ **fusionnee**

`1 j` · zone `gouvernance` · depend de `GOV-001`, `GOV-005`

Couvre : `REQ-GOV-021`, `REQ-GOV-025`, `REQ-GOV-027`

**Acceptation.** conversion **mécanique** de `TASKS.md` en `docs/tasks.json` pour les champs qui existent déjà (`id`, `titre`, `phase`, `deps`, `reqs`, `hyp`, `externe`, `repo`, `estimateDays`, `statut`), validé par `scripts/lot/tasks.schema.json` ; `repo` absent → `partners` par défaut ; grappes fusionnées ; chemin critique écrit dans PLAN-STATE ; `TASKS.md` devient une vue générée (`pnpm gov:tasks --render`).

**Tests.** `tests/unit/gouvernance/gardes.spec.ts#'gov:tasks' > sait rougir : ses 11 familles ont chacune un témoin`

### GOV-017b — `paths

`1.5 j` · zone `gouvernance` · sensible : attribution · depend de `GOV-017a`

Couvre : `REQ-GOV-021`, `REQ-GOV-025`, `REQ-GOV-027`

**Acceptation.** chaque tâche porte `zone`, `paths[]` (≥ 1 entrée) et `sensible[]` ; **c'est ce qui fonde la disjonction de chemins du composeur** — sans ces champs, deux tâches d'un même lot peuvent écrire le même fichier et la file casse ; `acceptance` et `tests{}` deviennent requis **à l'attribution** (`statut: en_cours`), pas à l'écriture.

### GOV-019 — Budgets de performance après première mesure

`0.25 j` · zone `gouvernance` · depend de `GOV-014`

Couvre : `REQ-GOV-028`

**Tests.** `poids-du-bundle-garde-vraiment.spec.ts`

### GOV-020 — Inventaire prouvé C1-C8

`0.25 j` · zone `gouvernance` · depend de `GOV-004`

Couvre : `REQ-GOV-026`

### GOV-023 — Fiches de rôle générées depuis `agents.json`

`0.5 j` · zone `gouvernance` · depend de `GOV-000`, `GOV-007`

Couvre : `REQ-GOV-010`

**Acceptation.** `pnpm gov:agents` génère `.claude/agents/<role>.md` (~15 fiches : mission, entrées, sorties, interdits, documents à lire avec chemins, `tools`).

**Tests.** `fiches-agents.spec.ts`

### QA-T00 — `prove.sh` + `gates.json` {id, script, fixtureRouge, phase, preuveRouge} + nightly `gates:prouvees`

`0.5 j` · zone `qualite` · depend de `GOV-000`

Couvre : `REQ-QA-013`

**Acceptation.** chaque gate porte un champ `phase` et une `preuveRouge` archivée ; `gates:prouvees` calcule « toutes les gates de phase ≤ N présentes, bloquantes, avec `preuveRouge` ».

### CPL-T01 — Décisions sans valeur par défaut à trancher par Will : W1 entité contractante, W9 prolongation de fenêtre si devis en cours — **attente_externe**

`0 j` · zone `gouvernance` · `externe` · sensible : argent, attribution · depend de `GOV-005` · decisions `HYP-E1-5`, `W1`, `W11`, `W2`, `W3`, `W4`, `W5`, `W6`, `W9`

Couvre : `REQ-CPL-001`, `REQ-CPL-002`, `REQ-CPL-003`, `REQ-CPL-004`, `REQ-CPL-017`, `REQ-CPL-018`

**Acceptation.** W1, W3, W4 tranchées avant la sortie de phase −1 ; **W6 est tranchée le 2026-09-03** — quatre familles commissionnées (formations collectives, accompagnement 1-to-1, audits, implémentations), soit **30 paliers** ; cinq familles non commissionnées à écrire noir sur blanc dans l'annexe (développement web, maintenance, coaching récurrent, conférences, interventions sur demande) ; banque (W2) et stack (W5) sont des hypothèses écrites dans DECISIONS.md (pain.001.001.03 générique + saisie manuelle avec EndToEndId, REQ-CPL-002 ; la banque ne gate que le mois à blanc) ; coût mensuel de l'hébergement dédié (HYP-E1-5) soumis à Will ; test de cohérence SIREN/IBAN sur les trois fixtures (contrat, mandat, pain.001) dès que l'entité est nommée.

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

Couvre : `REQ-ARG-002`, `REQ-ARG-003`, `REQ-INT-010`, `REQ-INT-011`, `REQ-QA-008`, `REQ-QA-009`, `REQ-SEC-010`, `REQ-SEC-011`

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

