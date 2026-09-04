# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `9597865` — 2026-09-04T06:27:42+02:00 |
| Qu’est-ce qui est en vol ? | 1. #29 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | GOV-018 (A01) · GOV-008 (A01) · GOV-010 (A01) · GOV-011 (A01) · GOV-012 (A01) · INT-T01a (A01) · GOV-020 (A01) · GOV-023 (A01) |
| Où en est la phase ? | phase -1 — 12/26 tâches, reste 7.00 j |
| Le prochain pas | GOV-012 — Protocole de fusion, release manager, protection de main (chemin critique) |
| Ce qui bloque | 3 tâche(s) bloquée(s) ou en attente externe · 9 question(s) pour Will |
| Dernière entrée de journal | PR #29 — 2026-09-04 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

12/26 tâches terminées · reste 7.00 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 182 | GOV-018, GOV-008, GOV-006, GOV-010, GOV-011, GOV-012, GOV-013, GOV-014, INT-T01a, INT-T01b, GOV-019, GOV-020 … |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 12 | GOV-000, GOV-007, GOV-001, GOV-002, GOV-003, GOV-004, GOV-005, GOV-009, GOV-015, GOV-017a, GOV-017b, QA-T00 |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 3 | CPL-T01 · JUR-T01b · JUR-T01c |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → GOV-012 (0.5 j, ph -1) → GOV-013 (0.25 j, ph -1) → GOV-014 (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **18.25 j**.

## Bloquées

- **CPL-T01** — Décisions sans valeur par défaut à trancher par Will : W1 entité contractante, W9 prolongation de fenêtre si devis en cours · attend will
- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W1
- W11
- W2
- W3
- W4
- W5
- W6
- W9
- externe:will

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #29 — chore(GOV-008): entree de journal de la PR 28 — main etait rouge sans elle | `lot/L-1-03-journal` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-018 — Règles maison et leçons dans le dépôt | A01 | #6 | `a_faire` |
| GOV-008 — PLAN-STATE vivant, protocole de session, verrou d'écriture | A01 | #7 | `a_faire` |
| GOV-010 — Gate ADR ↔ assertion | A01 | #12 | `a_faire` |
| GOV-011 — Matrice de traçabilité dérivée | A01 | #13 | `a_faire` |
| GOV-012 — Protocole de fusion, release manager, protection de main | A01 | #14 | `a_faire` |
| INT-T01a — Contrat d'événements, enveloppe et nomenclature : Zod + JSON Schema + `schemaVersion` + hash | A01 | #18 | `a_faire` |
| GOV-020 — Inventaire prouvé C1-C8 | A01 | #22 | `a_faire` |
| GOV-023 — Fiches de rôle générées depuis `agents.json` | A01 | #23 | `a_faire` |

⚠️ **7 revendication(s) périmée(s)** — GOV-007, GOV-002, GOV-004, GOV-009, GOV-015, GOV-017b, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

- partners/ADR-0007 — La branche porte le LOT, la tâche porte le COMMIT — `docs/adr/0007-la-branche-porte-le-lot-pas-la-tache.md`
- partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema — `docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md`

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-04). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

1. **GOV-012** — Protocole de fusion, release manager, protection de main (0.5 j, **sur le chemin critique**) : 9 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `9597865` (2026-09-04T06:27:42+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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

### PR #28 — 2026-09-04 — feat(GOV-011): lot L-1-03 — huit taches, six gardes armees, seize ruptures de tracabilite fermees

**Fait.** Les huit tâches du lot `L-1-03` sont intégrées : `GOV-008`, `GOV-010`, `GOV-011`,
`GOV-012`, `GOV-018`, `GOV-020`, `GOV-023` et `INT-T01a`. Le dépôt passe de 25 à 37 étapes de Gate A,
de 92 à 217 tests sur 19 fichiers, et de **11** à 18 gardes armées ; les seize ruptures de
traçabilité que `gov:trace` a trouvées le jour de sa livraison sont fermées. Le titre de la PR
annonce « six gardes armees » : c'est **sept**, et le titre d'une PR fusionnée ne se réécrit pas.
`docs/gates.json` passe de 11 à 18 entrées portant une `preuveRouge` non nulle — `req:check`,
`gov:depot-visibilite`, `gov:agents`, `partners:contrat:hash`, `gov:inventaire`, `gov:lecons` et
`gov:etat`. Le contrat d'événements est dérivé
et tenu par son empreinte (`packages/contracts/contracts.sha256`), et les quinze fiches de rôle sont
générées depuis `docs/agents.json`.

**Reste.** `glossaire-enums.spec.ts` (`GOV-006`) n'existe pas : tant qu'il manque, `docs/GLOSSAIRE.md`
est une consigne et non un contrôle, alors que `docs/PRESEANCE.md` §2 lui donne la primauté sur les
termes. `deploy:verify` (`GOV-012`, `partners/ADR-0006`) manque toujours, et le Pas 7 de
`docs/PROTOCOLE-FUSION.md` porte donc un repli daté. Six des huit étiquettes de chantier de
`docs/INVENTAIRE-CHANTIERS.md` n'ont aucun référent dans ce dépôt, et l'écart entre les trois
comptes d'événements (5, 7, 11) est consigné dans `partners/ADR-0008` plutôt que résolu.

**Appris.** Une garde ne juge pas forcément ce que son propre lot écrit : `gov:trace` écartait les
tâches non livrées, or les huit du lot étaient `a_faire` — les 33 entrées `tests{}` que le lot
écrivait n'étaient confrontées au disque par aucune garde, et une promesse inventée est passée dans
la tâche même qui livre la garde censée l'attraper. Le critère juste n'est pas le statut de la tâche
mais l'existence du fichier, et il a fallu élargir deux choses : le contrôle, puis la résolution des
titres — un contrôle élargi dont la source ne l'est pas ne contrôle rien.

### PR #27 — 2026-09-03 — chore(GOV-012): cloture du lot L-1-01, `partners/ADR-0007` sur la branche de lot, LF partout

**Fait.** Le lot `L-1-01` est clos : ses sept tâches de gouvernance passent `fusionnee`.
`partners/ADR-0007` arrête les deux formes de branche (`lot/<id>-<suffixe>` en forme normale,
`t/<slug>` en dérogation) et `tasks.schema.json` les accepte toutes deux. `.gitattributes` force le
LF dans l'arbre de travail, pas seulement dans l'index. `pnpm lot:integrer` refuse de recopier un
fichier partagé et dit ce que le livrable aurait effacé.

**Reste.** `docs/PROTOCOLE-FUSION.md` et le script `deploy:verify` (REQ-GOV-014, GOV-012) n'existent
toujours pas : tant qu'ils manquent, la sérialisation des fusions tient par la discipline du
`release-manager` — c'est-à-dire par rien qui rougisse (`partners/ADR-0006`, « Reste à faire »).
Les quatre revues passent par le compte de Will, faute d'un second compte GitHub (`W13`).

**Appris.** Un `OK` qui n'a pas lu un code de sortie n'est pas un verdict : le premier passage de
Gate A a été lancé en `pnpm <cible> | tail -6` sous `set -e` ; le code de sortie d'un tube est celui
de `tail`, donc zéro, et la boucle a imprimé `GATE A LOCAL: OK` sur trois gates rouges. La seconde
boucle lit `$?` de chaque commande. Et `gov:pr` exigeait des revues `APPROVED` que GitHub refuse à
l'auteur d'une PR sur un dépôt à un seul compte : la garde était insatisfiable, donc désarmée.

… 1 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

