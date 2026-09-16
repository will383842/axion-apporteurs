# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `6f093b6` — 2026-09-16T13:56:34+02:00 |
| Qu’est-ce qui est en vol ? | 1. #46 (brouillon) |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase 0 — 0/68 tâches, reste 48.75 j |
| Le prochain pas | QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #46 — 2026-09-16 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

0/68 tâches terminées · reste 48.75 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 187 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 39 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
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
| 1 | #46 — chore(GOV-038): la phase -1 se ferme, cinq taches passent fusionnee et GOV-056 est versee | `lot/phase-moins-1-cloture` | brouillon — hors file tant qu’il n’est pas prêt |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **20 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-030, GOV-031 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-16 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 24 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `6f093b6` (2026-09-16T13:56:34+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #46 — 2026-09-16 — chore(GOV-038): la phase -1 se ferme, cinq taches passent fusionnee et GOV-056 est versee

**Fait.** Les cinq dernières tâches de la phase −1 passent `fusionnee` : GOV-035 par la PR #36,
GOV-030 par la #41, GOV-031 par la #44, GOV-036 par la #39, GOV-037 par la #45. Chaque atterrissage
a été mesuré avant d'être écrit : état `MERGED` sur la forge, commit de fusion égal au sha donné, et
sha ancêtre d'`origin/main`. Leur `lot` reste `null` — elles ont été livrées seules, chacune sur sa
branche `t/`, et inventer un lot après coup fabriquerait l'enregistrement que ce champ conserve.
Trois décisions de Will du 15/09 sont écrites par les outils hors dépôt, jamais à la main :
l'acceptance de GOV-036 est alignée sur ce que la PR #39 a livré, celle de GOV-049 admet la tâche
livrée seule sans lot, et les cinquième et sixième livrables de GOV-037 en sortent pour devenir
GOV-056, phase 0, 1,5 jour. Les vues sont régénérées dans l'ordre, `plan-state:build` en dernier :
`docs/PLAN-STATE.md` porte « Phase courante : 0 » et 39 tâches livrées sur 39 en phase −1.

**Reste.** Vingt-huit des vingt-neuf manques relevés par la passe de complétude ne sont pas versés
ici : ils feront une PR à part, et aucun ne va en phase −1. Les issues 37, 38, 40, 42 et 43 restent
ouvertes ; les fermer appartient à Will. GOV-042 n'est pas amendée : sa mesure du 12/09 est datée et
reste vraie, le nombre de tâches `fusionnee` sans attestation passe simplement de 33 à 38, ce
qu'elle décrit déjà. La ligne « question(s) pour Will » de `docs/PLAN-STATE.md` compte encore des
hypothèses tranchées le 03/09 : dette connue, portée par la passe de complétude.

**Appris.** Un registre reste infermable quand aucun outil ne sait écrire UN champ. Les cinq tâches
portaient `branch: null`, et `reclasser.mjs --fusionnee` refusait plutôt que d'inventer une branche :
refus juste, impasse quand même. Le geste manquant n'était pas d'inventer, c'était de CONSTATER,
comme la revendication constate une issue. La branche se lit donc sur la forge, sous quatre
questions posées de la plus locale à la plus lointaine : le sha est-il ancêtre d'`origin/main`, la
PR est-elle `MERGED`, son commit de fusion est-il ce sha, le nom rendu satisfait-il le motif que le
schéma du dépôt impose. L'ordre est la garde : un contrôle placé derrière un appel réseau ne tire
pas le jour où le réseau tombe, et c'est le jour où il compte.

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

… 13 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

