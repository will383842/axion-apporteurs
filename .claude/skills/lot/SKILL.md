---
name: lot
description: Exécute un lot de tâches d'Axion Partners de bout en bout — compose le lot depuis docs/tasks.json, lance le workflow (développement, revue à trois lentilles, mutation prouvée, fusion sérialisée), puis clôture en écrivant les statuts. À invoquer avec /lot [phase] [repo]. C'est le point d'entrée UNIQUE d'une session d'autopilote.
---

# /lot — une session, un lot

> Une session Claude Code = **un seul lot**. Jamais deux. Si le lot se termine tôt, on s'arrête :
> le facteur limitant n'est pas la machine, c'est la file de fusion et la relecture.

## 0. Amorçage — la seule session qui ne compose pas de lot

Tout le reste de cette compétence lit `docs/tasks.json`. Ce fichier n'existe qu'après **GOV-017**, qui
dépend de GOV-001 / GOV-005 / GOV-011, eux-mêmes après **GOV-000** — et le dépôt, la CI, le
`package.json` et cette compétence *sont* GOV-000. La toute première session mourrait sur
`ENOENT: docs/tasks.json` avant d'avoir rien fait.

Si `docs/tasks.json` est absent : **ne pas appeler le composeur**. Exécuter à la main, dans cet ordre,
depuis la liste écrite de `TASKS.md` phase −1 : **GOV-000**, puis GOV-001, GOV-005, GOV-011, GOV-017.
Le composeur ne prend la main qu'à partir du lot suivant.

GOV-000 **amorce** `docs/tasks.json` avec les 27 tâches de phase −1 au statut `a_faire`, et
GOV-017 crée les issues (`pnpm gov:issues --sync`) : sans ces deux gestes, aucun outillage n'atteint
la suite.

## 1. Avant de composer — l'état

```bash
pnpm plan-state:build
git diff --quiet docs/PLAN-STATE.md || echo "PLAN-STATE était périmé — il vient d'être régénéré"
```

Puis **lire, dans cet ordre** : `docs/PLAN-STATE.md` · `docs/REGLES-MAISON.md` · `docs/DECISIONS.md`
(les décisions ouvertes du §1 et les hypothèses posées du §2) · le §7 du plan directeur (gate de la
phase courante).

⚠️ `PLAN-STATE.md` est **dérivé**. Ne jamais l'éditer à la main — `.claude/settings.json` l'interdit.
Il est la **vue régénérée** des statuts de `docs/tasks.json` et des PR GitHub.

## 2. Composer

```bash
pnpm lot:composer -- --phase -1 --repo partners --max 8 --now <ISO du jour>
```

- Le `--` de pnpm est **obligatoire** : sans lui, pnpm avale les options.
- `--phase` s'écrit avec un **tiret ASCII** (`-1`), jamais le « − » (U+2212) des titres de section :
  le composeur refuse désormais une phase non entière plutôt que de rendre une liste vide.
- `--now` est fourni par toi : le composeur ne lit pas l'horloge (il doit être rejouable).
- **Aucune tâche éligible** → le composeur imprime les raisons (dépendance, décision sans hypothèse,
  décision bloquante du §1, attente externe, maquette non validée par Will). Les remonter à Will
  telles quelles, **et s'arrêter**. Ne jamais « prendre une tâche d'une autre phase pour avancer ».
- Le composeur a déjà fait le **balayage** : tâches abandonnées depuis plus de 6 h remises à `a_faire`,
  `git worktree prune`.

## 3. Revendiquer

Pour chaque tâche `t` du lot — son numéro d'issue est dans le champ `t.issue` du `lot.json` :

```bash
gh issue edit ${t.issue} --add-label en_cours --add-label "owner:<Axx>"
```

Si `t.issue` est `null`, la tâche n'a pas d'issue : **ne pas en inventer une**, lancer
`pnpm gov:issues --sync` (qui crée l'issue et écrit son numéro dans `docs/tasks.json`), puis recomposer.

La revendication **expire** sans commit ni PR depuis 6 h. Deux tentatives sans livrable → `bloquee`.

## 4. Exécuter

Lis `docs/lots/L<phase>-<seq>/lot.json` et passe son **CONTENU JSON**, pas son chemin :

```
Workflow({ scriptPath: 'scripts/lot/lot.workflow.js', args: { lot: <l'objet JSON lu>, now: '<ISO du jour>' } })
```

Un script de workflow **n'a aucun accès au système de fichiers** : s'il reçoit la chaîne du chemin,
il meurt sur `lot.taches is undefined` à la première ligne (le script le refuse explicitement).

`now` est fourni par toi : le script ne peut pas lire l'heure (il doit être rejouable).
En cas d'interruption : relancer avec `resumeFromRunId` — les agents terminés sont rejoués depuis le cache.

Le workflow enchaîne, par tâche et en parallèle : développement en worktree isolé (test rouge d'abord) →
trois lentilles de relecture (veto sécurité sur les tâches sensibles, **quatrième lentille bloquante de
l'architecte sur une tâche `schema`**) → vérificateur « vu rougir » → **fusion sérialisée**, une PR à la
fois, atterrissage vérifié avant la suivante.

## 5. Clôturer — c'est toi, pas le workflow

**Les statuts vivent dans `docs/tasks.json`.** Un label d'issue est une vue ; si tu ne mets à jour que
les labels, le composeur recompose éternellement le même lot et PLAN-STATE affiche « 0/25 » à vie.

Écris d'abord le rendu JSON du workflow (`{ lotId, resultats, stops, manques, arret }`) **tel quel**
dans `docs/lots/<lotId>/resultat.json`, puis :

```bash
pnpm lot:cloture -- --lot <lotId> --owner <Axx> --commit
```

`lot:cloture` lit ce rendu, écrit les champs dans `docs/tasks.json` et commite. Une tâche
n'est `fusionnee` que si sa PR a **atterri** (`fusion.atterri === true`) ; sinon elle repart `a_faire`
avec `attempts++`, ou `bloquee` avec le motif du lead.

Puis, pour chaque résultat, la vue côté GitHub :

```bash
gh issue edit ${t.issue} --remove-label en_cours --add-label fusionnee   # ou bloquee, motif en commentaire
gh issue comment ${t.issue} --body "<le bloc ## RENDU de l'agent>"
```

Le bloc `## RENDU` est posté **en commentaire de l'issue**, pas dans PLAN-STATE (qui est dérivé et
interdit d'écriture).

Les `manques[]` du critique de complétude deviennent des issues `gh issue create --label proposee`
(elles n'entrent dans `tasks.json` qu'après arbitrage du gardien du spec).

Puis : `pnpm plan-state:build` et commit de `docs/PLAN-STATE.md` sur `main` via une PR (au moins à chaque
clôture de phase).

## 6. Si le workflow rend un `arret`

Ne pas contourner. Envoyer à Will, par `PushNotification`, la liste des `stops` avec leur motif.
La liste est **fermée** — le schéma du workflow refuse tout autre motif :

| Motif | Ce que ça veut dire |
|---|---|
| `decision_sans_hypothese` | Une décision **W1/W3/W4/W6/W9/W11** (ou marquée « avenant ») est devenue nécessaire |
| `req_non_testable` | L'exigence doit revenir en spécification, elle ne se prouve pas |
| `dependance_externe_sans_repli` | DocuSeal, API gouv, banque, Coolify indisponible sans mode dégradé |
| `constat_critique` | Un audit a trouvé un défaut critique |
| `gate_phase_x2` | Une gate de phase a échoué deux fois |
| `readyz_503_prod` / `ecart_reconciliation` | Production : **accusé humain avant tout retour arrière** |

## Ce que cette compétence ne fait jamais

- Coder à la place d'un agent, ou fusionner à la place du release manager.
- Trancher une décision de Will ou de l'expert-comptable. **Il n'y a pas d'avocat sur le projet** : une
  question juridique se rend en `stop` à Will, elle ne s'arbitre pas et ne s'attend pas d'un tiers.
- Toucher `main` d'axionia : les tâches `[axionia]` suivent `docs/runbooks/fusion-axionia.md`, dans un
  créneau annoncé aux autres sessions.
