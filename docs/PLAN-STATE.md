# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `055590b` — 2026-09-29T01:17:40+02:00 |
| Qu’est-ce qui est en vol ? | 1. #199 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T07 (A05) · SEC-05 (A01) · GOV-040 (A01) · GOV-049 (A01) · GOV-052 (A01) · GOV-064 (A01) · GOV-069 (A01) · GOV-071 (A01) · GOV-104 (A01) |
| Où en est la phase ? | phase 0 — 76/118 tâches, reste 35.85 j |
| Le prochain pas | QA-T07 — Gate sécurité : semgrep |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #200 — 2026-09-28 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

76/118 tâches terminées · reste 35.85 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 175 | QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04 … (12 affichées sur 175 — liste complète : `docs/TASKS.md`) |
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
| 1 | #199 — chore(GOV-012): registre rattrape, huit taches livrees par trois PR passent fusionnee, quatre suites versees | `t/registre-rattrapage-7` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| SEC-05 — Couche d'accès `forApporteur | A01 | #198 | `a_faire` |
| GOV-040 — Le registre d'exemptions n'a AUCUNE des deux surfaces qui arment une machine | A01 | #189 | `a_faire` |
| GOV-049 — Une tache en cours sans lot est invisible de TOUTES les gardes, et c'est ce lot qui l'a rencontre | A01 | #196 | `a_faire` |
| GOV-052 — L'entree de journal d'une PR n'est exigee qu'APRES sa fusion : la seule victime possible est main | A01 | #191 | `a_faire` |
| GOV-064 — Deux chemins suivis distincts peuvent se confondre dans la source unique du perimetre | A01 | #194 | `a_faire` |
| GOV-069 — La garde des termes interdits decoupe SQL, Prisma et prose avec une grammaire maison incomplete | A01 | #197 | `a_faire` |
| GOV-071 — Les gardes lexicale et d'identifiants ne decoupent pas les mots comme le rendu les affiche | A01 | #192 | `a_faire` |
| GOV-104 — La cloture d'une tache seule lit sa declaration dans un corps de PR reecrivable apres la fusion, et juge l'atterrissage sur la base de la PR | A01 | #186 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-29 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T07** — Gate sécurité : semgrep (1 j) : 18 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `055590b` (2026-09-29T01:17:40+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #200 — 2026-09-28 — feat(SEC-05): lot L0-12 — cloisonnement par apporteur, une grammaire des zones de prose, une tache en cours appartient a un lot

**Fait.** Trois tâches, un commit chacune. SEC-05 : la couche d'accès `forApporteur` injecte
l'apporteur de la session dans chaque `where`, que l'appelant peut restreindre sans jamais le
remplacer ; elle refuse d'écrire l'identifiant, l'apporteur et les relations, et répond à un
identifiant étranger exactement comme à un identifiant inexistant (404 identique à l'octet). Une
garde statique confronte chaque route et action de l'espace à ses cas d'accès. GOV-069 : une seule
grammaire découpe SQL, Prisma et prose pour la garde des termes interdits, et une construction jamais
refermée est refusée en la nommant. GOV-049 : une tâche `en_cours` porte un lot, ou la preuve
d'une livraison seule ; aucune forme de nom de branche n'en exempte.

**Reste.** Aucune route de l'espace ne reçoit encore d'identifiant de ressource : l'attaque boîte
noire est jouée sur chaque méthode de la couche, et attend les écrans. « Même durée observable » est
prouvée par la structure (une requête au texte identique), pas par une mesure de temps. GOV-069
approche la continuation paresseuse des citations et les blocs HTML.

**Appris.** Une garde de cloisonnement se prouve par ses brèches : sans la couche, la batterie en
relève sept par modèle ; avec elle, zéro, et la ligne de l'apporteur reste lisible et modifiable.

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

### PR #188 — 2026-09-28 — fix(GOV-104): la cloture lit la declaration dans le commit de fusion et juge l'atterrissage sur la branche par defaut

**Fait.** Les deux dettes de la lentille `securite` sur la PR #182, que Will a décidé de corriger
(W18). La déclaration d'une livraison, titre et ligne `Lot:`, se lit dans le message du commit
d'écrasement, immuable, et plus dans le corps de la PR, réécrivable après la fusion. Le pas 6 y
recopie `Lot:` par `gh pr merge --body`. L'atterrissage se juge sur la branche par défaut du dépôt
de la tâche, lue sur la forge. Le mode `--lot` refuse lui aussi une branche hors motif. W17 et W18
entrent au registre des décisions, et la charte cite `RACINES_DE_LA_GARDE_DES_REVUES` au lieu de
recopier leur nombre. L'instant des témoins qui lisent le registre réel a une seule définition.

**Reste.** Les fusions antérieures au pas 6 ne portent pas `Lot:` dans leur commit : leurs tâches
secondaires ne se clôturent plus par `--tache`, et c'est voulu (échec fermé). Sur les vingt-cinq
tâches secondaires de ces fusions, vingt-quatre sont closes, huit d'entre elles par la PR #187 ; la
dernière, GOV-074 (#168), n'était livrée qu'en partie et entre dans le lot L0-11.

**Appris.** Cette branche a dû être reconstruite depuis `main` : elle portait les commits d'une PR
fusionnée par écrasement, et la fusion de `main` n'a plus su réconcilier cinq fichiers. Une branche
construite sur une autre branche de PR se reconstruit ; elle ne se fusionne pas.

… 3 entrée(s) affichée(s) sur 82 ; les 79 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

