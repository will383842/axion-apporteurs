// Configuration ESLint — REQ-GOV-018 (« Prettier/ESLint versionnés ; lint et format bloquants en
// CI dès le socle »), livrée par GOV-014.
//
// ⚠️ CE FICHIER N'A JAMAIS ÉTÉ EXÉCUTÉ. `eslint` n'est pas dans les dépendances de ce dépôt au
// 2026-09-05, et `package.json` est un fichier PARTAGÉ qu'un développeur n'écrit pas : les
// dépendances et les scripts sont rendus en texte dans la PR de GOV-014, pour application en une
// passe par A01. Tant qu'ils ne sont pas appliqués, cette configuration est une DÉCLARATION, pas
// une mesure — et `gov:conventions` le dit à chaque exécution (périmètre « étapes de lint et de
// format en CI » : 0, motivé, repris par QA-T01).
//
// Ce que la garde `gov:conventions` (famille `outillage_non_epingle`) refusera le jour où l'étape
// arrivera : une étape `pnpm lint` sans `eslint` épinglé, sans script `lint`, ou sans cette
// configuration versionnée. Et la famille `lint_non_bloquant` refusera la même étape si elle porte
// `continue-on-error` — c'est LE point de l'exigence, pas un détail de câblage.
//
// LES TROIS RÈGLES DE FOND SONT DÉRIVÉES, PAS INVENTÉES. `docs/gates.json` décrit déjà ce que le
// job `gate-a` doit faire tourner : « ESLint (no-console, imports interdits sous src/domain,
// new Date() interdit dans le domaine) ». Elles sont écrites ici sous cette forme, et nulle part
// ailleurs (RM-01).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['node_modules/**', '.next/**', 'coverage/**', 'dist/**'] },

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
    // Les gardes IMPRIMENT leur verdict : c'est leur interface. Une garde muette ne garde rien.
    files: ['scripts/**/*.{ts,js,mjs}'],
    rules: { 'no-console': 'off' },
  },

  // En dernier : `eslint-config-prettier` éteint les règles de mise en forme qu'ESLint et Prettier
  // se disputeraient. Deux outils qui reformatent la même ligne dans deux sens font une CI qui
  // rougit sans qu'aucun humain n'ait tort.
  prettier
);
