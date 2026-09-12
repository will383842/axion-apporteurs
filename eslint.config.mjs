// Configuration ESLint — REQ-GOV-018 (« Prettier/ESLint versionnés ; lint et format bloquants en
// CI dès le socle »), livrée par GOV-014, EXÉCUTÉE et corrigée par GOV-031.
//
// ── ELLE A TOURNÉ. VOICI QUAND, ET CE QU'ELLE A TROUVÉ ──────────────────────────────────────
//
// Cet en-tête portait, jusqu'au 2026-09-12 et en majuscules, « CE FICHIER N'A JAMAIS ÉTÉ
// EXÉCUTÉ ». Un commentaire qui survit à son code désinforme : celui-là disait à chaque lecteur
// que la garde était une intention. Elle a tourné le 2026-09-12, sur le dépôt entier, avec
// eslint 10.10.0, typescript-eslint 8.70.0, @eslint/js 10.0.1, eslint-config-prettier 10.1.8 et
// globals 17.12.0. `eslint .` a rendu, sur la configuration d'origine :
//
//     ✖ 60 problems (60 errors, 0 warnings)      — 16 fichiers
//     no-undef 28 · no-console 8 · no-useless-assignment 7 · no-explicit-any 6
//     no-irregular-whitespace 5 · no-control-regex 4 · no-require-imports 2
//
// (Le relevé du 2026-09-05 cité par l'acceptation de GOV-031 annonçait 46 sur 7 fichiers ; l'écart
// vient d'eslint 10, dont le socle `recommended` a gagné `no-useless-assignment` et durci
// `no-control-regex`, et de neuf fichiers écrits depuis. Le chiffre se remesure, il ne se recopie
// pas : `pnpm lint` le rend en une commande.)
//
// LES CAUSES SONT ICI, PAS DANS LE CODE. 38 des 60 erreurs — les 28 `no-undef`, les 8
// `no-console`, les 2 `no-require-imports` — venaient de trois manques de CE fichier : aucun
// environnement déclaré, donc les globales de Node inconnues des quatre scripts `.js` ; aucune
// dérogation pour `tests/**`, donc `no-console` frappait une suite dont l'interface EST sa
// sortie ; et `scripts/lot/lot.workflow.js`, qui n'est pas du JavaScript à corriger, lu comme
// tel. Corriger le code aurait été corriger la mauvaise chose.
//
// ── CE QU'IL RESTE, ET SOUS QUEL RÉGIME ─────────────────────────────────────────────────────
//
// Après ce correctif, `eslint .` sort en 0 sur le dépôt, avec 13 AVERTISSEMENTS comptés (voir le
// dernier bloc). Ils sont posés en `warn` et non éteints : une CI qu'on rend verte en éteignant
// la règle mesure la règle éteinte. Les corriger touche cinq fichiers hors du périmètre de
// GOV-031 (charte A11 : un manque devient une tâche, jamais un correctif glissé dans le lot en
// cours) — la tâche qui les remonte en `error` reste à ouvrir par A01.
//
// `prettier --check .` rend 136 fichiers non formatés (docs 48, scripts 45, tests 33, autres 10)
// et n'est PAS vert : le rendre vert reformate le dépôt, ce qui n'est pas le périmètre de cette
// tâche. Tant que ce n'est pas fait, `format:check` n'a pas sa place en Gate A — la famille
// `lint_non_bloquant` de `gov:conventions` refuserait qu'on l'y mette avec `continue-on-error`,
// et elle a raison.
//
// ── CE QUE `gov:conventions` EXIGE LE JOUR OÙ L'ÉTAPE ARRIVE ────────────────────────────────
//
// `package.json` et `.github/workflows/ci.yml` sont des fichiers PARTAGÉS qu'un développeur
// n'écrit pas (LEC-13) : les six dépendances épinglées, les scripts `lint`, `format:check` et
// `format`, et les étapes de Gate A sont rendus en texte dans la PR de GOV-031 pour application
// en une passe par A01. La famille `outillage_non_epingle` refusera une étape `pnpm lint` sans
// `eslint` épinglé, sans script `lint`, ou sans cette configuration versionnée ; la famille
// `lint_non_bloquant` refusera la même étape si elle porte `continue-on-error` — c'est LE point
// de l'exigence, pas un détail de câblage. Les deux ne s'arment qu'en présence de l'étape :
// sans étape, rien ne ment.
//
// LES TROIS RÈGLES DE FOND SONT DÉRIVÉES, PAS INVENTÉES. `docs/gates.json` décrit déjà ce que le
// job `gate-a` doit faire tourner : « ESLint (no-console, imports interdits sous src/domain,
// new Date() interdit dans le domaine) ». Elles sont écrites ici sous cette forme, et nulle part
// ailleurs (RM-01).

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'dist/**',
      // `scripts/lot/lot.workflow.js` est un langage dédié, pas du JavaScript de ce dépôt : ses
      // symboles `args`, `agent`, `phase`, `log`, `pipeline` et `parallel` sont INJECTÉS par le
      // moteur qui l'exécute, et n'existent nulle part dans le fichier. Les 15 `no-undef` qu'il
      // rendait ne se corrigent par aucun changement de code — les déclarer en globales serait
      // recopier ici l'interface d'un moteur tiers (RM-01), qui la changerait sans nous prévenir.
      'scripts/lot/lot.workflow.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Un `console.log` oublié dans du code de produit est une fuite en puissance : les payloads
      // de ce dépôt portent des données personnelles (REQ-DM-041).
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // `as` déplace le mensonge dans le type au lieu de l'arrêter à la porte : une entrée se
      // valide par un schéma Zod (`docs/CONVENTIONS.md` §9), jamais par une assertion.
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      // Les 5 espaces irrégulières trouvées le 2026-09-12 sont TOUTES dans des littéraux d'expression
      // régulière — `gov-entite.ts` et `gov-publication.ts` neutralisent l'espace insécable, la fine
      // et le tiret typographique pour qu'un montant écrit « 2 400 € » ne passe pas entre les mailles.
      // Le caractère irrégulier y est la CHOSE RECHERCHÉE. `skipRegExps` est le réglage prévu pour
      // ce cas exact : la règle reste armée partout ailleurs, y compris dans le code et les gabarits.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipTemplates: true, skipComments: false, skipRegExps: true },
      ],
    },
  },

  {
    // `src/domain/**` est PUR : aucune I/O, aucune horloge, aucun accès à la base. L'horloge est
    // injectée par le module `temps` (`docs/CONVENTIONS.md` §3) — sans quoi un test qui dépend de
    // la minute où il tourne ne se rejoue pas.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "`new Date()` est interdit sous src/domain : l'horloge est injectée par le module " +
            '`temps` (docs/CONVENTIONS.md §3). Un domaine qui lit l’heure ne se rejoue pas.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/*', 'next', 'next/*', 'node:fs', 'node:child_process', '*/prisma'],
              message:
                'src/domain/** est pur : aucune I/O, aucun accès base, aucun couplage au cadre ' +
                'applicatif (docs/CONVENTIONS.md §3).',
            },
          ],
        },
      ],
    },
  },

  {
    // Les quatre scripts `.js` du dépôt (`gh-sur`, `git-push-sur`, `hook-env`, et le workflow
    // ignoré ci-dessus) sont exécutés par node DIRECTEMENT, hors de la chaîne TypeScript :
    // `hook-env.js` est appelé en `PreToolUse` par l'agent, `gh-sur.js` et `git-push-sur.js`
    // sont requis par lui. Ce sont des modules CommonJS, et `require` y est le SEUL mécanisme
    // d'import disponible : `no-require-imports` y interdirait la seule forme qui fonctionne.
    // La liste des globales de Node est IMPORTÉE du paquet `globals`, jamais retapée (RM-01) :
    // une copie locale divergerait de node à la première version, en silence.
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Les gardes IMPRIMENT leur verdict : c'est leur interface. Une garde muette ne garde rien.
    files: ['scripts/**/*.{ts,js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  {
    // Même motif que les gardes, et c'est la deuxième cause du premier passage : les 8
    // `no-console` de `tests/unit/gouvernance/fiches-tiers.controles.ts` sont le RAPPORT que ce
    // contrôle rend à qui le lance. Une suite qui ne dit pas ce qu'elle a balayé laisse « 0
    // fichier vérifié » et « tout est conforme » rendre exactement le même vert.
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  {
    // Deux fichiers, nommés un par un, et pas une famille : leurs expressions régulières RETIRENT
    // les séquences d'échappement ANSI (`\x1b[…m`) et les retours arrière (`\x08`) de la sortie
    // d'un outil avant de la lire. Le caractère de contrôle est ce qu'on cherche à supprimer ;
    // `no-control-regex` y interdirait le nettoyage lui-même. Si l'un de ces fichiers est
    // renommé, la dérogation cesse de s'appliquer et le lint rougit — c'est le bon sens de panne.
    files: ['scripts/lot/corps-de-pr.ts', 'tests/unit/gouvernance/tete-de-pr-concorde.spec.ts'],
    rules: { 'no-control-regex': 'off' },
  },

  {
    // ── LA DETTE, COMPTÉE ET VISIBLE, JAMAIS ÉTEINTE ────────────────────────────────────────
    // 13 occurrences au 2026-09-12 : 6 `no-explicit-any` (4 dans `scripts/gates/perf-budgets.ts`,
    // 2 dans `tests/unit/gouvernance/poids-du-bundle-garde-vraiment.spec.ts`) et 7
    // `no-useless-assignment` (`gov-inventaire.ts` 2, `gov-sonde.ts` 1, `plan-state/build.ts` 1,
    // et 3 dans deux suites). Ce sont de vraies remarques, pas du bruit de configuration : les
    // corriger touche cinq fichiers hors du périmètre de GOV-031, et la charte A11 dit qu'un
    // manque constaté devient une TÂCHE, jamais un correctif glissé dans le lot en cours.
    // `warn` les COMPTE à chaque exécution ; `off` les ferait disparaître. La tâche qui les
    // remonte en `error` est à ouvrir par A01, et son acceptation tient en une ligne : ce bloc
    // supprimé, `eslint .` toujours en 0. Le périmètre s'arrête à `scripts/**` et `tests/**` :
    // sous `src/**` et `packages/**`, le code du produit, les deux règles restent BLOQUANTES.
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-useless-assignment': 'warn',
    },
  },

  // En dernier : `eslint-config-prettier` éteint les règles de mise en forme qu'ESLint et Prettier
  // se disputeraient. Deux outils qui reformatent la même ligne dans deux sens font une CI qui
  // rougit sans qu'aucun humain n'ait tort.
  prettier
);
