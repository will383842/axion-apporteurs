# partners/ADR-0024 — Deux lentilles partout, la mutation mesurée par Stryker, et les relectures qui ne corrigent aucun défaut

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-26 |
| **Décideur** | `architecte` — cet ADR consigne une décision de Will et une décision de l'orchestrateur prise sur sa délégation, et la façon dont elles sont appliquées ; il n'est pas encore accepté |
| **Tâche** | GOV-101 |
| **Exigences servies** | REQ-GOV-011, REQ-GOV-013, REQ-GOV-032, REQ-QA-002 |
| **Décisions du registre citées** | `W16`, `W14` |
| **Règle maison appliquée** | RM-01, RM-02, RM-11 |
| **Remplace / remplacé par** | amende `partners/ADR-0021` : sa règle (1), le nombre de lentilles selon le risque ; sa règle (2), la prose inexacte comme dette, est conservée |

## Contexte

Mesure de l'orchestrateur, le 2026-09-26 : environ neuf PR en douze heures, trois à quatre tours de
relecture par PR, et **près de la moitié des tours ne corrigent aucun défaut**. Trois causes :

1. chaque fusion met les autres PR en conflit sur les vues dérivées commitées (`docs/PLAN-STATE.md`,
   `docs/TRACABILITE.md`, `docs/TASKS.md`…) et sur le total littéral du cliquet des sorties non
   nulles de `refus-de-rendre-et-de-publier.spec.ts` ;
2. fusionner `main` dans une PR périme tous les accords, même quand le diff propre à la PR est
   identique ;
3. la porte A rougit **après** les relectures — un nom de garde, `perf:budgets`, `red-first`, une vue
   périmée.

Will a délégué « aller beaucoup plus vite », puis a tranché lui-même, le même jour, deux points
(`W16`, `docs/DECISIONS.md` §1) : **deux lentilles partout** (`exactitude`, `securite`), le refus de
`securite` restant un veto, l'avis signé `A02 · schema` restant exigé dès qu'une PR touche au schéma ;
et **la lentille `mutation` n'est plus une revue d'agent** : Stryker la mesure sur les fichiers de la
PR.

## Décision

### (1) Deux lentilles partout

`lentillesExigees()` (`scripts/lot/revues.ts`) rend `exactitude` et `securite` sur toute PR, plus
`schema` quand le signal de schéma n'est pas **prouvé** absent (`schema === false`). Le niveau de
risque (`risqueDeLaPr()`) reste calculé et publié : il dit au relecteur `securite` où regarder, il ne
compte plus de lentille. `simplicite` disparaît : la dérivation depuis une source unique (RM-01) est
jugée par `exactitude`. Le refus de `securite` bloque à lui seul, comme avant.

### (2) La mutation, mesurée par Stryker

`pnpm mutation:pr` (`scripts/mutation/pr.ts`), dans `gate-a` après `req:check` : Stryker, **en bac à
sable** (`inPlace: false` écrit dans la configuration dérivée — une passe en place interrompue a
laissé 220 fichiers réécrits le 2026-09-25), sur les sources de `src/domain/`, `src/server/` et
`src/lib/` que la PR ajoute ou modifie depuis sa base de fusion (`src/lib/` ajouté au second tour de
relecture : `forme-iban.ts` touche l'argent). Le reste de `src/` — `src/app/`, `src/proxy.ts`,
`src/instrumentation.ts` — est jugé au rendu, hors du processus que Stryker instrumente : il est
**écarté et nommé**, jamais tu. Un commentaire `// Stryker disable` dans un fichier muté fait
**échouer** la passe en se nommant `fichier:ligne` : il retirerait des mutants du score sans en
nommer aucun. La configuration dérive de `stryker.config.json` :
seuil `thresholds.break`, lanceur, parallélisme. Le verdict est celui du lecteur unique du rapport
(`scripts/mutation/rapport.ts`) : sous le seuil, rouge, chaque survivant nommé `fichier:ligne`. Sur
`push` de `main`, le diff est vide et l'étape le dit. Les scripts de garde touchés sont **nommés et
écartés** : leurs témoins les lancent en sous-processus, que Stryker n'instrumente pas.

### (3) Un accord survit à une fusion de `main` qui ne change pas le patch

Un accord rendu sur C survit à la tête T si l'**empreinte du diff propre à la PR** est la même :
`git patch-id --stable` de `git diff <merge-base(origin/main, X)> X`, vues dérivées exclues
(`scripts/vues/vues.ts`) ; `patch-id` hache aussi les en-têtes de création, de suppression et de
mode (un résumé `--summary` posé en plus a été retiré au second tour : muté, il ne faisait rougir
aucun témoin). La lentille `exactitude` suit la même règle pour la prose écrite dans les fichiers ;
le corps de la PR n'est pas dans ce diff. Toute
mesure impossible (commit absent du clone, base introuvable, diff vide) périme. **Limite déclarée** : le vérificateur de `docs/PLAN-STATE.md` exempte les zones lues sur la forge ; une falsification écrite à la main dans ces zones après l'accord survit à l'empreinte. Ces zones portent déjà, par construction, du texte que la forge contrôle (le titre de n'importe quelle PR d'un dépôt public), et le vérificateur y refuse tout ce qui sortirait de la zone au rendu. Les six autres vues sont comparées entières.

### (4) Le pré-contrôle et la fusion des vues

`pnpm pre-gate` (`scripts/prevol.ts --rapide`) joue les étapes rapides de `gate-a`, lues dans
`ci.yml`, sans la suite, les navigateurs ni Stryker — chacune écartée est nommée. `pnpm vues:fusion`
(`scripts/vues/fusion.ts`) fusionne `main` dans la branche et résout un conflit qui ne porte que sur
des vues dérivées en les **rendant** ; tout autre conflit abandonne la fusion. Les relectures démarrent
quand la porte A est verte.

### (5) Le cliquet des sorties non nulles est calculé

Le total littéral de `refus-de-rendre-et-de-publier.spec.ts` est remplacé par une lecture de la base
(`tests/unit/gouvernance/declarations-de-sorties.ts`) : une déclaration présente sur `origin/main`
reste présente tant que son fichier existe, et son total ne baisse pas. Une sortie ajoutée non
déclarée rougit toujours, par le cliquet du diff.

## Conséquences

- **Les vues restent commitées dans les PR.** L'orchestrateur demandait de les sortir des PR et de
  les faire régénérer sur `main` par un jeton de robot. C'est **contraire à `partners/ADR-0006` §4**
  (« aucun workflow ne pousse sur la branche principale », REQ-GOV-014), tenu par
  `aucun-workflow-ne-pousse-sur-main.spec.ts`. Ce pas demande une décision de Will qui amende
  `partners/ADR-0006` ; il n'est pas pris ici. Ce qui en tient lieu : `pnpm vues:fusion`, et la
  survie des accords sur patch identique, qui ôtent au conflit de vue son coût en relecture.
- **`gate-a` s'allonge** du temps de Stryker sur les PR qui touchent `src/domain/`, `src/server/`
  ou `src/lib/`.
  Les PR de gouvernance, de loin les plus nombreuses, n'y passent que quelques secondes. Au-delà
  d'environ quinze minutes, le découpage proposé est un job à part, requis par la protection de
  `main` — un réglage que seul Will peut faire.
- **Cinq témoins de `gov:pr --prove` changent de nature.** Ils prouvaient qu'un risque élevé
  exigeait quatre lentilles ; ils prouvent désormais, en contre-témoins, que la même PR élevée est
  cochée par deux. Deux autres (le `sensible` absent de `projeter()`, la tâche sensible au milieu du
  registre) sont devenus des témoins de la section Attaque. La classification du risque reste
  éprouvée par `lentilles-selon-le-risque.spec.ts` et
  `quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.spec.ts`.
- **Retour arrière.** Rétablir la branche élevée de `lentillesExigees()` et la faute « aucun avis
  mutation » de `fautesDesRevues()`, et revenir sur les témoins réécrits. La règle (3) se retire en
  supprimant la seconde chance de `lireRevues()` : le sens de défaillance y est fermé, son retrait ne
  peut que périmer davantage.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Un robot qui commite les vues sur `main` | Contraire à `partners/ADR-0006` §4 et REQ-GOV-014 : décision de Will, pas de cette tâche |
| Une PR automatique ouverte par `GITHUB_TOKEN` | GitHub ne déclenche aucun workflow sur une PR ouverte par ce jeton : `gate-a` ne s'y lirait jamais, et `gov:pr` y exigerait des revues que personne ne rend |
| L'empreinte sans contexte (`-U0`) | Déplacer une ligne de garde dans le même fichier garderait la même empreinte |
| Stryker sur les scripts de garde | Leurs témoins les lancent en sous-processus : chaque mutant y survivrait, et la porte A rougirait sur un faux |
| Garder le total littéral du cliquet | C'est lui qui mettait deux PR en conflit sans aucun défaut |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/relectures-sans-defaut.spec.ts` ·
  `it('REQ-GOV-011 — une PR de risque ÉLEVÉ n’exige plus que exactitude et securite')`, et les
  témoins à deux faces de la survie sur patch, de `vues:fusion`, de `pre-gate`, de `mutation:pr` et du
  cliquet calculé, dans le même fichier.

## Reste à faire

- Sortir `docs/PLAN-STATE.md` et `docs/TRACABILITE.md` des PR : décision de Will qui amende
  `partners/ADR-0006` §4, puis un jeton de robot et un job sur `push` de `main`.
- Une passe Stryker sur les fonctions PURES des gardes, jugées en processus.
- Mesurer la durée de `mutation:pr` en porte A sur une PR du domaine ; au-delà de quinze minutes, un
  job à part, ajouté aux checks requis de `main`.
