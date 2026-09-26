import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * La configuration de test que Stryker lance — QA-T30 (REQ-QA-002).
 *
 * C'est `vitest.config.ts`, réduite aux tests UNITAIRES EN PROCESSUS du domaine et du serveur
 * (`tests/unit/domaine/**`, `tests/unit/contrat/**`, puis, depuis GOV-101, `tests/unit/securite/**`,
 * `tests/unit/integration/**` et `tests/unit/espace/**`) : le travail de nuit ne mute que
 * `src/domain/**`, `pnpm mutation:pr` mute aussi les fichiers de `src/server/**` que la PR touche,
 * et chaque mutant est jugé par les tests qui le couvrent (`coverageAnalysis: perTest`, `related`).
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
 *  - trois tests LISENT le texte d'une source du domaine au lieu de l'exécuter : dans le bac, ce
 *    texte porte l'instrumentation de Stryker. Aucun mutant n'y survit ni n'y meurt ;
 *  - deux tests balaient les fichiers suivis sous `src/` (dépôt git requis) ;
 *  - un test exécute le code, mais sous un BUDGET de temps (moins de 5 s pour quinze ans d'heures)
 *    que l'instrumentation fait dépasser : mesuré à 7,3 s.
 * Tous tournent dans `pnpm test`, sur le vrai texte. Les titres sont des fragments d'expression
 * régulière : le point tient lieu de l'apostrophe typographique.
 *
 * ⚠️ Stryker tourne en BAC À SABLE, jamais en place : une passe en place interrompue laisse
 * l'instrumentation dans l'arbre de travail — mesuré le 2026-09-25, 220 fichiers suivis réécrits.
 */
const ECARTES = [
  'aucun fichier de src/domain/temps/ ne nomme Date',
  'le module n.écrit aucune durée de dormance en dur',
  'le module n.importe que le domaine',
  'chaque heure de 2026 à 2040 : `versParis` concorde avec Intl',
  'aucun fichier suivi sous src/ n.importe à la fois la dérivation et un envoi',
  'aucun module suivi sous src/ ne porte de barème de score',
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
