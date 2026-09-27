/**
 * semgrep.ts — Gate sécurité : semgrep (QA-T07, REQ-QA-013 ; règle maison n° 1 sous REQ-SEC-008).
 *
 * USAGE : pnpm sec:semgrep          (le dépôt réel : `src/`, règles maison + jeux publics)
 *         pnpm sec:semgrep:prove    (le témoin : un bac jetable, une faute plantée par forme)
 *
 * ── L'INSTRUMENT : L'IMAGE OFFICIELLE, ÉPINGLÉE AU CONDENSAT, EN CI COMME SUR LE POSTE ──────
 *
 * Semgrep n'a pas d'exécution Windows native fiable, et une version installée par `pip` en CI à
 * côté d'une autre sur le poste feraient deux instruments. On lance donc TOUJOURS l'image
 * officielle, par `spawnSync('docker', [...])` et un tableau d'arguments (aucun shell : aucune
 * conversion de chemin par Git Bash). Le condensat est celui de l'INDEX multi-architecture
 * (amd64 et arm64) : `docker run` refuse une image dont le condensat diffère, c'est lui qui
 * vérifie. Une image sans condensat est refusée en étant nommée (`image_non_epinglee`).
 *
 * ── CE QUI EST MONTÉ, ET POURQUOI PAS LA RACINE DU DÉPÔT (mesuré le 2026-09-19) ─────────────
 *
 *   — `src/` SEUL, en lecture seule, sous `/depot/src`. Monter la racine coûtait 3 min 35 par
 *     passage (Docker Desktop parcourt `node_modules/` à travers le montage) contre 16 à 27 s,
 *     et le `.git` d'un worktree pointe un chemin Windows introuvable dans le conteneur.
 *   — la cible est `.` depuis `/depot`, jamais `src` : les `paths.include` des règles sont
 *     ANCRÉS à la racine de projet (`/src/...`), et sans `.git` semgrep prend la CIBLE pour
 *     racine — cible `src`, la règle ne matchait plus rien et le passage sortait en 0.
 *   — un `.semgrepignore` VIDE à la racine. Sans fichier, semgrep applique une liste implicite
 *     qui saute `tests/`, `test/`, `node_modules/`, `dist/` — sous `src/server/espace/` aussi :
 *     5 fichiers analysés sur 9 dans le bac de mesure. Le fichier vide annule cette liste.
 *   — `.semgrep.yml` sous `/maison/regles.yml` : semgrep préfixe l'identifiant d'une règle
 *     locale par son dossier, ce qui sépare les règles MAISON (`maison.…`) des règles publiques.
 *
 * ── LES RÈGLES PUBLIQUES SONT CHARGÉES DU REGISTRE À L'EXÉCUTION, PAS RECOPIÉES ──────────────
 *
 * Le dépôt est PUBLIC et les règles du registre sont sous licence propre : elles ne sont pas
 * vendues ici. Deux conséquences, assumées : (a) la gate dépend du réseau vers le registre, et
 * une indisponibilité la fait ROUGIR (semgrep sort en erreur) — elle ne saute jamais ; (b) un
 * jeu public peut gagner une règle entre deux passages. Une règle publique écartée l'est par
 * `--exclude-rule`, dans la table `EXCLUSIONS` ci-dessous, une ligne = un identifiant + un
 * motif, imprimée à chaque passage. Aucune exclusion en ligne : `--disable-nosem` éteint les
 * commentaires `nosemgrep`, et le témoin le prouve.
 *
 * ── CE QUE LE VERT AFFIRME ─────────────────────────────────────────────────────────────────
 *
 * Zéro constat ; zéro erreur rapportée par semgrep ; chaque fichier de code présent sous `src/`
 * ANALYSÉ (un fichier sauté est une faute, pas un silence) ; le compte des règles RÉELLEMENT
 * exécutées, lu dans `time.rules` de la sortie `--json --time` — jamais la longueur de
 * `.semgrep.yml` — avec un plancher de règles maison et de règles publiques ; chaque règle
 * maison exécutée a SON témoin, et chaque témoin vise une règle exécutée.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── l'instrument ──────────────────────────────────────────────────────────────────────────────

/** La version épinglée. Elle est confrontée au champ `version` de la sortie de semgrep. */
export const VERSION = '1.176.1';

/** Condensat de l'INDEX de `semgrep/semgrep:1.176.1` (amd64 + arm64), relevé le 2026-09-19. */
export const IMAGE = `semgrep/semgrep:${VERSION}@sha256:34ab619bf1391a24bfda3f05debd0d8a6ce3093c2d5f9d39cfc00f83c1397823`;

/**
 * Les options fixes. `--error` : un constat fait sortir semgrep en 1. `--disable-nosem` : un
 * commentaire `nosemgrep` n'éteint rien. `--metrics=off` : aucune télémétrie depuis un dépôt
 * public (mesuré : acceptée avec les jeux du registre). `--json --time` : la sortie qu'on JUGE,
 * et la liste des règles exécutées.
 */
export const OPTIONS_FIXES: readonly string[] = [
  '--error',
  '--disable-nosem',
  '--metrics=off',
  '--json',
  '--time',
];

/** Les jeux publics retenus — mesurés présents et chargés sur la version épinglée. */
export const JEUX_PUBLICS: readonly string[] = ['p/typescript', 'p/nodejs'];

/** Une règle publique écartée : son identifiant exact, et pourquoi. */
export interface Exclusion {
  readonly id: string;
  readonly motif: string;
}

/** La table des règles publiques écartées. Vide : aucune n'a été écartée à ce jour. */
export const EXCLUSIONS: readonly Exclusion[] = [];

/** Le fichier des règles maison, à la racine du dépôt. */
export const FICHIER_REGLES = '.semgrep.yml';

const DEPOT = '/depot';
const MONTAGE_REGLES = '/maison/regles.yml';
/** Dérivé du point de montage, jamais tapé une seconde fois : semgrep préfixe par le dossier. */
export const PREFIXE_MAISON = `${MONTAGE_REGLES.split('/')[1]}.`;

/** Au moins deux règles maison exécutées (les deux de QA-T07). */
export const PLANCHER_MAISON = 2;

/**
 * Le plancher des règles PUBLIQUES, mesuré — pas deviné. « Au moins une » laissait passer un jeu
 * vidé ou tronqué au registre : 74 règles exécutées contre un plancher de 1, la gate serait
 * restée verte avec 73 règles en moins (revue `securite` du 2026-09-19, PR 82).
 *
 * MESURE du 2026-09-21, image `semgrep/semgrep:1.176.1@sha256:34ab619b…`, sur un fichier d'une
 * ligne pour ne compter que le CHARGEMENT des jeux :
 *
 *   `p/typescript` seul .......... 74 règles
 *   `p/nodejs` seul .............. 36 règles
 *   les deux ensemble ............ 74 règles
 *
 * Fait qui change la lecture : sur cette version, **`p/nodejs` est contenu dans `p/typescript`**
 * (74 ∪ 36 = 74). Un plancher qui rougirait « si un jeu disparaît » ne peut donc porter que sur
 * l'UNION — retirer `p/nodejs` de `JEUX_PUBLICS` ne changerait pas le compte, et aucun seuil ne
 * le verrait. Le plancher est l'union mesurée : retirer `p/typescript` (→ 36) rougit, et toute
 * troncature du jeu rougit aussi.
 *
 * Conséquence ASSUMÉE : si le registre RETIRE une règle en amont, la gate rougit. C'est voulu —
 * on remesure et on met à jour cette constante avec sa date, on ne l'abaisse jamais « pour que
 * ça passe ». Une règle publique ajoutée en amont, elle, ne rougit pas (le test est `≥`).
 */
export const PLANCHER_PUBLIC = 74;

/** Les extensions de code que les règles couvrent : un tel fichier sous `src/` DOIT être analysé. */
export const EXTENSIONS_ANALYSEES: readonly string[] = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];

// ── les témoins : UNE copie, exportée, que la spec importe ────────────────────────────────────

export const REGLE_PRISMA = 'axion-prisma-hors-couche-d-acces';
export const REGLE_SQL = 'axion-sql-brut-non-parametre';

/** Un fichier du bac. `regle` nulle : contre-témoin, aucun constat attendu. */
export interface FichierDuBac {
  readonly nom: string;
  readonly chemin: string;
  readonly lignes: readonly string[];
  readonly regle: string | null;
  /** Rang (1-based) de la ligne fautive dans `lignes` ; 0 pour un contre-témoin. */
  readonly ligneFautive: number;
}

/** Le dossier du MILIEU de l'espace : ni la racine du périmètre, ni sa dernière feuille. */
const MILIEU_ESPACE = 'src/server/espace/a/b';

/**
 * L'antislash, écrit par son CODE. Les témoins d'échappement plantent un antislash dans le TEXTE
 * du fichier ; écrit doublé dans une chaîne de ce fichier-ci, il se relit mal, et des outils
 * d'édition réinterprètent une séquence `u` + quatre chiffres. Une seule source pour tous.
 */
const AS = String.fromCharCode(0x5c);

/**
 * Des BLANCS UNICODE que TypeScript admet entre deux jetons, écrits par leur CODE pour la même
 * raison que l'antislash : invisibles dans le texte, ils se relisent mal. Espace insécable
 * U+00A0, espace ogham U+1680, espace fine insécable U+202F, espace idéographique U+3000,
 * ZWNBSP U+FEFF.
 */
const NBSP = String.fromCharCode(0xa0);
const OGHAM = String.fromCharCode(0x1680);
const FINE = String.fromCharCode(0x202f);
const IDEO = String.fromCharCode(0x3000);
const ZWNBSP = String.fromCharCode(0xfeff);

/** Les formes d'accès direct au client de base que la règle n° 1 refuse. */
const FORMES_PRISMA: readonly { nom: string; ext: string; lignes: string[]; fautive: number }[] = [
  {
    nom: 'import',
    ext: 'ts',
    lignes: ["import { PrismaClient } from '@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'import-type',
    ext: 'ts',
    lignes: ["import type { Apporteur } from '@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'export-from',
    ext: 'ts',
    lignes: ["export { Prisma } from '@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'export-type-from',
    ext: 'ts',
    lignes: ["export type { Apporteur } from '@prisma/client';"],
    fautive: 1,
  },
  // Les formes TEXTUELLES de la limite (c) écrites avec un BLANC UNICODE ou un COMMENTAIRE entre
  // leurs mots (revues `securite` 5329281085 et `exactitude` 5329280901, PR 82) : TypeScript les
  // admet, et une classe de blancs ASCII (`\s`) ne les lisait pas.
  {
    nom: 'export-type-from-espace-insecable',
    ext: 'ts',
    lignes: [`export${NBSP}type { Apporteur } from '@prisma/client';`],
    fautive: 1,
  },
  {
    nom: 'export-type-from-commentaire',
    ext: 'ts',
    lignes: ["export /* c */ type { Apporteur } from '@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'export-type-from-espace-ideographique',
    ext: 'ts',
    lignes: [`export type${IDEO}{ Apporteur } from '@prisma/client';`],
    fautive: 1,
  },
  {
    nom: 'export-type-en-ligne-espace-insecable',
    ext: 'ts',
    lignes: [`export { type Apporteur }${NBSP}from '../../lib/prisma.js';`],
    fautive: 1,
  },
  {
    nom: 'require',
    ext: 'ts',
    lignes: ["export const client = require('@prisma/client');"],
    fautive: 1,
  },
  {
    nom: 'require-js',
    ext: 'js',
    lignes: ["module.exports = require('@prisma/client');"],
    fautive: 1,
  },
  {
    nom: 'import-dynamique',
    ext: 'ts',
    lignes: ["export const charger = () => import('@prisma/client');"],
    fautive: 1,
  },
  {
    nom: 'alias-lib-prisma',
    ext: 'ts',
    lignes: ["import { prisma } from '@/lib/prisma';"],
    fautive: 1,
  },
  { nom: 'relatif-db', ext: 'ts', lignes: ["import { db } from '../../../db';"], fautive: 1 },
  {
    nom: 'relatif-db-index',
    ext: 'ts',
    lignes: ["import { db } from '../../../db/index';"],
    fautive: 1,
  },
  // Des CHARGEURS qui ne s'écrivent pas `require(...)` : le module par son objet, le chargeur
  // fabriqué, le chargeur ré-affecté, l'import dynamique à attributs (revue `exactitude`, PR 82).
  {
    nom: 'module-require',
    ext: 'ts',
    lignes: ["export const client = module.require('@prisma/client');"],
    fautive: 1,
  },
  {
    nom: 'create-require',
    ext: 'ts',
    lignes: [
      "import { createRequire } from 'node:module';",
      "export const client = createRequire(import.meta.url)('@prisma/client');",
    ],
    fautive: 2,
  },
  {
    nom: 'require-reaffecte',
    ext: 'ts',
    lignes: ['const charger = require;', "export const client = charger('@prisma/client');"],
    fautive: 1,
  },
  {
    nom: 'import-dynamique-attributs',
    ext: 'ts',
    lignes: ["export const charger = () => import('@prisma/client', { with: { type: 'js' } });"],
    fautive: 1,
  },
  // Le chargeur par ses PROPRIÉTÉS et par crochets, et un segment `db` suivi d'un suffixe pointé
  // (revue `securite` 5328211580, PR 82). Placés au MILIEU de la liste : ni premiers ni derniers
  // du bac. La liaison `export import p = require(…)` est dans `FORMES_PRISMA_REFUSEES_PARTOUT` :
  // la règle n° 2 refuse tout import-equals sous `src/`.
  {
    nom: 'require-call',
    ext: 'ts',
    lignes: ["export const client = require.call(null, '../../db');"],
    fautive: 1,
  },
  {
    nom: 'require-apply',
    ext: 'ts',
    lignes: ["export const client = require.apply(null, ['../db']);"],
    fautive: 1,
  },
  {
    nom: 'require-call-cjs',
    ext: 'cjs',
    lignes: ["module.exports = require.call(null, '../../db');"],
    fautive: 1,
  },
  {
    nom: 'module-require-calcule',
    ext: 'ts',
    lignes: ["export const client = module['require']('../../db');"],
    fautive: 1,
  },
  {
    nom: 'module-require-reaffecte',
    ext: 'ts',
    lignes: ['export const charger = module.require;'],
    fautive: 1,
  },
  {
    nom: 'segment-db-suffixe',
    ext: 'ts',
    lignes: ["import { db } from '../db.server';"],
    fautive: 1,
  },
  // Le client atteint par son chemin DANS `node_modules`, et sa déclaration `.d.ts`.
  {
    nom: 'node-modules',
    ext: 'ts',
    lignes: ["import { PrismaClient } from '../../../../../node_modules/@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'node-modules-point-prisma',
    ext: 'ts',
    lignes: ["import type { Charge } from '../../../../../node_modules/.prisma/client/index.js';"],
    fautive: 1,
  },
  {
    nom: 'declaration-dts',
    ext: 'ts',
    lignes: ["import type { Charge } from '../../lib/prisma.d.ts';"],
    fautive: 1,
  },
  {
    nom: 'point-prisma',
    ext: 'ts',
    lignes: ["import type { Charge } from '.prisma/client/index';"],
    fautive: 1,
  },
  // La ligne fautive est celle où COMMENCE la liaison de module, et non celle du `from` : le
  // motif AST rend la portée de l'instruction entière, là où l'ancienne regex ne voyait que sa
  // dernière ligne. Rendre l'instruction est plus précis, pas moins.
  {
    nom: 'import-multiligne',
    ext: 'ts',
    lignes: ['import {', '  PrismaClient,', '  Prisma,', "} from '@prisma/client';"],
    fautive: 1,
  },
  // Un spécifieur PORTANT SON EXTENSION : sous `moduleResolution: bundler`, `prisma.js` et
  // `prisma.ts` résolvent au même module que `prisma` (revue `securite`, PR 82).
  {
    nom: 'extension-js',
    ext: 'ts',
    lignes: ["import { prisma } from '../../lib/prisma.js';"],
    fautive: 1,
  },
  {
    nom: 'extension-ts',
    ext: 'ts',
    lignes: ["import { prisma } from '../../lib/prisma.ts';"],
    fautive: 1,
  },
  {
    nom: 'extension-alias',
    ext: 'ts',
    lignes: ["import { prisma as db } from '../../lib/prisma.js';"],
    fautive: 1,
  },
  {
    nom: 'extension-db-index',
    ext: 'ts',
    lignes: ["import { db } from '../../../db/index.mts';"],
    fautive: 1,
  },
  {
    nom: 'extension-require',
    ext: 'ts',
    lignes: ["export const client = require('../../lib/prisma.cjs');"],
    fautive: 1,
  },
  {
    nom: 'extension-import-dynamique',
    ext: 'ts',
    lignes: ["export const charger = () => import('../../lib/db.mjs');"],
    fautive: 1,
  },
  {
    nom: 'import-defaut',
    ext: 'ts',
    lignes: ["import client from '@/lib/prisma.js';"],
    fautive: 1,
  },
  {
    nom: 'import-espace-de-noms',
    ext: 'ts',
    lignes: ["import * as P from '@prisma/client';"],
    fautive: 1,
  },
  { nom: 'import-effet', ext: 'ts', lignes: ["import '@/lib/prisma.ts';"], fautive: 1 },
  {
    nom: 'export-etoile',
    ext: 'ts',
    lignes: ["export * as P from '@prisma/client';"],
    fautive: 1,
  },
  {
    nom: 'export-type-en-ligne',
    ext: 'ts',
    lignes: ["export { type Apporteur } from '../../lib/prisma.js';"],
    fautive: 1,
  },
  {
    nom: 'new-prismaclient',
    ext: 'ts',
    lignes: [
      'declare const PrismaClient: new () => object;',
      'export const client = new PrismaClient();',
    ],
    fautive: 2,
  },
];

/**
 * Les formes de la règle n° 1 que la règle n° 2 refuse AUSSI dans tout `src/` : le spécifieur ou
 * le chargeur écrits par ÉCHAPPEMENT (revue `exactitude` 5328459424, PR 82 — semgrep compare le
 * TEXTE source, et `'@pri` + échappement + `ma/client'` a la même VALEUR que le client), et la
 * liaison import-equals (revue `exactitude` 5328984956). Hors de `FORMES_PRISMA` parce que leurs
 * copies sous `src/server/acces/` ne seraient pas des contre-témoins muets.
 */
const FORMES_PRISMA_REFUSEES_PARTOUT: readonly {
  nom: string;
  lignes: string[];
  fautive: number;
  ext?: string;
}[] = [
  {
    nom: 'echappement-unicode-specifieur',
    lignes: [`import { Prisma } from '@pri${AS}u0073ma/client';`],
    fautive: 1,
  },
  {
    nom: 'echappement-identite-specifieur',
    lignes: [`import { db } from '../../${AS}db';`],
    fautive: 1,
  },
  {
    nom: 'echappement-hexa-specifieur',
    lignes: [`import { db } from '../../d${AS}x62';`],
    fautive: 1,
  },
  // L'octal hérité À ZÉRO DE TÊTE (JavaScript non strict) : `0` + `57` vaut la barre oblique,
  // et le spécifieur vaut `../../db`. Les chiffres 1 à 9 tombent sous l'identité ; celui-ci ne
  // tombe que sous le bras « `0` suivi d'un chiffre ».
  {
    nom: 'echappement-octal-zero-specifieur',
    ext: 'js',
    lignes: [`module.exports = require('..${AS}057..${AS}057db');`],
    fautive: 1,
  },
  // L'INTERPOLATION d'un `String.raw` réduite à un littéral de chaîne écrit par échappement
  // (revue `exactitude` 5328789820, PR 82) : `String.raw` rend le littéral déjà DÉCODÉ, et le
  // spécifieur vaut le client. Refusée comme classe — toute interpolation d'un `String.raw`.
  {
    nom: 'interpolation-brute-import-dynamique',
    lignes: [`export const charger = () => import(String.raw\`\${'@pri${AS}u0073ma/client'}\`);`],
    fautive: 1,
  },
  {
    nom: 'interpolation-brute-require',
    lignes: [`export const client = require(String.raw\`../\${'../${AS}x64b'}\`);`],
    fautive: 1,
  },
  {
    nom: 'interpolation-brute-parenthese-double',
    lignes: [`export const charger = () => import(String.raw\`\${("@pri${AS}u0073ma/client")}\`);`],
    fautive: 1,
  },
  {
    nom: 'export-import-require',
    lignes: ["export import p = require('../db');"],
    fautive: 1,
  },
  // La même liaison, que l'AST ne représente pas, écrite avec un nom et des blancs UNICODE (revue
  // `securite` 5329281085, PR 82) : le bras textuel de la règle n° 1 doit la lire lui aussi.
  {
    nom: 'export-import-require-unicode',
    lignes: [`export import${NBSP}pé${IDEO}= require${NBSP}('../db');`],
    fautive: 1,
  },
  {
    nom: 'echappement-barre-oblique-specifieur',
    lignes: [`import { PrismaClient } from '@prisma${AS}/client';`],
    fautive: 1,
  },
  {
    nom: 'echappement-unicode-require',
    lignes: [`export const client = requ${AS}u0069re('../../db');`],
    fautive: 1,
  },
  {
    nom: 'echappement-hexa-module-require',
    lignes: [`export const client = module['requ${AS}x69re']('../../db');`],
    fautive: 1,
  },
];

/** Les formes de SQL brut non paramétré que la règle n° 2 refuse. */
const FORMES_SQL: readonly { nom: string; lignes: string[]; fautive: number; ext?: string }[] = [
  {
    nom: 'query-raw-unsafe',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      'export const lire = (q: string) => p.$queryRawUnsafe(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'execute-raw-unsafe',
    lignes: [
      'declare const p: { $executeRawUnsafe(q: string): unknown };',
      'export const ecrire = (q: string) => p.$executeRawUnsafe(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'query-raw-unsafe-destructure',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      'const { $queryRawUnsafe } = p;',
      'export const lire = (q: string) => $queryRawUnsafe(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma.raw(x);',
    ],
    fautive: 2,
  },
  // TOUTE référence au membre dangereux, pas seulement l'appel écrit en toutes lettres
  // (revue `securite`, PR 82) : accès calculé, renommage, alias, espace de noms.
  {
    nom: 'query-raw-unsafe-calcule',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      "export const lire = (q: string) => p['$queryRawUnsafe'](q);",
    ],
    fautive: 2,
  },
  {
    nom: 'execute-raw-unsafe-calcule',
    lignes: [
      'declare const p: { $executeRawUnsafe(q: string): unknown };',
      'export const ecrire = (q: string) => p["$executeRawUnsafe"](q);',
    ],
    fautive: 2,
  },
  {
    nom: 'query-raw-unsafe-gabarit',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      'export const lire = (q: string) => p[`$queryRawUnsafe`](q);',
    ],
    fautive: 2,
  },
  {
    nom: 'execute-raw-unsafe-renomme',
    lignes: [
      'declare const p: { $executeRawUnsafe(q: string): unknown };',
      'const { $executeRawUnsafe: brut } = p;',
      'export const ecrire = (q: string) => brut(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-reference',
    lignes: ["import { Prisma } from '@prisma/client';", 'export const brut = Prisma.raw;'],
    fautive: 2,
  },
  // Le namespace `Prisma` qui QUITTE sa liaison d'import — chaînage optionnel, assertion non
  // nulle, ré-affectation, paramètre par défaut, objet, `satisfies`, reste, argument — n'est plus
  // résolu par semgrep : c'est la SORTIE qui est refusée, pas chaque orthographe (revue
  // `exactitude`, PR 82).
  {
    nom: 'prisma-raw-chainage-optionnel',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma?.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-non-nul',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma!.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-alias-optionnel',
    lignes: [
      "import { Prisma as P } from '@prisma/client';",
      'export const fragment = (x: string) => P?.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-espace-de-noms-non-nul',
    lignes: [
      "import * as C from '@prisma/client';",
      'export const fragment = (x: string) => C.Prisma!.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-satisfies',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { raw } = Prisma satisfies object;',
      'export const fragment = (x: string) => raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-let-affecte',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'let P;',
      'P = Prisma;',
      'export const fragment = (x: string) => P.raw(x);',
    ],
    fautive: 3,
  },
  {
    nom: 'prisma-raw-parametre-defaut',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string, P = Prisma) => P.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-objet',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const o = { P: Prisma };',
      'export const fragment = (x: string) => o.P.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-reste',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { sql, ...reste } = Prisma;',
      'export const fragment = (x: string) => reste.raw(x) ?? sql;',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-reflect',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      "export const brut = Reflect.get(Prisma, 'raw');",
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-import-dynamique-renomme',
    lignes: [
      'export const fragment = async (x: string) => {',
      "  const { Prisma: Q } = await import('@prisma/client');",
      '  return Q.raw(x);',
      '};',
    ],
    fautive: 2,
  },
  // Le constructeur de fragment : `new Prisma.Sql([x], [])` range `x` dans le TEXTE de la requête.
  {
    nom: 'prisma-sql-constructeur',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => new Prisma.Sql([x], []);',
    ],
    fautive: 2,
  },
  // ── Placés au MILIEU de la liste (revues `exactitude` 5328209488 et `securite` 5328211580,
  //    PR 82) : ni premiers ni derniers du bac. ──
  // Le namespace atteint par ACCÈS CALCULÉ sur l'objet module du client — espace de noms, défaut,
  // `import()` attendu, `require`, gabarit, `Reflect.get` : le nom `Prisma` écrit comme chaîne.
  {
    nom: 'prisma-calcule-espace-de-noms',
    lignes: [
      "import * as C from '@prisma/client';",
      "export const fragment = (x: string) => C['Prisma'].raw(x);",
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-calcule-defaut',
    lignes: [
      "import pc from '@prisma/client';",
      "export const fragment = (x: string) => pc['Prisma']['raw'](x);",
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-calcule-import-dynamique',
    lignes: [
      "export const fragment = async (x: string) => (await import('@prisma/client'))['Prisma'].raw(x);",
    ],
    fautive: 1,
  },
  {
    nom: 'prisma-calcule-require',
    lignes: ["export const fragment = (x: string) => require('@prisma/client')['Prisma'].raw(x);"],
    fautive: 1,
  },
  {
    nom: 'prisma-calcule-gabarit-sql',
    lignes: [
      "import * as C from '@prisma/client';",
      'export const fragment = (x: string) => new C[`Prisma`].Sql([x], []);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-calcule-reflect',
    lignes: [
      "import * as C from '@prisma/client';",
      "export const fragment = (x: string) => Reflect.get(C, 'Prisma').raw(x);",
    ],
    fautive: 2,
  },
  // Le NOM `$queryRawUnsafe` / `$executeRawUnsafe` écrit EN CLAIR, refusé comme CLASSE où qu'il
  // soit (revue `exactitude` 5328984956, PR 82) : la déstructuration RENOMMÉE hors d'une
  // déclaration de variable — paramètre de fonction ou de flèche, seule ou parmi d'autres clés,
  // affectation, `for … of`, imbriquée — et la clé d'objet. Aucune n'était prise : le motif
  // renommé ne voyait que `var { … } = …`. Aucune ligne 1 ne nomme le membre : la ligne fautive
  // est la seule qui l'écrit.
  {
    nom: 'unsafe-renomme-parametre-fonction',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'export async function lireBrut({ $queryRawUnsafe: brut }: PrismaClient, requete: string) { return brut(requete); }',
    ],
    fautive: 2,
  },
  {
    nom: 'unsafe-renomme-parametre-fonction-execute',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'export async function ecrireBrut({ $executeRawUnsafe: brut }: PrismaClient, requete: string) { return brut(requete); }',
    ],
    fautive: 2,
  },
  {
    nom: 'unsafe-renomme-parametre-fleche',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'export const lire = ({ $queryRawUnsafe: u }: PrismaClient, q: string) => u(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'unsafe-renomme-parametre-fleche-parmi',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'export const ecrire = ({ $connect, $executeRawUnsafe: u, $disconnect }: PrismaClient, q: string) =>',
      '  [u(q), $connect, $disconnect];',
    ],
    fautive: 2,
  },
  {
    nom: 'unsafe-renomme-affectation',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'declare const p: PrismaClient;',
      'let u: unknown;',
      '({ $queryRawUnsafe: u } = p);',
      'export const lu = u;',
    ],
    fautive: 4,
  },
  {
    nom: 'unsafe-renomme-for-of',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'declare const p: PrismaClient;',
      "for (const { $queryRawUnsafe: brut } of [p]) void brut('SELECT 1');",
    ],
    fautive: 3,
  },
  {
    nom: 'unsafe-renomme-imbrique-declaration',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'declare const o: { db: PrismaClient };',
      'const { db: { $executeRawUnsafe: u } } = o;',
      'export const e = u;',
    ],
    fautive: 3,
  },
  {
    nom: 'unsafe-renomme-imbrique-parametre',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'export const lire = ({ db: { $queryRawUnsafe: u } }: { db: PrismaClient }, q: string) => u(q);',
    ],
    fautive: 2,
  },
  {
    nom: 'unsafe-cle-d-objet',
    lignes: ['export const faux = { $queryRawUnsafe: (q: string) => q };'],
    fautive: 1,
  },
  // Le nom obtenu par CONCATÉNATION de littéraux : semgrep la replie (limite a), et c'est le
  // bras « nom écrit comme chaîne » qui la prend — le seul qui voie un nom qu'aucun texte n'écrit.
  {
    nom: 'unsafe-concatene',
    lignes: [
      "import type { PrismaClient } from '@prisma/client';",
      'declare const p: PrismaClient;',
      "export const lire = (q: string) => p['$query' + 'RawUnsafe'](q);",
    ],
    fautive: 3,
  },
  // La liaison TypeScript `import X = …` (import-equals), refusée comme CLASSE quelle qu'en soit
  // la cible (revue `exactitude` 5328984956, PR 82) : `import P = Prisma` fait sortir le namespace
  // par une liaison que le refus de sortie ne voit pas, exportée ou non.
  {
    nom: 'import-egal-alias-prisma',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'import P = Prisma;',
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'export-import-egal-alias-prisma',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export import P = Prisma;',
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-commentaire',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'import /* alias */ P = Prisma;',
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-cible-quelconque',
    lignes: [
      'namespace Outils { export const un = 1; }',
      'import Un = Outils.un;',
      'export const deux = Un + 1;',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-require-quelconque',
    lignes: ["import fs = require('node:fs');", 'export const lire = fs.readFileSync;'],
    fautive: 1,
  },
  // L'import-equals dont le NOM ou les BLANCS ne sont pas ASCII (revue `securite` 5329281085,
  // PR 82) : TypeScript admet un identifiant Unicode et tout blanc Unicode entre les mots, et un
  // bras qui lisait le nom par une classe ASCII et les blancs par `\s` les laissait passer.
  {
    nom: 'import-egal-alias-accentue',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'import Pé = Prisma;',
      'export const fragment = (t: string) => Pé.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-alias-cyrillique',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'import Пр = Prisma;',
      'export const fragment = (t: string) => Пр.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-espace-insecable',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `import${NBSP}P = Prisma;`,
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-espace-ideographique',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `import${IDEO}P = Prisma;`,
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-zwnbsp',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `import${ZWNBSP}P = Prisma;`,
      'export const fragment = (t: string) => P.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'export-import-egal-unicode',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export${NBSP}import${OGHAM}Ωm${FINE}= Prisma;`,
      'export const fragment = (t: string) => Ωm.raw(t);',
    ],
    fautive: 2,
  },
  {
    nom: 'import-egal-require-accentue',
    lignes: ["import fé = require('node:fs');", 'export const lire = fé.readFileSync;'],
    fautive: 1,
  },
  // `from` est un identifiant contextuel : `import from = X` est un import-equals. Un bras qui
  // s'arrêterait au MOT `from` le laisserait passer.
  {
    nom: 'import-egal-alias-from',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'import from = Prisma;',
      'export const fragment = (t: string) => from.raw(t);',
    ],
    fautive: 2,
  },
  // Le NOM écrit par ÉCHAPPEMENT, sans rien de calculé (revue `exactitude` 5328459424, PR 82) :
  // semgrep compare le TEXTE source, pas la valeur. Échappements imprimables `u` / `u{}` / `x`
  // dans un identifiant ou une chaîne, échappement d'identité, continuation de ligne, octal
  // hérité (JavaScript non strict), et l'interpolation d'un `String.raw`, que l'exemption du
  // gabarit brut couvrirait par sa portée.
  {
    nom: 'echappement-unicode-membre',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => Prisma.r${AS}u0061w(x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-unicode-unsafe',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      `export const lire = (q: string) => p.$queryRaw${AS}u0055nsafe(q);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-unicode-namespace',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => Pr${AS}u0069sma.raw(x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-hexa-calcule',
    lignes: [
      "import * as C from '@prisma/client';",
      `export const fragment = (x: string) => C['Pr${AS}x69sma'].raw(x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-unicode-calcule',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => Prisma['r${AS}u0061w'](x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-accolades-calcule',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => Prisma['r${AS}u{61}w'](x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-identite-calcule',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => Prisma['r${AS}aw'](x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-identite-dollar',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      `export const lire = (q: string) => p['${AS}$queryRawUnsafe'](q);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-identite-gabarit',
    lignes: [
      "import * as C from '@prisma/client';",
      `export const fragment = (x: string) => C[\`Pr${AS}isma\`].raw(x);`,
    ],
    fautive: 2,
  },
  // La continuation : la ligne fautive FINIT par l'antislash. Aucun commentaire ne peut la
  // suivre : ce témoin n'a que son jumeau `nosemgrep` du DESSUS (voir `jumeauxNosem`).
  {
    nom: 'echappement-continuation',
    lignes: [
      "import * as C from '@prisma/client';",
      `export const fragment = (x: string) => C['Pri${AS}`,
      "sma'].raw(x);",
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-octal-js',
    ext: 'js',
    lignes: [
      "const C = require('@prisma/client');",
      `module.exports.fragment = (x) => C['Pr${AS}151sma'].raw(x);`,
    ],
    fautive: 2,
  },
  {
    nom: 'echappement-interpolation-string-raw',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      `export const fragment = (x: string) => String.raw\`a\${Prisma['r${AS}u0061w'](x)}\`;`,
    ],
    fautive: 2,
  },
  // L'interpolation d'un `String.raw` réduite à un LITTÉRAL DE CHAÎNE écrit par échappement
  // (revue `exactitude` 5328789820, PR 82) : `String.raw` rend le littéral déjà décodé, le vrai
  // nom s'exécute. La classe est fermée — toute interpolation d'un `String.raw` sous `src/` —,
  // et le dernier témoin, sans échappement, le prouve.
  {
    nom: 'interpolation-brute-nom-entier',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      `export const lire = (q: string) => p[String.raw\`\${'$queryRaw${AS}u0055nsafe'}\`](q);`,
    ],
    fautive: 2,
  },
  {
    nom: 'interpolation-brute-nom-coupe',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      `export const lire = (q: string) => p[String.raw\`$query\${'Raw${AS}u0055nsafe'}\`](q);`,
    ],
    fautive: 2,
  },
  {
    nom: 'interpolation-brute-parenthese-double',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      `export const lire = (q: string) => p[String.raw\`$query\${("Raw${AS}u0055nsafe")}\`](q);`,
    ],
    fautive: 2,
  },
  {
    nom: 'interpolation-brute-variable',
    lignes: ['export const texte = (x: string) => String.raw`a${x}b`;'],
    fautive: 1,
  },
  // Le membre du runtime par accès CALCULÉ sur le chargeur, et ses autres membres dangereux :
  // `Sql`, `sqltag`, `join`, `makeTypedQueryFactory`.
  {
    nom: 'runtime-raw-require-calcule',
    lignes: [
      "export const fragment = (x: string) => require('@prisma/client/runtime/library')['raw'](x);",
    ],
    fautive: 1,
  },
  {
    nom: 'runtime-raw-import-dynamique-calcule',
    lignes: [
      'export const fragment = async (x: string) =>',
      "  (await import('@prisma/client/runtime/library'))['raw'](x);",
    ],
    fautive: 2,
  },
  {
    nom: 'runtime-sql-importe',
    lignes: [
      "import { Sql } from '@prisma/client/runtime/library';",
      'export const fragment = (x: string) => new Sql([x], []);',
    ],
    fautive: 1,
  },
  {
    nom: 'runtime-sql-espace-de-noms',
    lignes: [
      "import * as rt from '@prisma/client/runtime/library';",
      'export const fragment = (x: string) => new rt.Sql([x], []);',
    ],
    fautive: 2,
  },
  {
    nom: 'runtime-sqltag',
    lignes: [
      "import { sqltag } from '@prisma/client/runtime/library';",
      'export const fragment = (x: string) => sqltag([x] as unknown as TemplateStringsArray);',
    ],
    fautive: 1,
  },
  {
    nom: 'runtime-join',
    lignes: [
      "import { join as joindre } from '@prisma/client/runtime/library';",
      'export const fragment = (v: never[], s: string) => joindre(v, s);',
    ],
    fautive: 1,
  },
  {
    nom: 'runtime-typed-query',
    lignes: [
      "import { makeTypedQueryFactory } from '@prisma/client/runtime/library';",
      'export const requete = (x: string) => makeTypedQueryFactory(x);',
    ],
    fautive: 1,
  },
  // Une fonction d'ÉTIQUETTE appelée sans gabarit : le tableau de « morceaux » est du TEXTE.
  {
    nom: 'prisma-sql-appel',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma.sql([x] as unknown as TemplateStringsArray);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-sql-call',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma.sql.call(null, [x] as never);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-sql-niche',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => Prisma.sql`a ${Prisma.sql([x] as never)}`;',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-sql-destructure-appel',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { sql } = Prisma;',
      'export const fragment = (x: string) => sql([x] as never);',
    ],
    fautive: 3,
  },
  {
    nom: 'prisma-sql-destructure-renomme',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { sql: s } = Prisma;',
      'export const fragment = (x: string) => s([x] as never);',
    ],
    fautive: 3,
  },
  {
    nom: 'query-raw-appel',
    lignes: [
      'declare const p: { $queryRaw(s: TemplateStringsArray): unknown };',
      'export const lire = (x: string) => p.$queryRaw([x] as unknown as TemplateStringsArray);',
    ],
    fautive: 2,
  },
  {
    nom: 'query-raw-generique-appel',
    lignes: [
      'declare const p: { $queryRaw<T>(s: TemplateStringsArray): T };',
      'export const lire = (x: string) => p.$queryRaw<number>([x] as never);',
    ],
    fautive: 2,
  },
  {
    nom: 'query-raw-reference',
    lignes: [
      'declare const p: { $queryRaw(s: TemplateStringsArray): unknown };',
      'export const brut = p.$queryRaw;',
    ],
    fautive: 2,
  },
  {
    nom: 'execute-raw-calcule-appel',
    lignes: [
      'declare const p: { $executeRaw(s: TemplateStringsArray): unknown };',
      "export const ecrire = (x: string) => p['$executeRaw']([x] as never);",
    ],
    fautive: 2,
  },
  {
    nom: 'query-raw-sortie-dans-l-objet',
    lignes: [
      'declare const p: { $queryRaw(s: TemplateStringsArray): unknown };',
      'let q: unknown;',
      'export const lire = () => (q = p.$queryRaw, p).$queryRaw`SELECT 1`;',
    ],
    fautive: 3,
  },
  // `Prisma.join` : séparateur, préfixe et suffixe sont insérés en TEXTE ; seul `join(valeurs)`.
  {
    nom: 'prisma-join-separateur',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const liste = (v: Prisma.Sql[], s: string) => Prisma.join(v, s);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-join-etale',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'declare const a: [Prisma.Sql[], string];',
      'export const liste = () => Prisma.join(...a);',
    ],
    fautive: 3,
  },
  {
    nom: 'prisma-join-destructure',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { join } = Prisma;',
      'export const liste = (v: Prisma.Sql[], s: string) => join(v, s);',
    ],
    fautive: 3,
  },
  {
    nom: 'prisma-join-call',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const liste = (v: Prisma.Sql[], s: string) => Prisma.join.call(null, v, s);',
    ],
    fautive: 2,
  },
  // La classe `Sql` atteinte par le CONSTRUCTEUR d'une valeur du namespace.
  {
    nom: 'prisma-empty-constructeur',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'export const fragment = (x: string) => new (Prisma.empty.constructor as never)([x], []);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-join-constructeur-calcule',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      "export const Classe = Prisma.join([Prisma.empty])['constructor'];",
    ],
    fautive: 2,
  },
  // Une sortie écrite DANS une construction admise : la valeur par défaut d'une déstructuration.
  {
    nom: 'prisma-sortie-valeur-par-defaut',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'let P: unknown;',
      'const garder = (v: unknown) => ((P = v), 1);',
      'const { sql = garder(Prisma) } = Prisma;',
    ],
    fautive: 4,
  },
  // Le nom du membre `…Unsafe` écrit comme CHAÎNE, où qu'elle soit.
  {
    nom: 'query-raw-unsafe-reflect',
    lignes: [
      'declare const p: { $queryRawUnsafe(q: string): unknown };',
      "export const brut = Reflect.get(p, '$queryRawUnsafe');",
    ],
    fautive: 2,
  },
  {
    nom: 'execute-raw-unsafe-cle-calculee',
    lignes: [
      'declare const p: { $executeRawUnsafe(q: string): unknown };',
      "const { ['$executeRawUnsafe']: brut } = p;",
      'export const ecrire = (q: string) => brut(q);',
    ],
    fautive: 2,
  },
  // Le `raw` du runtime atteint par l'objet module, et non par un import nommé.
  {
    nom: 'runtime-raw-espace-de-noms',
    lignes: [
      "import * as rt from '@prisma/client/runtime/library';",
      'export const fragment = (x: string) => rt.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'runtime-raw-require',
    lignes: [
      "export const fragment = (x: string) => require('@prisma/client/runtime/library').raw(x);",
    ],
    fautive: 1,
  },
  {
    nom: 'runtime-raw-import-dynamique',
    lignes: [
      'export const fragment = async (x: string) =>',
      "  (await import('@prisma/client/runtime/library')).raw(x);",
    ],
    fautive: 2,
  },
  {
    nom: 'runtime-raw-require-destructure',
    lignes: [
      "const { raw: brut } = require('../../../node_modules/@prisma/client/runtime/library.js');",
      'export const fragment = (x: string) => brut(x);',
    ],
    fautive: 1,
  },
  {
    nom: 'prisma-raw-destructure',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { raw } = Prisma;',
      'export const fragment = (x: string) => raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-destructure-renomme',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const { sql, raw: brut } = Prisma;',
      'export const fragment = (x: string) => brut(x) ?? sql;',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-alias',
    lignes: [
      "import { Prisma as P } from '@prisma/client';",
      'export const fragment = (x: string) => P.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-alias-destructure',
    lignes: [
      "import { Prisma as P } from '@prisma/client';",
      'const { raw } = P;',
      'export const fragment = (x: string) => raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-calcule',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      "export const fragment = (x: string) => Prisma['raw'](x);",
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-alias-calcule',
    lignes: [
      "import { Prisma as P } from '@prisma/client';",
      'export const fragment = (x: string) => P[`raw`](x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-espace-de-noms',
    lignes: [
      "import * as C from '@prisma/client';",
      'export const fragment = (x: string) => C.Prisma.raw(x);',
    ],
    fautive: 2,
  },
  {
    nom: 'prisma-raw-affecte',
    lignes: [
      "import { Prisma } from '@prisma/client';",
      'const P = Prisma;',
      'export const fragment = (x: string) => P.raw(x);',
    ],
    fautive: 3,
  },
  {
    nom: 'prisma-raw-importe',
    lignes: [
      "import { raw } from '@prisma/client/runtime/library';",
      'export const fragment = (x: string) => raw(x);',
    ],
    fautive: 1,
  },
];

function fichier(
  nom: string,
  chemin: string,
  lignes: readonly string[],
  regle: string | null,
  ligneFautive: number
): FichierDuBac {
  return { nom, chemin, lignes, regle, ligneFautive };
}

/** Les témoins ROUGES : chacun doit être nommé par SA règle, sur SA ligne. */
export const TEMOINS: readonly FichierDuBac[] = [
  ...FORMES_PRISMA.map((f) =>
    fichier(
      `prisma/${f.nom}`,
      `${MILIEU_ESPACE}/${f.nom}.${f.ext}`,
      f.lignes,
      REGLE_PRISMA,
      f.fautive
    )
  ),
  ...FORMES_PRISMA_REFUSEES_PARTOUT.map((f) =>
    fichier(
      `prisma/${f.nom}`,
      `${MILIEU_ESPACE}/${f.nom}.${f.ext ?? 'ts'}`,
      f.lignes,
      REGLE_PRISMA,
      f.fautive
    )
  ),
  // L'autre moitié du périmètre de REQ-SEC-008, la page de l'espace.
  fichier(
    'prisma/page-espace',
    'src/app/(espace)/tableau/page.tsx',
    [
      "import { PrismaClient } from '@prisma/client';",
      'export default function Page() { return null; }',
    ],
    REGLE_PRISMA,
    1
  ),
  // Un dossier `tests/` sous l'espace : sans le `.semgrepignore` vide, semgrep le SAUTE.
  fichier(
    'prisma/sous-dossier-tests',
    'src/server/espace/tests/aide.ts',
    ["import { PrismaClient } from '@prisma/client';"],
    REGLE_PRISMA,
    1
  ),
  ...FORMES_SQL.map((f) =>
    fichier(`sql/${f.nom}`, `src/lib/sql/${f.nom}.${f.ext ?? 'ts'}`, f.lignes, REGLE_SQL, f.fautive)
  ),
];

/** Les contre-témoins : AUCUN constat attendu. Une règle trop large rougit ici. */
export const CONTRE_TEMOINS: readonly FichierDuBac[] = [
  // Les MÊMES fichiers hors de l'espace : la couche d'accès a le droit d'importer le client.
  ...FORMES_PRISMA.map((f) =>
    fichier(`acces/${f.nom}`, `src/server/acces/${f.nom}.${f.ext}`, f.lignes, null, 0)
  ),
  // Dans l'espace, des spécifieurs qui RESSEMBLENT sans être le client.
  fichier(
    'espace/voisins',
    `${MILIEU_ESPACE}/voisins.ts`,
    [
      "import { lireApporteur } from '@/server/acces/apporteur';",
      "import { a } from '@/lib/prismatique';",
      "import { b } from './db-outils';",
      "import { c } from '@/lib/dbx';",
      "export const d = require('./mydb');",
      "import { e } from '@/lib/prismatique.js';",
      "import { f } from './db-outils.ts';",
      "import { g } from './prisma-aide.mjs';",
      "export * as h from '@/server/acces/dbx.js';",
      // Des chaînes qui RESSEMBLENT à un spécifieur sans être chargées comme module.
      "export const i = fetch('/api/db');",
      "export const j = require.resolve('./outil-prisma');",
    ],
    null,
    0
  ),
  // Les échappements ADMIS — les exemptions déclarées dans `.semgrep.yml` —, au milieu de
  // l'espace, donc jugés par les DEUX règles : un caractère de contrôle (U+0000 à U+001F) ou DEL
  // (le séparateur `u001f` des condensats), les échappements courants, un antislash doublé devant
  // `u` (du texte),
  // une expression régulière littérale, un gabarit `String.raw` SANS interpolation (toute
  // interpolation d'un `String.raw` est refusée comme classe), un gabarit NON étiqueté qui
  // interpole, à côté d'un `String.raw` sans interpolation, et un `String.raw` dont le texte
  // porte un `${` échappé par un antislash (du texte, pas une interpolation).
  fichier(
    'espace/echappements-admis',
    `${MILIEU_ESPACE}/echappements-admis.ts`,
    [
      `export const a = '${AS}u001f' + '${AS}x1F' + '${AS}u{1f}' + '${AS}x7f' + '${AS}u007F' + '${AS}0';`,
      `export const b = '${AS}n${AS}t${AS}r${AS}b${AS}f${AS}v' + '${AS}'' + "${AS}"" + \`${AS}\`\` + '${AS}${AS}';`,
      `export const c = '${AS}${AS}u0061${AS}${AS}x62${AS}${AS}db';`,
      `export const d = /^[${AS}x21-${AS}x7e]{1,200}$/.test('a') && /${AS}u0061${AS}/${AS}d${AS}./.test('a');`,
      `export const e = String.raw\`^src/.*${AS}.tsx?$\`;`,
      `export const f = String.raw\`${AS}u0061${AS}d\`;`,
      `export const g = \`x\${1}y\` + String.raw\`z${AS}.w${AS}d\`;`,
      `export const h = String.raw\`a${AS}\${x}b\`;`,
    ],
    null,
    0
  ),
  // Le patron du verrou de DM-01 : gabarit étiqueté, paramétré. Le chemin du bac ne nomme PAS
  // le dossier du journal : `journal:sans-pii` tient pour second écrivain tout fichier qui
  // touche le client ET nomme la table (mesuré en Gate A). Le fichier réel de DM-01, lui, est
  // sous `src/` et le passage sur le dépôt réel le juge : 0 constat.
  fichier(
    'sql/verrou-dm01',
    'src/server/verrou/journal.ts',
    [
      "import type { Prisma } from '@prisma/client';",
      'const CLE_VERROU = 7;',
      'export async function verrouiller(tx: Prisma.TransactionClient): Promise<void> {',
      '  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CLE_VERROU}, 0))`;',
      '}',
    ],
    null,
    0
  ),
  // Des `raw` qui ne viennent PAS de Prisma, et des membres voisins des membres dangereux.
  fichier(
    'sql/voisins',
    'src/lib/sql/voisins.ts',
    [
      'declare const autre: { raw(x: string): string };',
      'declare const p: { $queryRaw(s: TemplateStringsArray): unknown; unsafe: number };',
      'export const a = String.raw`x`;',
      "export const b = autre.raw('x');",
      'const { raw } = autre;',
      "export const c = raw('y') + autre['raw']('z');",
      'export const d = p.unsafe + p[`unsafe`];',
      // `$queryRaw` voisin de `$queryRawUnsafe`, par crochets — EN ÉTIQUETTE : une référence
      // nue à `$queryRaw` est désormais une sortie de la fonction d'étiquette, refusée.
      "export const e = p['$queryRaw']`SELECT 1`;",
    ],
    null,
    0
  ),
  // Les VOISINS des deux classes refusées par leur écriture (revue `exactitude` 5328984956,
  // PR 82) : un nom qui CONTIENT `queryRaw` sans être un membre `…Unsafe` (la borne du mot tient
  // compte du `$`), un `import type`, un import nommé ordinaire de `Prisma` employé en membre
  // immédiat, un gabarit étiqueté, et un identifiant qui COMMENCE par `import`.
  fichier(
    'sql/voisins-des-classes',
    'src/lib/sql/voisins-des-classes.ts',
    [
      "import type { PrismaClient } from '@prisma/client';",
      "import { Prisma } from '@prisma/client';",
      'declare const p: PrismaClient;',
      'const queryRaw = 1;',
      'const $queryRawUnsafely = 2;',
      'export const a = queryRaw + $queryRawUnsafely;',
      'export const b = (id: string) => p.$queryRaw`SELECT ${id}`;',
      'export const c = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError;',
      'export const important = 3;',
    ],
    null,
    0
  ),
  // Les VOISINS de l'import-equals quand le bras ne lit plus la forme de l'identifiant (revue
  // `securite` 5329281085, PR 82) : un identifiant qui COMMENCE par `import` et continue par un
  // caractère non ASCII, les liaisons ES (accolades, étoile, défaut, `import type`, blanc
  // insécable compris) suivies d'une affectation sur la ligne d'après, `import()`, une
  // comparaison sur `import.meta`, un membre et une clé d'objet nommés `import`.
  fichier(
    'sql/voisins-import-unicode',
    'src/lib/sql/voisins-import-unicode.ts',
    [
      "import type { PrismaClient } from '@prisma/client';",
      "import { a } from './a';",
      "import * as X from './x';",
      "import d from './d';",
      `import${NBSP}{ e } from './e';`,
      "import type T from './t';",
      'let importÉtat: unknown = 1;',
      'const importé = 2;',
      `const importé2${NBSP}= importé;`,
      'importÉtat = importé + importé2;',
      "export const m = () => import('./m');",
      "export const u = import.meta.url == 'x';",
      'export const w = { import: 1, b: 2 };',
      'w.import = 3;',
      'export const y: PrismaClient | T | typeof X = importÉtat as never;',
      'export const z = [a, d, e];',
    ],
    null,
    0
  ),
  fichier(
    'sql/parametre',
    'src/lib/sql/parametre.ts',
    [
      "import { Prisma } from '@prisma/client';",
      'declare const p: { $queryRaw(s: TemplateStringsArray, ...v: unknown[]): unknown };',
      'export const lire = (id: string) => p.$queryRaw`SELECT 1 WHERE id = ${id}`;',
      'export const fragment = (id: string) => Prisma.sql`id = ${id}`;',
      // Ce que le namespace a le DROIT de faire : membre immédiat, déstructuration sans `raw`,
      // type `Prisma.Sql` en annotation, chargement paresseux non renommé.
      'const { sql, join } = Prisma;',
      'export const g = (v: Prisma.Sql): Prisma.Sql => join([v, sql`x`]);',
      'export const h = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError;',
      "export const k = async () => { const { Prisma } = await import('@prisma/client'); return Prisma.empty; };",
      // Des étiquettes NICHÉES, génériques, et `join` à une seule valeur : tout cela reste admis.
      'export const m = (id: string) => Prisma.sql`a ${Prisma.sql`b ${id}`} ${Prisma.join([Prisma.sql`c`])}`;',
      'export const n = (id: string) => p.$queryRaw`x ${Prisma.join([id])} ${sql`y ${id}`}`;',
      'export const o = (id: string) => p.$queryRaw<{ n: number }[]>`SELECT ${id}`;',
      // Un constructeur DÉCLARÉ n'est pas une lecture de `.constructor`.
      'class Ligne { constructor(public n: number) {} }',
      'export const q = new Ligne(1);',
    ],
    null,
    0
  ),
];

/**
 * Les jumeaux `nosemgrep` d'un témoin rouge : le commentaire au-dessus de la ligne fautive
 * (forme nue), et en fin de ligne fautive (forme nommant la règle). Sans `--disable-nosem`,
 * semgrep les ÉTEINT (mesuré) : c'est ce qui rend le jumeau significatif.
 *
 * Une ligne fautive qui FINIT par un antislash (continuation de ligne dans une chaîne) n'a pas de
 * jumeau en ligne : un commentaire ajouté derrière l'antislash tomberait DANS la chaîne et la
 * laisserait non terminée — le fichier ne s'analyserait plus. Seul le jumeau du dessus existe.
 */
export function jumeauxNosem(t: FichierDuBac): FichierDuBac[] {
  if (t.regle === null) return [];
  const i = t.ligneFautive - 1;
  const base = t.chemin.replace(/(\.[a-z]+)$/, '');
  const ext = t.chemin.slice(base.length);
  const dessus = [...t.lignes.slice(0, i), '// nosemgrep', ...t.lignes.slice(i)];
  const enLigne = t.lignes.map((l, j) => (j === i ? `${l} // nosemgrep: ${t.regle}` : l));
  const jumeauDessus = fichier(
    `${t.nom}#nosem-dessus`,
    `${base}.nosem-dessus${ext}`,
    dessus,
    t.regle,
    t.ligneFautive + 1
  );
  if (t.lignes[i]!.endsWith(AS)) return [jumeauDessus];
  return [
    jumeauDessus,
    fichier(
      `${t.nom}#nosem-en-ligne`,
      `${base}.nosem-en-ligne${ext}`,
      enLigne,
      t.regle,
      t.ligneFautive
    ),
  ];
}

/** Le bac entier : témoins, jumeaux `nosemgrep`, contre-témoins. Un seul passage de semgrep. */
export function fichiersDuBac(): FichierDuBac[] {
  return [...TEMOINS, ...TEMOINS.flatMap(jumeauxNosem), ...CONTRE_TEMOINS];
}

// ── la sortie de semgrep, et ce qu'on en juge ─────────────────────────────────────────────────

export interface Constat {
  readonly check_id: string;
  readonly path: string;
  readonly start: { readonly line: number };
}

export interface SortieSemgrep {
  readonly version: string;
  readonly results: readonly Constat[];
  readonly errors: readonly unknown[];
  readonly paths: { readonly scanned: readonly string[] };
  readonly time: { readonly rules: readonly unknown[] };
}

export interface Faute {
  readonly famille: string;
  readonly message: string;
}

/** Ce qu'un passage de semgrep a rendu. `sortie` nulle : rien de lisible n'est sorti. */
export interface Passage {
  readonly code: number;
  readonly sortie: SortieSemgrep | null;
  readonly stderr: string;
}

export function lireSortie(stdout: string): SortieSemgrep | null {
  try {
    const j: unknown = JSON.parse(stdout);
    if (typeof j !== 'object' || j === null) return null;
    const o = j as Partial<SortieSemgrep>;
    if (!Array.isArray(o.results) || !Array.isArray(o.errors)) return null;
    if (!o.paths || !Array.isArray(o.paths.scanned)) return null;
    if (!o.time || !Array.isArray(o.time.rules)) return null;
    if (typeof o.version !== 'string') return null;
    return j as SortieSemgrep;
  } catch {
    return null;
  }
}

/** Une image sans condensat est un instrument qui change sous nos pieds. */
export function verifierImage(image: string): Faute[] {
  if (/^semgrep\/semgrep:[0-9][\w.-]*@sha256:[0-9a-f]{64}$/.test(image)) return [];
  return [
    {
      famille: 'image_non_epinglee',
      message:
        `L'image « ${image} » n'est pas épinglée par version ET condensat ` +
        '(`semgrep/semgrep:<version>@sha256:<64 hex>`). Sans condensat, la CI et le poste ' +
        'peuvent faire tourner deux instruments différents sous le même nom.',
    },
  ];
}

/** Les identifiants de règles exécutées, tels que `time.rules` les rend (des chaînes). */
export function reglesExecutees(sortie: SortieSemgrep): string[] | null {
  const r = sortie.time.rules;
  return r.every((x) => typeof x === 'string') ? [...(r as string[])] : null;
}

/** Ce qui vaut pour tout passage : semgrep a tourné, dans la version épinglée, sans erreur. */
export function jugerPassage(p: Passage): Faute[] {
  if (p.sortie === null) {
    return [
      {
        famille: 'semgrep_n_a_pas_tourne',
        message:
          `semgrep n'a rendu aucune sortie JSON lisible (code ${p.code}). Réseau vers le registre, ` +
          `Docker absent ou image introuvable : la gate ÉCHOUE, elle ne saute pas. Fin de ` +
          `stderr : ${p.stderr.trim().split('\n').slice(-5).join(' | ')}`,
      },
    ];
  }
  const fautes: Faute[] = [];
  // `--error` : 0 sans constat, 1 avec. Tout autre code est un passage qui a ÉCHOUÉ, même si un
  // JSON est sorti — on ne juge pas un demi-passage.
  if (p.code !== 0 && p.code !== 1) {
    fautes.push({
      famille: 'code_inattendu',
      message: `semgrep est sorti en ${p.code} (0 ou 1 attendu) : le passage n'est pas complet.`,
    });
  }
  if (p.sortie.version !== VERSION) {
    fautes.push({
      famille: 'version_divergente',
      message: `semgrep ${p.sortie.version} a tourné, ${VERSION} est épinglée.`,
    });
  }
  for (const e of p.sortie.errors) {
    fautes.push({
      famille: 'erreur_semgrep',
      message: `semgrep rapporte une erreur — un fichier non analysé ne garde rien : ${JSON.stringify(e).slice(0, 400)}`,
    });
  }
  if (reglesExecutees(p.sortie) === null) {
    fautes.push({
      famille: 'regles_executees_illisibles',
      message:
        '`time.rules` ne rend pas une liste d’identifiants : le compte des règles exécutées est illisible.',
    });
  }
  return fautes;
}

/**
 * Acceptance (1) : chaque règle maison exécutée a SON témoin rouge, et chaque témoin vise une
 * règle exécutée. `maison` : les identifiants SANS le préfixe.
 */
export function jugerEnsemble(
  maison: readonly string[],
  temoins: readonly FichierDuBac[]
): Faute[] {
  const fautes: Faute[] = [];
  const visees = new Set(temoins.flatMap((t) => (t.regle === null ? [] : [t.regle])));
  for (const id of [...new Set(maison)].sort()) {
    if (!visees.has(id)) {
      fautes.push({
        famille: 'regle_sans_temoin',
        message:
          `La règle maison « ${id} » est exécutée et AUCUN témoin ne la fait rougir. Une règle ` +
          'sans test est une règle qu’on croit active : ajoutez son témoin à `TEMOINS`.',
      });
    }
  }
  for (const id of [...visees].sort()) {
    if (!maison.includes(id)) {
      fautes.push({
        famille: 'temoin_sans_regle',
        message:
          `Un témoin vise « ${id} », que semgrep n’a PAS exécutée : la règle a disparu de ` +
          `\`${FICHIER_REGLES}\` ou a été renommée.`,
      });
    }
  }
  if (new Set(maison).size < PLANCHER_MAISON) {
    fautes.push({
      famille: 'plancher_maison',
      message: `${new Set(maison).size} règle(s) maison exécutée(s), plancher ${PLANCHER_MAISON}.`,
    });
  }
  return fautes;
}

/** Sépare les règles exécutées : maison (préfixe retiré) et publiques. */
export function partager(executees: readonly string[]): { maison: string[]; publiques: string[] } {
  const maison = executees
    .filter((id) => id.startsWith(PREFIXE_MAISON))
    .map((id) => id.slice(PREFIXE_MAISON.length));
  const publiques = executees.filter((id) => !id.startsWith(PREFIXE_MAISON));
  return { maison, publiques };
}

/** Le dépôt réel : zéro constat, tout fichier présent analysé, planchers tenus. */
export function jugerReel(p: Passage, presents: readonly string[]): Faute[] {
  const fautes = jugerPassage(p);
  if (p.sortie === null) return fautes;
  for (const c of p.sortie.results) {
    fautes.push({
      famille: 'constat',
      message: `${c.check_id} — ${c.path}:${c.start.line}`,
    });
  }
  if (presents.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        'Aucun fichier de code sous src/ : un vert sur zéro fichier ne dirait rien. Si le ' +
        'périmètre est vide PAR DÉCISION, la gate doit le dire autrement qu’en verdissant.',
    });
  }
  const analyses = new Set(p.sortie.paths.scanned);
  for (const f of presents) {
    if (!analyses.has(f)) {
      fautes.push({
        famille: 'fichier_non_analyse',
        message: `${f} est présent sous src/ et semgrep ne l’a PAS analysé.`,
      });
    }
  }
  const executees = reglesExecutees(p.sortie) ?? [];
  const { maison, publiques } = partager(executees);
  fautes.push(...jugerEnsemble(maison, TEMOINS));
  if (publiques.length < PLANCHER_PUBLIC) {
    fautes.push({
      famille: 'plancher_public',
      message:
        `${publiques.length} règle publique exécutée, plancher ${PLANCHER_PUBLIC} : les jeux ` +
        `${JEUX_PUBLICS.join(', ') || '(aucun jeu déclaré)'} ne sont pas chargés.`,
    });
  }
  return fautes;
}

/** Le bac : chaque témoin nommé par sa règle sur sa ligne, chaque contre-témoin muet. */
export function jugerPreuve(p: Passage, bac: readonly FichierDuBac[]): Faute[] {
  const fautes = jugerPassage(p);
  if (p.sortie === null) return fautes;
  const analyses = new Set(p.sortie.paths.scanned);
  for (const f of bac) {
    if (!analyses.has(f.chemin)) {
      fautes.push({
        famille: 'fichier_non_analyse',
        message: `${f.nom} (${f.chemin}) n’a pas été analysé.`,
      });
      continue;
    }
    const constats = p.sortie.results.filter((c) => c.path === f.chemin);
    if (f.regle === null) {
      for (const c of constats) {
        fautes.push({
          famille: 'faux_positif',
          message: `${f.nom} (${f.chemin}:${c.start.line}) : ${c.check_id} rougit un contre-témoin.`,
        });
      }
      continue;
    }
    const attendu = `${PREFIXE_MAISON}${f.regle}`;
    if (!constats.some((c) => c.check_id === attendu && c.start.line === f.ligneFautive)) {
      fautes.push({
        famille: 'temoin_muet',
        message:
          `${f.nom} (${f.chemin}:${f.ligneFautive}) : « ${f.regle} » ne mord pas. ` +
          `Constats sur ce fichier : ${constats.map((c) => `${c.check_id}:${c.start.line}`).join(', ') || 'aucun'}.`,
      });
    }
  }
  const { maison } = partager(reglesExecutees(p.sortie) ?? []);
  fautes.push(...jugerEnsemble(maison, bac));
  return fautes;
}

// ── le lancement ──────────────────────────────────────────────────────────────────────────────

export interface Lancement {
  /** Dossier dont `src/` est monté. */
  readonly racine: string;
  /** Chemin sur l'hôte du fichier de règles maison. */
  readonly regles: string;
  /** Chemin sur l'hôte d'un `.semgrepignore` VIDE. */
  readonly ignoreVide: string;
  readonly jeuxPublics: readonly string[];
  readonly exclusions: readonly Exclusion[];
  readonly options: readonly string[];
  readonly image: string;
}

/** Les arguments de `docker`. Aucune chaîne de shell : un tableau, tel quel. */
export function argumentsDocker(l: Lancement): string[] {
  const monter = (source: string, cible: string) => [
    '--mount',
    `type=bind,source=${source},target=${cible},readonly`,
  ];
  return [
    'run',
    '--rm',
    ...monter(join(l.racine, 'src'), `${DEPOT}/src`),
    ...monter(l.ignoreVide, `${DEPOT}/.semgrepignore`),
    ...monter(l.regles, MONTAGE_REGLES),
    '-w',
    DEPOT,
    l.image,
    'semgrep',
    'scan',
    '--config',
    MONTAGE_REGLES,
    ...l.jeuxPublics.flatMap((j) => ['--config', j]),
    ...l.exclusions.flatMap((e) => ['--exclude-rule', e.id]),
    ...l.options,
    '.',
  ];
}

export function lancer(l: Lancement): Passage {
  const r = spawnSync('docker', argumentsDocker(l), {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    code: r.status ?? -1,
    sortie: lireSortie(r.stdout ?? ''),
    stderr: `${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`,
  };
}

/** Un dossier jetable portant un `.semgrepignore` vide. Rendu avec sa fonction de nettoyage. */
function dossierJetable(): { dossier: string; ignoreVide: string; nettoyer: () => void } {
  const dossier = mkdtempSync(join(tmpdir(), 'sg-'));
  const ignoreVide = join(dossier, '.semgrepignore');
  writeFileSync(ignoreVide, '');
  return { dossier, ignoreVide, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) };
}

/** Les fichiers de code présents sous `<racine>/src`, en chemins relatifs `src/...`. */
export function fichiersPresents(racine: string): string[] {
  const parcourir = (rel: string): string[] =>
    readdirSync(join(racine, rel), { withFileTypes: true }).flatMap((e) => {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) return parcourir(r);
      return EXTENSIONS_ANALYSEES.some((x) => e.name.endsWith(x)) ? [r] : [];
    });
  return parcourir('src').sort();
}

export interface Verdict {
  readonly code: number;
  readonly fautes: readonly Faute[];
  readonly passage: Passage;
  readonly lignes: readonly string[];
}

function entete(l: Pick<Lancement, 'image' | 'options' | 'jeuxPublics' | 'exclusions'>): string[] {
  return [
    `semgrep — image ${l.image}`,
    `   options : ${l.options.join(' ')}`,
    `   jeux publics : ${l.jeuxPublics.join(', ') || 'AUCUN'}`,
    `   exclusions : ${l.exclusions.length === 0 ? 'aucune' : ''}`,
    ...l.exclusions.map((e) => `     --exclude-rule ${e.id} — ${e.motif}`),
  ];
}

function conclure(fautes: Faute[], passage: Passage, tete: string[], vert: string): Verdict {
  const lignes = [...tete];
  if (fautes.length === 0) {
    lignes.push(vert);
  } else {
    lignes.push(`❌ ${fautes.length} faute(s) :`);
    for (const f of fautes) lignes.push(`   [${f.famille}] ${f.message}`);
  }
  return { code: fautes.length === 0 ? 0 : 1, fautes, passage, lignes };
}

/** Le dépôt réel. */
export function executerReel(racine: string, regles = join(racine, FICHIER_REGLES)): Verdict {
  const base = {
    image: IMAGE,
    options: OPTIONS_FIXES,
    jeuxPublics: JEUX_PUBLICS,
    exclusions: EXCLUSIONS,
  };
  const tete = entete(base);
  const refus = [...verifierImage(base.image), ...verifierLesEntrees(racine, regles)];
  const vide: Passage = { code: -1, sortie: null, stderr: '' };
  if (refus.length > 0) return conclure(refus, vide, tete, '');
  const jetable = dossierJetable();
  try {
    const passage = lancer({ ...base, racine, regles, ignoreVide: jetable.ignoreVide });
    const presents = fichiersPresents(racine);
    const fautes = jugerReel(passage, presents);
    const { maison, publiques } = partager(
      passage.sortie ? (reglesExecutees(passage.sortie) ?? []) : []
    );
    const vert =
      `✅ semgrep ${VERSION} : ${maison.length + publiques.length} règles exécutées — ` +
      `${maison.length} maison (${maison.join(', ')}), ${publiques.length} publiques ` +
      `(${JEUX_PUBLICS.join(', ')}) — ${passage.sortie?.paths.scanned.length ?? 0} fichier(s) ` +
      `analysé(s) sur ${presents.length} présent(s) sous src/, 0 constat.`;
    return conclure(fautes, passage, tete, vert);
  } finally {
    jetable.nettoyer();
  }
}

/** Le témoin : un bac jetable, un seul passage de semgrep, règles maison seules. */
export function executerPreuve(
  regles: string,
  options: readonly string[] = OPTIONS_FIXES,
  bac: readonly FichierDuBac[] = fichiersDuBac()
): Verdict {
  const base = {
    image: IMAGE,
    options,
    jeuxPublics: [] as string[],
    exclusions: [] as Exclusion[],
  };
  const tete = entete(base);
  const jetable = dossierJetable();
  try {
    const refus = [
      ...verifierImage(base.image),
      ...verifierLesEntrees(jetable.dossier, regles, false),
    ];
    const vide: Passage = { code: -1, sortie: null, stderr: '' };
    if (refus.length > 0) return conclure(refus, vide, tete, '');
    for (const f of bac) {
      const cible = join(jetable.dossier, f.chemin);
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, `${f.lignes.join('\n')}\n`);
    }
    const passage = lancer({
      ...base,
      racine: jetable.dossier,
      regles,
      ignoreVide: jetable.ignoreVide,
    });
    const fautes = jugerPreuve(passage, bac);
    const { maison } = partager(passage.sortie ? (reglesExecutees(passage.sortie) ?? []) : []);
    const rouges = bac.filter((f) => f.regle !== null).length;
    const vert =
      `✅ preuve : ${rouges} témoin(s) rouge(s) nommé(s) par leur règle (dont ` +
      `${bac.filter((f) => f.nom.includes('#nosem')).length} sous \`nosemgrep\`), ` +
      `${bac.length - rouges} contre-témoin(s) muet(s) ; règles maison exécutées : ${maison.join(', ')}.`;
    return conclure(fautes, passage, tete, vert);
  } finally {
    jetable.nettoyer();
  }
}

/** Les entrées manquantes font REFUSER — jamais un passage sur un périmètre inconnu. */
function verifierLesEntrees(racine: string, regles: string, exigerSrc = true): Faute[] {
  const fautes: Faute[] = [];
  if (!existsSync(regles)) {
    fautes.push({
      famille: 'regles_introuvables',
      message: `Le fichier de règles maison « ${regles} » est introuvable : aucune règle maison ne peut mordre.`,
    });
  }
  if (exigerSrc && !existsSync(join(racine, 'src'))) {
    fautes.push({
      famille: 'perimetre_illisible',
      message: `« ${join(racine, 'src')} » est introuvable : le périmètre est inconnu, la gate refuse.`,
    });
  }
  return fautes;
}

// ── ligne de commande ─────────────────────────────────────────────────────────────────────────
// GARDÉE : ce module est IMPORTÉ par sa spec, et l'import ne doit ni lancer docker ni sortir.

const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const racine = process.cwd();
  const i = process.argv.indexOf('--regles');
  const regles =
    i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : join(racine, FICHIER_REGLES);
  const verdict = process.argv.includes('--prove')
    ? executerPreuve(regles)
    : executerReel(racine, regles);
  (verdict.code === 0 ? console.log : console.error)(verdict.lignes.join('\n'));
  process.exit(verdict.code);
}
