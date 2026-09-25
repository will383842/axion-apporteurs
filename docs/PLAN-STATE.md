# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `f7ea7c3` — 2026-09-25T17:40:52+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (un conflit avec `main`) · 2. #88 (un conflit avec `main`) · 3. #91 (un conflit avec `main`) · 4. #92 (un conflit avec `main`) · 5. #93 (un conflit avec `main`) · 6. #122 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · QA-T07 (A05) · GOV-092 (A03) · GOV-090 (A02) |
| Où en est la phase ? | phase 0 — 21/108 tâches, reste 65.60 j |
| Le prochain pas | SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #120 — 2026-09-25 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

21/108 tâches terminées · reste 65.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 208 | JUR-T02, QA-T08, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13 … |
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
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 2 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |
| 3 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 4 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un conflit avec `main` — à résoudre avant tout |
| 5 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un conflit avec `main` — à résoudre avant tout |
| 6 | #122 — chore(GOV-098): perimetre fonctionnel decide par Will le 2026-09-25 — lignees, parrain, statistiques, bibliotheque | `t/perimetre-fonctionnel-2026-09-25` | un conflit avec `main` — à résoudre avant tout |

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

**SEC-08** — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (1 j, **sur le chemin critique**) : 48 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `f7ea7c3` (2026-09-25T17:40:52+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #120 — 2026-09-25 — feat(GOV-097): quatre lentilles pour l'argent, la securite et les donnees, deux pour le reste

**Fait.** Décision de Will du 2026-09-25 (`W14`, `partners/ADR-0021`). `risqueDeLaPr()` ne prouve
plus qu'une PR est anodine par deux listes blanches : elle cherche des signaux. Élevé si une tâche
porte `sensible` non vide ou absent, `schema: true`, une zone `argent`/`securite`, une zone absente
ou inconnue du schéma du registre ; si la PR porte le label ou un chemin de schéma, un fichier en
zone sensible du code, un fichier du processus (garde des revues, dossier caché, racine,
`config/`) ; ou si le diff est vide, incomplet, sans tâche, sans base lisible. Une zone `espace`,
`juridique`, `integration`, `domaine` ou une autre zone à `sensible: []` qui touche du code
neutre se relit à deux lentilles. Fusion de `main` après #114 : une seule lecture par segment,
`segmentsNommesTouches()` dans `scripts/lot/revues.ts`, sert la section « Attaque » (liste
`ZONES_SENSIBLES`, répertoires seuls) et le risque (liste `SEGMENTS_DES_ZONES_SENSIBLES`, nom de
fichier compris). La charte §6 et le poste A09 disent qu'une inexactitude de prose est une dette, pas un
refus.

**Reste.** Les tâches qui manipulent des données personnelles avec `sensible: []` passent à deux
lentilles si leurs fichiers évitent les zones sensibles : le remède est de leur porter `rgpd` au
registre (`gardien-spec`). La section « Attaque » lit par segment depuis #114, mais sur la liste
étroite `ZONES_SENSIBLES` : `src/proxy.ts` élève le risque sans l'exiger ; l'élargir est un
changement de REQ-GOV-011, hors de cette tâche. La règle (2) n'est outillée
par rien : `gov:pr` bloque sur tout `Verdict: refuse`.

**Appris.** `ZONES_SENSIBLES` (`commissions/`, `attributions/`, `auth/`, `espace/`) se lisait en
préfixe depuis la racine, et aucun fichier suivi du dépôt ne commençait par l'un d'eux : le code vit sous
`src/`. Une liste « de zones sensibles » peut donc être juste en mots et ne rien désigner sur le
disque ; la reprendre telle quelle pour le risque aurait fait passer tout le code produit à deux
lentilles sans qu'aucun témoin ne rougisse. Le signal se lit maintenant par segments de chemin. —
Le gain de la décision (1) est borné par le registre : mesuré par le code, 31 tâches `partners`
restantes ordinaires avant, 43 après, relecture comprise, 38 sur 195 depuis la fusion de #116 ; la cause dominante de l'élevé est `sensible` non vide, que la
décision garde. — `refs/stash` est PARTAGÉ entre les arbres de travail d'un même dépôt : un
`git stash pop` lancé dans un arbre a tenté d'appliquer le remisage d'une autre session (refusé par
git, rien d'appliqué). Ne jamais utiliser `git stash` dans un arbre de travail de ce dépôt.

**Relecture.** Deux refus sur `11a0502`. `securite` (5316365953) : le code de sécurité déjà au
dépôt redescendait à deux lentilles : `api-entrante.ts` (SEC-07, `auth`), l'attrape-tout
`[...inconnu]/route.ts`, les deux `journal.ts` (DM-01, `rgpd`) ressortaient ordinaires sous
`feat(INT-T11)`. Remède : la sensibilité suit le FICHIER. `fichiersDesTachesAElever()` rend élevé
tout fichier du code produit (`src/`) qu'une tâche quelconque du registre, base et tête, déclare
(`paths` et `tests{}`, par `cheminsDeLaTache()`) si elle élèverait seule une PR ; la raison nomme le
fichier et la tâche. La liste des segments gagne `session`, `sessions`, `crypto`, `chiffrement`,
`cloisonnement`, `middleware` ; aucun des 250 fichiers suivis sous `docs/`, `scripts/`, `tests/`,
`src/` n'y répond. `nuDuSegment()`, lecture unique de l'Attaque et du risque, retire désormais
`[...x]`, `[[...x]]`, `@x`, `(.)x`, `(..)x`, `(...)x` répétés. `mutation` (5316513348) : la casse
et la frontière répertoire/fichier de l'Attaque ont chacune leur témoin, vus rougir sous la
mutation. Pourquoi `src/` seul : étendue à tout le dépôt, la règle rendait 24 tâches `partners`
ordinaires sur 194, moins que les 31 d'avant GOV-097, parce que des tâches de gouvernance portent
`sensible` sur des scripts partagés (GOV-008 pour `scripts/plan-state/build.ts`, GOV-018 pour
`scripts/gates/gov-lecons.ts`). Limitée au code produit, elle en rend 43 ; 38 sur 195 après la fusion
de #116, dont `revues.ts` importe `gov-attributions.ts`, qui entre dans la garde des revues et fait
monter GOV-073, GOV-074, GOV-075, GOV-081 et GOV-084 ; les scripts de contrôle
gardent leurs propres signaux, et un `scripts/gates/*` hors de la garde reste ordinaire (dette déjà
relevée par `securite`).

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

### PR #116 — 2026-09-23 — feat(GOV-095): un accord de lentille survit a un commit qui ne touche que le journal

**Fait.** `scripts/lot/revues.ts` liait un accord de lentille au SHA DE LA TETE et jamais au CODE
JUGE : `x.commit !== entree.tete` suffisait a perimer. Toute tete de plus perimait donc tous les
accords exiges, meme quand `git diff` entre les deux etait vide. Un accord rendu sur la lentille L
au commit C survit desormais a la tete T si, et seulement si, L n'est pas `exactitude` — cette
lentille juge la prose, c'est sa matiere — ET que l'ensemble des fichiers changes entre C et T est
vide, ou n'est fait que d'ENTREES PAR PR du journal : la forme `docs/journal/AAAA-MM-pr-<n>.md`,
et rien d'autre du dossier.
La DECISION est pure (`accordSurvit`), la MESURE est `git` (`fichiersEntre`), sur le modele
d'`estAncetreDe` juste au-dessus. Et parce que cette garde devient PLUS PERMISSIVE, elle DIT chaque
fois qu'elle l'a ete : `pnpm gov:pr --pr` imprime le poste, la lentille, le sha de l'accord, le sha
de la tete et LA LISTE DES FICHIERS qui les separent, et la phrase publiee au corps de la PR cesse
d'affirmer que tout a ete juge sur la tete. Une survie silencieuse serait une permission
inauditable.

**Reste.** L'ADR appartient a l'architecte, pas a cette PR : la regle de survie est une decision de
conception, et trois alternatives ont ete ecartees — perimer toujours, une liste NOIRE de documents
normatifs, un prefixe par dossier repute inoffensif. Le pas 5 de `docs/PROTOCOLE-FUSION.md` la porte
en attendant, avec ses cas fermes. Deuxieme reste, mesure : la survie ne se declenche que si le
clone porte le commit de l'accord ; l'unique `checkout` de `gate-a` porte `fetch-depth: 0`
(`.github/workflows/ci.yml`), le premier des deux `checkout` de `.github/workflows/nightly.yml`
aussi, le second — celui du travail `lecons-fraiches` — NON. Sans effet a ce jour : ce travail-la ne
lance que `gov:lecons`, qui ne lit aucun accord. Sur un clone superficiel, la garde echoue FERME,
donc exactement comme avant. Troisieme reste, releve par la lentille `securite` et NON traite ici :
le litteral `securite` est encore ecrit deux fois dans `scripts/lot/revues.ts` — dans la liste des
lentilles exigees et dans le message qui dit que le refus de cette lentille bloque a lui seul ;
renommer l'un ferait cesser l'autre de mordre. Quatrieme reste, nomme et assume : l'impression
console des accords survivants par `gov:pr` n'a pas de temoin ; le canal qui compte, le `detail`
publie au corps de la PR, en a un.

**Appris.** UNE LISTE BLANCHE PAR PREFIXE DE DOSSIER EST FAUSSE D'UN FICHIER DES QUE LE DOSSIER
PORTE SA PROPRE CONFIGURATION. La doctrine tient — un seul prefixe, rien d'enumere, un oubli fait
relire PLUS et jamais MOINS — mais sa premisse ne tenait pas : `docs/journal/` ne contient pas que
de la prose, il contient aussi son mode d'emploi, et ce mode d'emploi porte le PLANCHER. Deux gardes
bloquantes de `gate-a` en DERIVENT ce nombre : `gov:attributions`, pour qui le plancher EXEMPTE des
taches de toute attestation de lot, et `gov:etat`, pour qui il fait taire la faute
`pr_fusionnee_sans_journal`. Une tete qui ne change QUE ce nombre eteint les deux pendant que les
accords survivent, et la phrase publiee affirme alors que le delta ne juge aucun code : une phrase
calculee et FAUSSE, la pire espece, parce que personne ne la met en doute. Le remede n'est pas une
liste noire, et exclure le seul README n'en etait qu'une d'un element : la liste blanche est la
FORME d'une entree par PR, et tout le reste du dossier - fichier mensuel compris - perime. La question se repose
pour tout dossier qu'on met en liste blanche, et elle se repond par une COMMANDE, jamais par une
lecture : quel fichier de ce dossier une garde cite-t-elle par son nom. Deuxieme chose apprise, du
meme ordre : `--no-renames` ferme DEUX sens et non un. Le sens qui mord vraiment n'est pas le
fichier SORTI du journal, c'est le document normatif DEPLACE VERS le journal — avec la detection de
renommage, `docs/CONVENTIONS.md` deplace vers `docs/journal/x.md` ne serait rendu que par sa
destination, donc lu comme entierement sous le journal, et l'accord survivrait a la SUPPRESSION d'un
document normatif. Troisieme chose apprise, sur la maniere de raconter une garde : une famille de
`--prove` peut rougir pour une raison qui n'est pas celle qu'on lui prete. Le temoin de
`lentille_perimee` pose un `commit_id` de zeros sur TOUTES les revues ; mutant pose, `fichiersEntre`
echouant OUVERT, `gov:pr --prove` reste VERT. La famille rougit par l'exception `exactitude`, pas
par l'echec ferme — lequel est bien couvert, mais par le temoin unitaire. Ce qu'une garde protege se
mesure en la cassant, jamais en lisant son intention.

**Relecture.** La tete `23a7f1b` a ete refusee par `securite` (revue 5307855596) : le README du
journal, qui porte le plancher lu par `gov:attributions` et `gov:etat`, etait dans la liste blanche.
Un premier correctif (`ed91983`) excluait ce seul fichier ; ce tour-ci remplace l'exclusion par une
liste blanche de FORME (`ENTREE_DU_JOURNAL`), parce que `gov:attributions` lit aussi le fichier
mensuel, qui porte les entrees d'autres PR. Temoins : le scenario du plancher, de 27 a 9999, joue
contre un vrai `git`, perime les quatre accords - vu rouge sous la regle d'origine, qui en laissait
survivre trois ; et le fichier mensuel perime - vu rouge sous l'exclusion seule, qui le laissait
survivre. Contre-temoin : une tete qui ne touche que `docs/journal/2026-09-pr-116.md` laisse
survivre `securite`, `simplicite` et `mutation`, et perime `exactitude`. Les trois dettes de
`mutation` (prefixe lu au debut, relecture par l'auteur independante de la survie, lentille de la
prose derivee d'une seule source) etaient fermees par `ed91983`.

Troisieme tour, sur la faille nommee au deuxieme : `gov:attributions` lit le numero de chaque titre
d'entree de tout fichier du journal, sans le lier au nom du fichier. Une tete qui ne touche que
`2026-09-pr-102.md`, ou qui ajoute un titre d'entree de la PR 999 dans `2026-09-pr-116.md`,
attesterait un autre lot sous des accords survivants. La survie exige desormais le NUMERO de la PR
jugee : seul son fichier est admis, et chaque titre de niveau 2 ou plus qu'il porte a la tete doit
ouvrir son entree. Numero inconnu, entree illisible a la tete : echec ferme. Les deux temoins ont
ete vus rouges (`expected true to be false`) avant le code.

Quatrième tour (veto `securite`, revue 5316791878) : une entrée devenue lien symbolique se lisait par sa cible, alors que `gov:etat` et `gov:attributions` suivent le lien. `contenuALaTete` n'admet plus qu'un fichier ordinaire (mode 100644, lu par `git ls-tree`) ; un titre caché derrière un retour chariot seul est vu, comme `gov:etat` le coupe. Deux témoins, vus rouges avant le correctif.

Quatrieme tour, sur le refus de `mutation` (revue 5317022729) : quatre retraits survivaient a tout -
l'ancre de debut de `ENTREE_DU_JOURNAL`, le numero passe par `controler()`, celui passe par le
composeur, et l'impression des accords survivants. Chacun a desormais un temoin vu rouge sous son
mutant, dont trois traversent la garde et le composeur reels avec les seules mesures `git` injectees
(`MesuresDeSurvie`) ; les trois survivants equivalents sont tues aussi.

… 46 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

