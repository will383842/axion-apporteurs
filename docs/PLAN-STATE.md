# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `a8221af` — 2026-09-19T04:42:28+02:00 |
| Qu’est-ce qui est en vol ? | 1. #59 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T01 (A05) · GOV-077 (A05) |
| Où en est la phase ? | phase 0 — 5/98 tâches, reste 71.60 j |
| Le prochain pas | QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #64 — 2026-09-18 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

5/98 tâches terminées · reste 71.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 214 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 44 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **17.50 j**.

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
| 1 | #59 — feat(QA-T01): squelette de tests et Gate A bloquante, domaine a 100 %, lint sans tolerance | `t/qa-t01` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T01 — Squelette de tests et Gate A bloquante | A05 | #56 | `a_faire` |
| GOV-077 — La garde des demandes de fusion confond aucune revue lue et toutes les revues refusent | A05 | #57 | `a_faire` |

⚠️ **25 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0012-relecture-proportionnee-au-risque.md` — partners/ADR-0012 — La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-19). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 32 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `a8221af` (2026-09-19T04:42:28+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #64 — 2026-09-18 — feat(GOV-077): la relecture se proportionne au risque, aucune revue n est pas toutes refusent

**Fait.** Le nombre de lentilles exigées dépend désormais du risque de la PR, dérivé par une seule
fonction, `risqueDeLaPr()` (`scripts/lot/revues.ts`), qu'appellent `gov:pr` et le composeur du
corps. Une PR n'est ordinaire que si tout est prouvé : tâche résolue, base lisible, chaque tâche en
zone `gouvernance` ou `qualite` avec `sensible` présent et vide sur la tête ET la base, aucun
label `schema`, et un diff non vide, complet, entièrement sous `docs/`, `scripts/` ou `tests/`,
hors de la garde des revues, fermeture transitive de ses imports comprise. Tout le reste,
`.github/` et toute la racine compris, est élevé, et un fichier renommé compte par sa source comme
par sa destination. Ordinaire : `exactitude` et `securite` ; élevé : les quatre lentilles, comme avant. `gov:pr --pr` imprime le risque et ses
raisons, et « aucune revue » a sa propre famille, `aucune_revue`, distincte de « toutes les revues
refusent ». Un avis posté en commentaire d'issue est nommé sans être compté. Le lot L0-01 est clos
dans la même PR : GOV-039, GOV-041, GOV-043, GOV-044 et GOV-056 passent `fusionnee` par
`reclasser --fusionnee`, cinq appels sans refus.

**Reste.** `partners/ADR-0012` est `propose` : A02 le fera passer à `accepte`. Le workflow de lot,
les fiches de `.claude/agents/` et `docs/agents.json` disent encore « trois lentilles » : chemins du
lot `--settings` (GOV-023). La garde qui juge une PR reste celle de sa tête, limite déclarée et non
fermée. Huit tâches qui manipulent des données personnelles portent `sensible: []` : sans effet
sur les lentilles (leur zone les rend élevées), mais la section Attaque ne leur est pas demandée.

**Appris.** Une fixture qui semble ordinaire peut être élevée par accident : la PR témoin de
`--prove` touche la charte, donc la garde des revues, et son témoin de lentilles manquantes restait
rouge pour une raison que personne n'avait écrite. La PR ordinaire est maintenant une fixture
explicite. Et `gh pr view --json files` plafonne à 100 fichiers : un risque lu sur les fichiers
doit passer par l'API paginée, sinon un fichier au-delà du centième est invisible. Mesure sur le
registre réel : 29 des 201 tâches `partners` non livrées se reliront avec deux lentilles. Enfin,
une liste de fichiers qui ne lit que la destination d'un renommage juge une PR par l'endroit où un
fichier arrive, jamais par celui qu'il quitte : la lentille `securite` l'a refusé, à juste titre.
Et la liste que sert la forge plafonne sans erreur : elle se compare au nombre de fichiers que la PR
annonce, sinon trois mille documents cachent un fichier de configuration.

### PR #61 — 2026-09-18 — feat(GOV-043): gov:trace rend son perimetre et son complement, sous un plancher declare

**Fait.** `gov:trace` dit maintenant ce qu'il a regardé : 45 tâches sur 260 ont vu au moins une
promesse de `tests{}` recevoir un verdict contre ce disque, et les 215 autres sont nommées, rangées
en quatre raisons (`hors_depot` 16, `sans_promesse` 112, `promesse_a_venir` 87, `promesse_non_jugee`
0). Le périmètre sort du même passage que le contrôle. Un plancher déclaré dans le champ `verifie`
de `req:check` (45, mesuré le 2026-09-18 après l'intégration de la PR 54) rougit en
`couverture_sous_plancher` quand la couverture passe dessous : vu rouge en le franchissant par le
bas, vu vert quand elle monte. `gov:inventaire` ne compte plus une tâche absente du registre comme
portant une preuve qui résout.

**Reste.** GOV-043 reste ancrée sur REQ-GOV-005, absorbée : `reecrire-champ` refuse `reqs`, et
`taches` de `docs/requirements.json` n'est écrivable par aucun verbe. Le ré-ancrage sur REQ-QA-014
demande un verbe neuf, pas un contournement. Le plancher ne monte pas seul : la marge est imprimée
pour que la dérive se voie. La dette GOV-082 (une liste vide rendue à code 0 par `vitest list`) reste
ouverte et n'est pas touchée ici.

**Appris.** Le « 48 sur 209 » de l'acceptance comptait les tâches qui PORTENT un `tests{}`, pas
celles que la garde juge : reconstitué sur `e0dacf3`, où SEC-01, SEC-02 et INT-T01b n'en portaient
aucun. Porter une promesse ne suffit pas pour être regardé. Une promesse sans titre qui ne porte
qu'une exigence absorbée ne reçoit AUCUN verdict, et c'était le cas de GOV-043 elle-même : sa
première mesure l'a rangée dans son propre complément. Et `gov:inventaire` garde 7 familles parce
que ce compte est épinglé par une spécification hors des `paths` de la tâche : ajouter une famille
aurait élargi le périmètre de la PR.

### PR #59 — 2026-09-18 — feat(QA-T01): squelette de tests et Gate A bloquante, domaine a 100 %, lint sans tolerance

**Fait.** `pnpm test` lance désormais `vitest run --coverage` et applique 100 % lignes et branches à
chaque fichier de `src/domain/**`, `perFile` nommant le fichier sous le seuil ; `tests/setup.ts`
existe et est chargé par `setupFiles`. Les 13 avertissements ESLint de la PR 44 sont corrigés à la
source et les deux blocs de dette retirés : `pnpm lint` sort en 0 sans un seul avertissement. Le lint
du domaine refuse la base, le cache, le réseau et l'horloge système par leur nom usuel. La spec
`tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts` porte trois témoins à deux faces, un par
exigence, et elle est le script de `G-SEC-CI-BLOQUANTE`, dont la `preuveRouge` est posée : aucun job
ni aucune étape d'aucun workflow ne porte `continue-on-error`, lu par un vrai analyseur YAML.
`etats.ts` passe de 73,33 % à 100 % par un test de domaine qui dérive les statuts non occupants de
REQ-DM-006. Règle du domaine : sous `src/domain/**`, rien que du `.ts` NON-TEST — ni autre
extension, ni `*.spec.ts`, ni `*.test.ts`, ni `*.d.ts` ; les tests vivent sous `tests/`. Et aucun
commentaire du domaine ne parle de couverture : les formes que le fournisseur installé accepte sont
lues dans son code, et chacune est vue rougir.

**Reste.** Les formes voisines des interdits du domaine sont fermées par GOV-076 : import sans
préfixe, `import()` dynamique, `globalThis.fetch`, `Date['now']`, console par alias. REQ-QA-013 n'est
couverte qu'en partie : semgrep, testcontainers, audit, gitleaks, `req:check`, `idor:check`, lint de
migration et size-limit restent à leurs tâches. La couverture globale de CONVENTIONS §6 n'est pas
livrée. Le détecteur de `continue-on-error` existe en double avec le témoin étroit de CPL-T01, et la
lecture YAML en double avec `gardes-transposees.spec.ts` : dettes, pas tâches. Le désarmement d'une
étape par le shell, `run: pnpm test || true`, n'est jugé par aucun témoin de cette spec : dette
listée. L'en-tête de `tests/setup.ts` ne nomme pas les deux tâches qui le rempliront, parce que
`gov:attributions` refuse qu'un fichier neuf nomme en tête une tâche dont il n'est pas : dette. Tout fichier neuf
sous `src/domain/` doit arriver couvert à 100 % dans sa propre PR, et une passe partielle se lance
par `npx vitest run`, jamais par `pnpm test` suivi d'un fichier, qui rougit sur le seuil.

**Appris.** `pnpm test --coverage.reportsDirectory=x` est refusé par pnpm en « Unknown options » et
sort en 0 : sous la forme courte, pnpm lit les drapeaux pour lui. `pnpm run test` les passe au
script. Sans `reportOnFailure`, vitest n'imprime aucun seuil dès qu'un autre test échoue : le premier
rouge de couverture est resté muet sur une suite qui portait dix autres échecs. Et `gov:attributions`
lit les vingt premières lignes de chaque fichier : nommer une tâche voisine en tête d'un fichier neuf
la fait rougir en `mention_hors_paths`, même pour dire qui le remplira.

… 21 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

