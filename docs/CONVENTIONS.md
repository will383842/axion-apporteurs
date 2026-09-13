# Conventions — Axion Partners

> Livré par **GOV-014** (REQ-GOV-018, REQ-GOV-029). Version normative des conventions du plan directeur §4, corrigées
> par la synthèse des juges du 2026-09-03. `docs/CONVENTIONS.md` **prévaut** sur le §4 du plan en cas d'écart : le plan
> cite, ce fichier fixe. Gates : lint et format bloquants dès le socle (Gate A) ; `gov:conventions`, `gov:tasks`,
> `gov:pr`, `gov:autonomie`.
>
> **Le sort de chaque garde héritée d'axionia est décidé, une ligne par garde, dans
> [`docs/GARDES-AXIONIA.md`](GARDES-AXIONIA.md)** (REQ-GOV-029) : transposer, adapter, écarter ou différer, avec motif —
> et, pour une garde différée, la tâche qui la reprend. Les §9 à §11 ci-dessous appliquent ce registre.

## 1. Langue

- Français pour les docs, commentaires, messages de commit, messages d'erreur, ADR et micro-copy — sans exception.
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
- **Dates en UTC.** Tout horodatage est stocké en UTC (`timestamptz`, suffixe `…At`) ; la conversion vers
  `Europe/Paris` est un fait d'AFFICHAGE et de règle métier, jamais de stockage. Un horodatage qu'on compare à
  l'horloge locale du poste est un instrument qui ment : 48 minutes s'y sont déjà lues « 3 heures ».
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
| Branche          | `lot/<id-de-lot>-<suffixe>` — ex. `lot/L-1-01-integration` — la forme normale : un lot, une branche, une PR, **un commit par tâche**. `t/<id-en-minuscules>` — ex. `t/dm-07` — la forme dérogatoire, pour une tâche livrée seule (correctif urgent, tâche `sensible` relue isolément). Motif fermé, tenu par `scripts/lot/tasks.schema.json` et `partners/ADR-0007`. |
| Worktree         | `../axion-partners-wt/<id>` (créé par le script de lot ; `git worktree prune` au balayage)              |
| Titre de PR      | `<type>(<ID-TÂCHE>): <titre>` — ex. `feat(DM-07): attribution provisoire et index partiel` — clé de `gov:pr` |
| Labels de PR     | `phase:<n>`, `role:<rôle>`, `repo:partners` ou `repo:axionia`, `schema` si `prisma/**` ou `packages/contracts/**` |
| Commits          | `<type>(<domaine>): …` ≤ 100 caractères (commitlint), conventional commits ; `type ∈ feat, fix, test, docs, chore, refactor, ci, perf` |
| Taille           | Un **lot** = une PR ; chaque tâche du lot = un commit ≤ 600 lignes de diff. Une PR par tâche a été écartée par `partners/ADR-0007` : 185 créneaux de fusion sur une file partagée avec quatre sessions coûtent plus que le travail qu'ils gardent. |
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

> ⚠️ Les sections **§9 à §11** sont ajoutées à la SUITE, jamais intercalées. Les §1, §3, §5 et §8 sont cités par leur
> numéro depuis `partners/ADR-0007`, `partners/ADR-0008`, `docs/AFFIRMATIONS-AXIONIA.md`, `docs/CHARTE-AGENTS.md` et
> les sept fiches de rôle de `docs/agents.json` : renuméroter aurait cassé dix-huit références qu'aucune garde ne relit.

## 9. Frontière client / serveur, et entrées

- **Server Actions par défaut.** Toute mutation et toute lecture de l'espace apporteur ou de la console passe par une
  Server Action. Une **API HTTP** ne s'ouvre que pour la **frontière axionia** — le seul appelant qui n'est pas une page
  de ce dépôt (`SEC-07`, `INT-T02`) — et pour les webhooks entrants d'un tiers. Toute autre route HTTP est un écart qui
  se justifie en ADR : une route ouverte pour la commodité d'un composant est une surface d'attaque de plus, sans garde.
- **Zod à toute entrée.** Aucune donnée venue du dehors — corps de Server Action, requête HTTP, webhook, variable
  d'environnement, réponse d'un tiers, fixture rejouée — n'est lue avant d'avoir traversé un schéma Zod. `parse`, pas
  `as` : un `as` déplace le mensonge dans le type au lieu de l'arrêter à la porte. Les schémas vivent dans un module
  unique par domaine, et le type métier se **dérive** du schéma (`z.infer`), jamais l'inverse.
- **Un module `"use server"` n'exporte QUE des fonctions asynchrones.** Next transforme chaque export en point d'entrée
  réseau ; une constante y devient une référence distante et le fichier **entier** cesse de compiler, sous un message
  qui désigne la mauvaise cause (« Export X doesn't exist in target module », alors que l'export existe). Mesuré côté
  axionia : `tsc --noEmit` **vert**, ESLint **vert**, tests unitaires **verts**, `next build` en échec. Aucun type
  n'attrape ce défaut — c'est `gov:conventions` (famille `use_server_export_interdit`) qui le tient.
- **Aucun ré-export (`export { … }`) dans un module `"use server"`.** Chaque nom ré-exporté devient un point d'entrée
  HTTP public, appelable sans cookie et sans session : la protection d'un groupe de routes protège des PAGES, pas des
  actions. Deux fuites réelles trouvées par cette seule règle côté axionia, dont une lecture de table sans garde.
- **`// use-client:` justifié.** Toute directive `"use client"` porte, collée juste avant ou juste après, un commentaire
  `// use-client: <raison>`. Franchir la frontière de rendu est une décision : elle s'explique en une ligne, au moment
  où on la prend.

## 10. Outillage : lint, format, et le fait qu'ils bloquent

- **Prettier et ESLint versionnés.** Les deux outils sont épinglés dans `package.json` (`devDependencies`) et leur
  configuration est **commitée** (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`). Un outil non épinglé
  rend un verdict différent selon le poste ; une configuration non versionnée rend un verdict différent selon la
  personne.
- **Lint et format BLOQUANTS en CI dès le socle.** Les étapes `pnpm lint` et `pnpm format:check` entrent dans le job
  `gate-a` **sans `continue-on-error`**, et c'est le seul point qui compte. Une garde privée de son caractère bloquant
  est une décoration : côté axionia, **toutes** les gates PR de budget portent `continue-on-error: true`, donc aucune PR
  qui alourdit le bundle n'y rougit — et la documentation du dépôt a affirmé le contraire pendant des mois. Un drapeau
  `continue-on-error` sur une étape de lint ou de format fait rougir `gov:conventions`
  (famille `lint_non_bloquant`) ; `G-SEC-CI-BLOQUANTE` (QA-T01) étendra le refus à tout job de gate en phase 0.
- **La cohérence, pas la présence.** `gov:conventions` n'exige pas que l'étape existe : elle exige que, si elle existe,
  elle soit bloquante et que son outil soit épinglé et configuré. Un contrôle de dette rouge en Gate A bloquerait tout
  le monde pour un manque qu'aucune PR n'a créé — c'est LEC-13, et c'est pourquoi la dette va en nightly.

## 11. Une garde ne se transpose ni à vide, ni sans ses dents

- **Périmètre vide = périmètre DIT.** Une garde dont le périmètre est vide imprime son compte (« 0 fichier »), son
  **motif**, et la **tâche** qui l'ouvrira. Le contre-modèle est `axionia/scripts/check-zod.ts`, qui sort en 0 avec un
  avertissement quand son répertoire n'existe pas : verte, silencieuse, et ne gardant rien. `gov:conventions` refuse un
  périmètre vide dont le motif tient en deux mots ou dont la tâche successeur n'est pas au backlog.
- **Une garde écrite est une garde appelée.** Tout script de `scripts/gates/**` inscrit au registre `docs/gates.json`
  est câblé dans un workflow ou dans `.claude/settings.json`. Côté axionia, `qualiopi:isolation-check` a vécu des mois
  sans câblage en cumulant 88 violations, pendant que la seule des trois gardes câblée affichait zéro.
- **Une garde retenue a été vue rougir.** Témoin par famille **et contre-témoins verts** : une règle trop large rougit
  sur du légitime, et une garde qui rougit toujours finit désarmée (RM-02, LEC-13). Le mode `--prove` porte la preuve ;
  `gates:prouvees` refuse toute gate de phase sortie sans `preuveRouge`.
