# partners/ADR-0012 — La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-18 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne une décision de Will et les arbitrages pris pour l'appliquer, il n'est pas encore accepté |
| **Tâche** | GOV-077 |
| **Exigences servies** | REQ-GOV-011 |
| **Décisions du registre citées** | — décision de Will du 2026-09-18 (« levier 3 »), hors registre : `docs/DECISIONS.md` ne porte pas encore les décisions de gouvernance, et c'est GOV-058 qui leur donnera une place |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

Le 2026-09-18, Will a mesuré le rythme du projet : une trentaine d'exécutions d'agents dans la
journée, trois PR d'une demi-journée à une journée chacune, **zéro fusion**. Une part de ce coût est
la relecture : **toute** PR recevait quatre avis — `exactitude`, `securite`, `simplicite` (ou
`schema`), plus l'avis `mutation` — y compris une PR qui ne touche que la documentation d'une tâche
de qualité. Et la garde l'exigeait **en dur** : `lentillesExigees()` (`scripts/lot/revues.ts`)
rendait quatre lentilles quel que soit le diff, si bien qu'une consigne « deux lentilles suffisent »
aurait fait rougir `gov:pr` en `lentilles_manquantes`. La décision ne pouvait donc pas s'appliquer
par consigne : il fallait que la machine la porte.

La décision de Will, telle qu'il l'a donnée :

- **risque élevé** → quatre lentilles : tâche dont `sensible` n'est pas vide, zones `argent` ou
  `securite`, toute tâche qui touche des données personnelles, `prisma/` ou `packages/contracts/` ;
- **risque ordinaire** (gouvernance, documentation, outillage) → deux lentilles, `exactitude` et
  `securite` — et « `securite` garde son veto ».

## Décision

**Une seule fonction dérive le risque d'une PR** : `risqueDeLaPr()`, dans `scripts/lot/revues.ts`,
appelée par la garde (`scripts/gates/gov-pr.ts`) **et** par le composeur du corps de PR
(`scripts/lot/corps-de-pr.ts`). `lentillesExigees()` ne reçoit plus un booléen `schema` mais ce
risque. `pnpm gov:pr --pr <n>` imprime le risque et ses raisons : c'est la ligne qu'on lit avant de
lancer les lentilles.

**L'ordinaire se prouve, l'élevé est le défaut.** Une PR est de risque ordinaire si et seulement si
les cinq conditions sont établies ; sinon elle est élevée :

1. au moins une tâche résolue — par le titre ou par le champ `pr` du registre ;
2. le registre des tâches de la **base** de la PR est lisible ;
3. chaque tâche résolue, lue sur la **tête** et sur la **base**, est en zone `gouvernance` ou
   `qualite`, porte un champ `sensible` **présent et vide**, et n'est pas `schema: true` — la plus
   haute l'emporte ;
4. la PR ne porte pas le label `schema` ;
5. le diff n'est pas vide, et chacun de ses fichiers est sous `docs/`, `scripts/`, `tests/`, ou est
   un document `*.md` à la racine — jamais sous `.github/`, jamais un autre fichier de la racine —, et
   n'appartient pas à la garde des revues (`scripts/lot/revues.ts`,
   `scripts/gates/gov-pr.ts`, `scripts/lot/corps-de-pr.ts`, `docs/CHARTE-AGENTS.md`,
   `docs/agents.json`).

| Risque | Lentilles exigées |
| --- | --- |
| élevé | `exactitude`, `securite`, `simplicite` (ou `schema` sur une PR de schéma), `mutation` |
| ordinaire | `exactitude`, `securite` |

**Le refus de `securite` bloque à lui seul, sur toute PR.** Plus généralement, tout refus rendu
bloque, qu'il vienne d'une lentille exigée ou non : on n'est pas obligé de la demander, on ne peut
pas l'ignorer une fois rendue. La section « Attaque » reste exigée sur une tâche `sensible`
(REQ-GOV-011).

**Les cinq arbitrages pris pour appliquer la décision**, chacun dans le sens fermé :

- **Zones en liste blanche, pas en liste noire.** Will cite `argent` et `securite` ; une liste noire
  laisse passer tout le reste. Mesuré sur le registre à `809a746` : huit tâches vivantes manipulent
  des données personnelles avec `sensible: []` (INT-T09, INT-T10, INT-T11, INT-T13, JUR-T09,
  UX-P1-07, UX-P3-03, EXT-T05), et aucune n'est en zone `gouvernance` ou `qualite` : la liste
  blanche les met toutes en élevé sans rien leur demander. SEC-01 (zone `securite`, `sensible: []`)
  prouve que la zone doit compter seule.
- **« Touche des données personnelles » ne se mesure ni par un motif de chemin ni par `rgpd`.**
  Des motifs (`contact`, `iban`, `chiffr`, `pii`) confrontés aux `paths` déclarés n'attrapent
  aucune des huit tâches ; `rgpd` seul en omet huit. Ce qui mesure, c'est la liste blanche de zone
  et la liste blanche de chemins.
- **Chemins en liste blanche aussi** : un dossier neuf, `config/exemptions-corps-publie.json` ou
  `.claude/settings.json` tombent en élevé sans que personne ait pensé à eux.
- **`.github/` hors de la liste blanche** (arbitrage de l'orchestrateur du 2026-09-18, qui a refusé
  la première version) : les workflows et `CODEOWNERS` gouvernent les gates et la propriété des
  chemins ; une PR qui affaiblit la CI est exactement celle qu'on ne relit pas à deux lentilles.
  Conséquence assumée : QA-T01, qui touche `.github/workflows/ci.yml`, se relit en élevé.
- **La racine hors de la liste blanche, sauf ses documents `*.md`** (même arbitrage, sur une dette de
  la lentille `securite`) : `package.json`, `pnpm-lock.yaml`, `.npmrc`, `vitest.config.*`,
  `eslint.config.*`, `tsconfig*.json`, `.gitattributes` gouvernent la chaîne de contrôle. Les
  énumérer laisserait passer le prochain ; la règle fermée est « toute la racine sauf les documents ».
- **Un fichier renommé ou copié compte par sa source ET sa destination** (refus bloquant de la
  lentille `securite` sur la PR de cette décision) : la forge sert la source dans
  `previous_filename`, `git diff --name-status` la rend en première colonne de chemin. Une seule
  extraction, `cheminsTouches()`, pour la garde et le composeur ; sans elle, un fichier retiré de
  `.github/` ou de `prisma/` n'était jugé que par l'endroit où il arrive.
- **La garde des revues est toujours élevée**, même sous `scripts/` ou `docs/` : sinon une PR relue
  par deux lentilles pourrait affaiblir la règle qui décide combien de lentilles relisent les
  autres. La liste est confrontée au graphe d'imports de `scripts/`.
- **Tête et base** : chaque PR écrit `docs/tasks.json` ; sans la base, une PR réécrirait la `zone`
  ou viderait le `sensible` de sa propre tâche et se relirait en ordinaire. Un champ **absent** vaut
  élevé — la projection `sensible ?? []` de `gov-pr.ts` était un échec ouvert, elle est retirée.

Mesure à `87fb212` (260 tâches, une PR synthétique par tâche, fichiers dérivés de ses `paths`) :
52 ordinaires, 208 élevées. Sur les 201 tâches `partners` non livrées, **29 sont ordinaires** — autant
de PR relues par deux lentilles au lieu de quatre — et 172 restent élevées. La première version
(`.github/` et racine admis) en comptait 46 sur 206, la deuxième (racine admise) 35 sur 206.

## Conséquences

- La PR qui livre cette règle est **elle-même élevée** : elle touche la garde des revues. Toute PR
  qui la modifiera le sera aussi.
- `gov:pr --pr <n>` lit désormais les fichiers par l'interface REST paginée (`gh pr view --json
  files` plafonne à 100 : un fichier de code produit au 101ᵉ rang aurait été invisible), les
  commentaires d'issue (un avis posté là ne compte pour rien, et c'est désormais dit), et le
  registre de la base (`git show origin/<base>:docs/tasks.json`).
- Le composeur du corps de PR lit le **titre** pour résoudre la tâche du risque, et lui seul : sans
  lui, pendant tout le vol d'une PR (`pr: null` au registre), le risque serait élevé et la case des
  revues ne se cocherait jamais sur une PR ordinaire. `LISTE_SUR_LA_PR` et `COUVRE` restent sur ce
  que la PR déclare.
- **Limite préexistante, déclarée et non fermée** : la garde qui juge une PR est celle de la tête de
  cette PR. Une PR qui modifie `risqueDeLaPr()` se juge avec sa version modifiée. La parade reste
  humaine : quatre lentilles sur toute PR qui touche la garde, et le veto de `securite`.
- **Limite déclarée** : une tâche absente de la base (créée par la PR) n'est jugée que sur la tête ;
  créer une tâche passe par `verser-tache` et le label `role:gardien-spec`.
- **Retour arrière** : faire rendre à `lentillesExigees()` les quatre lentilles quel que soit le
  risque suffit à revenir à l'état antérieur ; la dérivation du risque peut rester, elle ne coûte
  qu'une ligne imprimée.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Liste noire de zones (`argent`, `securite`) | Laisse passer les huit tâches à données personnelles mesurées avec `sensible: []`, et toute zone neuve |
| Détecter les données personnelles par motif de chemin | Mesuré : n'attrape aucune des huit tâches, leurs `paths` ne portent pas le mot |
| Juger la tâche sur la tête seule | Une PR déclasserait sa propre tâche dans `docs/tasks.json` et se relirait en ordinaire |
| Lire le risque sur la seule tâche du titre | Une PR de plusieurs tâches cacherait une tâche sensible derrière une tâche ordinaire |
| Une consigne sans code | `gov:pr` aurait rougi `lentilles_manquantes` sur toute PR relue par deux lentilles |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/lentilles-selon-le-risque.spec.ts` ·
  `it('REQ-GOV-011 · la PR est ÉLEVÉE, la raison nomme DM-01, et deux revues laissent simplicite et mutation manquantes')` :
  une PR ordinaire par son titre qui porte une tâche sensible au milieu de ses tâches reste élevée.
- **Assertion** — `tests/unit/gouvernance/lentilles-selon-le-risque.spec.ts` ·
  `it('REQ-GOV-011 · une PR QA-T01 réduite à ses fichiers hors .github/ et hors racine (qualite, sensible vide) est de risque ordinaire')` :
  la classe ordinaire existe, et deux lentilles lui suffisent.
- `pnpm gov:pr:prove` exerce l'appelant `gov-pr.ts` sur les mêmes cas (PR ordinaire, PR à tâche
  sensible au milieu, aucune revue, quatre refus).

## Reste à faire

- Passer à `accepte` après relecture par l'architecte (A02). Ce n'est pas une condition de fusion
  de GOV-077 (précédent : `partners/ADR-0010`).
- `scripts/lot/lot.workflow.js`, `.claude/agents/`, `.claude/skills/lot/SKILL.md` et
  `docs/agents.json` disent encore « trois lentilles » : chemins réservés au lot `--settings`
  (GOV-023), à aligner dans ce lot.
- GOV-058 donnera une place aux décisions de gouvernance de Will ; cet ADR y citera alors la sienne.
