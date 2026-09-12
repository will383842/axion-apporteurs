# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `d864ca8` — 2026-09-12T10:27:50+02:00 |
| Qu’est-ce qui est en vol ? | aucune PR ouverte |
| Qui tient quoi ? | aucune tâche revendiquée |
| Où en est la phase ? | phase -1 — 34/39 tâches, reste 3.50 j |
| Le prochain pas | GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #33 — 2026-09-12 |

**Ce qu’on tape maintenant.** `pnpm lot:composer` pour composer le lot suivant, puis revendiquer ses tâches par `gh issue edit`. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

34/39 tâches terminées · reste 3.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 176 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 34 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |

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

Aucune PR ouverte. **Une fusion à la fois** (RM-09) : la file se réserve avant `gh pr update-branch`, jamais après.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.

⚠️ **15 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-12 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

1. **GOV-035** — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur (0.5 j) : 5 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `d864ca8` (2026-09-12T10:27:50+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #33 — 2026-09-12 — chore(GOV-014): reconcilie gov-038 — quatre taches de phase -1, et le faux vert qui n'entrait en conflit avec rien

**Fait.** `lot/gov-038-attestation`, orpheline depuis le 2026-09-05, est réconciliée avec `main` par
un merge à deux parents (`8e9113f` + `f856704`). Elle apporte `GOV-014`, `INT-T01b`, `GOV-019`,
`GOV-028` et `GOV-038` elle-même. **22 conflits, ~128 blocs** : 7 vues régénérées jamais résolues,
2 registres fusionnés **par identifiant** avec un outil hors dépôt qui REFUSE et NOMME toute entrée
touchée des deux côtés (4 dans `gates.json`, 10 dans `tasks.json` — aucune résolue par une règle),
et 5 gardes tranchées au sur-ensemble, mesuré export par export. Le dépôt passe de 29 à 30 tâches
livrées sur 212, de 16,75 à 17,75 j sur 157,25.

**Le faux vert est arrivé sans aucun conflit.** `scripts/gates/gov-conventions.ts` est un fichier
NEUF de `gov-038` : il portait le `try/catch { return [] }` que la PR #31 avait fermé pour les cinq
autres gardes, et `package.json` le faisait déjà entrer dans la chaîne bloquante `gov:check`. Un
fichier ajouté d'un seul côté ne se confronte à rien — aucun conflit ne l'a signalé. Converti :
**six** gardes passent désormais par la source unique.

**Reste.** Onze tours de revue, vingt-deux motifs rendus par les quatre lentilles — et **aucun** ne
portait sur la résolution des conflits : tous visaient le code ajouté hors résolution, ou le récit.
`GARDES_QUI_BALAIENT` a dû être **renversée** — dérivée du disque, puis DÉCLARÉE — parce qu'une
population dérivée de la présence du correctif ne voit pas celui qui le perd. Le plancher du cliquet
a demandé quatre rédactions avant de tenir. Restent versés en tâches, non corrigés ici (A11) : le
cliquet garde un COMPTE et non une IDENTITÉ (25 sorties échangeables sur les 8 entrées à delta nul,
et le registre ne couvre que 12 fichiers sur 33) ; `perf-budgets.ts:472` porte un
`if (!existsSync(racine)) return []` qu'aucune tâche ne porte ; et `gov-attestation.ts` est le seul
des 24 scripts de garde absent de `docs/gates.json`, ce qui l'exempte de la famille
`garde_ecrite_jamais_appelee` que ce lot livre — la forme exacte du défaut qu'il vient de renverser
ailleurs, réintroduite le même jour.

**Appris.** Trois choses, chacune payée d'un rouge. D'abord, **le merge ne protège que ce que les
DEUX branches ont touché** : un correctif qu'une branche n'a pas vu passer rentre par la porte
qu'aucune garde ne surveille, et le devis d'une réconciliation ne vieillit que dans un sens — 8
conflits mesurés contre une tête, 22 contre `main` deux fusions plus tard. Ensuite, **une garde qui
cherche ses sujets par le correctif qu'ils portent ne verra jamais celui qui le perd** ; la liste
doit être une déclaration, que seul un humain retire, et la réciproque n'attrape que l'oubli
inverse. Enfin, **corriger aux numéros de ligne d'un relecteur n'est pas corriger le défaut** :
deux fois dans cette PR j'ai fermé l'occurrence citée en laissant les autres, et c'est la lentille
qui a dû revenir. Un relecteur qui cite une ligne donne un exemple, jamais l'inventaire. Corollaire
mesuré le même jour : un commentaire qui survit à son code ne décrit plus rien, il désinforme — le
fichier affirmait à trois endroits l'inverse du design livré.

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

… 5 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

