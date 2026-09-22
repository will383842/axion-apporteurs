# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `1078394` — 2026-09-22T13:07:25+02:00 |
| Qu’est-ce qui est en vol ? | 1. #109 (un contrôle requis rouge ou une revue manquante) · 2. #82 (un conflit avec `main`) · 3. #88 (un conflit avec `main`) · 4. #90 (un conflit avec `main`) · 5. #91 (un conflit avec `main`) · 6. #92 (un conflit avec `main`) · 7. #93 (un conflit avec `main`) · 8. #99 (un conflit avec `main`) · 9. #100 (un conflit avec `main`) · 10. #102 (un conflit avec `main`) · 11. #107 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · DM-02 (A05) · QA-T02 (A05) · QA-T07 (A05) · GOV-059 (A05) |
| Où en est la phase ? | phase 0 — 14/99 tâches, reste 65.60 j |
| Le prochain pas | DM-02 — Gates de schéma : enums, centimes, index partiels, migrations additives (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #109 — 2026-09-22 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

14/99 tâches terminées · reste 65.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 206 | JUR-T02, QA-T08, DM-02, QA-T02, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06 … |
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
| 1 | #109 — chore(GOV-008): l'entrée de journal de la PR 108 manquait — main était rouge sans elle | `t/journal-108` | un contrôle requis rouge ou une revue manquante |
| 2 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 3 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |
| 4 | #90 — feat(SEC-07): frontiere axionia — 404 unique, jeton en temps constant, liste d'adresses fermee | `t/sec-07` | un conflit avec `main` — à résoudre avant tout |
| 5 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 6 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un conflit avec `main` — à résoudre avant tout |
| 7 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un conflit avec `main` — à résoudre avant tout |
| 8 | #99 — feat(GOV-047): pnpm prevol existe enfin, derive du job gate-a et non de la chaine gov:check | `t/gov-047` | un conflit avec `main` — à résoudre avant tout |
| 9 | #100 — fix(GOV-059): la porte A ne tourne plus sur une PR fusionnee, gov:pr nomme la bonne cause, et ADR 0017 | `t/gov-059-suite` | un conflit avec `main` — à résoudre avant tout |
| 10 | #102 — docs(GOV-063): ADR 0017 tranche l'homonymie, le nom gov:check est retire des deux cotes | `t/gov-check-homonymie` | un conflit avec `main` — à résoudre avant tout |
| 11 | #107 — fix(GOV-089): un numero PUBLIC se juge a son porteur, pas a son mot-cle — 452 defauts, 448 sur des tiers | `t/gov-entite-tiers` | un conflit avec `main` — à résoudre avant tout |

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

`docs/adr/0011-une-seule-implementation-des-listes-d-etats.md` — partners/ADR-0011 — Les listes d'états occupants ont UNE implémentation, et son discriminant est la couverture

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-22). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**DM-02** — Gates de schéma : enums, centimes, index partiels, migrations additives (1.5 j, **sur le chemin critique**) : 42 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `1078394` (2026-09-22T13:07:25+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #109 — 2026-09-22 — chore(GOV-008): l'entrée de journal de la PR 108 manquait — main était rouge sans elle

**Fait.** L'entrée de journal de la PR 108, absente à sa fusion, est écrite ici, dérivée du corps de
la PR et de son diff. `pnpm gov:etat` repasse d'un défaut (`pr_fusionnee_sans_journal`,
REQ-GOV-023) à neuf familles évaluées sur neuf, et les deux spécifications qui rougissaient pour
cette seule cause — `plan-state-frais.spec.ts` et `une-tache-un-owner.spec.ts` — redeviennent
vertes. Cette PR porte aussi sa PROPRE entrée : sans elle, sa fusion reproduirait le défaut qu'elle
répare.

**Reste.** Le défaut structurel n'est pas fermé ici, et il n'appartient pas au documentaliste :
`pr_fusionnee_sans_journal` ne peut pas rougir AVANT la fusion, son prédicat étant que la PR est
fusionnée. Aucune garde d'avant-fusion ne l'exige : `gov:pr` ne lit jamais `docs/journal/`, et la
seule mention du dossier dans son code est le contre-témoin qui grave ce choix. La seule victime
possible est donc `main`. GOV-052 porte ce remède au registre, et GOV-073 passe avant elle ou avec
elle, sous peine d'une cinquième grammaire d'entrée de journal. GOV-088 reste `a_faire` au registre
alors que sa PR est fusionnée : c'est la dette de clôture de lot, déjà connue.

**Appris.** Le rouge d'une garde qui interroge la forge n'appartient à aucune branche : les deux
spécifications rougissaient sur TOUTE branche sans qu'aucune n'ait changé une ligne, et un seul
fichier de documentation les rend vertes. Mesuré au passage : `pnpm gov:etat` sans `--now`
n'évalue que huit familles sur neuf et sort 0 en le DISANT — un vert local obtenu sans l'instant
est plus faible que celui de la porte A, qui le donne.

### PR #108 — 2026-09-22 — fix(GOV-088): le glossaire interdisait la colonne qu'il prescrit, et un .ts ne peut citer aucun terme interdit

**Fait.** `docs/GLOSSAIRE.md` interdisait en ligne 149 la forme qu'il prescrit en ligne 126 : la
colonne de la table de réception, dont le texte de REQ-DM-036 est repris mot pour mot. La règle
posée se dérive du registre au lieu de nommer un cas : un jeton que le registre attribue AUSSI à un
autre rôle ne peut pas porter un interdit sec — il devient un interdit sous condition, que la garde
n'exerce pas et qu'elle imprime. Trois jetons passent sous condition, et un est récupéré :
`subjectRef` était désarmé par un accident de ponctuation, le tiret cadratin qui suivait le dernier
jeton de la liste. Le compte des interdits exercés va donc de 37 à 35, pas à 34. Un témoin neuf,
`enveloppe_camelcase_hors_contrat`, entre au code ET au registre, les deux sens du refus mesurés :
30 témoins deviennent 31.

**Reste.** Un marqueur de citation pour les fichiers TypeScript a été essayé puis réfuté sur mesure :
le `//` d'une URL ouvre une zone de commentaire et amnistie la même instruction exécutée. La limite
est nommée au glossaire avec son propriétaire, GOV-069. REQ-DM-036 s'épelle elle-même avec un
synonyme interdit : le développeur de SEC-06 lira le mauvais nom dans sa propre exigence. Le §5 du
glossaire porte un avertissement périmé. Le champ `verifie` de `docs/gates.json` n'apparaît dans
aucune vue.

**Appris.** L'accident réparé l'est par l'INSTANCE, pas par la famille : un jeton ajouté en fin de
bloc et suivi d'une glose naîtra désarmé de la même façon. Et la face verte annoncée n'est pas la
ligne que SEC-06 écrira — la même ligne rougit sous la garde des énumérations, la colonne devra
être un enum.

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

… 34 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

