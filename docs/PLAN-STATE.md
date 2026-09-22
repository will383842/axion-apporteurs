# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `571b1eb` — 2026-09-22T08:18:27+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (un conflit avec `main`) · 2. #86 (un conflit avec `main`) · 3. #88 (un conflit avec `main`) · 4. #90 (un conflit avec `main`) · 5. #91 (un conflit avec `main`) · 6. #92 (un conflit avec `main`) · 7. #93 (un conflit avec `main`) · 8. #99 (un conflit avec `main`) · 9. #100 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · DM-02 (A05) · QA-T02 (A05) · QA-T07 (A05) · GOV-059 (A05) |
| Où en est la phase ? | phase 0 — 14/98 tâches, reste 65.10 j |
| Le prochain pas | DM-02 — Gates de schéma : enums, centimes, index partiels, migrations additives (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #89 — 2026-09-21 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

14/98 tâches terminées · reste 65.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 205 | JUR-T02, QA-T08, DM-02, QA-T02, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 53 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → DM-02 (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **16.00 j**.

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
| 2 | #86 — feat(QA-T02): harnais d'integration testcontainers, environnement construit, Redis reel du script de SEC-10 | `t/qa-t02` | un conflit avec `main` — à résoudre avant tout |
| 3 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |
| 4 | #90 — feat(SEC-07): frontiere axionia — 404 unique, jeton en temps constant, liste d'adresses fermee | `t/sec-07` | un conflit avec `main` — à résoudre avant tout |
| 5 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 6 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un conflit avec `main` — à résoudre avant tout |
| 7 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un conflit avec `main` — à résoudre avant tout |
| 8 | #99 — feat(GOV-047): pnpm prevol existe enfin, derive du job gate-a et non de la chaine gov:check | `t/gov-047` | un conflit avec `main` — à résoudre avant tout |
| 9 | #100 — fix(GOV-059): la porte A ne tourne plus sur une PR fusionnee, gov:pr nomme la bonne cause, et ADR 0017 | `t/gov-059-suite` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| DM-02 — Gates de schéma : enums, centimes, index partiels, migrations additives | A05 | #63 | `a_faire` |
| QA-T02 — Harnais d'intégration testcontainers | A05 | #68 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-059 — Une demande de fusion de plus rougit les autres, et ce rouge fait sauter les etapes de mesure | A05 | #87 | `a_faire` |

⚠️ **34 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, QA-T03, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-077 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-22 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

**DM-02** — Gates de schéma : enums, centimes, index partiels, migrations additives (1.5 j, **sur le chemin critique**) : 41 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `571b1eb` (2026-09-22T08:18:27+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #89 — 2026-09-21 — fix(GOV-059): la revendication se derive de la forge, et gov:etat passe apres les etapes de mesure

**Fait.** La revendication d'une tache ne se recopie plus dans le `docs/tasks.json` de chaque
branche : elle se DERIVE d'une issue ouverte titree `ID` suivi d'un tiret cadratin et portant
`en_cours` plus `owner:Axx`. Le cout de synchronisation entre branches ouvertes cesse d'etre en
carre. Dans `.github/workflows/ci.yml`, l'etape `gov:etat` passe APRES lint, format, typecheck et
tests : un rouge venu d'une autre branche ne les laisse plus en sautees. L'entree de journal de la
PR 83, absente, est posee ici — elle rougissait toutes les branches ouvertes.

**Reste.** La surface de revendication passe d'un fichier sous revue de code a un titre d'issue que
tout compte pouvant ouvrir une issue sur ce depot peut ecrire. L'ecart est nomme dans la section
Attaque de la PR et assume sur ce depot ; il appartient a SEC-05 de decider s'il doit se fermer.
La dette de cloture de lot reste due : DM-01, SEC-10 et QA-T03 sont fusionnees sur main et encore
`a_faire` au registre.

**Appris.** Le rouge de trois PR ouvertes le meme jour etait la preuve vivante du defaut que cette
PR ferme : `pr_sur_tache_non_revendiquee` s'est allume sur 84 et 86 des l'ouverture de 89, sans
qu'aucune des trois n'ait change. Mesure au passage : une PR de phase 0 qui touche
`docs/tasks.json` exige le label `role:gardien-spec`, et le champ `Rouge constate par:` n'admet
QUE le code de poste — la moindre parenthese apres lui rend `rouge_vert_absent`.

### PR #84 — 2026-09-19 — feat(DM-02): gates de schema, enums, centimes, index partiels et migrations additives

**Fait.** Les gardes du schéma lisent un schéma LU, par un lecteur unique exporté
(`scripts/lot/lecteur-prisma.ts`) : un modèle se ferme sur SON accolade, et un texte illisible est
refusé en nommant la ligne. `partners:schema:enums` est réécrite dessus. Une liste d'états s'y juge
par groupe, la projection exacte est admise en migration par règle, et l'index unique de
l'attribution occupante se juge en SQL (`fautesIndexOccupant`). Deux gardes neuves sont câblées en
Gate A : `partners:schema:cents` (REQ-DM-001) et `partners:migrations:additive` (REQ-DM-037). La
seconde lit toutes les migrations suivies et dérive la protection du journal des déclencheurs que
les migrations posent. La spec d'intégration relit `pg_indexes` en base réelle. Le prédicat
provisoire de DM-01 meurt au profit de l'import de la garde, et `partners/ADR-0011` est amendée.

**Reste.** `reecrire-champ` refuse le champ `tache` : `partners:migrations:additive` reste
attribuée à QA-T11 au registre. La table `attributions` et son index naissent avec DM-07, qui
importera `fautesIndexOccupant`. `LANCE_EN_SCRIPT` à extension obligatoire vit encore dans d'autres
gardes. Le DML des migrations et le SQL assemblé hors `EXECUTE` ne sont pas jugés.

**Appris.** La garde `journal:sans-pii` est un fil tendu : toute mention en clair de la table
refuse, hors de sa liste blanche. Une garde qui doit protéger cette table ne la NOMME donc pas :
elle dérive la table protégée des déclencheurs que les migrations posent. C'est plus juste (RM-01),
et toute table protégée demain l'est sans retouche. Et remplacer un prédicat de test par l'import
d'une garde ne doit pas perdre ses mots : `remuneration`, `euro` et `euros` sont passés dans la
garde avec lui.

### PR #83 — 2026-09-19 — docs(GOV-039): les 25 clauses decidees remises ou datees (ADR 0016)

**Fait.** Les 25 clauses decidees par `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` et declarees perdues
dans `DETTE_TEXTE_DECIDE` sont resorbees, sans qu'aucune decision neuve soit prise : 23 reviennent
au mot pres dans le texte applique de 14 exigences, ecrites par un verbe hors depot et jamais a la
main ; les 2 autres etaient une annexe perimee, datee en ligne par `partners/ADR-0016`.
`DETTE_TEXTE_DECIDE` est desormais vide. `siren_manquant`, qui n'est pas une valeur de
`MotifBlocage`, devient `non_resolue` partout ou il etait ecrit.

**Reste.** La tension entre REQ-DM-021 et REQ-ARG-017 sur `non_resolue` est relevee par la lentille
exactitude et n'est pas tranchee : elle appartient a la zone argent. Cinq dettes de la revue sont
reportees. L'entree de journal de cette PR manquait a la fusion : elle est ecrite ici, a posteriori,
derivee mot a mot du corps de la PR — c'est exactement ce que `pr_fusionnee_sans_journal` reproche.

**Appris.** Comme la famille `dette_texte_decide_perimee` ne peut plus etre amenee au binaire par
une donnee une fois le registre vide, `controler()` prend un parametre `dettes` dont la valeur par
defaut est le registre, et les temoins passent une dette fabriquee. Un registre qu'on vide emporte
avec lui le seul moyen de prouver que la garde qui le lit sait encore rougir : il faut rendre la
source injectable AVANT de la vider.

… 31 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

