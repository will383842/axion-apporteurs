# Conventions — Axion Partners

> Livré par **GOV-014** (REQ-GOV-018, REQ-GOV-029). Version normative des conventions du plan directeur §4, corrigées
> par la synthèse des juges (A5). Ce fichier **prévaut** sur le §4 du plan en cas d'écart : le plan cite, ce fichier
> fixe. Gates : lint et format bloquants dès le socle (Gate A) ; `gov:tasks`, `gov:pr`, `gov:autonomie`.

## 1. Langue

- Docs, commentaires, messages de commit, messages d'erreur, ADR, micro-copy : **français**.
- Identifiants de code en **français camelCase** : colonnes, champs de payload, fonctions, enums. Suffixes obligatoires :
  `…Cents` pour tout montant (`Int`), `…At` pour tout horodatage (`timestamptz`). Exemples : `montantHtCents`,
  `confirmeeAt`, `fenetreFinAt`, `deposeeAt`.
- **Aucun « identifiant technique anglais admis »** (la formule du plan v2 est retirée). L'anglais est réservé aux
  noms imposés par un tiers (`pain.001`, `EndToEndId`, `IBAN`, champs d'API externe) et aux mots-clés du langage.
- Postgres en snake_case par `@map` / `@@map` ; le code ne voit jamais le snake_case.
- Vocabulaire : « apporteur d'affaires », jamais « commercial » ; lexique interdit linté (REQ-GOV-017, REQ-UX-003) :
  objectif, quota de vente, classement, top N, challenge, obligatoire, vous devez, commercial(e/aux). Exception unique :
  `src/content/keywords/**` d'axionia et une phrase de désambiguïsation (ordre de Will).

## 2. États et vocabulaire

- Toute colonne `statut|status|etat|type|motif|resultat|origine|kind|palier|priorite` est un **enum Prisma** ; chaque
  valeur est dans `docs/GLOSSAIRE.md` (RM-04).
- `ETATS_OCCUPANTS = {provisoire, active, rdv_pris, proposition, signee, convertie, figee_resiliation}` — constante
  **dérivée de REQ-DM-003**, définie une fois dans `src/domain/attribution/etats.ts`, projetée en SQL par le script de
  migration ; **jamais recopiée** (aucune liste littérale d'états ailleurs, `gov:check` rougit).
- Machines à états typées : matrice `from × événement → to` ; transition absente = erreur typée, rien n'est écrit.
- Fonctions d'affichage exhaustives (`switch … never`), jamais de `default` muet.

## 3. Argent et temps

- Montants en **centimes entiers** `Int …Cents`, HT ; jamais `Float`/`Decimal` ; `montant ≠ 0` en CHECK.
- Arrondi par **méthode du cumul** (le solde absorbe le reliquat) ; Σ des parts = total, en propriété.
- `src/domain/**` pur : aucune I/O, aucun `new Date()` — horloge injectée par le module `temps` (stockage UTC, métier
  Europe/Paris, fériés FR versionnés).
- Seuils et durées : SSOT unique avec source et date (RM-10) ; aucun littéral.

## 4. Sécurité

- Rôles console : `admin`, `qualifieur`, `comptable`, `lecteur` — identifiant **unique `qualifieur`** (jamais
  `qualificateur`), enum `ConsoleRole`, matrice écran × rôle × action dans un module unique, `requireRole` partout,
  défaut = refus (RM-05).
- Espace apporteur : accès aux données via `forApporteur()` **seul** ; garde AST anti-`prisma` sous `src/app/(espace)/**`.
- Ressource étrangère = **404 byte-identique** (PDF inclus) ; jamais 401/403 sur une ressource d'un autre apporteur.
- PII chiffrée via `encryptPii` + AAD ; IP hachée seule ; payload d'événement sans nom, e-mail, téléphone, IBAN, adresse
  (REQ-DM-041, `journal:sans-pii`).
- Session apporteur : 30 jours (REQ-SEC-003), révocable, `sessionVersion`.

## 5. Branches, worktrees, PR, commits

| Objet            | Règle                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Branche          | `t/<id-en-minuscules>` — ex. `t/dm-07`, `t/int-t01`, `t/ux-p1-08`                                       |
| Worktree         | `../axion-partners-wt/<id>` (créé par le script de lot ; `git worktree prune` au balayage)              |
| Titre de PR      | `<type>(<ID-TÂCHE>): <titre>` — ex. `feat(DM-07): attribution provisoire et index partiel` — clé de `gov:pr` |
| Labels de PR     | `phase:<n>`, `role:<rôle>`, `repo:partners` ou `repo:axionia`, `schema` si `prisma/**` ou `packages/contracts/**` |
| Commits          | `<type>(<domaine>): …` ≤ 100 caractères (commitlint), conventional commits ; `type ∈ feat, fix, test, docs, chore, refactor, ci, perf` |
| Taille           | Une tâche = une PR ≤ 600 lignes de diff                                                                  |
| Corps de PR      | Gabarit 8 cases (REQ-GOV-013) : REQ · tests par REQ vus rougir (bloc ROUGE/VERT verbatim) · relecteur ≠ auteur · ADR si décision · glossaire/enum à jour · mesure bundle avant/après si route UI · PLAN-STATE (dérivé) · fusion + atterrissage · **section « Attaque »** si `commissions/**\|attributions/**\|auth/**\|espace/**` · **Règle maison appliquée : RM-nn** |
| Fusion           | squash + `required_linear_history` ; une à la fois ; `mergeStateStatus` lu et `gh pr merge --squash --delete-branch` dans le **même** appel ; jamais `--auto`, jamais `--force` |
| Schéma           | Toute PR `schema` a A02 (`architecte`) en troisième relecteur, approbation bloquante ; CODEOWNERS `prisma/** @A02` |

## 6. Tests et gates

- Test **avant** code (`red-first`) : le fichier de test porte `// @req REQ-xxx` ; `it()` nomme la REQ ; le premier
  `vitest run` DOIT rougir et son message est copié **verbatim** dans la PR.
- Fixtures depuis le producteur réel, `Source:` obligatoire (RM-03) ; aucun défaut sur ce qui varie (RM-11).
- Couverture : 100 % lignes et branches sur `src/domain/**`, ≥ 80 % global ; mutation ≥ 80 % sur fichiers touchés
  (QA-T30).
- Aucun `stub.invalid` dans Partners ; `NOTIFY_SINK=true` hors prod (refus au boot).
- Budget bundle : **75 KB gz par route**, mesuré par script maison `pnpm perf:bundle -- <route>` sur
  `.next/static/chunks/app/` (une entrée par route ; `size-limit` somme les globs et ne convient pas) ; bloquant après
  première mesure (seuil aligné d'abord, blocage ensuite).
- Migrations additives (expand/contract), `migrate diff` vide, index partiels en SQL brut + test `pg_indexes`.
- Aucun `TODO` sans identifiant de tâche.

## 7. Environnements et autonomie des agents

- La matrice d'autonomie **EST** `.claude/settings.json` : `deny` sur `git push origin main*`, `git push --force*`,
  `prisma migrate deploy*`, `pnpm db:deploy*`, `Write/Edit` de `docs/PLAN-STATE.md`, `docs/REQUIREMENTS.md`,
  `docs/DECISIONS.md`, `docs/tasks.json` ; hook `PreToolUse` (`scripts/gates/hook-env.js`) refusant toute
  `DATABASE_URL` non locale / non testcontainers et tout `NOTIFY_SINK ≠ true`. Toute ligne de la matrice sans règle
  correspondante rougit (`gov:autonomie`).
- **Aucune commande manuelle contre `DATABASE_URL` prod** ; la migration passe par le pipeline gardé par Gate D.
- Worktrees : **jamais de jonction `node_modules`** dans un worktree ; `pnpm install --offline --frozen-lockfile`
  depuis le store partagé ; `ln -s` sous Git Bash copie au lieu de lier (`ls -ld` avant de dire « lié »).
- **Les hooks locaux ne font pas foi** : husky n'est pas fiable en worktree ; le pré-vol est `pnpm prevol`
  (typecheck, lint, format, `gov:*`, `req:check`, `use-client:check`) ; la CI est la seule vérité.
- `cwd` ne survit pas à l'appel suivant : tout appel qui écrit commence par `cd <chemin absolu du worktree> && git branch --show-current`.
- Côté axionia (`dev-axionia`) : lire `axionia/AGENTS.md` ; pré-vol des quatre gardes CI invisibles en local (export
  sync dans `use server`, `// use-client:` deux-points collé, isolation content-gen, commitlint 100) ; la fusion n'est
  pas dans le workflow — A01 applique `docs/runbooks/fusion-axionia.md`.

## 8. Fichiers réservés

| Fichier                                      | Écrivain                                                             |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `docs/PLAN-STATE.md`                         | **dérivé** (`pnpm plan-state:build`), commité par A01 seul            |
| `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md` | `gardien-spec`, lot dédié avec `--settings` surchargé |
| `docs/tasks.json`                            | `gardien-spec` / A01 (composition), jamais un développeur             |
| `prisma/**`, `packages/contracts/**`         | PR `schema`, approbation `architecte` bloquante                       |
| `docs/adr/**`                                | `architecte` accepte ; `documentaliste` indexe                        |
| `.claude/settings.json`, `.claude/agents/**` | lot dédié GOV-000 / GOV-023 (`pnpm gov:agents`)                       |
