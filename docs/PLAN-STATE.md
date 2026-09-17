# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `7f83007` — 2026-09-17T18:53:09+02:00 |
| Qu’est-ce qui est en vol ? | 1. #53 (brouillon) |
| Qui tient quoi ? | GOV-041 (A05) · GOV-056 (A05) |
| Où en est la phase ? | phase 0 — 0/98 tâches, reste 75.85 j |
| Le prochain pas | QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #53 — 2026-09-17 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

0/98 tâches terminées · reste 75.85 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 219 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 39 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
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
| 1 | #53 — fix(GOV-041): la cloture refuse un resultat etranger au lot et un lotId absent | `t/gov-041` | brouillon — hors file tant qu’il n’est pas prêt |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-041 — La cloture ecrit un statut sur une entree qu'elle n'a pas verifiee | A05 | #50 | `a_faire` |
| GOV-056 — Le composeur compare des `paths` quand les taches promettent des `tests{}`, et rien ne juge les fichiers d une PR | A05 | #49 | `a_faire` |

⚠️ **20 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-030, GOV-031 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-17 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 34 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `7f83007` (2026-09-17T18:53:09+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #53 — 2026-09-17 — fix(GOV-041): la cloture refuse un resultat etranger au lot et un lotId absent

**Fait.** `pnpm lot:cloture`, seul écrivain de `statut`, `pr`, `branch` et `owner` dans
`docs/tasks.json`, ne pouvait pas dire quelles tâches le lot portait : il ne lisait nulle part la
liste de ses membres et posait `lot` sur toute entrée que le rendu nommait. Le périmètre d'un lot se
LIT désormais, et il a deux sources dont la préséance est écrite plutôt que subie :
`docs/lots/lotId/lot.json` fait foi, et à son défaut — le dossier est ignoré par git, donc le fichier
n'existe que dans l'arbre où le composeur a tourné et rien ne le régénère — le champ `lot` de
`docs/tasks.json`, qui est suivi et que le rendu ne contrôle pas. Un identifiant que le rendu nomme
et que le périmètre ne contient pas est un refus `tache_etrangere_au_lot` ; un rendu sans `lotId` est
un refus `lot_du_rendu_absent`, là où seul un `lotId` FAUX était refusé ; une absence de périmètre
est un refus `lot_introuvable`, jamais un périmètre vide. Les trois refus sont posés EN AMONT de la
boucle qui écrit : ni la branche qui pose `fusionnee`, ni celle qui recompte la tentative n'écrit
quoi que ce soit quand l'un d'eux se lève, et les témoins le vérifient par l'EFFET, pas par le
message. Le module s'importe enfin sans le moindre effet de bord, sous `LANCE_EN_SCRIPT` ancré sur
son dossier, son nom et la fin de chaîne — le patron de `scripts/plan-state/build.ts` et de
`scripts/lot/composer.ts` — et sa règle est EXPORTÉE : `perimetreDuLot`, `controlerLePerimetre` et
`cloturerLeLot` sont APPELÉES par vingt et un témoins, dont quatre qui lancent le SCRIPT ENTIER sur
un dépôt jetable.

**Reste.** Les huit cases de la définition de « terminé » sont vides : l'auteur ne les coche pas,
c'est Will qui atteste. Le troisième trou de la mesure du 2026-09-09 — pour une tâche LOCALE, rien
n'écrit ni ne vérifie le sha de fusion — est porté par GOV-042, qui étend l'attestation aux tâches
locales ; l'ordre D-15 impose GOV-041 puis GOV-042 puis la dette numéro 2, en trois lots successifs,
parce que les trois partagent `scripts/lot/cloture.ts`. Deux silences subsistent et ne sont pas
couverts ici : un résultat sans `dev.taskId` est ignoré avec un avertissement, et surtout un membre
du lot dont le rendu ne dit RIEN ne reçoit rien — ni statut, ni tentative — alors que c'est le
miroir exact du trou que cette PR ferme. Il faudra une tâche pour ce second cas. Le composeur
n'exclut toujours pas les tâches déjà composées, et `docs/lots/` reste hors suivi.

**Appris.** Un contrôle rangé sous la condition qui l'a fait naître garde la moitié des cas, et la
moitié se mesure. Huit pannes fabriquées sur ce correctif, toutes vues : deux d'entre elles se
bornent à REDESCENDRE le contrôle de périmètre dans la branche `fusionnee`, là où le défaut avait
été observé en 2026-09-09. Elles laissent seize témoins sur vingt et un VERTS, et seuls ceux qui
mesurent l'EFFET — aucun statut écrit — les tuent ; le témoin qui appelle la fonction de contrôle
directement reste vert sous les deux. Plus net encore : tant qu'un rendu contient au moins un
résultat fusionné, un refus mal placé se déclenche quand même et PARAÎT garder. Il faut un rendu
dont AUCUN résultat n'est fusionné pour voir l'intrus se faire recompter `attempts` en silence.
Deuxième fait mesuré : glisser l'intrus au MILIEU du rendu plutôt qu'en queue distingue « tous » de
« le dernier » — un contrôle réduit à `slice(-1)` reste vert sur un intrus en fin de liste et tue
trois témoins sur un intrus au milieu.

### PR #48 — 2026-09-17 — feat(GOV-056): le composeur lit paths ET tests{}, gov:pr juge les fichiers d une PR

**Fait.** Le test de collision de lot lit désormais les deux listes de fichiers d'une tâche, `paths`
et `tests{}`, par un lecteur unique que le composeur, `gov:pr` et leurs témoins partagent ; l'écart
qu'il provoque NOMME le fichier partagé et la tâche qui le tenait. `docs/gates.json` en sort
nommément, avec son motif à côté, parce que chaque PR y verse SA ligne indexée par son propre
identifiant ; l'exclusion n'est pas extensible, et toute entrée au-delà du registre fondateur doit
nommer une ADR qui existe sur le disque. `gov:pr` gagne la famille `fichier_hors_paths_des_taches` :
les fichiers de code d'une PR sont confrontés aux chemins que ses tâches déclarent, une PR dont
aucune tâche ne résout étant refusée plutôt que passée sous silence. La preuve passe de 20 à 21
familles et de 12 à 14 contre-témoins, dont celui du PRÉFIXE de dossier, que rien ne gardait : une
tâche qui déclare un dossier couvre ce qui vit dessous, et le prédicat qui le dit n'est plus réécrit
à deux lignes d'un commentaire qui nommait déjà sa source — il appelle `touche`. La boucle qui
compose réellement le lot est sortie du niveau module du script vers une fonction PURE,
`retenirSansCollision`, que le composeur appelle et qu'un test peut donc exécuter ; elle n'écrit
rien, et l'intersection qu'elle applique est celle de `collisionEntre`, seule écriture de la règle
dans le dépôt. `composer.ts` lui-même s'importe désormais sans le moindre effet de bord — tout ce
qui lit, taille ou écrit vit sous `LANCE_EN_SCRIPT`, le patron de `plan-state/build.ts` — et la
composition est EXPORTÉE, `composerLeLot`, appelée par ses témoins au lieu d'être relue. Un
troisième témoin lance le SCRIPT ENTIER sur un dépôt jetable et relit le `lot.json` qu'il écrit.
Les cinq spécifications suivies que nulle tâche ne
revendiquait sont rattachées par les outils hors dépôt : quatre étaient promises par un nom nu, qui
ne résout aucun fichier du dépôt, la cinquième n'avait aucun porteur. La chaîne de lots simulée
jusqu'à épuisement tombe de 35 lots à 20 pour les mêmes 88 tâches, et de 17 lots d'une seule tâche
à 2.

**Reste.** Les huit cases de la définition de « terminé » sont vides : l'auteur ne les coche pas,
c'est Will qui atteste. Le composeur n'exclut toujours PAS les tâches déjà composées — un second
appel, sans rien changer, recompose les mêmes tâches sous le lot suivant, parce qu'il n'existe
aucune table des lots régénérable et que `docs/lots/` est ignoré par git ; hors périmètre de cette
tâche, mais toute mesure de chaîne qui l'ignore se lit de travers. Treize promesses en nom nu
subsistent dans `tests{}` : elles ne résolvent aucun fichier, et aucune garde n'exige qu'une
promesse pointe un fichier existant à l'OUVERTURE de la PR. `sansAncre` de `gov-attributions.ts`
fait exactement ce que fait `cheminDePromesse` du lecteur neuf, sur la même donnée : deux lectures
du même fait, non fusionnées ici parce que cette PR ne rouvre pas la garde de GOV-037.
`scripts/lot/integrer.ts` n'est dans les `paths` d'aucune tâche ; sa spécification l'est désormais.

**Appris.** Une mesure de divergence qui ne dit pas COMMENT elle normalise n'est pas comparable à la
suivante. Les mêmes 260 tâches donnent 20 et 31 quand on retire le titre écrit après le `#` d'une
promesse, 27 et 39 quand on ne le retire pas — et la mesure des spécifications orphelines tombe de
cinq à une si l'on accepte en plus de résoudre un nom nu par son nom de base, sans qu'un seul
fichier ait changé de porteur. Trois conventions coexistent dans `tests{}` : chemin complet, chemin
suivi d'un titre, nom nu. Le second se normalise, le troisième ne se résout pas — et c'est écrit à
côté de la fonction, plutôt que supposé. Second enseignement, payé sur cette branche : la fixture
« conforme » de `gov:pr --prove` portait des fichiers TAPÉS que la tâche de son titre ne déclarait
pas. La PR réputée conforme de la preuve était elle-même une instance du défaut que la garde neuve
ferme, et c'est le contre-témoin qui l'a dit. Une fixture conforme par accident prouve quelque
chose, mais pas ce qu'on croit. Troisième enseignement, celui qui a coûté un refus : le premier
témoin du composeur ne lisait que le TEXTE de `composer.ts` — deux assertions de chaîne — parce que
la boucle vivait au niveau module d'un script qui écrit `docs/tasks.json` et le fichier de lot au
seul fait d'être importé. Le code n'était pas testable, alors on avait testé sa syntaxe. La panne
fabriquée le montre : remettre la disjonction sur `paths` seul laisse les deux assertions VERTES, et
une variante à UNE LETTRE près aussi. Une garde qui connaît une orthographe ne connaît pas un
comportement. Le remède n'est pas une meilleure expression régulière, c'est de rendre la règle
appelable : sortir la boucle en fonction pure, laisser les effets de bord au script, et faire porter
le témoin sur ce qu'elle REND. Quatrième, du même refus : un contre-témoin identique en entrées et
en verdict à un autre ne mesure rien, et l'avoir compté pour un gain gonfle la preuve sans
l'étendre ; il est retiré. Cinquième : un nombre écrit au présent dans le fichier même qui le rend
faux se lit comme une mesure et n'en est plus une — le compte des promesses en nom nu se dérive
désormais, et la ligne que le composeur imprime dit enfin COMMENT elle normalise. Sixième, d'un
second refus et le plus utile de tous : sortir la règle en fonction pure ne suffit pas, parce que
le CÂBLAGE entre le script et elle restait gardé par une chaîne — et une panne d'UNE LIGNE au point
d'appel, `tests` amputé, laissait le dépôt entier vert en remettant 24 paires de tâches du registre
dans le même lot. Le nom survivait dans un commentaire qui affirmait le contraire du code. Un
correctif qui déplace une garde d'un cran la laisse contournable d'un cran : la question n'est pas
« la règle est-elle isolée ? » mais « chaque appelant est-il exercé ? ». Et il y en avait DEUX — la
composition, puis le pilote qui l'appelle : fermer le premier laissait le second ouvert, jusqu'au
témoin qui lance le script entier sur un dépôt jetable. Septième : un témoin de collision construit
contre la DERNIÈRE tâche retenue ne distingue pas « toutes » de « la dernière ». Remplacer la boucle
par la seule dernière retenue le laissait vert, alors que la panne rouvre une collision sur `paths`,
c'est-à-dire le cas que le composeur gardait déjà AVANT cette PR. Une garde n'a de sens que dans les
deux sens : il en a fallu un second, où la tâche fautive se dispute un fichier avec la PREMIÈRE
retenue. Huitième : un compteur DÉRIVÉ qu'aucun témoin ne garde vaut le compteur tapé — vider la
fonction qui le rend laissait le témoin imprimer des zéros et boucler sur rien.

### PR #47 — 2026-09-17 — chore(GOV-037): le lot preparatoire rend la phase 0 composable, 50 gabarits tombent

**Fait.** Les 50 tâches de phase 0 qui ne portaient qu'un chemin gabarit reçoivent leurs chemins
réels ; 35 `acceptance` et 42 `tests` absents sont posés ; 8 `tests` en nom nu deviennent des
chemins complets ; 13 `script` de gate, 4 `verifie`, 3 `phase` et 2 textes de
`docs/requirements.json` sont amendés ; 32 tâches sont versées, soit 31 dettes de phase 0 et
`UX-P0-01b` en phase 1. 223 écritures, toutes par les six outils hors dépôt, aucune à la main. Les
huit vues sont régénérées dans l'ordre, `plan-state:build` en dernier, après cette entrée.
`gov:attributions` descend de 231 à 158 exemptions, et la baisse vient entièrement des quatre
rubriques de gabarit, qui passent de 135 à 62 : le lot n'ajoute aucune exemption, d'aucune nature.
`docs/PLAN-STATE.md` porte « Phase courante : 0 » et 0 sur 98 tâches, reste 75,85 jours.

**Reste.** Les huit cases de la définition de « terminé » sont vides : l'auteur ne les coche pas,
c'est Will qui atteste. La sérialisation de la phase 0 est révélée, pas refermée — 33 tâches
partagent `docs/gates.json`, et c'est le troisième livrable de GOV-056 qui la ferme. Le composeur
n'a pas été lancé : `lot:composer` écrit `docs/tasks.json` et n'a rien à faire dans le même geste
que le lot préparatoire. Deux tâches de phase 0 ne se composeront jamais côté partners, `DM-03-P`
et `DM-04`, qui attendent un lot du dépôt voisin.

**Appris.** Une tâche neuve qui adosse une exigence à un fichier de test DÉJÀ PRÉSENT doit vérifier
que ce fichier CITE l'exigence ; tant que le fichier n'existe pas, personne ne le vérifie et
`gov:trace` tolère. Mesuré ici sur `GOV-087`, qui adossait `REQ-GOV-032` à
`tests/unit/gouvernance/paths-derives.spec.ts` — un fichier suivi qui ne cite que `REQ-GOV-021` et
`REQ-GOV-025`. `gov:trace:render` a REFUSÉ de rendre, et le refus de rendre est le bon
comportement : il coûte quatre rouges en cascade, pas un, parce que la vue reste périmée et que
`vue_divergente` la rattrape ensuite. La même faute avait été corrigée sur `GOV-081` avant le gel ;
elle est revenue avec les deux dettes ajoutées à la réouverture, parce que la vérification n'a pas
été rejouée sur ce qu'on ajoutait. Une correction qui vit dans un contenu gelé ne protège que les
entrées présentes au moment du gel.

… 16 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

