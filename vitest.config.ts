import { defineConfig } from 'vitest/config';

/**
 * Configuration de test du dépôt.
 *
 * ⚠️ CE FICHIER DOIT EXISTER, même minimal. Sans lui, Vitest REMONTE L'ARBORESCENCE et trouve
 * `C:\Users\willi\vitest.config.ts` — un résidu d'un autre chantier, qui réclame un
 * `vitest.setup.ts` absent d'ici. `pnpm test` échouait alors sur « Failed to load url …
 * vitest.setup.ts », c'est-à-dire sur la configuration d'un dépôt voisin, sans qu'aucun test
 * de celui-ci n'ait été exécuté. Une suite qui ne tourne pas ne garde rien.
 *
 * L'`include` reprend la convention déjà écrite dans `docs/gates.json`, où les 105 gates
 * déclarent leurs tests sous `tests/unit/**`.
 */
export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/schemas/**/*.{test,spec}.{ts,tsx}',
      // `tests/gov/**` est declare par DEUX sources de verite — `docs/REGLES-MAISON.md:5`
      // (`tests/gov/regles-maison.spec.ts`) et `docs/tasks.json` (quatre REQ de GOV-007 sur
      // `tests/gov/charte-pr.spec.ts`). Sans cette ligne les deux existent sans jamais tourner.
      'tests/gov/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'tests/e2e/**', 'tests/integration/**'],
    // Les gardes lancent `tsx` en sous-processus : 20 s par défaut ne suffisent pas toujours.
    testTimeout: 60_000,
    hookTimeout: 60_000,

    /**
     * PARALLÉLISME BORNÉ — et ce n'est pas un réglage de confort.
     *
     * Presque chaque test de `tests/unit/gouvernance/` lance une garde en SOUS-PROCESSUS
     * (`npx tsx scripts/gates/…`), et chacune en lance d'autres pour ses témoins. À dix-neuf
     * fichiers exécutés en parallèle, cela fait des dizaines de processus Node concurrents.
     *
     * Mesuré le 2026-09-04, même arbre, même commit :
     *   — suite complète en parallèle libre : 11 échecs sur 216 ;
     *   — chacun de ces fichiers lancé SEUL : 0 échec ;
     *   — suite complète en `--no-file-parallelism` : 4 échecs, tous réels.
     *
     * Autrement dit, sept « échecs » sur onze ne disaient rien du code : ils disaient que la
     * machine était saturée. C'est la pire espèce de rouge — il ressemble à une régression, il
     * change à chaque exécution, et il apprend à relancer au lieu de lire. Même famille que le
     * `| tail` sous `set -e` qui rend le code de `tail` : l'instrument ment.
     *
     * `maxForks` borne le nombre de fichiers concurrents sans revenir au séquentiel (397 s).
     * Si le nombre de fichiers de test double encore, remesurer plutôt que d'augmenter.
     */
    // `minForks` vaut par defaut le nombre de coeurs : le laisser seul fait
    // « options.minThreads and options.maxThreads must not conflict ». Les deux, toujours.
    poolOptions: { forks: { minForks: 1, maxForks: 3 } },
  },
});
