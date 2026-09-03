# partners/ADR-0001 — La pile technique

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-GOV-008, REQ-GOV-018, REQ-QA-001, REQ-QA-006, REQ-QA-018, REQ-QA-032 |
| **Décisions du registre citées** | HYP-W5, HYP-E1-5, HYP-E1-24 |
| **Règle maison appliquée** | RM-01 |
| **Remplace / remplacé par** | — |

## Contexte

Partners est un dépôt distinct d'axionia, écrit par une flotte d'agents, et il doit être opérationnel
sans qu'aucun humain n'ait à réapprendre une pile. axionia tourne déjà sur Next.js, Prisma, Postgres
et BullMQ : ses gardes, ses patrons de webhook, ses runbooks et ses habitudes de revue existent et
sont transposables (REQ-GOV-029). Le registre a posé la pile en hypothèse par défaut à la ligne
`HYP-W5`, avec pour échéance la sortie de la phase −1 ; la colonne `Tranchée` de cette ligne porte
encore un tiret.

## Décision

Partners est écrit sur **Next.js 16 (App Router)** en **TypeScript strict**, avec **Prisma** sur
**Postgres 16**, **Redis + BullMQ** pour tout travail différé, **Tailwind v4** pour le rendu, **pnpm**
comme gestionnaire de paquets et **Node 22** comme moteur. C'est exactement l'hypothèse `HYP-W5` du
registre : cet ADR la consigne et en tire les conséquences, il ne la remplace pas.

Quatre règles de forme découlent de ce choix et ne se négocient pas au cas par cas :

1. **Server Actions par défaut ; l'API HTTP est réservée à la frontière** avec axionia, aux webhooks
   entrants et aux points de santé (REQ-GOV-018, `partners/ADR-0002`). Toute entrée est validée par un
   schéma Zod.
2. **Le code métier vit sous `src/domain/**` et ne fait aucune I/O** : ni Prisma, ni Redis, ni appel
   réseau, ni horloge — l'horloge est injectée (REQ-QA-001, CONVENTIONS §3). C'est ce qui rend le
   calcul des commissions testable sans base.
3. **Les tests d'intégration tournent sur un Postgres et un Redis éphémères** via testcontainers, sur
   un schéma migré par `prisma migrate deploy` (REQ-QA-006) : aucun test ne dépend d'un `.env`
   partagé.
4. **L'image est construite par la CI et poussée sur GHCR ; l'hébergeur ne fait que la tirer**
   (REQ-QA-018, hypothèse d'hébergement `HYP-E1-5`). Aucune construction sur le serveur, aucun
   `stub.invalid` dans le code (REQ-QA-032), aucun secret dans le dépôt (`HYP-E1-24`).

La version de pnpm est celle du champ `packageManager` de `package.json` : une seule source, y compris
pour la CI (RM-01).

## Conséquences

Le socle étant celui d'axionia, chaque garde d'axionia est **candidate** à la transposition, et chacune
est décidée une par une avec son motif (REQ-GOV-029) : on hérite d'un outillage, pas d'une confiance.

La dépendance à Docker devient structurelle : sans lui, ni testcontainers ni Gate C. C'est assumé,
c'est aussi ce qui permet de démarrer l'image réelle en CI avant de la déployer.

Le budget de poids par route reste mesuré par un script maison sur les fragments produits pour la
route, et non par la somme d'un glob (CONVENTIONS §6) : un budget mesuré sur autre chose que sa cible
est un budget qui ne garde rien.

Revenir sur cette pile après la phase 0 signifie réécrire le socle, pas changer un paramètre. C'est
précisément pourquoi `HYP-W5` porte « sortie de phase −1 » comme échéance.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Un dépôt unique avec axionia (monorepo) | La frontière deviendrait un import au lieu d'un contrat versionné, et les deux produits partageraient une file de fusion là où chacun a besoin de la sienne (RM-09, `partners/ADR-0006`). |
| Une pile différente de celle d'axionia | Aucune garde, aucun patron et aucun runbook ne se transposerait ; la flotte d'agents perdrait tous ses repères pour un gain nul. |
| Une file de travaux en base plutôt que Redis et BullMQ | Le gel mensuel et le rejeu d'événements ont besoin d'un identifiant de travail unique et d'un report exponentiel ; les réécrire en base revient à réécrire BullMQ moins bien. |

## Ce qui le vérifie

- **Assertion à poser** — par QA-T05, la tâche qui porte REQ-QA-018 et REQ-QA-032, les deux exigences
  de construction citées ici : `it('REQ-QA-018 — package.json déclare le moteur, le gestionnaire de
  paquets et les cadriciels de partners/ADR-0001')`, lisant `engines`, `packageManager` et les
  dépendances. **Aucune tâche ne déclare ce test aujourd'hui** — `docs/tasks.json` donne à QA-T05 ses
  trois exigences sans `tests` : GOV-009 en demande l'ajout au `gardien-spec`, seul écrivain du
  backlog, et ne l'écrit pas à sa place. Tant que ce test n'existe pas, cet ADR reste `propose`.
- Vérifications déjà en place : `pnpm typecheck` et `pnpm test` sont des étapes bloquantes de
  Gate A.

## Reste à faire

`HYP-W5` n'est pas tranchée : sa colonne `Tranchée` porte un tiret et son échéance est la sortie de
la phase −1. Cet ADR ne la tranche pas. Quand Will la tranchera, le `gardien-spec` datera la ligne et
cet ADR passera `accepte` sans changer de contenu — ou sera remplacé.

Deux conditions, donc, avant `accepte` : la ligne `HYP-W5` datée au registre, et le test-cliquet
ci-dessus écrit et vu rougir. La seconde est nommée dans `docs/tasks.json` ou elle n'aura pas lieu.
