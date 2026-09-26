/**
 * `pnpm red-first [--base <ref>]` — CPL-T22 (REQ-CPL-022) : les tests NOUVEAUX d'une PR, exécutés
 * contre le code de `main`, doivent ÉCHOUER.
 *
 * POURQUOI. RM-02 : une garde ne vaut que si on l'a vue rougir. Le bloc ROUGE/VERT d'une PR le
 * DÉCLARE ; ce job le MESURE. Un test qui passe déjà contre `main` ne prouve rien de ce que la PR
 * ajoute : il passerait aussi sans elle — c'est le test qui n'affirme rien, ou qui affirme ce qui
 * était déjà vrai.
 *
 * COMMENT.
 *  1. Les fichiers AJOUTÉS par la PR : `git diff --diff-filter=A <base>...HEAD`.
 *  2. Ceux que vitest exécute : la liste est DEMANDÉE à vitest (`vitest list --filesOnly`), jamais
 *     recopiée de sa configuration (RM-01). Un fichier de test ajouté hors de cette liste n'est pas
 *     jugé, et la sortie le NOMME.
 *  3. Un arbre de `<base>` est posé à côté (`git worktree add --detach`), avec les dépendances de la
 *     tête par lien symbolique. On y copie les fichiers AJOUTÉS OU MODIFIÉS sous `tests/` et la
 *     configuration de vitest : ce sont les TESTS de la PR, jugés contre le CODE de `main`.
 *  4. Chaque test nouveau y est lancé seul. Code 0 : `test_deja_vert_sur_main`. « Aucun fichier de
 *     test trouvé » n'est pas un rouge : `non_execute_sur_main`.
 *  5. L'arbre de `<base>` est retiré, succès ou échec.
 *
 * LA SEULE SORTIE : `@no-red-first:` suivi d'une justification d'au moins vingt caractères, dans le
 * fichier. Il n'est alors pas exécuté, et la justification est IMPRIMÉE. Un marqueur nu est un refus.
 *
 * CE QU'ELLE NE JUGE PAS, ET C'EST DIT. Un test ajouté dans un fichier EXISTANT n'est pas jugé : le
 * fichier n'est pas nouveau. Un rouge dû à l'environnement (un démon Docker absent) compte pour un
 * rouge ; en porte A, le démon est présent. Les dépendances de `<base>` sont celles de la tête.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID_REGISTRE = 'red-first';
export const MARQUEUR = '@no-red-first';
/** Une justification tient en une phrase : moins, c'est un marqueur posé pour faire taire. */
const JUSTIFICATION_MINIMALE = 20;
const VITEST = join('node_modules', 'vitest', 'vitest.mjs');

export const FAMILLES = [
  'test_deja_vert_sur_main',
  'no_red_first_sans_justification',
  'non_execute_sur_main',
] as const;
export type Famille = (typeof FAMILLES)[number];

export type Execution = { code: number | null; sortie: string };
export type Nouveau = { chemin: string; texte: string };
export type Faute = { famille: Famille; chemin: string; message: string };

export interface Univers {
  base: string;
  /** Les fichiers de test AJOUTÉS par la PR, que vitest exécute. */
  nouveaux: Nouveau[];
  /** Les fichiers de test ajoutés que vitest n'exécute pas : nommés, non jugés. */
  horsVitest: string[];
  /** Lance un test nouveau contre le code de `<base>`. */
  executer: (chemin: string) => Execution;
}

export interface Decision {
  code: 0 | 1;
  lignes: string[];
  fautes: Faute[];
}

/**
 * `undefined` : pas de marqueur. `null` : marqueur sans justification suffisante. Sinon : la
 * justification, telle qu'écrite après `@no-red-first:`.
 */
export function justificationDe(texte: string): string | null | undefined {
  // Le marqueur est une DIRECTIVE : il OUVRE une ligne de commentaire. Cité au fil d'une phrase
  // (comme dans l'en-tête d'un test qui le décrit), il n'exempte rien — mesuré sur cette PR même,
  // où la spec de la garde le citait en prose et se faisait refuser comme un marqueur nu.
  const directive = DIRECTIVE.exec(texte);
  if (directive === null) return undefined;
  const m = /^\s*:\s*(.+)$/.exec(directive[1] ?? '');
  const justification = m?.[1]?.trim() ?? '';
  return justification.length >= JUSTIFICATION_MINIMALE ? justification : null;
}
const DIRECTIVE = new RegExp(String.raw`^\s*(?://|/?\*)\s*${MARQUEUR}\b(.*)$`, 'm');

/** La ligne d'une sortie qui dit POURQUOI le test a rougi : l'erreur, sinon l'échec, sinon la fin. */
function derniereLigne(sortie: string): string {
  const lignes = sortie
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return (
    lignes.find((l) => /Error/.test(l)) ??
    lignes.find((l) => /FAIL/.test(l)) ??
    lignes[lignes.length - 1] ??
    ''
  );
}

/** PURE : juge un univers, n'écrit rien, ne sort pas. */
export function decider(u: Univers): Decision {
  const fautes: Faute[] = [];
  const details: string[] = [];
  let exemptes = 0;
  let rouges = 0;
  for (const n of u.nouveaux) {
    const justification = justificationDe(n.texte);
    if (justification === null) {
      fautes.push({
        famille: 'no_red_first_sans_justification',
        chemin: n.chemin,
        message:
          `${n.chemin} porte \`${MARQUEUR}\` sans justification d'au moins ` +
          `${JUSTIFICATION_MINIMALE} caractères après les deux-points : un marqueur nu fait taire la garde sans rien dire.`,
      });
      continue;
    }
    if (justification !== undefined) {
      exemptes++;
      details.push(`   · ${n.chemin} — exempté : ${justification}`);
      continue;
    }
    const e = u.executer(n.chemin);
    if (/No test files found/.test(e.sortie)) {
      fautes.push({
        famille: 'non_execute_sur_main',
        chemin: n.chemin,
        message:
          `${n.chemin} n'a pas été exécuté contre ${u.base} (aucun fichier de test trouvé) : ` +
          `ce n'est pas un rouge, c'est une absence de mesure.`,
      });
    } else if (e.code === 0) {
      fautes.push({
        famille: 'test_deja_vert_sur_main',
        chemin: n.chemin,
        message:
          `${n.chemin} passe DÉJÀ contre le code de ${u.base} : il ne prouve rien de ce que la PR ` +
          `ajoute. Écris le test qui rougit sans le correctif, ou pose \`${MARQUEUR}: <justification>\`.`,
      });
    } else {
      rouges++;
      details.push(`   · ${n.chemin} — rouge contre ${u.base} : ${derniereLigne(e.sortie)}`);
    }
  }
  const horsVitest = u.horsVitest.map((c) => `   · ${c} — hors de vitest, non jugé`);
  const compte =
    `${u.nouveaux.length} test(s) nouveau(x) jugé(s) contre ${u.base} : ${rouges} rouge(s), ` +
    `${exemptes} exempté(s) ; ${u.horsVitest.length} fichier(s) de test ajouté(s) hors de vitest.`;
  if (fautes.length === 0) {
    return {
      code: 0,
      fautes,
      lignes: [`✅ ${ID_REGISTRE} — ${compte}`, ...details, ...horsVitest],
    };
  }
  return {
    code: 1,
    fautes,
    lignes: [
      `❌ ${ID_REGISTRE} — ${fautes.length} faute(s). ${compte}`,
      ...fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ...details,
      ...horsVitest,
    ],
  };
}

// ── les témoins de `--prove` : un par famille, et un contre-témoin vert ─────────────────────────

const temoin = (texte: string, execution: Execution): Univers => ({
  base: 'origin/main',
  nouveaux: [{ chemin: 'tests/unit/temoin.spec.ts', texte }],
  horsVitest: [],
  executer: () => execution,
});

export const TEMOINS: readonly { famille: Famille; univers: () => Univers }[] = [
  {
    famille: 'test_deja_vert_sur_main',
    univers: () => temoin("it('x', () => {});", { code: 0, sortie: 'Tests  1 passed (1)' }),
  },
  {
    famille: 'no_red_first_sans_justification',
    univers: () => temoin(`// ${MARQUEUR}\nit('x', () => {});`, { code: 1, sortie: 'FAIL' }),
  },
  {
    famille: 'non_execute_sur_main',
    univers: () =>
      temoin("it('x', () => {});", { code: 1, sortie: 'No test files found, exiting with code 1' }),
  },
];

function prouver(): Decision {
  const lignes: string[] = [];
  let echecs = 0;
  for (const t of TEMOINS) {
    const d = decider(t.univers());
    const mord = d.code === 1 && d.fautes.some((f) => f.famille === t.famille);
    if (!mord) echecs++;
    lignes.push(`   ${mord ? '✓' : '✗'} ${t.famille}`);
  }
  const contre = decider(temoin("it('x', () => {});", { code: 1, sortie: 'FAIL  x.spec.ts' }));
  if (contre.code !== 0) echecs++;
  lignes.push(
    `   ${contre.code === 0 ? '✓' : '✗'} contre-témoin : un test rouge contre main passe`
  );
  const tete =
    echecs === 0
      ? `✅ ${ID_REGISTRE} --prove — les ${TEMOINS.length} familles rougissent chacune sur son témoin, et le contre-témoin passe.`
      : `❌ ${ID_REGISTRE} --prove — ${echecs} témoin(s) n'ont pas rendu le verdict attendu.`;
  return { code: echecs === 0 ? 0 : 1, fautes: [], lignes: [tete, ...lignes] };
}

// ── le dépôt réel ───────────────────────────────────────────────────────────────────────────────

const git = (args: string[], cwd = process.cwd()): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Les chemins que `<base>...HEAD` porte avec le filtre donné (A : ajoutés ; AM : ajoutés ou modifiés). */
function cheminsDuDiff(base: string, filtre: string): string[] {
  // `--no-renames` : un test DÉPLACÉ puis réécrit est un fichier ajouté, jugé comme tel. Sans lui,
  // git le voit renommé (statut R), et il sort du champ de la garde (revue securite de la PR 130).
  return git([
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    `--diff-filter=${filtre}`,
    `${base}...HEAD`,
  ])
    .split('\0')
    .filter((c) => c !== '');
}

/** Les fichiers que vitest exécute, DEMANDÉS à vitest. */
function inclusParVitest(): Set<string> {
  const r = spawnSync(process.execPath, [VITEST, 'list', '--filesOnly'], {
    encoding: 'utf8',
    maxBuffer: 64e6,
  });
  if (r.status !== 0) throw new Error(`vitest list a échoué (code ${r.status}) : ${r.stderr}`);
  return new Set(
    (r.stdout ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim().split('\\').join('/'))
      .filter((l) => l !== '')
  );
}

const RESSEMBLE_A_UN_TEST = /\.(spec|test)\.[cm]?[jt]sx?$/;

/** Pose l'arbre de `<base>` et rend l'exécuteur ; `retirer()` l'enlève. */
function arbreDeLaBase(base: string): { executer: Univers['executer']; retirer: () => void } {
  const racine = process.cwd();
  const arbre = join(mkdtempSync(join(tmpdir(), 'red-first-')), 'base');
  git(['worktree', 'add', '--detach', arbre, base]);
  const lien = join(arbre, 'node_modules');
  // Le LIEN d'abord, et lui seul : `worktree remove --force` ou un `rm` récursif qui le suivraient
  // videraient les dépendances de la tête. On ne détruit que ce qu'on a posé.
  const retirer = () => {
    if (existsSync(lien) && lstatSync(lien).isSymbolicLink()) unlinkSync(lien);
    try {
      git(['worktree', 'remove', '--force', arbre]);
    } finally {
      rmSync(dirname(arbre), { recursive: true, force: true });
    }
  };
  try {
    symlinkSync(
      join(racine, 'node_modules'),
      lien,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const aCopier = [
      ...cheminsDuDiff(base, 'AM').filter((c) => c.startsWith('tests/')),
      ...readdirSync(racine).filter((f) => /^vitest\.config\.[cm]?[jt]s$/.test(f)),
    ];
    for (const c of aCopier) {
      if (!existsSync(join(racine, c))) continue;
      mkdirSync(dirname(join(arbre, c)), { recursive: true });
      cpSync(join(racine, c), join(arbre, c));
    }
  } catch (e) {
    retirer();
    throw e;
  }
  const executer = (chemin: string): Execution => {
    const r = spawnSync(process.execPath, [join(arbre, VITEST), 'run', chemin], {
      cwd: arbre,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      encoding: 'utf8',
      maxBuffer: 64e6,
      timeout: 600_000,
    });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
  return { executer, retirer };
}

function juger(base: string): Decision {
  const ajoutes = cheminsDuDiff(base, 'A');
  const inclus = inclusParVitest();
  const tests = ajoutes.filter((c) => RESSEMBLE_A_UN_TEST.test(c) || inclus.has(c));
  const nouveaux = tests
    .filter((c) => inclus.has(c))
    .map((chemin) => ({ chemin, texte: readFileSync(chemin, 'utf8') }));
  const horsVitest = tests.filter((c) => !inclus.has(c));
  if (nouveaux.length === 0) {
    return decider({ base, nouveaux, horsVitest, executer: () => ({ code: 1, sortie: '' }) });
  }
  const { executer, retirer } = arbreDeLaBase(base);
  try {
    return decider({ base, nouveaux, horsVitest, executer });
  } finally {
    retirer();
  }
}

/**
 * La base jugée sans `--base` : sur une PR, GitHub Actions pose `GITHUB_BASE_REF` (la branche visée) ;
 * ailleurs, `origin/main`. La porte A appelle donc `pnpm red-first` nu : un argument calculé dans le
 * YAML sortirait de la forme FERMÉE que `gardes-transposees.spec.ts` exige de toute commande.
 */
export function baseParDefaut(brancheVisee: string | undefined): string {
  return brancheVisee !== undefined && brancheVisee !== ''
    ? `origin/${brancheVisee}`
    : 'origin/main';
}

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni juger ni sortir.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const decision = process.argv.includes('--prove')
    ? prouver()
    : juger(argument('--base') ?? baseParDefaut(process.env.GITHUB_BASE_REF));
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
