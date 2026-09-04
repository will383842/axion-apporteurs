# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `ff3ef54` — 2026-09-03T23:11:58+02:00 |
| Qu’est-ce qui est en vol ? | aucune PR ouverte |
| Qui tient quoi ? | GOV-018 (A01) · GOV-008 (A01) · GOV-010 (A01) · GOV-011 (A01) · GOV-012 (A01) · INT-T01a (A01) · GOV-020 (A01) · GOV-023 (A01) |
| Où en est la phase ? | phase -1 — 12/26 tâches, reste 7.00 j |
| Le prochain pas | GOV-012 — Protocole de fusion, release manager, protection de main (chemin critique) |
| Ce qui bloque | 3 tâche(s) bloquée(s) ou en attente externe · 9 question(s) pour Will |
| Dernière entrée de journal | PR #27 — 2026-09-03 |

**Ce qu’on tape maintenant.** `pnpm lot:composer` pour composer le lot suivant, puis revendiquer ses tâches par `gh issue edit`. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

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

Aucune PR ouverte. **Une fusion à la fois** (RM-09) : la file se réserve avant `gh pr update-branch`, jamais après.

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

- partners/ADR-0001 — La pile technique — `docs/adr/0001-pile-technique.md`
- partners/ADR-0002 — La frontière avec axionia, les sources de vérité, le mono-tenant — `docs/adr/0002-frontiere-axionia-sources-de-verite-mono-tenant.md`
- partners/ADR-0003 — La grille publiée et la grille par contrat — `docs/adr/0003-grille-publiee-et-grille-par-contrat.md`
- partners/ADR-0004 — Authentification et rôles : le défaut est le refus — `docs/adr/0004-authentification-et-roles.md`
- partners/ADR-0005 — La gouvernance : ce qui est source, ce qui est vue, qui écrit quoi — `docs/adr/0005-gouvernance-source-vue-et-ecrivains.md`
- partners/ADR-0006 — La fusion : file sérialisée, une PR à la fois, atterrissage vérifié — `docs/adr/0006-fusion-serialisee-et-atterrissage-verifie.md`
- partners/ADR-0007 — La branche porte le LOT, la tâche porte le COMMIT — `docs/adr/0007-la-branche-porte-le-lot-pas-la-tache.md`

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-03). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

1. **GOV-012** — Protocole de fusion, release manager, protection de main (0.5 j, **sur le chemin critique**) : 9 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `ff3ef54` (2026-09-03T23:11:58+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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

### PR #26 — 2026-09-03 — feat(GOV-007): lot L-1-01 — sept taches de gouvernance, quatre gardes armees

**Fait.** Les sept tâches du lot `L-1-01` sont intégrées. Le dépôt passe de cinq gardes armées à
neuf, de 13 tests à 83, et de 12 étapes de Gate A à 23. Chaque garde ajoutée porte sa preuve rouge :
un témoin par famille, vu rougir, et des contre-témoins qui restent verts.

**Reste.** `docs/tasks.json` n'est pas touché : `GOV-017b` **propose** les `paths[]`
(`docs/paths-proposes.json`), il n'adopte pas. Deux `stop` sont rendus plutôt que devinés — les
bandeaux « fonctionnement §3.2 » et « fonctionnement R5 » de `GOV-002` ne résolvent nulle part dans
ce dépôt public.

**Appris.** Sept des huit défauts bloquants restants étaient des **affirmations fausses sur l'état du
dépôt**, pas des bugs : un ADR nommait `gov:requirements` comme générateur de `REQUIREMENTS.md` alors
que ce script n'importe que `readFileSync`/`existsSync` ; `GATES.md` annonçait « trois familles au
plus » là où les deux boucles indépendantes de `gates-prouvees.ts` en autorisent quatre. Vérifier
chemin:ligne avant de corriger a coûté moins cher que corriger d'après le texte.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

