# Le journal — fait / reste / appris, une entrée par PR

**Source.** Ce dossier est une **source**, pas une vue (`partners/ADR-0005` §1). C'est le seul
contenu de l'état vivant que personne ne peut dériver : ce qu'une session a compris ne se déduit ni
de `git`, ni de `docs/tasks.json`, ni de GitHub. `docs/PLAN-STATE.md` le **rend** ; il ne le stocke
pas, et l'y écrire à la main le ferait effacer à la prochaine génération.

## Pourquoi un dossier et pas un fichier

Un fichier unique qui grossit indéfiniment est un aimant à conflits : quatre sessions en parallèle
écrivent toutes à sa fin. Le découpage **par mois** borne la surface de conflit à une poignée
d'entrées, et laisse la lecture chronologique intacte. Un lot qui craint le conflit peut poser son
propre fichier (`2026-09-lot-L-1-04.md`) : la garde `gov:etat` balaie **tout le dossier**, comme
`pnpm adr:index` balaie `docs/adr/` — l'index est dérivé du système de fichiers, jamais tenu à la
main.

## La forme d'une entrée

Un titre de niveau 2, exactement :

`## PR #<numéro> — <AAAA-MM-JJ> — <titre de la PR>`

puis trois champs, chacun ouvert par son marqueur en gras :

- `**Fait.**` — ce qui a atterri, en une à trois phrases. Ce qu'un lecteur croira sur parole.
- `**Reste.**` — ce que la PR n'a pas fait et qui reste dû, avec la tâche ou l'identifiant qui le porte.
- `**Appris.**` — le fait mesuré qu'un autre agent doit connaître et qui n'est écrit nulle part
ailleurs. Une leçon qui revient deux fois devient une règle `RM-nn` par ADR (`docs/REGLES-MAISON.md`).

Les trois sont obligatoires : sans eux, `pr_fusionnee_sans_journal` se satisferait d'un numéro écrit
quelque part, et le journal deviendrait une case à cocher.

## Quand elle s'écrit

**Avant la fusion**, jamais après (REQ-GOV-023 : « toute PR fusionnée est *précédée* d'une entrée »).
Le numéro de PR existe dès son ouverture ; l'entrée se pousse sur la branche de la PR, avec le reste.

## Plancher

Plancher : le journal couvre les PR de numéro **> 27**.

Les sept PR fusionnées avant lui (#1, #2, #3, #4, #25, #26, #27 — toutes le 2026-09-03, la dernière à
`2026-09-03T21:11:59Z`, mesuré par `gh pr list --state merged`) n'avaient aucune source où écrire.
Les journaliser après coup aurait fabriqué de la mémoire ; deux entrées rétrospectives existent
pourtant ci-après, **dérivées mot à mot du corps des PR #26 et #27**, pour que le format ait un
exemple vivant plutôt qu'un gabarit. Elles sont sous le plancher : la garde ne les exige pas.

`scripts/gates/gov-etat.ts` **dérive** ce plancher de la ligne ci-dessus — il ne le recopie pas
(RM-01). Le déplacer se fait ici, à un seul endroit, et la garde suit.

Ce nombre est l'**interrupteur** du journal : sous lui, aucune tâche n'a besoin d'être attestée. Il
se réécrit donc là où il est, **en texte que le rendu affiche**, et il ne s'écrit qu'une fois —
`gov:attributions` refuse de choisir s'il en trouve deux.

## Ce fichier est lu comme une entrée de journal

`gov:attributions` lit **tout** fichier de `docs/journal/`, celui-ci compris, sous la même liste
d'autorisation, ligne par ligne : ce que la garde lit, le dépôt publié doit l'afficher au même
endroit. Aucun conteneur n'est énuméré — c'est la ligne qui **ouvre** qui est nommée. Ce qu'on ne
peut donc écrire nulle part ici, ni dans une entrée :

- un `<`, un `>`, un `&`, un `\` ou un `[` hors d'un span de code (balise, commentaire HTML,
citation, lien, définition de lien-référence), et un accent grave que rien ne referme sur la ligne
(les clôtures de bloc de code, donc) ;
- une ligne qui commence par une espace (code indenté, continuation de liste : une continuation
s'écrit **au ras de la marge**, comme celle-ci) ou par `~~~` ;
- une ligne faite de seuls signes de bloc (`---`, `===`, `+++`, `***`, `___`) : filet, soulignement,
en-tête de fichier ;
- un caractère hors de l'ASCII imprimable et des lettres françaises (apostrophe typographique,
espace insécable, emoji hors `⚠`) ;
- un titre qui n'est pas un titre d'entrée exact et porte un `#`, ou dont le texte s'ouvre par
« PR » et un numéro.

Seule ligne qui échappe à cette liste : **celle du plancher**, et elle est jugée plus strictement
encore. Elle doit être l'expression du plancher, un point final au plus, et **rien d'autre** : ni
cellule de tableau, ni titre de lien, ni texte alternatif, ni commentaire autour. Le `>` de
`**> 27**` y est admis parce qu'il est **dans** le motif que `scripts/gates/gov-etat.ts` lit, pas
parce qu'on l'a autorisé. Le plancher ne s'écrit donc pas au fil d'une phrase : il a sa ligne.

Ce que la garde ne tient pas ici : elle ne lit de ce fichier **que** le plancher. Un titre d'entrée
écrit dans ce mode d'emploi n'atteste aucun lot pour `gov:attributions`, alors que `gov:etat` le
compterait. L'écart n'exempte rien — il n'est pas fermé pour autant.
