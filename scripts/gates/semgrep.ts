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

/** Les formes de SQL brut non paramétré que la règle n° 2 refuse. */
const FORMES_SQL: readonly { nom: string; lignes: string[]; fautive: number }[] = [
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
    fichier(`sql/${f.nom}`, `src/lib/sql/${f.nom}.ts`, f.lignes, REGLE_SQL, f.fautive)
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
      "export const e = p['$queryRaw'];",
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
    ],
    null,
    0
  ),
];

/**
 * Les jumeaux `nosemgrep` d'un témoin rouge : le commentaire au-dessus de la ligne fautive
 * (forme nue), et en fin de ligne fautive (forme nommant la règle). Sans `--disable-nosem`,
 * semgrep les ÉTEINT (mesuré) : c'est ce qui rend le jumeau significatif.
 */
export function jumeauxNosem(t: FichierDuBac): FichierDuBac[] {
  if (t.regle === null) return [];
  const i = t.ligneFautive - 1;
  const base = t.chemin.replace(/(\.[a-z]+)$/, '');
  const ext = t.chemin.slice(base.length);
  const dessus = [...t.lignes.slice(0, i), '// nosemgrep', ...t.lignes.slice(i)];
  const enLigne = t.lignes.map((l, j) => (j === i ? `${l} // nosemgrep: ${t.regle}` : l));
  return [
    fichier(
      `${t.nom}#nosem-dessus`,
      `${base}.nosem-dessus${ext}`,
      dessus,
      t.regle,
      t.ligneFautive + 1
    ),
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
