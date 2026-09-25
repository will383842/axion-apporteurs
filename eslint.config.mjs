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

// ── LES FORMES VOISINES DES INTERDITS DU DOMAINE (GOV-076, REQ-QA-001) ──────────────────────
//
// CHAQUE INTERDIT NE JUGEAIT QU'UNE SEULE FORME, et les formes voisines traversaient : un import
// de module écrit sans son préfixe, un import dynamique, une horloge système atteinte autrement
// que par son nom usuel, une écriture sur la console atteinte par un autre chemin.
//
// CE N'EST PAS UNE DETTE DE STYLE. REQ-QA-001 fait de la PURETÉ de `src/domain/**` la condition du
// calcul de commission (DM-04) et de l'horloge injectable (CPL-T13). Un domaine qui lit l'heure de
// la machine rend un résultat différent selon le jour où on le rejoue, et c'est un registre
// d'argent qu'on ne peut plus reconstituer. À fermer AVANT le premier code de domaine de la phase 0.
//
// LA LISTE EST EXPORTÉE, ET C'EST EXPRÈS : elle est IMPRIMÉE par
// `tests/unit/gouvernance/formes-voisines-des-interdits.spec.ts`, qui exerce CHACUNE de ses
// entrées et compte celles qu'il a réellement exercées. Une liste supposée n'est pas une liste
// couverte — c'est le défaut que cette tâche ferme, pas une tournure.
//
// LES FORMES VOISINES SE DÉRIVENT DES LISTES DE BASE, ELLES NE LES RETAPENT PAS. Motif `simplicite`
// sur la PR 114 : les sélecteurs recopiaient `fetch|XMLHttpRequest|WebSocket` et `Date|performance`.
// Un global ajouté à l'interdit de base aurait été refusé par son nom nu et aurait TRAVERSÉ par son
// porteur (`globalThis.EventSource`). Les deux listes ci-dessous sont les SEULES écritures de ces
// noms : `no-restricted-globals`, `no-restricted-properties` et les formes voisines en dérivent
// toutes.

/** Les globaux réseau interdits sous `src/domain/**` — l'interdit de base, `no-restricted-globals`. */
export const GLOBAUX_RESEAU_INTERDITS = ['fetch', 'XMLHttpRequest', 'WebSocket'];

/** Les horloges interdites — l'interdit de base, `no-restricted-properties` : `[objet, propriété]`. */
export const HORLOGES_INTERDITES = [
  ['Date', 'now'],
  ['performance', 'now'],
];

/** `/^(a|b)$/` sur des noms d'identifiant — le seul endroit où une liste devient un sélecteur. */
const alternance = (noms) => `/^(${[...new Set(noms)].join('|')})$/`;

/**
 * Les formes voisines, DÉRIVÉES de leurs listes de base. Exportée pour que le témoin puisse
 * ajouter un nom à une liste et exiger que sa forme par porteur le suive.
 */
export function formesVoisines({ reseau, horloges }) {
  const objetsHorloge = alternance(horloges.map(([objet]) => objet));
  return [
    {
      nom: 'import-dynamique',
      exemple: "export const lu = import('node:fs');",
      selector: 'ImportExpression',
      message:
        "src/domain/** est pur : un import DYNAMIQUE charge le même module qu'un import statique " +
        'et échappe à `no-restricted-imports`, qui ne lit que les imports écrits en tête de fichier. ' +
        'Aucun module ne se charge à la demande ici (REQ-QA-001).',
    },
    {
      nom: 'require',
      exemple: "export const fs = require('node:fs');",
      selector: "CallExpression[callee.name='require']",
      message:
        'src/domain/** est pur : `require` charge le même module et échappe à ' +
        '`no-restricted-imports` de la même façon (REQ-QA-001).',
    },
    {
      nom: 'horloge-par-acces-calcule',
      exemple: "export const t = Date['now']();",
      selector: `MemberExpression[computed=true][object.name=${objetsHorloge}]`,
      message:
        "src/domain/** ne lit pas l'horloge système : `Date['now']` atteint exactement ce que " +
        '`no-restricted-properties` interdit, par une clé que la règle ne voit pas. ' +
        "L'heure est injectée par le module `temps` (REQ-QA-001, docs/CONVENTIONS.md §3).",
    },
    {
      nom: 'horloge-par-un-porteur',
      exemple: 'export const t = globalThis.Date.now();',
      selector: `MemberExpression[property.name=${objetsHorloge}]`,
      message:
        "src/domain/** ne lit pas l'horloge système : l'atteindre par un PORTEUR " +
        '(`globalThis.Date`, `global.Date`) contourne le nom usuel que les règles surveillent ' +
        '(REQ-QA-001, docs/CONVENTIONS.md §3).',
    },
    {
      nom: 'reseau-par-un-porteur',
      exemple: "export const r = globalThis.fetch('https://exemple.test');",
      selector: `MemberExpression[property.name=${alternance(reseau)}]`,
      message:
        'src/domain/** est pur : atteindre le réseau par un PORTEUR (`globalThis.fetch`) contourne ' +
        '`no-restricted-globals`, qui ne juge que le nom nu. La donnée arrive en argument ' +
        '(REQ-QA-001).',
    },
    {
      nom: 'console-par-un-porteur',
      exemple: "export const f = () => globalThis.console.log('fuite');",
      selector: "MemberExpression[property.name='console']",
      message:
        'src/domain/** n’écrit pas sur la console : `globalThis.console` atteint exactement ce que ' +
        '`no-console` interdit, sans jamais écrire le nom que la règle lit (REQ-DM-041).',
    },
    {
      nom: 'console-par-acces-calcule',
      exemple: "export const f = () => console['log']('fuite');",
      selector: "MemberExpression[computed=true][object.name='console']",
      message:
        'src/domain/** n’écrit pas sur la console : une clé calculée atteint la même méthode que ' +
        '`console.log` (REQ-DM-041).',
    },
    {
      nom: 'console-par-le-flux',
      exemple: "export const f = () => process.stdout.write('fuite');",
      selector: "MemberExpression[object.name='process'][property.name=/^(stdout|stderr)$/]",
      message:
        'src/domain/** n’écrit sur aucun flux : `process.stdout.write` est la même fuite que ' +
        '`console.log`, un cran plus bas (REQ-DM-041, REQ-QA-001).',
    },
  ];
}

export const FORMES_VOISINES = formesVoisines({
  reseau: GLOBAUX_RESEAU_INTERDITS,
  horloges: HORLOGES_INTERDITES,
});

/**
 * LES MODULES INTERDITS SOUS `src/domain/**`, ÉCRITS DANS LEURS DEUX FORMES.
 *
 * Un module du cœur de node s'importe avec son préfixe (`node:fs`) ou sans (`fs`) : les deux
 * chargent le MÊME module, et la liste d'origine ne nommait que la première. La forme sans préfixe
 * est la forme voisine la plus banale de toutes, et elle traversait.
 */
export const MODULES_INTERDITS_DU_DOMAINE = [
  '@prisma/*',
  'next',
  'next/*',
  '*/prisma',
  'ioredis',
  'redis',
  'bullmq',
  'undici',
  // les deux écritures de chaque module du cœur, et leurs sous-chemins (`node:fs/promises`)
  ...['fs', 'child_process', 'http', 'https', 'net']
    .flatMap((m) => [m, `${m}/*`, `node:${m}`, `node:${m}/*`])
    .sort(),
];

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
        ...GLOBAUX_RESEAU_INTERDITS.map((name) => ({
          name,
          message:
            'src/domain/** est pur : aucun appel réseau. La donnée arrive en argument ' +
            '(REQ-QA-001, docs/CONVENTIONS.md §3).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...HORLOGES_INTERDITES.map(([object, property]) => ({
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
        // GOV-076 — les FORMES VOISINES, DÉRIVÉES de la liste exportée en tête de ce fichier et
        // jamais retapées ici : une seconde écriture de la même liste divergerait au premier ajout,
        // et c'est la copie qui serait lue.
        ...FORMES_VOISINES.map(({ selector, message }) => ({ selector, message })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // GOV-076 — les deux écritures de chaque module, DÉRIVÉES en tête de ce fichier.
              group: MODULES_INTERDITS_DU_DOMAINE,
              message:
                'src/domain/** est pur : aucune I/O, aucun accès base, aucun cache, aucun appel ' +
                'réseau, aucun couplage au cadre applicatif (REQ-QA-001, docs/CONVENTIONS.md §3). ' +
                '⚠️ Un module du cœur de node s’importe AVEC ou SANS son préfixe `node:` — les deux ' +
                'chargent le même module, et les deux sont interdits ici.',
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
