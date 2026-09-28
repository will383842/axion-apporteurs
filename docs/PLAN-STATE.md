# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `20a4c9f` — 2026-09-28T23:32:53+02:00 |
| Qu’est-ce qui est en vol ? | 1. #188 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T07 (A05) · GOV-040 (A01) · GOV-052 (A01) · GOV-064 (A01) · GOV-071 (A01) · GOV-074 (A01) · GOV-085 (A01) |
| Où en est la phase ? | phase 0 — 76/117 tâches, reste 34.85 j |
| Le prochain pas | QA-T07 — Gate sécurité : semgrep |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #195 — 2026-09-28 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

76/117 tâches terminées · reste 34.85 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 174 | QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04 … (12 affichées sur 174 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 115 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 115 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → ~~SEC-17~~ (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **11.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend sont codables dans `docs/DECISIONS.md` — tranchées, ou portées par une hypothèse par défaut.

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #188 — fix(GOV-104): la cloture lit la declaration dans le commit de fusion et juge l'atterrissage sur la branche par defaut | `t/gov-104b` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-040 — Le registre d'exemptions n'a AUCUNE des deux surfaces qui arment une machine | A01 | #189 | `a_faire` |
| GOV-052 — L'entree de journal d'une PR n'est exigee qu'APRES sa fusion : la seule victime possible est main | A01 | #191 | `a_faire` |
| GOV-064 — Deux chemins suivis distincts peuvent se confondre dans la source unique du perimetre | A01 | #194 | `a_faire` |
| GOV-071 — Les gardes lexicale et d'identifiants ne decoupent pas les mots comme le rendu les affiche | A01 | #192 | `a_faire` |
| GOV-074 — Les exemptions de la garde des attributions se rangent par site, pas par occurrence | A01 | #190 | `a_faire` |
| GOV-085 — Le geste que le rouge prescrit eteint le rouge en rendant vraie l'attribution qu'il denonce | A01 | #193 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0007-la-branche-porte-le-lot-pas-la-tache.md` — partners/ADR-0007 — La branche porte le LOT, la tâche porte le COMMIT

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T07** — Gate sécurité : semgrep (1 j) : 17 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `20a4c9f` (2026-09-28T23:32:53+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #195 — 2026-09-28 — chore(GOV-052): lot L0-11 — six gardes de gouvernance qui laissaient passer ce qu'elles devaient voir

**Fait.** Six tâches, un commit chacune. GOV-052 : `gov:pr --pr` exige l'entrée de journal AVANT
la fusion, et refuse une entrée pour une PR non fusionnée ; RM-15 la pose. GOV-040 : le registre
qui peut absoudre un rouge de la porte A passe sous `deny`. GOV-074 : une seule clé d'occurrence
pour les trois registres de `gov:attributions`. GOV-071 : les gardes lexicale et d'identifiants
jugent le texte rendu, par une seule fonction. GOV-085 : un rendu n'officialise plus une
attribution fausse ; la source et la vue sont deux questions. GOV-064 : deux entrées distinctes de
l'index ne se confondent plus sous un même chemin.

**Reste.** GOV-052 ne s'évalue que sous `--pr` : l'événement `pull_request` de la CI ne la joue pas.
GOV-040 ne ferme que Write et Edit, pas l'écriture par le shell. GOV-071 laisse passer une balise
à attributs et la concaténation de chaînes, limites écrites dans le code. GOV-064 refuse désormais
un nom de fichier légitime qui n'est pas de l'UTF-8.

**Appris.** Les six tâches ont été écrites en parallèle par des agents, coupés par une limite
d'usage puis repris : chaque commit a été rejoué sur `main` par son seul diff propre, et les vues
rendues une fois, à la fin. Un `git add -A` d'urgence avait embarqué des vues dans chaque branche.

### PR #187 — 2026-09-28 — chore(GOV-012): registre rattrape, douze taches livrees par quatre PR fusionnees passent fusionnee

**Fait.** Sixième rattrapage du registre, et le premier par le chemin outillé de GOV-057 :
`pnpm lot:cloture -- --tache <id> --pr <n> --owner <Axx>`, une fois par tâche. Douze tâches livrées
passaient encore `a_faire` : les six de la PR #114 (lot L0-02), les quatre de la PR #175 (lot
L0-09), GOV-057 (#182) et GOV-103 (#185). Chaque tâche a été confrontée par l'outil à la
déclaration de sa PR — titre ou ligne `Lot:` — avant toute écriture. Le SHA, l'instant et la
branche viennent de la forge, et l'atterrissage est l'ascendance du SHA sur la base. Le
propriétaire posé est celui de la ligne `Auteur:` de chaque PR, quand la tâche n'en portait pas.
Phase 0 : 64/117 → 76/117, reste 42,60 j → 34,35 j.

**Reste.** Les six tâches de #114 n'étaient closables qu'une fois le motif de `branch` élargi
(#185) : leur branche est `t/lot-L0-02`. Et ce rattrapage lit encore la déclaration dans le corps
des PR : GOV-104 la lira dans le message du commit de fusion, et ces anciennes fusions n'y portent
pas `Lot:`. C'est pourquoi ce rattrapage passe avant GOV-104.

**Appris.** Le composeur proposait cinq de ces douze tâches pour le lot suivant : un registre en
retard ne coûte pas un compteur faux, il fait refaire du travail livré.

### PR #185 — 2026-09-28 — feat(GOV-103): la forme t/ du motif de branch admet les majuscules

**Fait.** Décision de Will du 2026-09-28 : la forme `t/` du motif de `branch` admet les majuscules,
comme la forme `lot/`. La PR #114 avait été fusionnée depuis `t/lot-L0-02`, et ses six tâches ne
pouvaient pas être closes. Le motif reste fermé : la lentille `securite` l'a mesuré sur 23 cas par
la vraie garde. Amendement daté de `partners/ADR-0007` ; tâche versée par `verser-tache.mjs`.

**Reste.** La décision n'a pas encore sa ligne dans `docs/DECISIONS.md` (W17) : elle est portée par
GOV-104. Deux dettes antérieures notées par la lentille `securite` : le motif admet `..`, et deux
branches peuvent ne différer que par la casse.

**Appris.** Une branche réelle de la forge refusée par le registre ne se corrige pas en réécrivant
la branche : le champ deviendrait décoratif. C'est le motif qui suit la réalité, par décision.

… 3 entrée(s) affichée(s) sur 80 ; les 77 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

