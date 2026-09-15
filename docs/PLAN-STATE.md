# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `ae56ce4` — 2026-09-15T14:36:27+02:00 |
| Qu’est-ce qui est en vol ? | 1. #39 (rien) · 2. #45 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-035 (A01) · GOV-036 (A01) · GOV-037 (A01) · GOV-030 (A01) · GOV-031 (A01) |
| Où en est la phase ? | phase -1 — 34/39 tâches, reste 3.50 j |
| Le prochain pas | fusionner #39, puis GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #45 — 2026-09-15 |

**Ce qu’on tape maintenant.** `gh pr view 39 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

34/39 tâches terminées · reste 3.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 191 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 34 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **16.50 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend ont une hypothèse posée dans `docs/DECISIONS.md`.

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #39 — feat(GOV-036): les deux listes qui decident de ce que gov:entite REGARDE | `t/gov-036` | rien — fusionnable maintenant |
| 2 | #45 — fix(GOV-037): les attributions se confrontent a leurs sources — quatre rouges fermes, cliquet a 36 | `t/gov-037` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur | A01 | #37 | `a_faire` |
| GOV-036 — Les deux listes qui decident de ce que gov:entite REGARDE sont tapees a la main | A01 | #38 | `a_faire` |
| GOV-037 — Les nombres se derivent, les ATTRIBUTIONS non : rien ne confronte un nom de tache a ses paths | A01 | #43 | `a_faire` |
| GOV-030 — `gov:check` designe DEUX choses, et aucune ne fait ce que six documents lui pretent | A01 | #40 | `a_faire` |
| GOV-031 — eslint.config.mjs porte « CE FICHIER N'A JAMAIS ETE EXECUTE », et c'etait vrai | A01 | #42 | `a_faire` |

⚠️ **15 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0011-une-seule-implementation-des-listes-d-etats.md` — partners/ADR-0011 — Les listes d'états occupants ont UNE implémentation, et son discriminant est la couverture

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-15). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**Fusionner #39** — elle est en tête de file et ne bloque sur rien. Lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.

**GOV-035** — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur (0.5 j) : 5 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `ae56ce4` (2026-09-15T14:36:27+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #45 — 2026-09-15 — fix(GOV-037): les attributions se confrontent a leurs sources — quatre rouges fermes, cliquet a 36

**Fait.** La garde `gov:attributions` (`scripts/gates/gov-attributions.ts`) confronte à sa seconde
source toute attribution écrite deux fois : gate ↔ tâche, owner ↔ poste, lot ↔ titre de l'entrée de
journal de sa PR, et tout identifiant de tâche nommé dans l'en-tête d'un fichier suivi de `scripts/`
ou de `tests/`, ou dans une chaîne de `docs/gates.json`. Ce qu'elle ne peut pas juger est exempté,
imprimé et compté sous la rubrique de sa nature. Une dette figée (`DETTE_GABARIT_LIVREE`,
`DETTE_LOT_JOURNAL`) porte tout ce que le site jugé porte, et une entrée qui ne mesure plus rien
rougit en `dette_perimee`. Elle est appelée par Gate A (`pnpm gov:attributions`, puis son `--prove`)
et par `pnpm gov:check`. La branche a ensuite fusionné `main` après les PR #36, #41 et #44 : cinq
conflits. `ci.yml` et `package.json` gardent toutes les étapes et tous les scripts des deux côtés ;
`docs/PLAN-STATE.md` et `docs/TRACABILITE.md` sont régénérés. Le cliquet des sorties non nulles a
rougi sur la fusion, `expected 37 to be 36` : la PR #41 avait pris le 36 avec `gov-check.ts`, et il
est déclaré à 37. La garde a rougi trois fois sur le contenu fusionné, en `mention_hors_paths`, sur
trois textes arrivés par `main`. Deux sont des champs `verifie` de `docs/gates.json`, réécrits par
l'outil hors dépôt sans exemption : `gov:plan-state` ne nomme plus GOV-035, `gov:check` ne nomme plus
GOV-006. Le troisième, l'en-tête de `scripts/gates/gov-check.ts`, dit un fait vrai sur GOV-000 : il
est déclaré en `contexte`. Prettier est appliqué aux trois fichiers de cette PR que `format:check`
refusait, avec un arbre syntaxique identique.

**Reste.** Les livrables (5) et (6) de l'acceptance ne sont pas livrés, et la décision appartient au
gardien de la spécification ou à Will. Les dettes déclarées au corps de la PR restent ouvertes,
lentille par lentille, dont le mutant survivant du retrait des commentaires HTML fichier par fichier.
Le titre de la PR dit encore « cliquet a 36 ». La déclaration `contexte` de l'en-tête de
`gov-check.ts` est un choix d'intégration : la phrase pourrait aussi être réécrite dans le fichier de
GOV-030. La PR #39 atterrira probablement avant celle-ci, et une seconde fusion de `main` suivra.

**Appris.** Une mesure d'interaction entre PR vaut pour la base où elle a été faite. Rejouée après la
seule PR #36 (`git merge-tree`), la garde nommait un texte fautif ; sur la fusion réelle, après la
PR #41, elle en nomme trois. Et une mention hors paths ne se ferme pas en ajoutant le path :
`plan-state-frais.spec.ts` n'a été touché ni par la PR #36 ni par GOV-035, et le déclarer à cette
tâche aurait écrit une seconde attribution fausse pour taire la première.

### PR #44 — 2026-09-15 — chore(GOV-031): l'outillage epingle, ses scripts, et les deux etapes de Gate A

**Fait.** ESLint et Prettier sont épinglés en `devDependencies`, lancés par les scripts `lint`,
`format:check` et `format`, et appelés par deux étapes BLOQUANTES de Gate A. Chaque écart restant
porte une dérogation nommée et motivée. La dernière passe a fermé les deux failles qui passaient en
exit 0. D'abord, le témoin d'effet lance l'acte exact de Gate A (`pnpm lint`, `pnpm format:check`) sur
un arbre jetable porteur d'une faute, avec un contre-témoin de binaires factices. Ensuite, une action
locale non `composite` sous `.github/` est refusée nommément. Quatre accords sur `b5c7aba` —
`simplicite` `5206075494`, `securite` `5206103463`, `exactitude` `5206128949`, `mutation`
`5206281536`. La branche a ensuite fusionné `main` après les PR #36 et #41 : nouvelle tête, nouveau
tour de relecture. Les trois conflits de code ont été résolus du côté de `main`, parce que le
changement de cette PR sur ces fichiers était exactement leur formatage ; `docs/PLAN-STATE.md`, en
conflit aussi, est régénéré. Le code venu de `main` a été reformaté dans
un commit séparé, avec un arbre syntaxique TypeScript et des commentaires identiques à `main` sur les
six fichiers.

⚠️ **Choix d'intégration.** La règle de cette PR (toute commande de YAML suivi est `pnpm <script>`,
parce que `npx` peut résoudre un paquet hors du verrou) refusait les deux étapes que la PR #41 écrivait
`npx tsx scripts/gates/gov-check.ts`. La règle stricte est gardée. Les étapes appellent deux scripts
au nom NEUF, `gov:termes-interdits` et `gov:termes-interdits:prove`, qui ne touchent pas `gov:check`
et ne tranchent donc pas l'homonymie que l'acceptation de GOV-030 renvoie à un ADR. Mesure de la
famille `garde_ecrite_jamais_appelee` de `gov:conventions`, sur le `ci.yml` lu, modifié en mémoire :

| Variante du `ci.yml` lu | avant (`ci.yml` de `main`) | après |
| --- | --- | --- |
| tel quel | vert | vert |
| les deux étapes retirées, commentaires gardés | vert | vert |
| tel quel, lignes de commentaire retirées | vert | ROUGE `gov:check` |
| étapes et commentaires retirés | ROUGE `gov:check` | ROUGE `gov:check` |

**Reste.** Les dettes déclarées dans le corps de la PR, lentille par lentille : `shell` jugé deux fois,
témoins de dérivation manquants, `.editorconfig` imbriqué, réservation de `patches/` et de
`package.json`. S'y ajoutent vingt et une limites par classe, dont `pnpm prevol` qu'aucun script ne
porte. Et deux dettes nées de l'intégration, toutes deux fermées (un faux rouge ou un vert
préexistant, jamais un vert neuf). (1) Retirer les deux étapes laisse la famille verte : c'est
préexistant sur `main` depuis la PR #41, parce que `gov-conventions.ts:402-404` cherche l'appel dans
tout le texte du workflow, commentaires compris, et que le commentaire des deux étapes cite
`gov:check`. (2) Retirer ce commentaire rougit à tort : la reconnaissance de l'appel ne tient plus
qu'à ce littéral. Remède à verser en tâche : déclarer `alias: ["gov:termes-interdits"]` sur l'entrée
`gov:check` de `docs/gates.json` (aucun outil n'écrit `alias` dans ce registre en `deny` : il est à
créer), et rendre `garde_ecrite_jamais_appelee` aveugle aux commentaires YAML.

**Appris.** Un reformatage de code n'est pas vérifiable par `git diff -w` : Prettier recoupe les lignes
et change les guillemets, et `-w` ne compare que des lignes. La preuve tient en une comparaison de
l'arbre syntaxique, nœud par nœud, parenthèses et virgules finales ignorées, plus le texte des
commentaires. Et une garde qui reconnaît un appel par sous-chaîne dans un fichier qui porte des
commentaires se satisfait d'un commentaire : quand deux gardes se contredisent à la fusion, la
mesure sur copie jetable dit laquelle voit encore quelque chose.

### PR #41 — 2026-09-15 — feat(GOV-030): la garde des termes interdits que six documents invoquaient sans quelle existe

**Fait.** La garde des termes interdits existe : `scripts/gates/gov-check.ts`, câblée en Gate A
bloquante par son chemin. `docs/GLOSSAIRE.md`, `docs/CONVENTIONS.md` §2, `docs/REGLES-MAISON.md`
(RM-01, RM-06), `packages/contracts/events.ts`, REQ-GOV-001 et `docs/GATES.md` l'invoquaient ; l'entrée
de `docs/gates.json` n'avait aucun script derrière elle. Les deux gardes, `gov-check` et
`partners:schema:enums`, appliquent une même règle de fin de ligne (`finDeLigneEtrangere`, famille
`fin_de_ligne_non_lf`) : une ligne est ce que LF termine, CRLF compris ; CR seul, U+2028 et U+2029 sont
refusés en les nommant, avant tout calcul d'exemption. Ce qui est lu se prouve par empreinte sha256
confrontée au disque, jusqu'à la dernière ligne d'un fichier de plus d'un mébioctet. Quatre accords sur
`96fcf03` — `securite` `5205615135`, `exactitude` `5205892198`, `simplicite` `5205916802`, `mutation`
`5206064111`. La branche a ensuite fusionné `main` après la PR #36 : nouvelle tête, nouveau tour de
relecture. Cette PR porte sa propre entrée, et celle de la #36.

**Reste.** L'homonymie de `gov:check` (le nom appartient à un ADR) ; `preuveRouge` de l'entrée
`gov:check` reste `null` ; `schema-enums.ts` ne voit ni l'énumération répartie sur plusieurs lignes ni
les membres d'enum sans délimiteur, et ne refuse pas un contenu illisible (UTF-16 sous `scripts/` sort
en 0) — à verser en tâche avec `sensible` renseigné par Will. `partners/ADR-0011` reste `propose` :
`gov-adr` ne juge son texte qu'à `accepte`, et la mutation qui y ampute la portée survit. L'acceptation (3) de GOV-030 dit « `src/` étant vide en phase -1 », ce
qui est faux (3 fichiers) ; le texte vit dans `docs/tasks.json`. #39 porte une troisième règle
`contenu_illisible` : la PR qui atterrit en second devra converger.

**Appris.** Un fichier marqué inchangé dans l'index (blob fautif, disque propre, `git status` vide)
fait sortir `gov-check` en 0 en local et en 1 en CI, qui extrait le blob : **un vert local ne certifie
pas ce qui est publié.** Et une règle de fin de ligne s'écrit pour les consommateurs, pas pour les
pannes connues. PostgreSQL, Prisma et CommonMark coupent au CR seul, ECMAScript à U+2028. Refuser
nommément coûte 0 sur les 188 fichiers suivis. Découper comme chaque consommateur aurait demandé une
grammaire par consommateur.

… 11 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

