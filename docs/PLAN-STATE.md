# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `b973869` — 2026-09-19T20:30:42+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (un conflit avec `main`) · 2. #84 (un conflit avec `main`) · 3. #86 (un conflit avec `main`) · 4. #88 (un conflit avec `main`) |
| Qui tient quoi ? | SEC-10 (A05) · QA-T08 (A05) · DM-01 (A05) · DM-02 (A05) · QA-T02 (A05) · QA-T03 (A05) · QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 11/98 tâches, reste 68.10 j |
| Le prochain pas | DM-01 — Socle du schéma Partners : conventions, enums de base, journal Evenement chaîné immuable (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #88 — 2026-09-19 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

11/98 tâches terminées · reste 68.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 208 | JUR-T02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07, QA-T30, CPL-T22, SEC-08 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 50 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **17.00 j**.

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

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 2 | #84 — feat(DM-02): gates de schema, enums, centimes, index partiels et migrations additives | `t/dm-02` | un conflit avec `main` — à résoudre avant tout |
| 3 | #86 — feat(QA-T02): harnais d'integration testcontainers, environnement construit, Redis reel du script de SEC-10 | `t/qa-t02` | un conflit avec `main` — à résoudre avant tout |
| 4 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| SEC-10 — Bibliothèque rate-limit avec garde de famille, honeypot observable | A05 | #71 | `a_faire` |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| DM-01 — Socle du schéma Partners : conventions, enums de base, journal Evenement chaîné immuable | A05 | #62 | `a_faire` |
| DM-02 — Gates de schéma : enums, centimes, index partiels, migrations additives | A05 | #63 | `a_faire` |
| QA-T02 — Harnais d'intégration testcontainers | A05 | #68 | `a_faire` |
| QA-T03 — Traçabilité REQ→test : requirements.yaml, @req, req:check | A05 | #80 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **31 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-077 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0012-relecture-proportionnee-au-risque.md` — partners/ADR-0012 — La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve · `docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées · `docs/adr/0014-temps-paris-jours-ouvres.md` — partners/ADR-0014 — Le temps du métier : horloge injectée, heure de Paris calculée, jours ouvrés versionnés · `docs/adr/0015-journal-evenement-chaine-immuable.md` — partners/ADR-0015 — Le journal Evenement : chaîné, refusé à toute modification par la base, sans donnée personnelle

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-19). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**DM-01** — Socle du schéma Partners : conventions, enums de base, journal Evenement chaîné immuable (1 j, **sur le chemin critique**) : 40 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `b973869` (2026-09-19T20:30:42+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #88 — 2026-09-19 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur

**Fait.** `src/lib/logger.ts` écrit des lignes JSON pino dans un flux qui relit chaque ligne finale,
la parcourt en entier et remplace toute valeur protégée : par nom de clé (lexique de personne importé
de DM-01, plus `SEGMENTS_SECRETS`, casse et accents neutralisés) et par valeur (courriel, IBAN,
téléphone français, lien de dépôt). Une ligne illisible est remplacée, jamais écrite brute. Seule une
empreinte SHA-256 exacte, sous une clé de contexte à la racine, échappe au scan. `src/lib/sentry.ts`
bâtit un client `@sentry/node` autonome, dont les trois filtres passent par la même fonction, et qui
ne transmet aucun en-tête. `src/lib/notify.ts` refuse de se construire hors production sans
`NOTIFY_SINK=true`, et son prédicat est confronté au vrai `hook-env.js` sur 8 environnements.
`src/instrumentation.ts` est le seul lecteur de l'environnement. Versions exactes : pino 10.3.1,
`@sentry/node` 10.75.0. 26 tests, 25 mutants tués en phase A, 3 rejoués en phase B.

**Reste.** Aucun transport réel de notification (INT-T14, INT-T10) ; le notifieur n'est pas composé
au démarrage. Pas de Sentry côté navigateur ni de cartes de sources (SEC-03). `SENTRY_DSN` doit
devenir obligatoire en production dans le schéma d'environnement (QA-T04). L'entrée de Sentry au
registre RGPD appartient à JUR-T04. Une règle de lint doit interdire toute interpolation dans le
message d'un appel de journal : un nom de personne en texte libre n'a pas de motif.

**Appris.** L'option `redact` de pino juge des chemins : un objet un cran plus bas, un tableau ou une
clé en casse différente passent, et seul un parcours de la ligne finale les voit tous. Une exemption
par forme hexadécimale est une porte : un IBAN allemand en minuscules, `de89` suivi de chiffres, a
la forme d'une empreinte de 22 caractères. Seule la longueur exacte de la SHA-256 ferme la porte.
Depuis que `next` est une dépendance, `NodeJS.ProcessEnv` exige `NODE_ENV` : un environnement de
sous-processus construit à partir de zéro doit être converti, comme dans la spec de SEC-01. Et la
garde `journal:sans-pii` lit tout identifiant `evenement`, y compris le paramètre d'un filtre Sentry :
renommer vaut mieux qu'inscrire une exemption. Enfin, le corps d'une PR garde chacune de ses
révisions : un IBAN d'exemple à clé valide collé une fois dans un bloc rouge verbatim y reste, et
`gov:entite --corps-publie` le lit. La PR #85 a été fermée pour cela et remplacée par celle-ci, code
inchangé. Un corps se vérifie avec le détecteur de la garde AVANT sa première publication.

### PR #81 — 2026-09-19 — feat(QA-T03): req:check juge chaque paire (tache, REQ) - deux formes et test vert

**Fait.** `pnpm req:check` est la garde deja inscrite sous cet identifiant (`gov-trace.ts`, alias
`gov:trace`), lancee dans Gate A juste apres « Tests » avec le rapport JSON que `pnpm test` ecrit
desormais (`test-results/vitest.json`). Aucun second script. La garde exige les DEUX formes de
REQ-QA-014 pour chaque paire (tache, exigence active) dont le fichier promis existe : `@req` dans le
premier bloc de commentaires ET l'identifiant dans le titre d'un `it()` (ecrit, ou dernier segment
du nom resolu par vitest quand le titre est un gabarit), et elle nomme la forme qui manque. Avec les
resultats, elle exige un test VERT ; une promesse par titre exige CE test vert. Trois familles
neuves : `annotation_absorbee_sans_renvoi`, `test_promis_non_vert`, `resultats_illisibles` (absents,
illisibles, perimes). `--prove` : 15 familles, 25 temoins dont 12 nommes pour les pannes du brief,
15 contre-temoins. Mise en conformite a la source : 25 paires dans 12 fichiers de spec, et les trois
annotations absorbees portent leur renvoi. QA-T01, GOV-077, SEC-01, SEC-02, CPL-T13 et UX-P0-02
passent `fusionnee` ; le temoin du cas 10 de `lentilles-selon-le-risque.spec.ts` choisit sa tache au
registre au lieu de nommer QA-T01.

**Reste.** `pnpm prevol` n'existe pas et devrait appeler `req:check` (GOV-047). Le temoin etroit
« titre qui nomme une absorbee » vit dans une spec (GOV-039), le jumeau « annotation absorbee » dans
la garde : deux lieux pour une regle. `gardes-transposees.spec.ts` garde sa copie de la lecture YAML.
Un titre cite litteralement par un ADR est une promesse que la mise en conformite a cassee une fois
(`partners/ADR-0009`, corrige) ; `partners/ADR-0005` en cite un autre que `gov:adr` ne juge pas.

**Appris.** `vitest list --json` OMET les tests `it.skip` et `it.todo` : une promesse par titre vers
un test saute se lisait deja « titre absent », jamais « non vert ». Le rapport JSON de vitest 2.1.9
porte le chemin ABSOLU de chaque fichier : des resultats produits dans un autre arbre sont perimes
par construction, et la garde le dit. Une chaine de test qui contient une ouverture `it(` ou une
annotation en clair est lue par `gov:trace` comme une citation : les textes fabriques s'assemblent.
Les etiquettes de panne du brief tombent sous `gov:identifiants` (lettre et chiffre nus).

### PR #79 — 2026-09-19 — docs(UX-P0-02): maquettes des huit écrans et garde maquettes-validees

**Fait.** Huit maquettes autonomes sous `docs/maquettes/` : six pour l'espace, deux pour la console. Elles couvrent 90 états et viennent avec une charte (`index.html`) aux contrastes mesurés dans les deux thèmes de l'espace. La garde `maquettes-validees` lit `VALIDATION.md` par ses en-têtes. Elle refuse une validation écrite à moitié ou signée par un autre que Will, et rougit sur toute tâche d'écran attribuée sans maquette validée ; elle est câblée en Gate A. La spec prouve aussi la forme de l'accueil (REQ-UX-008), le contraste recalculé depuis chaque maquette (REQ-UX-034) et la moitié statique de REQ-UX-017. Elle a été vue rouge avant la garde, et six mutants de la garde ont été tués. Les six maquettes de l'espace portent `2026-09-19 | Will`. Will a donné la validation lui-même, en séance avec l'orchestrateur, en répondant « oui parfait » à « Valider les six maquettes de l'espace apporteur ». Cette réponse vaut aussi pour les onze choix par défaut des notes. L'orchestrateur a écrit les six lignes dans `1c6d94b`, avec les mots de Will dans le message de ce commit ; l'auteur de la PR ne les a pas écrites. La garde libère UX-P1-01, UX-P1-02, UX-P1-05, UX-P1-08, UX-P1-09 et UX-P2-01. Le composeur lit désormais le tableau par le lecteur de la garde, et non plus par position de colonne.

**Reste.** Les deux maquettes de console (UX-P1-07, UX-P2-03) attendent la validation de Will. Restent aussi la moitié dynamique de REQ-UX-017 (UX-P0-03) et la dérive du GLOSSAIRE sur `IssueDepot` et `MotifBlocage`.

**Appris.** Prettier coupe les balises fermantes d'un HTML long (`</a` puis `>` à la ligne suivante). Une spec qui cherche `</label>` en texte exact ne trouve jamais la fermante, et juge alors « étiqueté » tout champ placé après une étiquette. Le témoin était trop indulgent sans rougir. Et le composeur lisait l'avant-dernière cellule du tableau, « Par », sous un commentaire qui disait « Validé le ».

… 29 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

