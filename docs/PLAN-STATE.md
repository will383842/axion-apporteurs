# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `e0dacf3` — 2026-09-09T23:59:31+02:00 |
| Qu’est-ce qui est en vol ? | 1. #32 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase -1 — 29/36 tâches, reste 4.00 j |
| Le prochain pas | GOV-014 — Conventions + sélection des gardes d'axionia (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #32 — 2026-09-10 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

29/36 tâches terminées · reste 4.00 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 178 | GOV-014, INT-T01b, GOV-019, JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02 … |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 29 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → GOV-014 (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **17.50 j**.

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
| 1 | #32 — chore(GOV-012): cloture du lot L-1-04 — neuf taches fusionnee, le verrou de phase leve | `lot/L-1-04-cloture` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **15 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

- partners/ADR-0009 — Une valeur que seul Will connaît est une CONFIGURATION, pas un blocage de plan — `docs/adr/0009-valeurs-du-monde-reel.md`
- partners/ADR-0010 — Une gate bloquante dont l'exception s'écrit, plutôt qu'une gate qu'on n'exécute pas — `docs/adr/0010-une-gate-bloquante-et-sa-dette-declaree.md`

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-09). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

1. **GOV-014** — Conventions + sélection des gardes d'axionia (1 j, **sur le chemin critique**) : 6 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `e0dacf3` (2026-09-09T23:59:31+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #32 — 2026-09-10 — chore(GOV-012): cloture du lot L-1-04 — neuf taches fusionnee, le verrou de phase leve

**Fait.** Le lot `L-1-04` est clos : ses neuf tâches passent `fusionnee` dans `docs/tasks.json`, et
le dépôt passe de 20 à 29 tâches livrées sur 209, de 13,50 à 16,75 j sur 154,25 — soit 9,6 % à 13,9 % des tâches et 8,8 % à 10,9 % de l'effort,
deux taux qu'il ne faut pas confondre,
phase −1 à 29 sur 36. L'invariant `fusion.atterri === true` a été **mesuré** avant l'écriture, non
affirmé : `git merge-base --is-ancestor` a rendu vrai pour `e0dacf3`, `git diff --stat` entre la
tête du lot et `origin/main` est **vide**, et le run `Gate A` du `push` sur `main` est vert sur
`e0dacf3`. Les échecs visibles sur `794245c` sont le *Nightly*, rouge par construction jusqu'à la
sortie de phase −1 — pas `Gate A` ; les confondre ferait lire une panne là où il y a une dette
déclarée.

**Le verrou de phase n'était pas où le journal le disait.** Depuis le 2026-09-04, chaque reprise
recopiait que `CPL-T01` était en attente externe, donc jamais livrée, donc que la phase −1 ne se
fermerait jamais et que 171 tâches — 91 % du plan — étaient gelées. Le registre dit autre chose :
`CPL-T01` est `fusionnee`, levée par le lot que cette PR clôt ; et les deux tâches qu'on lui
associait sont en **phase 1**, donc sans effet sur la fermeture de la phase −1. Des trois gestes
réputés appartenir à Will, un a été fait par du code et les deux autres ne sont pas dans la phase
qu'ils étaient censés tenir fermée. *Un verrou se vérifie sur le registre, pas sur la note qui le
décrit* — celle-ci a traversé cinq jours et plusieurs sessions sans que le champ `phase` soit relu.
Ce qui ferme réellement la phase −1 : sept tâches, quatre jours, aucun arbitrage externe — et
**quatre d'entre elles sont déjà écrites** sur `lot/gov-038-attestation`, jamais fusionnée. La
réconciliation de cette branche cesse donc d'être un rangement : c'est le chemin le plus court vers
l'ouverture de la phase 0.

**Reste.** La première tête de cette PR a fait rougir `Gate A` — et pour la récidive exacte de
LEC-23, née de la PR #30 : `lot:cloture` écrit la source et n'ajoute qu'elle, laissant `TASKS.md`
derrière lui. La vue annonçait 20 tâches livrées quand sa source en portait 29. Deux vues étaient
en fait périmées, pas une : `docs/TRACABILITE.md` aussi. La lentille `simplicite` l'a relevé sur la
gate, pas sur son impression — et la garde qui l'attrape appartient à `GOV-024`, l'une des neuf
tâches que cette PR déclare livrées : le lot a reproduit l'incident qu'il avait été écrit pour
empêcher. Rendu ici par les six générateurs, non à la main. Deux dettes restent ouvertes et
deviennent des tâches plutôt que des correctifs glissés dans le lot en cours
(`docs/CHARTE-AGENTS.md`, A11) : `lot:cloture` devrait ajouter ses vues ou refuser de commiter sans
elles, et `docs/PLAN-STATE.md` demeure la seule vue sans vérificateur — ce que `GOV-035`, ajoutée
par le lot précédent, a précisément pour objet.

**Appris.** Trois choses, toutes payées d'un rouge. D'abord, **un verrou se vérifie sur le
registre, pas sur la note qui le décrit** : l'avertissement « la phase −1 ne se fermera jamais,
171 tâches gelées » a traversé cinq jours et plusieurs sessions, chacune le recopiant, aucune ne
relisant le champ `phase` des deux tâches qu'il incriminait — elles sont en phase 1, et la
troisième était déjà livrée. Une note de reprise vieillit comme un cache : elle a une date, pas une
validité. Ensuite, **un outil qui écrit une source doit ajouter ses vues, ou refuser de commiter
sans elles** : `lot:cloture` n'ajoute que `docs/tasks.json`, et la vue restée en arrière a fait
rougir `Gate A` — récidive exacte d'un incident né de la clôture précédente, attrapée par une garde
qui appartient à l'une des neuf tâches que cette PR déclare livrées. Un lot peut reproduire
l'incident qu'il a été écrit pour empêcher, et c'est précisément quand il le prévient ailleurs
qu'on cesse de le surveiller chez soi. Enfin, **j'ai cité le vert de la base sans regarder le rouge
de ma propre tête** : le corps de cette PR affirmait l'atterrissage de la précédente, run à
l'appui, pendant que `gate-a` échouait sur le commit qu'il décrivait — la même erreur, d'un cran,
que de conclure d'un compteur qu'on n'a pas mesuré. Et une part de tâches n'est pas une part d'effort :
l'une compte les lignes du registre, l'autre les jours, et elles diffèrent de trois points ;
écrire « soit » entre les deux les rend fausses toutes les deux.

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
**112 gardes**, de 18 à **23 armées**, de 197 à **209 tâches**, de 353 à **355 exigences**.
⚠️ Ces quatre nombres ont ete TAPES et ils etaient faux — 110/21/204 le 2026-09-05 au soir, quand la
mesure et le corps DERIVE de cette PR meme donnaient 112/23/209. Trois facons d'etre faux a la fois :
contre la mesure, contre l'artefact que la PR publie, et contre le bandeau de ce fichier. La garde des
compteurs ne les atteint pas : elle ne balaie que trois fichiers et ne vise que la tournure « n
revisions ». Ils restent tapes ici faute d'un marqueur dans ce fichier — c'est une dette, pas un choix.

**Reste.** Trois lots fusionnés en une PR au lieu de six : la Gate A juge l'arbre **combiné**, et
c'est le seul endroit où le conflit annoncé entre `gov:lexique` et `gov:publication` sur la même
phrase de `partners/ADR-0009` pouvait être tranché — il est **fermé**, mesuré et non simulé. Restent
en phase −1 : `GOV-014`, `INT-T01b`, `GOV-019`, `GOV-028`, `GOV-035`, `GOV-036`, `GOV-037` — les trois
dernieres etant creees par ce diff meme, ce que la premiere redaction omettait — `INT-T01b` étant la seule tâche de la PHASE −1 à vivre dans
`axionia` — le chantier en compte quatorze au total. Trois constats sont renvoyés en tâche plutôt que corrigés au
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

… 4 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

