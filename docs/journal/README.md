# Le journal — fait / reste / appris, une entrée par PR

> **Source.** Ce dossier est une **source**, pas une vue (`partners/ADR-0005` §1). C'est le seul
> contenu de l'état vivant que personne ne peut dériver : ce qu'une session a compris ne se déduit ni
> de `git`, ni de `docs/tasks.json`, ni de GitHub. `docs/PLAN-STATE.md` le **rend** ; il ne le stocke
> pas, et l'y écrire à la main le ferait effacer à la prochaine génération.

## Pourquoi un dossier et pas un fichier

Un fichier unique qui grossit indéfiniment est un aimant à conflits : quatre sessions en parallèle
écrivent toutes à sa fin. Le découpage **par mois** borne la surface de conflit à une poignée
d'entrées, et laisse la lecture chronologique intacte. Un lot qui craint le conflit peut poser son
propre fichier (`2026-09-lot-L-1-04.md`) : la garde `gov:etat` balaie **tout le dossier**, comme
`pnpm adr:index` balaie `docs/adr/` — l'index est dérivé du système de fichiers, jamais tenu à la
main.

## La forme d'une entrée

Un titre de niveau 2, exactement :

```
## PR #<numéro> — <AAAA-MM-JJ> — <titre de la PR>
```

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
