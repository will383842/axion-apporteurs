# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `fa90f83` — 2026-09-29T16:41:40+02:00 |
| Qu’est-ce qui est en vol ? | 1. #237 (un contrôle requis rouge ou une revue manquante) · 2. #239 (un contrôle requis rouge ou une revue manquante) · 3. #241 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T05 (A01) · JUR-T04 (A01) · GOV-066 (A01) · GOV-122 (A01) · GOV-118 (A01) · GOV-119 (A01) · GOV-121 (A01) · JUR-T34 (A01) |
| Où en est la phase ? | phase 0 — 95/136 tâches, reste 32.75 j |
| Le prochain pas | QA-T05 — Pipeline GHCR privé → Coolify pull |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #235 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

95/136 tâches terminées · reste 32.75 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 175 | QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05 … (12 affichées sur 175 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 134 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 134 — liste complète : `docs/TASKS.md`) |
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
| 1 | #237 — feat(INT-T26): la candidature recue cree un apporteur candidat, coordonnees tirees et chiffrees, rattachement par empreinte | `t/int-t26` | un contrôle requis rouge ou une revue manquante |
| 2 | #239 — chore(GOV-012): registre rattrape, sept taches closes, gel de la gouvernance, avenants JUR-T03 et INT-T27-A | `t/registre-rattrapage-11` | un contrôle requis rouge ou une revue manquante |
| 3 | #241 — fix(GOV-062): l'outillage qui execute la porte A est juge, sept points nommes | `t/gov-062` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T05 — Pipeline GHCR privé → Coolify pull | A01 | #222 | `a_faire` |
| JUR-T04 — Registre RGPD, LIA, AIPD, mention art. 14, politique de confidentialité | A01 | #232 | `a_faire` |
| GOV-066 — La garde d'entite juge l'index publie, pas tout ce que la forge sert du depot | A01 | #234 | `a_faire` |
| GOV-122 — La cloture retient un renommage fait dans la seconde meme de la fusion, et une date illisible y devient NaN au lieu d'un refus | A01 | #224 | `a_faire` |
| GOV-118 — La garde des attributions reconnait un gabarit a son nom, et reste verte si elle ne confronte aucun script de garde | A01 | #229 | `a_faire` |
| GOV-119 — La porte A d'une PR rougit quand une AUTRE PR fusionne pendant son execution | A01 | #223 | `a_faire` |
| GOV-121 — Le temoin de la preuve de vol ne joue que la cle absente, jamais owner ou branch a null, la forme reelle du registre | A01 | #227 | `a_faire` |
| JUR-T34 — La politique de confidentialite de l'espace : affichee, acceptee a la premiere connexion, tiree du registre de l'article 30 | A01 | #238 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T05** — Pipeline GHCR privé → Coolify pull (1 j) : 21 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `fa90f83` (2026-09-29T16:41:40+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #235 — 2026-09-29 — fix(GOV-066): la garde d'entite juge chaque commit de la PR, pas seulement la tete, et ecrit ce qu'elle ne lit pas

**Fait.** La garde des coordonnées ne juge plus seulement la tête : chaque commit poussé par la PR
est lu, fichier ajouté ou modifié par commit, tel qu'il était. Une coordonnée ajoutée puis retirée
avant la porte A est nommée avec son commit. Ce qu'elle ne lit pas est écrit et imprimé.

**Reste.** L'historique déjà fusionné n'est pas relu : chaque commit y a été jugé par sa PR, à
partir de celle-ci. Les archives composées avec les attributs d'export ne sont pas lues.

**Appris.** Sur un dépôt public, la tête n'est pas ce qui est publié : chaque commit d'une PR l'est,
même écrasé à la fusion.

### PR #233 — 2026-09-29 — feat(JUR-T04): registre de l'article 30 et AIPD, sources et derives du schema, la page de confidentialite scindee

**Fait.** Le registre de l'article 30 décrit trois traitements, chaque rubrique rattachée à sa source
ou déclarée à compléter avec sa question ; ses données stockées se dérivent du schéma dans les deux
sens. L'AIPD est posée, non signée. La page de confidentialité passe à JUR-T34, versée ici.

**Reste.** Les réponses juridiques, toutes rendues à Will : durées, sous-traitants, localisations,
et les huit questions du chantier des conseillers salariés, écrites sans créer leur traitement.

**Appris.** La garde dérivée du schéma a vu seule la table arrivée entre la rédaction et la PR : un
registre qui se confronte au schéma ne vieillit pas en silence.

### PR #231 — 2026-09-29 — fix(GOV-118): un gabarit qui existe est un chemin reel, zero script de garde confronte est un refus

**Fait.** La garde des attributions ne reconnaît plus un gabarit à sa seule forme : un chemin qui
existe dans les fichiers suivis, comme fichier ou comme dossier, est un chemin réel. Une liste de
scripts de garde lue et vide est un refus, et le périmètre de la famille est écrit.

**Reste.** Rien sur ces trois points.

**Appris.** Distinguer une dimension non lue d'une dimension lue et vide coûte une valeur de plus,
`undefined` à côté de `[]` ; sans elle, le plancher aurait fait rougir tous les cas de preuve.

… 3 entrée(s) affichée(s) sur 100 ; les 97 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

