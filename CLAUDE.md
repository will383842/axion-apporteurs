# CLAUDE.md — Axion Apporteurs

Ce fichier est lu **automatiquement** par toute session ouverte dans ce dépôt, quelle que soit la
formulation de la demande. Il n'a qu'une raison d'être : **amener une session neuve au bon document
sans qu'elle ait eu à le demander.**

Il ne décide rien, ne fait foi contre aucun document, et **ne résume rien** : il **pointe**. Un
résumé diverge de sa source sans que personne ne s'en aperçoive — c'est ce qui a fait retirer la
première version de ce fichier, et la règle de gouvernance qu'elle portait seule a disparu avec elle.
Cette règle est aujourd'hui enregistrée sous le numéro **RM-13**, dans `docs/REGLES-MAISON.md`.

⚠️ **La mémoire de session ne sert à rien ici.** Elle est rangée par répertoire de projet, et celle
du chantier vit ailleurs : une session ouverte ici ne la charge pas. Le dépôt doit donc se suffire à
lui-même — ce fichier en est la porte d'entrée, pas un raccourci.

## Par où commencer

| La question qu'on se pose | Le document qui répond |
| --- | --- |
| Que s'est-il passé à la session précédente ? Qu'est-ce qui coûterait une demi-journée à réapprendre ? | `docs/REPRISE-SESSION.md` — note de passation ; elle ne décide rien et ses chiffres périment |
| Où en est le chantier **maintenant** ? | `docs/PLAN-STATE.md` — vue **dérivée**, rendue par `pnpm plan-state:build`, jamais éditée à la main |
| Deux documents se contredisent : lequel fait foi ? | `docs/PRESEANCE.md` — la table d'arbitrage, document par document. À lire à la source |
| Quelles règles ont déjà coûté cher, et laquelle s'applique à mon patch ? | `docs/REGLES-MAISON.md` — des règles numérotées, citées **par numéro** dans les ADR et le gabarit de PR |
| Qui écrit quoi ? Quel label une PR doit-elle porter ? Quels chemins sont réservés ? | `docs/CHARTE-AGENTS.md`, section 7 — **ce tableau est LU par `pnpm gov:pr`**, il n'a pas de copie |
| Comment fusionne-t-on, et comment sait-on qu'une fusion a atterri ? | `docs/PROTOCOLE-FUSION.md` |
| Qu'a-t-on décidé, qui l'a tranché, est-ce réversible ? | `docs/DECISIONS.md` |
| Quel terme employer, et lequel est interdit ? | `docs/GLOSSAIRE.md` |
| Cette garde existe-t-elle vraiment, l'a-t-on vue rougir ? | `docs/gates.json` — une garde sans preuve rouge n'existe pas |
| Qu'a-t-on fait, appris, et que reste-t-il, PR par PR ? | `docs/journal/` puis `docs/LECONS.md` |
| Quelle décision d'architecture est en vigueur ? | `docs/adr/INDEX.md` — index **dérivé**, rendu par `pnpm adr:index` |
| Comment nomme-t-on branches, worktrees, commits ? | `docs/CONVENTIONS.md` |
| Que doit contenir une PR pour être recevable ? | `.github/PULL_REQUEST_TEMPLATE.md` — huit cases, un bloc ROUGE/VERT verbatim |

Ordre de lecture d'une session d'agent : `docs/PLAN-STATE.md`, puis `docs/REGLES-MAISON.md`, puis sa
fiche de rôle sous `.claude/agents/`, puis sa tâche dans `docs/tasks.json` et les exigences qu'elle
cite. Un agent qui n'a pas lu les règles maison ne prend pas de tâche.

## Ce que ce fichier ne dira jamais

**Le premier geste de la prochaine session.** Il change à chaque fois, et un fichier d'amorçage qui
le recopie devient faux sans que rien ne l'annonce : il n'a ni date, ni générateur, ni garde. Il se
lit dans `docs/REPRISE-SESSION.md`, qui est daté, et se recoupe avec `docs/PLAN-STATE.md`, qui est
régénéré. Aucun numéro de PR, aucune date, aucun identifiant de lot ni compteur d'avancement n'entre
ici — `tests/unit/gouvernance/regles-maison.spec.ts` le vérifie, et rougit sur le premier qui entre.

**Un résumé de `docs/PRESEANCE.md`.** La version retirée de ce fichier en portait un, et il avait
déjà divergé de sa source : il omettait deux des chemins réservés et affirmait que tout le reste
était une vue générée — ce qui interdisait d'éditer précisément les fichiers que la préséance donne à
éditer. Un résumé faux est plus cher qu'un renvoi : il se lit, et on le croit.

**Le tableau des chemins réservés.** Sa source est la section 7 de `docs/CHARTE-AGENTS.md`, et ce
tableau-là est lu ligne à ligne par la garde : en écrire une seconde version, ce serait décider
autrement que la garde qui bloque.

## La règle qu'on enfreint sans le vouloir : RM-13

**RM-13 : aucun lot composé tant qu'une PR de clôture est ouverte.** `pnpm lot:composer` lit
`docs/tasks.json`, où `pnpm lot:cloture` écrit les statuts — mais il les écrit **sur la branche de
clôture**. Tant que cette PR n'est pas fusionnée, les tâches du lot précédent y sont encore « à
faire » : le composeur les juge éligibles et les recompose, deux agents partent sur les mêmes
chemins, et deux PR portent la même tâche. La règle, son pourquoi, la garde qui en voit le symptôme
et ce qui n'en est **pas** gardé : `docs/REGLES-MAISON.md`, section RM-13.

Corollaire de lecture : tant qu'une PR de clôture est ouverte, un chiffre d'avancement se lit **sur
une branche nommée**, jamais seul — celui de la branche décrit un futur, celui de la branche par
défaut un acquis.

## Les pièges qui coûtent une demi-journée

- **Ouvrir la session hors du dépôt.** Le registre des fiches de rôle est figé à la racine de
  session : lancée d'ailleurs, une session ne résout aucune fiche de `.claude/agents/` et
  l'autopilote meurt au premier agent — ou, pire, tourne avec des relecteurs qui peuvent écrire.
- **`pnpm <cible> | tail` rend le code de sortie de `tail`.** Une suite de gates rouges s'est déjà
  affichée verte ainsi. Une commande à la fois, et le code de sortie de la commande elle-même.
- **`docs/lots/` est en `.gitignore`.** Ce que le composeur y écrit n'est suivi par personne, ne
  survit pas à un `clone`, et n'est lu par aucune garde. Rien d'important ne se laisse là.
- **Un fichier que git ne suit pas n'est lu par aucune garde.** `pnpm gov:identifiants` et
  `pnpm gov:publication` balaient `git ls-files`, pas le disque. Commiter un document jusque-là
  ignoré rend visible d'un coup la dette qui y dormait : c'est un inventaire, pas une régression.
- **Une Gate A locale verte ne juge pas le corps d'une PR.** `pnpm gov:pr` sans `--pr <n>` ne juge
  que la structure du gabarit ; les familles qui lisent la PR elle-même n'existent qu'avec `--pr`.
- **`pnpm plan-state:build` passe APRÈS l'entrée de journal**, jamais avant : la vue **rend** le
  journal, et régénérée trop tôt elle ne cite pas la PR en cours.
- **Le parallélisme des tests est borné exprès** (`vitest.config.ts`) : sans cette borne, la machine
  sature et fabrique des rouges qui ne disent rien du code — l'instrument ment.

## Ce dépôt est public

Trois familles de contenu n'y entrent jamais, et `pnpm gov:publication` les refuse : les notes
d'analyse juridique, les valeurs qui servent à repérer un usage anormal, et l'économie du réseau.
La règle est en tête de `README.md`, la décision au registre `docs/DECISIONS.md`.

Corollaire d'écriture, partout, y compris dans un commentaire : un identifiant se cite sous sa forme
qualifiée — c'est RM-12. `pnpm gov:identifiants` traite un identifiant **entre guillemets** comme une
citation, et **hors guillemets** comme une référence qui doit résoudre.
