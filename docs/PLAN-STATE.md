# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `3625f6c` — 2026-09-25T06:41:19+02:00 |
| Qu’est-ce qui est en vol ? | 1. #88 (rien) · 2. #92 (rien) · 3. #82 (un contrôle requis rouge ou une revue manquante) · 4. #93 (un contrôle requis rouge ou une revue manquante) · 5. #99 (un contrôle requis rouge ou une revue manquante) · 6. #114 (un contrôle requis rouge ou une revue manquante) · 7. #91 (un conflit avec `main`) · 8. #116 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · QA-T07 (A05) · GOV-092 (A03) · GOV-090 (A02) |
| Où en est la phase ? | phase 0 — 21/106 tâches, reste 64.10 j |
| Le prochain pas | fusionner #88, puis SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #118 — 2026-09-23 |

**Ce qu’on tape maintenant.** `gh pr view 88 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

21/106 tâches terminées · reste 64.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 206 | JUR-T02, QA-T08, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 60 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **14.50 j**.

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
| 1 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | rien — fusionnable maintenant |
| 2 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | rien — fusionnable maintenant |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un contrôle requis rouge ou une revue manquante |
| 4 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un contrôle requis rouge ou une revue manquante |
| 5 | #99 — feat(GOV-047): pnpm prevol existe enfin, derive du job gate-a et non de la chaine gov:check | `t/gov-047` | un contrôle requis rouge ou une revue manquante |
| 6 | #114 — chore(GOV-082): lot L0-02 — six gardes qui rendaient un verdict sans l'avoir mesure | `t/lot-L0-02` | un contrôle requis rouge ou une revue manquante |
| 7 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 8 | #116 — feat(GOV-095): un accord de lentille survit a un commit qui ne touche que le journal | `t/gov-095-accord-survit` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-092 — Une revision de corps de PR servie sans `diff` bloque `gov:entite` DEFINITIVEMENT, et les deux remedes que la garde nomme sont faux | A03 | #111 | `a_faire` |
| GOV-090 — La table des chemins reserves etiquette des VUES et laisse deux SOURCES ouvertes, et une garde prescrit un outil par un chemin irresolvable | A02 | #106 | `a_faire` |

⚠️ **41 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-07, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0020-le-champ-lot-declare-les-taches-d-une-pr-de-lot.md` — partners/ADR-0020 — Une PR de lot déclare ses tâches dans un champ `Lot:`, et la garde le croit exactement autant que le titre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #88** — elle est en tête de file et ne bloque sur rien.

**SEC-08** — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (1 j, **sur le chemin critique**) : 46 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `3625f6c` (2026-09-25T06:41:19+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #118 — 2026-09-23 — feat(GOV-096): le champ Lot: du gabarit resout les taches d une PR de lot

**Fait.** `gov:pr` ne savait pas lire une PR de LOT, qui est pourtant la forme NORMALE de ce dépôt
(`docs/CONVENTIONS.md` §5, `partners/ADR-0007` : un lot, une branche, une PR, un commit par tâche).
`tachesDeLaPr()` appariait une tâche à une PR sur `t.pr === <numéro>` OU sur l'identifiant du
TITRE ; or le titre ne peut nommer qu'une tâche, et `t.pr` n'est écrit que par `pnpm lot:cloture`,
dont l'invariant exige `fusion.atterri === true` — donc APRÈS la fusion. Les autres tâches d'un lot
ne résolvaient par rien, leurs `paths` étaient invisibles, et AUCUNE PR de lot n'était fusionnable.
Le gabarit porte désormais un champ `Lot:` à la section Identité, gardé par `CHAMPS` ;
`tachesDeLaPr()` résout par l'UNION DES TROIS, et `risqueDeLaPr()` reçoit la même union, faute de
quoi une tâche `sensible` ou `schema` portée par une autre tâche du lot que celle du titre
n'exigerait ni section Attaque ni approbation de l'architecte. Quatre refus bornent le champ,
chacun vu rougir sur son témoin, et un identifiant refusé n'élargit RIEN : identifiant inconnu du
registre, identifiant déjà livré, identifiant rattaché à une AUTRE PR — famille `deux_pr_meme_tache`,
NOM repris de `gov:etat` et non doublé (`partners/ADR-0011`) —, champ mal formé. `Lot:` vide ou
absent laisse le comportement INCHANGÉ, et deux contre-témoins le gardent. Le message de
`fichier_hors_paths_des_taches` cesse de prescrire, sur une PR de lot, le remède FAUX qu'il
prescrivait. `partners/ADR-0020` porte l'argument : le niveau de confiance ne change pas, le titre
étant déjà écrit par l'auteur et déjà cru par la garde.

**Reste.** Cette PR doit fusionner APRÈS la PR #113 : l'ADR porte le numéro 0020, le 0019 est pris
par #113 qui est ouverte, et `pnpm gov:adr` rougit ici sur `numero_non_consecutif` — et SEULEMENT
sur cela, vérifié en posant temporairement le 0019 de la branche de #113 dans cet arbre. Le trou se
referme par un `gh pr update-branch` une fois #113 atterrie. Le numéro n'a pas été pris à 0019
exprès : deux PR qui proposent le même numéro rendent `main` rouge APRÈS COUP, et aucune garde ne le
voit avant la fusion. — `scripts/lot/corps-de-pr.ts` ne remplit pas encore `Lot:` : l'auteur d'un lot
écrit la ligne à la main, et la tâche qui l'automatiserait appartient à `lot:composer` (GOV-012).
— Aucune garde ne confronte le champ `Lot:` aux COMMITS de la branche : une PR pourrait déclarer une
tâche qu'elle ne livre pas, et s'ouvrir ses `paths` sans y écrire. C'est dit plutôt que supposé ;
la garde qui le fermerait lirait `git log`, c'est-à-dire une troisième source de « quelles tâches
cette PR porte », écartée par l'ADR. — Sur la PR #114 elle-même, trois fichiers restent orphelins
après correction, et ils appartiennent au lead de ce lot. — #113 a atterri (`6d727b0`) : la
contrainte d'ordre est levée, et sa garde `citation-d-outil-hors-depot` a fait requalifier en
`hors-depot/` les trois citations de `ajouter-path.mjs` que cette PR portait. — Deux voies
restent OUVERTES, nommées par `securite` et `mutation` et non fermées ici : `lot_tache_livree`
et `deux_pr_meme_tache` ne lisent que le registre de TÊTE (une tâche remise à `a_faire` dans la
branche passe), et `deux_pr_meme_tache` ne peut pas tirer quand le numéro de la PR est inconnu.

**Relecture.** `exactitude` et `mutation` ont refusé la tête `9c0d62a` sur le même trou : la
promesse (8) — le lot fait MONTER le risque et exiger la section Attaque — était tenue par le code
et gardée par RIEN. Trois mutants survivaient (`idsDuLot` retiré de l'appel, l'union retirée de
`risqueDeLaPr()`, `lot.ids` retiré de `tachesSensibles`). Le correctif ajoute à `--prove` la PR
ordinaire à laquelle le SEUL `Lot:` ajoute une tâche sensible, sans un fichier de plus : elle doit
rougir sur `lentilles_manquantes` et, section Attaque vidée, sur `attaque_absente`. Les trois
mutants ont été rejoués un par un : chacun fait rougir son témoin.

**Appris.** La preuve par l'effet a été jouée sur la tête réelle de la PR #114 (`a103318`), sortie
dans un arbre de travail détaché, ce correctif posé dessus, la garde lancée pour de vrai : DOUZE
fichiers orphelins deviennent TROIS, et les six tâches du lot résolvent. Deux choses en sortent, et
la seconde est celle qui vaut d'être retenue.

(1) La famille ne disparaît PAS, et c'est la bonne nouvelle. Les trois qui restent —
`affirmations-verifiees.spec.ts`, `gardes.spec.ts`, `refus-de-rendre-et-de-publier.spec.ts` — sont
écrits par la PR #114 et déclarés par AUCUNE de ses six tâches. C'est exactement ce que la famille
existe pour dire, et l'un d'eux figurait déjà parmi les spécifications orphelines que GOV-056 avait
nommées. Un correctif dont on attend qu'il rende un rouge VERT doit être mesuré sur ce qu'il rend
RÉELLEMENT : « la famille doit disparaître » était l'attente, « elle passe de douze à trois » est la
mesure, et l'écart est un fait sur le lot, pas un défaut du correctif.

(2) Pour mesurer, il fallait un corps de PR portant `Lot:` sans TOUCHER au corps réel. Un mandataire
`gh` posé en tête de `PATH` ne fonctionne PAS sous Node sur Windows : `execFileSync('gh', ...)` passe
par `CreateProcess`, qui cherche `gh.exe` et n'applique PAS `PATHEXT` — un `gh.cmd` n'est jamais
trouvé, et la vraie commande répond à sa place. Le rouge mesuré était alors IDENTIQUE au rouge
d'avant, avec le message du correctif : de quoi conclure que le correctif ne fait rien. Ce qui
marche : `NODE_OPTIONS="--require <preload.cjs>"`, où le préchargement remplace
`require('child_process').execFileSync` AVANT que le graphe de modules ne soit instancié — les
imports nommés d'un module natif sont créés à ce moment-là et prennent la version remplacée. Le
mandataire IMPRIME ce qu'il injecte, sur la sortie d'erreur : sans cette ligne, on ne distingue pas
« l'injection n'a rien changé » de « l'injection n'a pas eu lieu », et c'est précisément la
confusion qui a coûté un tour.

### PR #113 — 2026-09-23 — feat(GOV-090): un label designe une SOURCE, jamais une vue, et un verbe hors depot se cite hors-depot/

**Fait.** `partners/ADR-0019` tranche une question que rien ne tranchait : une vue dérivée est-elle
réservable ? Non — un label répond à « qui répond de ce texte ? », et personne ne répond d'une vue,
qui a un générateur et un mode de vérification. La table du §7 de `docs/CHARTE-AGENTS.md` devient
celle des SOURCES : `docs/PLAN-STATE.md` et `docs/REQUIREMENTS.md` en sortent comme chemins
étiquetés, `docs/requirements.json` et `docs/gates.json` y entrent. Mesuré sur `origin/main`, et les
deux sources n'étaient pas logées à la même enseigne : `docs/requirements.json` n'était réservée par
**aucun** des quatre registres ; `docs/gates.json`, elle, était déjà au `deny` de
`.claude/settings.json`, mais dans aucun des trois registres documentaires. Côté vues, l'écart est
le même : `docs/REQUIREMENTS.md` était réservée par les quatre, `docs/GATES.md` par aucun. Deux
lignes sortent, deux entrent. Le trou `NON COMPARÉ` de `pnpm plan-state:verifier` se rétrécit là où il vit : l'attribution
des lectures de la forge descend de la rubrique à la LIGNE, la comparaison se fait par PRÉSENCE et
non par position, et les proses invariantes SORTENT des branches que la forge décide — sans quoi
elles restent exemptées par leur seule présence. Les cinq rubriques exemptées sont converties,
aucune ne reste sous `NON CONVERTI`, et le vert imprime désormais son DÉNOMINATEUR. Ce qui demeure
libre est écrit en toutes lettres dans l'ADR plutôt que déduit : le contenu d'une ligne nourrie par
la forge — au premier rang le numéro de la PR en tête de file, dans la rubrique « Prochain pas » que
le release-manager lit sous RM-09. Enfin `hors-depot/` devient un qualifiant de référence croisée au même rang que
`axionia/`, `ops/` et `partners/` — une seule écriture, `outilHorsDepot()`, que les messages rouges
dérivent, et un balayage de `git ls-files` qui refuse toute citation d'un verbe connu écrite en
chemin relatif au dépôt.

**Reste.** Le label reste muet sur la grande majorité des demandes de fusion, par `docs/tasks.json` ;
`partners/ADR-0019` porte cette mesure et refuse de laisser croire qu'il a réglé le problème. Les
dettes sont nommées et datées dans l'ADR plutôt que gardées : l'inventaire des verbes hors dépôt est
une COPIE de ce qui vit dehors, et une copie que rien ne confronte dérive ; une garde dont le
périmètre est `git ls-files` ne peut pas voir l'outillage qui écrit le registre ; le balayage ne
voit que les VERBES, pas les documents du dossier hors dépôt ; `cheminsReservesDeLaCharte()` dans
`scripts/gates/gov-agents.ts` est le second lecteur de la première colonne du §7 et garde l'ordre
fautif — inerte, hors `paths`, dit plutôt que corrigé en douce. Et `.claude/settings.json` ne met
PAS `docs/requirements.json` en `deny` : le code et l'ADR l'affirmaient, c'est mesuré faux sur
`main`, et les deux textes disent désormais ce que le `deny` refuse réellement — la protection
manquante appartient au lot `--settings` surchargé. `GOV-090` reste
`a_faire` au registre — sa clôture appartient au geste de clôture, pas à cette entrée. Et la branche
est restée seize commits en avance sans jamais ouvrir de demande de fusion : `GOV-047`, qui porte
`pnpm prevol`, n'est toujours pas livrée, donc le pré-vol de ce dépôt reste une suite de commandes
tapées à la main.

**Appris.** Deux faits mesurés cette nuit. Le premier : une branche abandonnée peut porter une tâche
qui n'existe dans AUCUNE révision de `main` — `GOV-090` a été vérifiée absente sur cinq shas. Le
registre ne l'avait jamais vue, et rien ne le signalait : ni la forge, ni les vues, ni `gov:etat`,
parce qu'une tâche qu'on n'a jamais versée ne manque à personne. Le second, plus utile encore :
résoudre un conflit de journal du côté de `main` REND au fichier les corrections que la branche y
avait faites. Deux citations que la branche avait écrites `hors-depot/` sont revenues à la forme
`outils/` par la résolution elle-même. **Le témoin de la famille n'en a vu qu'UNE**, et son propre
verbatim le dit — `expected [ Array(1) ] to deeply equal []`, un seul élément. C'est le fait le plus
utile de la nuit, parce qu'il dit le périmètre de la garde : elle ne cherche que le préfixe fautif
suivi d'un VERBE de `VERBES_HORS_DEPOT`, et la seconde citation nommait un DOCUMENT du dossier hors
dépôt — `DETTE-DES-SUCCEDANES.md` —, pas un verbe. Elle a donc été corrigée à la main, **invisible à
toute garde**. C'est la faute que `partners/ADR-0019` refuse en toutes lettres, commise dans la PR
qui la refuse : elle est nommée plutôt que tue, et elle est au « Reste à faire » de l'ADR. Une
résolution de conflit n'est pas une fusion de deux textes : c'est un CHOIX, et le côté qu'on choisit
efface l'autre en silence. Une garde le dit — dans les limites de ce qu'elle balaye, et il faut
savoir lesquelles.

### PR #112 — 2026-09-23 — fix(GOV-092): une revision servie sans `diff` bloque la porte A, et les deux remedes nommes sont faux

**Fait.** `pnpm gov:entite --corps-publie 102` rendait INDÉTERMINÉ et faisait échouer la porte A, et
le défaut n'était pas l'écart annoncé/lu : il était dans le REMÈDE. Le message de
`revisions_non_lues` nommait deux causes et deux remèdes, et aucun des deux ne s'appliquait à ce
cas-là. La forge sert `diff: null` quand une édition a produit un corps VIDE ou un corps INCHANGÉ,
et la PR #102 porte l'un et l'autre cas, aux horodatages `2026-09-23T00:21:32Z` et
`2026-09-23T00:21:56Z` ; la pagination fonctionnait, `PAGES_MAX` n'était pas atteint, et relancer la
garde ne changeait rien puisque la réponse est stable. `assemblerLecture` CLASSE désormais les
nœuds au lieu d'en écarter certains en silence, `LectureDuCorps` porte `revisionsIllisibles`, et
`jugerCorpsPublie` décompose l'écart en trois causes nommées, chacune avec son message et son
remède. La sortie réutilise le mécanisme déjà conçu pour l'irréparable : une ligne de
`config/exemptions-corps-publie.json` dont l'`empreinte` est ABSENTE absout la révision entière au
lieu d'une coordonnée, `definitive` y est exigé vrai, et elle ne vaut QUE pour une révision
illisible. Les lignes qui absolvent la PR #102 sont posées dans cette PR, avec leur motif. Mesure
d'ouverture rejouée après correctif : exit 0, et le vert imprime la dette qu'il porte.

**Reste.** ⚠ CE PARAGRAPHE A PORTÉ DEUX FOIS UN FAIT CHIFFRÉ FAUX, et la seconde fois était la
CORRECTION de la première. D'abord « les cases 3, 4, 6 et 8 sont vides » ; puis, en corrigeant,
« le corps en cochait deux, 4 et 8 ». La lentille `exactitude` a refusé les deux fois, et elle a
mesuré : **seule la case 3 est vide parmi les sept premières** — « relecteur n'est pas l'auteur », que seules
les lentilles peuvent rendre vraie — et la case 8 atteste la fusion, donc elle ne peut être que vide
avant elle. La leçon est plus large que le chiffre : **une phrase écrite de mémoire dans un document
permanent se vérifie en la MESURANT**, et `gov:pr --pr <n>` la mesure en dix secondes.
Ce qui reste vrai : aucun ADR n'est ouvert parce que l'arbitrage de la forme
large est prescrit par l'acceptance de GOV-092 plutôt que pris ici — s'il mérite son ADR, il
appartient à l'`architecte` (A02) —, aucune route d'interface n'est touchée, et la fusion
appartient à A04.

Les quatre lentilles ont accepté. ⚠ Ce paragraphe a d'abord annoncé « dix dettes » : un total
TAPÉ, qu'aucun des quatre avis ne porte et qu'aucun dédoublonnage n'annonçait — les avis déclarent
sept, cinq, quatre et six. Les dettes se lisent donc **lentille par lentille, dans les avis**, qui
les portent déjà avec leur fichier et leur ligne : `simplicite` revue 5285895325, `securite` revue
5285899400, `exactitude` revue 5285927152, `mutation` revue 5285938658, et les reconfirmations
5286021379, 5286034454, 5286032630 et 5286064623. Aucun total n'est recopié ici : un nombre tapé à
côté de quatre documents qui le portent redevient faux au premier avis suivant. Celles qui suivent méritent
cependant d'être NOMMÉES ici, parce qu'une dette qui n'entre pas au journal cesse d'exister à la
fusion. ⚠ Ce paragraphe a porté DEUX comptes contradictoires sur cette même liste — « trois » à
l'ouverture, « cinq » à la clôture, après qu'un commit en eut ajouté deux sans toucher au premier.
Troisième occurrence de la même classe de défaut sur cette PR. La liste **se compte seule** : plus
aucun nombre ne la précède ni ne la suit.
(1) `mutation` a fait survivre le mutant qui retire le terme d'appariement sur l'absence
d'empreinte : rien ne prouve qu'une exemption de COORDONNÉE ne blanchit pas une révision
ILLISIBLE — le sens inverse, lui, est prouvé. (2) **Le banc de porte A ne sait pas qu'il a cessé
de mesurer** : en retirant du banc les deux témoins neufs, `--corps-publie --prove` sort en 0 et
imprime toujours que ses six familles rougissent, parce que la non-vacuité est au grain de la
FAMILLE alors que les causes neuves vivent DANS une famille. C'est la dette la plus dangereuse de
la PR, et elle a la forme exacte du défaut que la PR ferme : elle est portée par **GOV-094**, versée
ici même, qui fait descendre le grain de la non-vacuité de la FAMILLE à la CAUSE. (3) Le
discriminant des deux formes
étant l'ABSENCE d'une clé, une ligne portant `empriente` mal orthographié est déclarée bien
formée et absout la révision entière — sur la base, la même ligne rougissait. (4) Trois dettes
que le premier tour avait laissées hors du journal, et qui y entrent : le `_commentaire` de
`config/exemptions-corps-publie.json` s'ouvre en s'annonçant exhaustif (« les trois clés doivent
concorder ») et n'annonce la seconde forme qu'en fin de chaîne ; le prédicat de la forme large est
nommé une fois et retapé anonymement cinq fois ailleurs ; et **une seule ligne d'exemption absout
toutes les révisions qui partagent son horodatage**, alors que le commentaire du registre affirme
qu'elle couvre « UNE RÉVISION PRÉCISE ». (5) Et une dernière, nommée ici faute de mieux : le
garde-fou qui **borne à zéro** le compteur
des révisions jamais servies survit à sa mutation. Dès que la forge servirait plus de nœuds qu'elle
n'en annonce, ce compteur passerait sous zéro, l'égalité à zéro qui commande l'évaluation de la
famille des exemptions sans objet deviendrait fausse, et **cette famille cesserait d'être évaluée en
silence**. GOV-094 ne la couvre pas.

**Aucune de ces dettes ne laisse fuir une coordonnée** : `securite` l'a établi en fabriquant douze
scénarios contre le code tel que livré et en balayant la population entière du dépôt, et `mutation`
en posant ses mutants et en rejouant le banc de la porte A.

Les dettes du quatrième point viennent de `simplicite` et de `securite`, la cinquième de `mutation`.

⚠ CETTE PHRASE PORTAIT UNE CLAUSE FAUSSE, et la correction précédente l'avait FABRIQUÉE : elle
ajoutait qu'aucune de ces dettes n'avait été mesurée par la sécurité à l'origine. `securite` et
`exactitude` l'ont mesuré indépendamment : au moins deux le sont — la ligne d'exemption qui absout
toutes les révisions partageant son horodatage, et l'orthographe qui élargit en silence — toutes
deux dans la revue 5285899400, avec leur fichier et leur ligne. La première moitié de la phrase,
elle, a été mesurée exacte par `simplicite`. **Quatrième fois qu'une clause est ajoutée sans
retirer celle qu'elle contredit** : la clause est SUPPRIMÉE, pas nuancée.

Le reste de l'attribution ne se recopie pas ici : chaque avis nomme déjà sa lentille, son fichier
et sa ligne, et les revues sont listées plus haut.

Le registre ne sait toujours pas distinguer une valeur fabriquée d'une valeur réelle : ce résidu est
déclaré dans le `_commentaire` du fichier et cette PR ne le change pas. Rien n'empêche non plus
qu'une ligne de la forme large soit écrite AVANT que la révision devienne illisible — la garde la
refuserait en `exemption_sans_objet`, mais personne ne le verrait venir. Enfin, la cause d'un `diff`
nul est AFFIRMÉE et non mesurée : `UserContentEdit` porte `deletedAt`, que la requête ne demande
pas, et une révision dont le contenu a été SUPPRIMÉ est indiscernable d'un corps vide alors qu'elle
a porté du texte. Sur la population entière du dépôt — 54 PR balayées par `securite` — les deux
seuls nœuds à `diff` nul portent `deletedAt` nul, donc l'affirmation est vraie aujourd'hui ; elle
n'est pas gardée pour demain.

**Appris.** ⚠ Un remède FAUX coûte plus cher qu'un remède absent. Le message nommait deux causes
avec l'autorité d'un diagnostic complet ; le lecteur a donc rejoué une commande qui ne pouvait rien
changer, trois fois, avant de soupçonner le message lui-même. Un message de garde qui énumère des
causes doit dire comment on SÉPARE celle qui s'applique, ou n'en nommer aucune. Deuxième fait
mesuré, et il vaut pour toute garde qui lit une forge : `userContentEdits` rend des nœuds dont les
champs sont nullables, et un `continue` sur un nœud illisible fait DISPARAÎTRE l'information que ce
nœud a existé — elle retombe alors dans un compteur partagé avec une tout autre cause, et les deux
deviennent indiscernables. Classer coûte un champ ; confondre coûte une porte A. Troisième fait :
une exemption mal formée absolvait quand même sa cible, ici comme du côté de la forme à empreinte.
Une ligne illisible qui absout reste indiscernable d'une ligne saine, puisque le verdict est le même
des deux côtés.

… 42 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

