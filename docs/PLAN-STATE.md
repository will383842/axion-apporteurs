# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `794245c` — 2026-09-04T23:10:40+02:00 |
| Qu’est-ce qui est en vol ? | 1. #31 (rien) |
| Qui tient quoi ? | GOV-006 (A01) · GOV-013 (A01) · GOV-014 (A01) · GOV-019 (A01) · CPL-T01 (A01) · GOV-024 (A01) · GOV-025 (A01) · GOV-026 (A01) · GOV-027 (A01) · GOV-028 (A01) · GOV-029 (A01) · GOV-032 (A01) |
| Où en est la phase ? | phase -1 — 20/35 tâches, reste 7.75 j |
| Le prochain pas | fusionner #31, puis INT-T01b — Contrat d'événements, payloads et fixtures produites par le producteur réel |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 4 question(s) pour Will |
| Dernière entrée de journal | PR #31 — 2026-09-05 |

**Ce qu’on tape maintenant.** `gh pr view 31 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

20/35 tâches terminées · reste 7.75 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 172 | INT-T01b, JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03 … |
| `en_cours` | 12 | GOV-006 (A01) PR#31 · GOV-013 (A01) PR#31 · GOV-014 (A01) · GOV-019 (A01) · CPL-T01 (A01) PR#31 · GOV-024 (A01) PR#31 · GOV-025 (A01) PR#31 · GOV-026 (A01) PR#31 · GOV-027 (A01) PR#31 · GOV-028 (A01) · GOV-029 (A01) PR#31 · GOV-032 (A01) PR#31 |
| `en_revue` | 0 | — |
| `fusionnee` | 20 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-009, GOV-010, GOV-011 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → GOV-013 (0.25 j, ph -1) → GOV-014 (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **17.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W1
- W13
- W3
- W4

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #31 — feat(GOV-024): lots L-1-04, L-1-05 et L-1-06 — huit taches, le verrou de phase leve, trois regressions fermees | `lot/L-1-INT-a` | rien — fusionnable maintenant |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-006 — Glossaire + gate schéma enum | A01 | #10 | `en_cours` |
| GOV-013 — Gate lexicale « commercial » | A01 | #15 | `en_cours` |
| GOV-014 — Conventions + sélection des gardes d'axionia | A01 | #16 | `en_cours` |
| GOV-019 — Budgets de performance après première mesure | A01 | #21 | `en_cours` |
| CPL-T01 — Registre `config/entite.json` à valeur sentinelle, ses lecteurs et la garde `gov:entite` | A01 | — | `en_cours` |
| GOV-024 — Une vue générée qui a dérivé de sa source doit rougir | A01 | — | `en_cours` |
| GOV-025 — La garde des identifiants nus est aveugle en fin de phrase — dépôt public, c'est une garde de publication | A01 | — | `en_cours` |
| GOV-026 — Le CLAUDE.md racine, avec sa règle maison d'abord registrée | A01 | — | `en_cours` |
| GOV-027 — Le composeur lit le registre des décisions autrement que la garde, et écarte des tâches dont la décision est posée | A01 | — | `en_cours` |
| GOV-028 — Citer n'est pas se servir — mais dans un fichier de code, la quote est de la SYNTAXE | A01 | — | `en_cours` |
| GOV-029 — L'identifiant d'un lot se derivait d'un dossier que git ignore, et repartait sur un numero deja pris | A01 | — | `en_cours` |
| GOV-032 — Un instant de reference se fige par rapport a CE QU'IL JUGE | A01 | — | `en_cours` |

⚠️ **15 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

- partners/ADR-0007 — La branche porte le LOT, la tâche porte le COMMIT — `docs/adr/0007-la-branche-porte-le-lot-pas-la-tache.md`
- partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema — `docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md`

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-04). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

1. **Fusionner #31** — elle est en tête de file et ne bloque sur rien. Lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.
2. **INT-T01b** — Contrat d'événements, payloads et fixtures produites par le producteur réel (1 j) : 1 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `794245c` (2026-09-04T23:10:40+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #31 — 2026-09-05 — feat(GOV-024): lots L-1-04, L-1-05 et L-1-06 — neuf taches, le verrou de phase leve, trois regressions fermees

**Fait.** Trois lots entrent en une PR : neuf tâches — `GOV-006`, `GOV-013`, `CPL-T01`, `GOV-024`, `GOV-025`, `GOV-026`, `GOV-027`, `GOV-029`, `GOV-032` —
les deux dernières nées de la vérification. `CPL-T01` lève le verrou qui gelait 171 tâches : une valeur que seul
Will connaît est une **configuration à sentinelle**, pas un état de tâche, et `attente_externe`
n'entrait dans aucun lot — la phase −1 restait donc courante à vie, sans qu'aucune garde ne rougisse.
`GOV-024` donne enfin un générateur à `docs/REQUIREMENTS.md`, qui n'en avait aucun alors que son
bandeau affirmait le contraire, et un **vérificateur** aux deux vues : `--verifie-rendu` n'écrit rien
et sort 1 sur un octet d'écart, en nommant l'écart en unités du domaine. `GOV-027` supprime le second
lecteur du registre des décisions ; le composeur imprime l'effet — **18 tâches** que la lecture
d'avant écartait « pour une raison de décision » sont éligibles, 1 le reste. Le dépôt passe de 109 à
110 gardes, de 18 à **21 armées**, de 197 à **204 tâches**, de 353 à **355 exigences**.

**Reste.** Trois lots fusionnés en une PR au lieu de six : la Gate A juge l'arbre **combiné**, et
c'est le seul endroit où le conflit annoncé entre `gov:lexique` et `gov:publication` sur la même
phrase de `partners/ADR-0009` pouvait être tranché — il est **fermé**, mesuré et non simulé. Restent
en phase −1 : `GOV-014`, `INT-T01b`, `GOV-019`, `GOV-028` — `INT-T01b` étant la seule tâche du
chantier à vivre dans `axionia`. Trois constats sont renvoyés en tâche plutôt que corrigés au
passage : la neutralisation des citations aveugle la garde sur toute chaîne courte (`GOV-028`), et
`pnpm gates:prouvees` compte 8 « preuves non référencées » qui sont des refus de **ponctuation**, pas
des gardes non prouvées.

**Appris.** Deux régressions ont été trouvées en vérifiant, et aucune n'aurait rougi avant d'être en
production. La première : `GOV-025` a retiré le point de sa lookahead pour attraper l'étiquette collée
à un point final — c'était juste — mais elle attrapait du même coup les **renvois pointés**, et
`docs/gates.json` en porte un depuis `main`. Les deux étaient verts **séparément** et rouges
**ensemble** ; sans l'arbre combiné, Gate A serait tombée sur `main`, sur une ligne que personne n'avait
touchée. La ligne juste se trace sur ce qui SUIT le point : un chiffre prolonge l'identifiant, autre
chose termine la phrase. La seconde : le composeur tirait le numéro du prochain lot d'un répertoire
que `.gitignore` exclut, donc absent de tout arbre neuf — il proposait `L-1-01`, identifiant déjà porté
par sept tâches livrées. Son commentaire nommait pourtant le cas exact, « un dossier non commité », et
n'en avait corrigé que la moitié : le comptage était devenu un maximum, la source était restée le
répertoire ignoré. **Un commentaire juste qui nomme un défaut ne le corrige pas, et il rassure d'autant
plus qu'il est juste.**

Et la troisième ne tenait pas dans « deux » : **un instant de référence se fige par rapport à CE
QU'IL JUGE.** Deux spec et le mode `--prove` d'une garde portaient un instant écrit en dur, sous un
commentaire exact — « un instant FIXE, jamais `new Date()` » — qui vaut pour un univers INJECTÉ et
non pour un fichier vivant. Confronté au journal réel, qui avance, il faisait un test à retardement,
tombé le lendemain sur cette entrée même. Le pire n'est pas la panne : `--prove` sortait **1** en
refusant de commencer, exactement comme une garde qui aurait trouvé un défaut. Une preuve qui
s'éteint toute seule ne prouve rien le second jour, **et rien ne le dit**. Son témoin portait lui
aussi une date en dur : un témoin dont la date est écrite à la main cesse d'exercer sa famille le
jour où le présent le rattrape — **en silence**, il devient un contre-témoin.

### PR #30 — 2026-09-04 — chore(GOV-012): cloture du lot L-1-03 — huit taches fusionnee, atterrissage atteste

**Fait.** Le lot `L-1-03` est clos : ses huit tâches passent `fusionnee` dans `docs/tasks.json`, et
le dépôt passe de 12 à 20 tâches livrées sur 197, de 9,50 à 13,50 j sur 149 — 6,4 % à 9,1 %, phase
−1 à 20 sur 26. L'invariant `fusion.atterri === true` a été satisfait avant l'écriture et non
affirmé : le run `Gate A` du `push` sur `main` a été lu vert (`33842493472`, `ab5caf5`), puis la
8ᵉ case de #28 et #29 cochée, puis `lot:cloture` lancé. `docs/TRACABILITE.md` passe de 22 à 31
exigences réputées testées — non par ajout de tests, mais parce que la clôture rend enfin visibles
les promesses `tests{}` de huit tâches jusque-là non livrées.

**Reste.** Les quatre lentilles ont rendu : `securite` et `mutation` acceptent, `exactitude` et
`simplicite` ont **refusé**, et leurs six motifs sont corrigés dans cette PR — vue `docs/TASKS.md`
non régénérée (relevée trois fois indépendamment), « sept » revendications périmées pour quinze, et
un `CLAUDE.md` racine hors périmètre, retiré. Deux constats sont renvoyés en tâche plutôt que
corrigés ici, parce qu'un manque devient une tâche arbitrée et non un correctif glissé dans le lot
en cours (`docs/CHARTE-AGENTS.md`, A11) : `gov:tasks` n'a pas de mode qui compare sa vue à sa source
— rien ne rougit quand `docs/TASKS.md` dérive —, et `gov:identifiants` est **aveugle en fin de
phrase**, sa lookahead `(?![A-Za-z0-9_.-])` incluant le point : une étiquette de relecteur placée
juste avant un point final n'est pas vue, alors que la même suivie d'un espace l'est. Ses propres
témoins `--prove` évitent tous cette position, de sorte que l'auto-preuve ne l'exerce jamais — la
garde reste verte sur le texte qu'elle condamne. La rédaction de cette entrée l'a vérifié malgré
elle : des deux occurrences écrites pour l'illustrer, la garde n'en a relevé qu'une, celle qui
n'était pas collée au point. Les **quinze** revendications périmées ne sont pas effacées — `lot:cloture` écrit le
backlog, pas les labels d'issue ; `pnpm gov:etat` les compte, et c'est lui qu'il faut relire plutôt
que ce chiffre, qui est daté du jour de la clôture — et `deploy:verify` (`GOV-012`, `partners/ADR-0006`) manque toujours, de sorte
que l'atterrissage se vérifie encore par le repli daté du Pas 7 de `docs/PROTOCOLE-FUSION.md`.

**Appris.** Le motif du **premier** échec de clôture d'une tâche n'est écrit nulle part : `cloture.ts`
le calcule, l'imprime — `fusion non atterrie : motif absent` — puis remet `t.motif` à `null`, parce
qu'une tâche qui repart doit repartir propre ; il n'est persisté qu'à la deuxième tentative, quand
la tâche bascule `bloquee`. Une session qui n'a pas lu la sortie console de ce run-là ne retrouvera
jamais la raison. L'attaque a aussi montré que l'invariant se juge **tâche par tâche** et non en
bloc : avec `atterri: false` sur la seule `GOV-010`, les sept autres passent `fusionnee` et elle
seule retombe `a_faire` avec `attempts: 1` — un rendu partiellement faux ne contamine pas les lignes
saines, et ne les protège pas non plus. Enfin, un fichier que git ne suit pas n'est lu par **aucune**
garde : `gov:identifiants` conclut par « aucun identifiant nu **dans les fichiers suivis** », et le
commit qui a fait entrer `docs/REPRISE-SESSION.md` dans le dépôt a rendu la CI rouge sur six
identifiants nus qui y dormaient depuis des sessions, aucun introduit ce jour-là — « vert » ne dit
rien de ce qu'aucune garde ne regarde.

La même garde en a fourni un second exemple, plus retors : `gov:identifiants` est **aveugle en fin
de phrase**. Sa lookahead `(?![A-Za-z0-9_.-])` inclut le point, de sorte qu'une étiquette de
relecteur collée à un point final n'est pas vue, alors que la même suivie d'un espace l'est. Ses
propres témoins `--prove` évitent tous cette position : l'auto-preuve ne l'exerce jamais, et la
garde reste **verte sur le texte qu'elle condamne**. La rédaction de cette entrée l'a vérifié
malgré elle — des deux occurrences écrites pour l'illustrer, une seule a été relevée. Ce n'est donc
pas « une garde manque » mais « une garde existe et ne couvre pas la position la plus fréquente
dans de la prose ». Un témoin qui n'éprouve que le milieu d'une phrase mesure la moitié du domaine.
Le remède est en tâche, avec des témoins aux positions limites — fin de phrase, fin de ligne, avant
une virgule, avant une parenthèse fermante — et un contre-témoin qui prouve qu'un usage légitime
passe toujours.

### PR #29 — 2026-09-04 — chore(GOV-008): entree de journal de la PR 28 — main etait rouge sans elle

**Fait.** L'entrée de journal de la PR #28 est écrite, et `docs/PLAN-STATE.md` régénéré. La PR #28
était la première au-dessus du plancher du journal (« PR de numéro > 27 ») et elle a été fusionnée
sans la sienne : le run `Gate A` du `push` sur `main` (33836891472, sha `9597865`) est resté ROUGE
sur la famille `pr_fusionnee_sans_journal` jusqu'à cette PR.

**Reste.** La clôture de `L-1-03` elle-même — `pnpm lot:cloture -- --lot L-1-03 --owner A01`, qui
écrit les huit statuts `fusionnee` dans `docs/tasks.json` — n'est pas dans cette PR : son invariant
exige `fusion.atterri === true`, et l'atterrissage de la PR #28 n'est vérifié qu'une fois `main`
redevenu vert, c'est-à-dire après celle-ci. Elle vient donc dans la PR suivante.

**Appris.** Une obligation qui s'évalue APRÈS la fusion ne peut pas être gardée AVANT elle par la
même garde : `gov:etat` ne voit `pr_fusionnee_sans_journal` que lorsque la PR est fusionnée, donc
sur `main`, donc trop tard pour refuser quoi que ce soit — sa seule victime possible est la branche
par défaut. Le protocole compense en demandant l'entrée sur la branche de la PR, mais rien ne le
vérifie au moment où c'est encore réparable sans un second aller-retour : la garde qui existe est un
détecteur d'incident, pas un garde-fou. Le coût mesuré de l'oubli est une PR entière, sa Gate A
complète, et un `main` rouge dans l'intervalle.

… 3 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

