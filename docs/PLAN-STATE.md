# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `5e73b88` — 2026-09-28T07:14:42+02:00 |
| Qu’est-ce qui est en vol ? | 1. #181 (rien) · 2. #82 (un contrôle requis rouge ou une revue manquante) · 3. #175 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 59/116 tâches, reste 45.35 j |
| Le prochain pas | fusionner #181, puis SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #180 — 2026-09-27 |

**Ce qu’on tape maintenant.** `gh pr view 181 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

59/116 tâches terminées · reste 45.35 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 190 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … (12 affichées sur 190 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 98 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 98 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **12.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend sont codables dans `docs/DECISIONS.md` — tranchées, ou portées par une hypothèse par défaut.

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #181 — chore(GOV-012): registre rattrape, cinq taches livrees par deux PR fusionnees passent fusionnee | `t/gov-cloture-l0-07-l0-10` | rien — fusionnable maintenant |
| 2 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un contrôle requis rouge ou une revue manquante |
| 3 | #175 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal | `t/lot-l0-09` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-28 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #181** — elle est en tête de file et ne bloque sur rien.

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 27 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `5e73b88` (2026-09-28T07:14:42+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #180 — 2026-09-27 — feat(JUR-T02): lot L0-10 — SSOT des délais du contrat, contrat sobre figé, alertes Telegram sans PII

**Fait.** JUR-T02 porte la PR, et JUR-T27 et INT-T14 sont dans son champ `Lot:`. La SSOT
`src/domain/seuils/ssot.ts` porte 27 constantes sourcées et datées, sans gradation ni contradictoire.
La garde `scripts/gates/seuils-ssot.ts` refuse un seuil ou un délai retapé dans `src/`, un préavis
indexé sur l'ancienneté, et une valeur qui diverge entre le gabarit et la SSOT ; son `--prove` joue
neuf familles. Le gabarit de contrat, déjà sobre, n'est pas modifié : `contrat-sobre.spec.ts` fige
l'acceptation de JUR-T27, et le texte final reste relu par Will avant toute signature. L'alerteur
Telegram dédoublonne, plafonne par catégorie et par heure, et sa garde nomme tout champ personnel
qui franchirait le canal. Le 2026-09-27T09:09Z, les paths de JUR-T02 couvrant désormais
`package.json`, `ci.yml` et `vitest.mutation.config.ts`, la garde est câblée : scripts
`ssot:seuils` et `ssot:seuils:prove`, deux étapes du job `gate-a` après la grille chiffrée, et
`tests/unit/juridique/` jugé sous mutation, deux tests écartés et nommés (balayage `git ls-files`,
lecture du texte instrumenté de la SSOT). Le 2026-09-27T09:24Z, l'entrée du registre porte le nom
de sa commande, `ssot:seuils`, et l'ancien identifiant n'y survit qu'en alias (`partners/ADR-0018`) :
`un-nom-une-garde.spec.ts` ne compte plus que ses trois écarts. Les `preuveRouge` de `ssot:seuils`
et de `G-SEC-NOTIF` sont posés. Les deux sorties non nulles de `scripts/gates/seuils-ssot.ts` sont
déclarées au cliquet de `refus-de-rendre-et-de-publier.spec.ts` et nommées dans `REFUS_NOMMES`,
témoins d'effet à zéro : dette déclarée. Le 2026-09-27T10:57Z, sur la porte A rouge et l'avis `securite` :
la garde établit son périmètre par la source unique `fichiersSuivisOuRefus` et figure parmi les
gardes qui balaient le dépôt. Les motifs de montant écrits forme par forme laissent place à deux
règles qui normalisent : tout nombre, lu sans séparateur de milliers, est confronté aux montants de
la SSOT ; tout produit de littéraux entiers est évalué et confronté à chaque délai de la SSOT en
jours, heures, minutes, secondes et millisecondes. L'alerteur n'admet comme identifiant que le
format des identifiants d'agrégat du dépôt, et compte plafond et dédoublonnage sur la forme
affichée. La garde sans PII voit le montant formaté en euros.

**Reste.** `docs/GARDES-AXIONIA.md` cite encore l'ancien identifiant, que l'alias résout : le
fichier est hors des paths du lot. La PR #175, non fusionnée, fige les étapes de `gate-a` dans `PORTE_A_FIGEE`
(`scripts/gates/gov-conventions.ts`) : les deux étapes ajoutées ici y manquent, et la PR qui
fusionnera en second résout ce conflit sémantique, que `git` ne signale pas. `FENETRE_MOIS` attend la question `JUR-T01-Q02` : `docs/DECISIONS.md` (`HYP-E1-9`) porte
12 mois, et la décision de Will du 2026-09-22, à 6 mois, n'est pas encore au registre. Les
catégories d'alerte n'ont pas de liste fermée : leur format est borné, pas leur nombre, et une
liste fermée se déclare au glossaire. L'appel réel au bot
attend la rubrique 2 de `docs/tiers/telegram.md` et les noms des deux secrets dans `src/lib/env.ts`.
Sous mutation, la SSOT n'a aucun mutant jugé : toutes ses valeurs sont évaluées au chargement du
module, donc statiques et hors score (`ignoreStatic`) ; ce sont ses tests en processus qui les
figent. GOV-082 n'est pas dans ce lot : elle est livrée par la PR #114 (fusionnée, `32ea43d`), et
son attestation reste bloquée par `branche_de_la_forge_refusee` (tête `t/lot-L0-02`) ; la décision
(l'outil ou le schéma) reste à prendre.

**Appris.** `gov:publication` refuse `montantCents` suivi d'un nombre, même sur un objet témoin
factice. Elle refuse aussi le seuil de versement écrit en euros dans un commentaire, alors que la même valeur en centimes,
sous la clé `SEUIL_VERSEMENT`, passe. Un script placé sous `scripts/gates/` est jugé par
`gov:conventions` dès qu'il existe : s'il n'est appelé par aucun workflow, la pré-porte rougit
tant que le registre ne le câble pas ou ne lui donne pas de `horsCi`. Une tâche dont les `paths` ne
couvrent ni `package.json` ni `ci.yml` ne peut donc pas livrer seule une garde neuve. Enfin,
`vitest.mutation.config.ts` n'inclut qu'une liste fermée de dossiers de tests : une source mutée dont
le test vit ailleurs sort « sans couverture », pas « survivante ». Et le rapport incrémental de `pnpm mutation:pr` REPREND
un résultat « sans couverture » quand seuls les tests ont changé : cinq mutants de la SSOT y restaient
« sans couverture » après l'ajout de ses tests. Sans le fichier incrémental local, ils sont statiques,
hors score.

### PR #176 — 2026-09-27 — chore(GOV-012): registre rattrape, douze taches livrees par des PR fusionnees passent fusionnee

**Fait.** Treize tâches livrées par les PR 158, 169 et 168 portaient encore `a_faire`. Douze passent `fusionnee` par `reclasser.mjs` : GOV-053, GOV-055, GOV-060, GOV-079, GOV-050 et GOV-051 (PR 158, lot L0-06), INT-T01c (PR 169), GOV-045, GOV-054, GOV-072, GOV-093 et GOV-042 (PR 168, lot L0-08). Chaque revendication est constatée sur son issue déjà ouverte (150 à 155, 167, 159 à 163), puis la livraison sur la forge. Chaque attestation est lue dans `origin/main` par `cloture.ts --rattraper-attestations`. La phase 0 passe de 47 à 59 tâches terminées sur 116, reste 45,35 jours.

**Reste.** GOV-074 reste `a_faire` : la PR 168 écrit qu'elle ne livre pas toute son acceptance (comparaison par préfixe et exemptions sans second producteur non identifiées une à une, `DETTE_GABARIT_LIVREE` au grain du site). Décision à prendre : une tâche fille pour le reste, ou une acceptance rétrécie par avenant. Les PR 114 et 102 restent dans l'état écrit par la PR 166.

**Appris.** Depuis GOV-042, `--fusionnee` ne suffit plus : `reclasser.mjs` n'écrit pas l'attestation, et `gov:tasks` rougit sans elle. Le rattrapage du dépôt la lit dans l'historique, en filtrant le sujet par `(#<pr>)` avant de chercher l'identifiant. Ce filtre est nécessaire : le message de la PR 168 nomme aussi GOV-055, livrée par la PR 158. Sans le filtre, la recherche aurait trouvé deux commits et laissé l'attestation vide.

### PR #175 — 2026-09-27 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal

**Fait.** Quatre tâches de la phase 0. GOV-083 : une entrée du registre des gates dont le script manque
sur le disque est triée (autre dépôt, promise, fautive) au lieu d'être écartée en silence ; la fautive
rougit `gate_sans_script`, et les cinq existantes sont déclarées une par une au passif, avec leur motif.
GOV-061 : chaque étape du job `gate-a` est confrontée à un constat figé, présente, active et effective,
et une garde citée dans un seul commentaire du workflow ne passe plus pour appelée. GOV-094 : le banc
du corps publié exige un témoin par CAUSE, et le compte des causes se dérive des sites qui les émettent.
GOV-073 : une seule grammaire de journal, importée par ses quatre lecteurs, avec un refus commun.
Correctif du 2026-09-27T07:55Z, après un veto de sécurité : le constat de la porte A fige désormais
l'étape entière, le job entier et le workflow hors `jobs`, clé par clé (`porte_a_alteree`), et refuse
deux étapes de même nom (`etape_en_double`) ; une garde n'est plus dite appelée que par une commande
en position de commande, et un script que `package.json` lance ne passe plus pour une promesse.
Correctif du 2026-09-27T08:42Z, après un refus d'exactitude : la lecture des appels découpait la ligne
sans tenir compte des guillemets, et une garde citée dans un `echo`, court-circuitée par `true ||`
ou placée après un `exit` passait pour appelée. Un lexer shell minimal respecte désormais guillemets
et échappements, et ne compte que les commandes atteignables dont le statut compte ; une ligne qu'il
ne sait pas juger n'appelle rien. La configuration pnpm/npm de la racine est figée absente au constat.
Correctif du 2026-09-27T09:20Z, après un refus d'exactitude et un veto de sécurité : le lexer est
retiré. Une garde n'est plus appelée que si une étape n'exécute qu'elle — une seule commande simple,
littérale, sur une ligne, sans opérateur ni `$` ni expression d'Actions ; tout le reste n'appelle
rien. Les crochets que `pnpm install` exécute à la racine, et les `pre`/`post` des scripts de la
porte, sont figés par leur valeur ou leur absence.
Correctif du 2026-09-27T10:10Z, après un refus d'exactitude et un veto de sécurité : une garde
passait pour appelée dès qu'une étape lançait le script qui porte son identifiant, même réduit à
`true`. Seul compte désormais le fichier de la garde, exécuté par une étape, directement ou par la
valeur d'un script. Aucune affectation n'est admise en tête d'une commande. `pnpm <mot>` ne compte
plus quand le mot est une commande intégrée de pnpm, et un script qui en porte le nom est refusé,
sauf `test`. La valeur de `packageManager` est figée au constat. Au tour 5, un nom hérité
d'`Object.prototype` compte aussi pour une commande intégrée : l'ensemble est dérivé à l'exécution,
jamais recopié. Et `pnpm <mot>` sans `run` ne compte que si le mot est en ASCII bas.

**Reste.** GOV-085 n'est pas livrée : GOV-082, dont elle dépend, est encore à faire. Les cinq entrées
fautives de `docs/gates.json` sont à corriger par le gardien de la spécification ; chaque correction
fera rougir sa ligne de passif, qu'il faudra retirer. Seize familles à plusieurs sites, nommées par le
balayage de GOV-094, attendent la tâche qui les traitera. Limite déclarée de la porte A : un `if:`
toujours faux posé sur le job `gate-a` saute aussi l'étape `gov:conventions`, et un job requis
sauté laisse fusionner ; en CI, cette faute n'est vue qu'hors du job (pré-vol, revue). Dettes
relevées par la revue, non traitées ici : dans `gov-entite.ts`, une famille écrite autrement qu'en
littéral est sautée par le balayage des causes, et le compte de sites repose sur la même lecture ;
dans `gov-attributions.ts`, un titre indenté est lu par `gov:etat` ; le point (6) de GOV-094 attend
sa tâche ; GOV-083 et GOV-061 partagent un fichier et ont été composées dans un même lot. La règle
littérale de GOV-083 (1), phase courante égale refus, rougirait dix entrées de phase 0 dont la tâche
porteuse est à faire (`a_faire`) : c'est un avenant d'acceptance à écrire au registre. Hors du job
`gate-a`, rien ne juge qu'une étape s'exécute : une étape de `nightly.yml` sous un `if:` faux
compte encore pour un appel. Prix de la règle stricte : un idiome composé qui lance vraiment la garde
est un faux rouge, qu'on écrit en une étape à part. Et le fichier d'une garde est tenu appelé si une
seule étape le lance, même en `--prove` : trois étapes de verdict (`gov:etat`, `gov:lecons`,
`gates:prouvees`) ne comptent plus, et leurs gardes restent appelées par leur preuve.

**Appris.** Une tâche qui cite le chemin d'une garde dans ses `paths` ne la promet pas : elle peut
aussi bien la retoucher. Seul le champ `tache` de l'entrée du registre dit qui l'écrira. Autre fait :
l'analyseur YAML que Prettier embarque rend les commentaires comme des nœuds, avec leur position.
Retirer les commentaires d'un workflow ne demande donc aucun découpage maison. Et une confrontation
qui ne lit que les clés qu'elle connaît laisse passer toutes les autres : un `shell:` ou un
`with: ref:` changent ce qu'une étape exécute sans changer sa commande. On fige l'objet entier.
Enfin, découper une commande shell par une expression régulière la lit comme un texte, pas comme
une commande : les guillemets, les courts-circuits et l'arrière-plan décident de ce qui s'exécute.
Trois tours à modéliser le shell ont chacun laissé passer une forme (`set +e`, `eval`, un `&&` non
final que `bash -e` avale) : on reconnaît une seule forme et on refuse le reste. Dernier fait : pnpm 9 lance
de lui-même les `pre`/`post` d'un script : `enable-pre-post-scripts` y vaut `true` par défaut.
Et `pnpm ls` exécute la commande `list`, jamais le script `ls` : le mot qui suit `pnpm` n'est un
script que s'il n'est pas une commande intégrée. `pnpm test`, lui, lance bien le script `test`.
Dernier fait, mesuré au tour 5 : la table des commandes de pnpm 9.12.0 est un objet JS ordinaire.
Un mot qui nomme une propriété héritée du prototype y trouve une fonction : pnpm le prend pour une
commande et sort sans lancer le script. `pnpm run <mot>`, lui, lance bien le script.

… 3 entrée(s) affichée(s) sur 74 ; les 71 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

