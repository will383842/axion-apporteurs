import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * La configuration de test que Stryker lance — QA-T30 (REQ-QA-002).
 *
 * C'est `vitest.config.ts`, réduite aux tests UNITAIRES EN PROCESSUS du domaine et du serveur
 * (`tests/unit/domaine/**`, `tests/unit/contrat/**`, puis, depuis GOV-101, `tests/unit/securite/**`,
 * `tests/unit/integration/**` et `tests/unit/espace/**`, puis, depuis INT-T10, `tests/unit/email/**`,
 * puis, depuis JUR-T02, `tests/unit/juridique/**`) :
 * le travail de nuit ne mute que `src/domain/**`, `pnpm mutation:pr` mute aussi les fichiers de
 * `src/server/**` et `src/lib/**` que la PR touche, et chaque mutant est jugé par les tests qui le couvrent
 * (`coverageAnalysis: perTest`, `related`).
 * Les tests de `tests/integration/` exigent un démon Docker et ceux de gouvernance lancent des
 * gardes en sous-processus : ni l'un ni l'autre ne juge un mutant, et les deux feraient échouer la
 * passe à blanc. Mesuré le 2026-09-26 sur le diff de SEC-03 : sans les tests du serveur, presque
 * tous les mutants sortaient « sans couverture » ; avec eux, la passe tient le seuil en un peu plus
 * de trois minutes (chiffres dans l'entrée de journal de la PR 140). Tout le reste (préparation,
 * délais, parallélisme) est hérité, jamais recopié.
 *
 * CE QUI EST ÉCARTÉ, NOMMÉ, parce que cela ne juge pas le COMPORTEMENT du domaine et échoue sur le
 * bac à sable de Stryker — chacun vu rougir à blanc le 2026-09-25, un par passe :
 *  - `journal-charge-fermee.spec.ts`, `gardes-de-schema.spec.ts` et `schema-centimes.spec.ts`
 *    ENTIERS : ils jugent des GARDES (`journal:sans-pii`, `partners:schema:enums`,
 *    `partners:schema:cents` et leurs voisines), qui lisent les fichiers SUIVIS
 *    et sortent en échec quand elles ne le peuvent pas — le bac à sable n'est pas un dépôt git ;
 *  - quatre tests LISENT le texte d'une source du domaine au lieu de l'exécuter : dans le bac, ce
 *    texte porte l'instrumentation de Stryker. Aucun mutant n'y survit ni n'y meurt ;
 *  - six tests balaient les fichiers suivis (dépôt git requis) ;
 *  - un test exécute le code, mais sous un BUDGET de temps (moins de 5 s pour quinze ans d'heures)
 *    que l'instrumentation fait dépasser : mesuré à 7,3 s.
 * Tous tournent dans `pnpm test`, sur le vrai texte. Les titres sont des fragments d'expression
 * régulière : le point tient lieu de l'apostrophe typographique.
 *
 * ⚠️ Stryker tourne en BAC À SABLE, jamais en place : une passe en place interrompue laisse
 * l'instrumentation dans l'arbre de travail — mesuré le 2026-09-25, 220 fichiers suivis réécrits.
 */
const ECARTES = [
  // DM-55 : ce témoin LIT le texte de src/server/taches/envoyer-notifications-espace.ts (la forme exacte
  // du lot, `cle: { in: [...CLES_ENVOYEES_PAR_LE_PASSAGE] }`), que Stryker instrumente dans le bac.
  'le passage n.envoie aucune autre clé : son lot lit la liste, et elle seule',
  'aucun fichier de src/domain/temps/ ne nomme Date',
  'le module n.écrit aucune durée de dormance en dur',
  'le module n.importe que le domaine',
  'chaque heure de 2026 à 2040 : `versParis` concorde avec Intl',
  'aucun fichier suivi sous src/ n.importe à la fois la dérivation et un envoi',
  'aucun module suivi sous src/ ne porte de barème de score',
  // `securite:schema-pii` sur le dépôt réel : balaie les fichiers suivis (vu rougir à blanc, porte A de la PR 145).
  'le dépôt sort en zéro, et le vert imprime le compte des champs',
  // la source unique des secrets (REQ-SEC-028) : `git ls-files` sur src/ et scripts/ (même passe).
  'aucun fichier autre que src/lib/env.ts ne cite deux noms de secret',
  // `ssot:seuils` (JUR-T02) : `controlerDepot` enumere src/ par `git ls-files` (depot git requis).
  'le dépôt réel est sans faute, et le compte des fichiers lus est imprimé',
  // et celui-ci LIT le texte de src/domain/seuils/ssot.ts, instrumente dans le bac.
  'la SSOT elle-même est le seul fichier où ces littéraux s.écrivent',
  // SEC-17 : lance la garde `securite:roles` en sous-processus, qui lit les fichiers SUIVIS par git — le
  // bac à sable n'est pas un dépôt, la garde y sort en échec. Jugé dans `pnpm test`, sur le vrai dépôt.
  'la garde sur la console du dépôt sort en 0',
  // QA-T56 : les deux tests de `vocabulaire-et-micro-copy.spec.ts` qui ne peuvent pas recevoir `suivis`
  // injecté — la vue du LEXIQUE lit `git ls-files` sans injection, et la garde `ux:exhaustivite` en
  // sous-processus. Mesuré hors dépôt git : 31 tests sur 52 en échec avant l'injection, ces 2 après.
  'la micro-copie réelle de l.espace est lue par gov:lexique et n.y rougit pas',
  'sur le dépôt réel, elle sort en zéro avec les comptes confrontés',
  // SEC-44 : la garde de famille (REQ-SEC-016) juge les sources du dépôt, pas le code sous mutation : le
  // bac à sable instrumenté n'est pas la source (Stryker y enveloppe le nom d'un compteur). Tout le bloc
  // de la garde est écarté — chaque témoin y part de l'univers du dépôt (`universDuDepot`) — comme ses
  // voisines `gardes-de-schema` et `journal-charge-fermee`. Joué par pnpm test et la porte A ; le nom de
  // compteur de la frontière est tué par un espion unitaire.
  'REQ-SEC-016 — la garde de famille',
  // SEC-12 : les trois autres blocs de `rate-famille.spec.ts` qui partent de l'univers du dépôt
  // (`universDuDepot`) : la garde y lit les sources MUTÉES par la PR, instrumentées dans le bac. Mesuré
  // en instrumentant les quatre fichiers mutés de #691 : 48 témoins rougissent, 40 sous le bloc
  // ci-dessus, ces 8 sous les trois suivants. Le reste du fichier EXÉCUTE `limiter` (verdict, panne,
  // `REDIS_URL`, empreinte) et reste sous mutation : l'écarter ENTIER faisait tomber `rate-limit.ts` à
  // 28,57 % (porte A de #691, `mutation:pr` à 70,52 %).
  'REQ-SEC-016 — option 1 : une limite lue en SSOT',
  'REQ-SEC-016 — la garde lit le texte en vigueur',
  'confrontée au chiffre de l.exigence ou à la SSOT ; aucun compteur par identité',
  // JUR-T13 : `jur:aucun-agregat-reseau` lancée sur les sources du dépôt — juge les sources du dépôt,
  // pas le code sous mutation : le bac à sable instrumenté n'est pas la source.
  'le binaire sur le dépôt sort en 0 et imprime les fichiers et clés confrontés',
  // JUR-T13 : les trois autres témoins qui lancent une garde sur les fichiers SUIVIS, mesurés hors
  // dépôt git sur la tête de #477 (validés un à un par la lentille sécurité). Le dernier ne sort que
  // le témoin du dépôt réel : les témoins synthétiques de `jugerLesSources` restent sous mutation.
  'REQ-JUR-035 : le binaire sur le dépôt sort en 0 et imprime les noms confrontés',
  'REQ-JUR-037 : le binaire `jur:lexique-social` sur le dépôt sort en 0 et imprime les fichiers lus',
  'REQ-SEC-029 : le dépôt réel — aucune faute, et un plancher de fichiers et d.attributs confrontés',
  // SEC-30 : ce témoin LIT le texte des sources de la console (src/server/console, src/app/(console)) ;
  // dans le bac, ce texte porte l'instrumentation de Stryker (vu rougir au run initial de la PR 667).
  // Joué par pnpm test, sur le vrai texte.
  'TÉMOIN STATIQUE — aucun code de la console ne pose valide_at à une création',
  // UX-P1-57 : ce témoin LIT le texte de src/server/console/mise-en-demeure/actions.ts, que Stryker
  // instrumente dans le bac. Joué par pnpm test, sur le vrai texte.
  'TÉMOIN statique — l.action ne lit ni le nombre ni l.historique des mises en demeure',
];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/unit/domaine/**/*.spec.ts',
      'tests/unit/contrat/**/*.spec.ts',
      'tests/unit/securite/**/*.spec.ts',
      'tests/unit/integration/**/*.spec.ts',
      'tests/unit/espace/**/*.spec.ts',
      // Le relais de courriel (INT-T10) : l'émetteur, le webhook des rebonds et leur migration, jugés
      // en processus avec des doubles — sans eux, les deux modules mutés sortaient « sans couverture »
      // (porte A de la PR 145 : 0 % sur `emetteur.ts` et `rebonds.ts`).
      'tests/unit/email/**/*.spec.ts',
      // `src/lib/` (GOV-101, second tour) : ses deux tests unitaires en processus, et eux seuls —
      // le reste de `tests/unit/qualite/` lance des gardes et Stryker lui-même en sous-processus.
      'tests/unit/qualite/env-fail-fast.spec.ts',
      'tests/unit/qualite/journal-redige.spec.ts',
      // La SSOT des seuils et des delais du contrat (JUR-T02) : sans ces tests, les mutants de
      // `src/domain/seuils/ssot.ts` ne sont juges par rien.
      'tests/unit/juridique/**/*.spec.ts',
      // UX-P1-41 : les témoins du rendu de l'e-mail au contact (`src/domain/confirmation/`), en processus.
      'tests/unit/micro-copy/**/*.spec.ts',
      // UX-P1-53 : les témoins de l'écran des gels du journal des accès (droit relu, liste bornée, curseur,
      // traces) et de la navigation dérivée de la matrice, en processus sur un faux client — sans eux,
      // les mutants de `gels-journal-acces.ts` et de `navigation.ts` sortaient « sans couverture »
      // (porte A de la PR 758 : 55,70 %).
      'tests/unit/console/gels-journal-acces-ecran.spec.ts',
      'tests/unit/console/navigation-par-role.spec.ts',
      // INT-T73-P : le témoin de la réconciliation des sommes, rangé sous tests/integration/ mais EN
      // PROCESSUS (lignes simulées et faux client, aucune base, aucun dépôt git, aucun sous-processus).
      'tests/integration/reconciliation-sommes.spec.ts',
      // UX-P1-16 : le témoin de la navigation de la console, en processus (aucun dépôt git ni sous-processus).
      'tests/unit/console/navigation-par-role.spec.ts',
      // UX-P1-57 : les témoins de l'action de mise en demeure (droit, step-up, refus, idempotence), en
      // processus sur des doubles — sans eux, les 94 mutants de `mise-en-demeure/actions.ts` sortaient
      // « sans couverture » (porte A de la PR 748 : 30,99 %).
      'tests/unit/console/mise-en-demeure.spec.ts',
      // UX-P1-56 : les témoins de la confirmation d'une anomalie (droit relu, clôture chiffrée, transition
      // selon l'état), en processus sur des doubles ; sans eux, `anomalies/confirmer.ts` sortirait
      // « sans couverture ».
      'tests/unit/console/confirmer-anomalie.spec.ts',
    ],
    exclude: [
      ...(base.test?.exclude ?? []),
      'tests/unit/domaine/journal-charge-fermee.spec.ts',
      'tests/unit/domaine/gardes-de-schema.spec.ts',
      'tests/unit/domaine/schema-centimes.spec.ts',
    ],
    testNamePattern: new RegExp(`^(?!.*(?:${ECARTES.join('|')})).*$`),
  },
});
