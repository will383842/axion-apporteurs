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
  },
});
