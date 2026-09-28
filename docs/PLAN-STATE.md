# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `fc8775e` — 2026-09-28T21:33:43+02:00 |
| Qu’est-ce qui est en vol ? | 1. #187 (un contrôle requis rouge ou une revue manquante) · 2. #82 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) · GOV-057 (A01) · GOV-103 (A01) |
| Où en est la phase ? | phase 0 — 64/117 tâches, reste 43.10 j |
| Le prochain pas | QA-T07 — Gate sécurité : semgrep |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #185 — 2026-09-28 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

64/117 tâches terminées · reste 43.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 186 | QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04 … (12 affichées sur 186 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 103 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 103 — liste complète : `docs/TASKS.md`) |
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
| 1 | #187 — chore(GOV-012): registre rattrape, douze taches livrees par quatre PR fusionnees passent fusionnee | `t/registre-rattrapage-6` | un contrôle requis rouge ou une revue manquante |
| 2 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-057 — Le pas 8 du protocole de fusion ne sait pas clore une tache livree seule, hors de tout lot | A01 | #183 | `a_faire` |
| GOV-103 — Le motif de branch refuse une branche reelle de la forge, et six taches livrees ne peuvent pas etre closes | A01 | #184 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-28 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T07** — Gate sécurité : semgrep (1 j) : 25 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `fc8775e` (2026-09-28T21:33:43+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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

### PR #182 — 2026-09-28 — fix(GOV-057): lot:cloture --tache clot une tache livree seule, sans inventer de lot

**Fait.** `pnpm lot:cloture -- --tache <id> --pr <n>` clôt une tâche livrée hors de tout lot : le
SHA, l'instant et la branche sont lus sur la forge, `branch` est posée, `t.lot` n'est jamais touché.
Neuf refus nommés avant toute écriture, dont `tache_etrangere_a_la_pr`, trouvé par la lentille
`securite` : sans lui, n'importe quelle PR fusionnée s'attachait à n'importe quelle tâche. La pose
de `fusionnee` est extraite dans `poserLaLivraison()`, partagée avec le mode `--lot`. `cloture.ts`
entre dans la garde des revues, comme `gov-tasks.ts` pour GOV-093.

**Reste.** Deux dettes de sécurité, que Will a demandé de corriger : la déclaration est lue dans
le corps de la PR, modifiable après la fusion, et l'atterrissage est jugé sur `baseRefName`. Elles
sont portées par GOV-104. Cette entrée est écrite après la fusion, dans la PR #185 : la PR #182 a
été fusionnée sans elle, et `gov:etat` l'a nommé (`pr_fusionnee_sans_journal`).

**Appris.** Un témoin qui choisit « la première tâche à faire » dépend de l'état du registre : la
fusion de #181 a changé cette première tâche, et il en a pris une déjà revendiquée. Le critère de
choix doit dire tout ce que le témoin suppose.

### PR #181 — 2026-09-28 — chore(GOV-012): registre rattrape, cinq taches livrees par deux PR fusionnees passent fusionnee

**Fait.** Cinq tâches livrées par deux PR fusionnées et atterries passaient encore `a_faire` :
SEC-17 et JUR-T26 (#165, lot L0-07), JUR-T02, JUR-T27 et INT-T14 (#180, lot L0-10). Elles passent
`fusionnee` par `pnpm lot:cloture`, seul écrivain de `statut`, `pr`, `branch` et `owner`, avec leurs
cinq attestations `{pr, sha, fusionneeAt}` écrites par l'outil. Le périmètre de chaque lot est
dérivé de deux faits publics de sa PR — la tâche de son titre et la ligne `Lot:` de son corps, le
lecteur de `tachesDeLaPr` (GOV-096) — et l'atterrissage des deux SHA est confronté à
`git merge-base --is-ancestor <sha> origin/main` avant toute écriture. Phase 0 : 59/116 → 64/116,
reste 45,35 j → 42,10 j. Les sept vues sont régénérées dans l'ordre, `plan-state:build` en dernier.

**Reste.** Les cinq tâches portent `issue: null` : `lot:cloture` ne lit pas l'issue de revendication,
là où `reclasser.mjs --revendiquer` l'inscrit. Le schéma ne l'exige pour aucun statut et `gov:tasks`
est vert ; c'est une donnée de traçabilité absente, pas un état invalide. Et surtout : `docs/lots/`
reste hors suivi, donc la même perte se reproduira au prochain changement de machine. GOV-057 (lot
L0-11) porte la moitié de ce sujet ; la voie — versionner le périmètre, ou faire lire la ligne `Lot:`
par `cloture` — appartient à A01 et n'est pas tranchée ici.

**Appris.** Le pas 8 du protocole n'était pas oublié : il était **inexécutable**, et silencieusement.
Il prescrit `lot:cloture --lot <id>`, qui exige `docs/lots/<id>/lot.json` ; ce fichier est en
`.gitignore`, donc il vit sur le disque de la machine qui a composé le lot — et cette machine a
changé. Une commande qu'on ne peut pas lancer ne rougit pas : elle ne se lance pas, et rien ne le
dit. La conséquence n'était pas le compteur, qui n'est qu'un affichage, mais le COMPOSEUR : il
voyait les cinq tâches éligibles et aurait recomposé un lot déjà livré — la pathologie même que
l'en-tête de `cloture.ts` dit avoir fermée. Une garde qui protège d'un défaut peut être rendue
inopérante par une condition d'exécution qu'elle ne mesure pas elle-même. L'attaque jouée dans la PR
montre l'autre face, rassurante : avec une attestation entièrement VRAIE mais une appartenance
fausse, `controlerLePerimetre` refuse, nomme `tache_etrangere_au_lot`, et `docs/tasks.json` reste
octet pour octet identique — GOV-041 tient.

… 3 entrée(s) affichée(s) sur 78 ; les 75 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

