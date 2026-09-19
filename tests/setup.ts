/**
 * Fichier de préparation chargé par Vitest AVANT chaque fichier de test (`setupFiles` de
 * `vitest.config.ts`) — QA-T01, REQ-QA-002.
 *
 * IL EST MINIMAL, ET C'EST VOULU. Il ne porte ni logique métier, ni horloge, ni base :
 *   — l'horloge s'injecte (`src/domain/temps/`), elle ne se fige pas ici ;
 *   — la base éphémère des tests d'intégration arrivera avec testcontainers.
 * Ce sont leurs tâches qui le rempliront, chacune dans sa PR.
 *
 * SON SEUL EFFET VÉRIFIABLE : il pose une marque que `tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts`
 * lit. Si `setupFiles` disparaît de la configuration, la marque manque et ce test rougit — un
 * fichier de préparation qu'on croit chargé et qui ne l'est pas est pire que pas de fichier.
 */
Reflect.set(globalThis, Symbol.for('axion-partners.tests.setup'), 'tests/setup.ts');
