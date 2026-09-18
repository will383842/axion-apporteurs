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
// GOV-031 avait laissé 13 AVERTISSEMENTS comptés (6 `no-explicit-any`, 7 `no-useless-assignment`),
// tolérés en `warn` dans deux blocs de dette qui nommaient leurs 7 fichiers un par un. QA-T01 les a
// CORRIGÉS À LA SOURCE et a retiré les deux blocs : `eslint .` sort en 0 sur le dépôt sans un seul
// avertissement, et chaque règle y rend en `error`. Zéro obtenu en éteignant une règle mesurerait la
// règle éteinte ; `tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts` plante une faute de
// chacune aux 7 chemins de l'ancienne dette et exige une ERREUR.
//
// UNE DÉROGATION VIT ICI, ET NULLE PART AILLEURS. Une règle éteinte est une entrée d'un bloc
// `files:`, un fichier ignoré une entrée d'`ignores`, et le motif de chacune est le commentaire
// COLLÉ au-dessus d'elle. `tests/unit/gouvernance/gardes-transposees.spec.ts` demande à ESLint ce
// qu'il applique à chaque fichier suivi : un fichier de code non lu, une configuration posée dans
// un sous-dossier, une exclusion ou un réglage du linter rouvert par bloc y rougissent.
//
// LES TROIS RÈGLES DE FOND SONT DÉRIVÉES, PAS INVENTÉES. `docs/gates.json` décrit déjà ce que le
// job `gate-a` doit faire tourner : « ESLint (no-console, imports interdits sous src/domain,
// new Date() interdit dans le domaine) ». Elles s'appliquent ici. Le spec les retape dans
// `INTERDITS` comme ORACLE, confronté à leur effet : c'est la divergence des deux qui rougit.

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
    // AUCUN COMMENTAIRE NE DÉSARME UNE RÈGLE. Sans ce réglage, `// eslint-disable-next-line
    // no-console` posé au-dessus d'une fuite la fait passer, sans motif et sans que rien ne le
    // voie. Une dérogation vit ICI, dans un bloc `files:` qui porte sa phrase, ou nulle part —
    // c'est la seule forme que l'acceptation de GOV-031 admet (« NOMMÉE et motivée »). Au
    // 2026-09-14, aucun fichier suivi ne porte de directive en ligne : le réglage ne coûte rien.
    linterOptions: { noInlineConfig: true },
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
    //
    // REQ-QA-001 (QA-T01) nomme ce que le lint BLOQUANT refuse ici : « ni Prisma, ni Redis, ni
    // fetch, ni new Date() » — la base, le cache, le réseau et l'horloge système, chacun par son nom
    // usuel. Le témoin qui lance `pnpm lint` sur une ligne fautive par interdit est
    // `tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts`. Les FORMES VOISINES — import sans
    // préfixe `'fs'`, `import()` dynamique, `globalThis.fetch`, `Date['now']` — ne sont PAS fermées
    // ici : c'est GOV-076 qui les ferme.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket'].map((name) => ({
          name,
          message:
            'src/domain/** est pur : aucun appel réseau. La donnée arrive en argument ' +
            '(REQ-QA-001, docs/CONVENTIONS.md §3).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...[
          ['Date', 'now'],
          ['performance', 'now'],
        ].map(([object, property]) => ({
          object,
          property,
          message:
            "src/domain/** ne lit pas l'horloge système : l'heure est injectée par le module " +
            '`temps` (REQ-QA-001, docs/CONVENTIONS.md §3).',
        })),
      ],
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
            {
              group: [
                'ioredis',
                'redis',
                'bullmq',
                'node:http',
                'node:https',
                'node:net',
                'undici',
              ],
              message:
                'src/domain/** est pur : ni cache, ni file de tâches, ni appel réseau ' +
                '(REQ-QA-001, docs/CONVENTIONS.md §3).',
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
    // sont requis par lui. La liste des globales de Node est IMPORTÉE du paquet `globals`, jamais
    // retapée (RM-01) : une copie locale divergerait de node à la première version, en silence.
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: {
      // Ce sont des modules CommonJS, et `require` y est le SEUL mécanisme d'import disponible :
      // `no-require-imports` y interdirait la seule forme qui fonctionne.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['scripts/**/*.{ts,js,mjs}'],
    rules: {
      // Les gardes IMPRIMENT leur verdict : c'est leur interface. Une garde muette ne garde rien.
      'no-console': 'off',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      // Même motif que les gardes : les 8 `no-console` de `tests/unit/gouvernance/
      // fiches-tiers.controles.ts` sont le RAPPORT que ce contrôle rend à qui le lance. Une suite
      // qui ne dit pas ce qu'elle a balayé laisse « 0 fichier vérifié » et « tout est conforme »
      // rendre exactement le même vert.
      'no-console': 'off',
    },
  },

  {
    // Deux fichiers, nommés un par un, et pas une famille. Si l'un d'eux est renommé, la dérogation
    // cesse de s'appliquer et le lint rougit — c'est le bon sens de panne.
    files: ['scripts/lot/corps-de-pr.ts', 'tests/unit/gouvernance/tete-de-pr-concorde.spec.ts'],
    rules: {
      // Leurs expressions régulières RETIRENT les séquences d'échappement ANSI (`\x1b[…m`) et les
      // retours arrière (`\x08`) de la sortie d'un outil avant de la lire. Le caractère de contrôle
      // est ce qu'on cherche à supprimer : `no-control-regex` y interdirait le nettoyage lui-même.
      'no-control-regex': 'off',
    },
  },

  // En dernier : `eslint-config-prettier` éteint les règles de mise en forme qu'ESLint et Prettier
  // se disputeraient. Deux outils qui reformatent la même ligne dans deux sens font une CI qui
  // rougit sans qu'aucun humain n'ait tort.
  prettier
);
