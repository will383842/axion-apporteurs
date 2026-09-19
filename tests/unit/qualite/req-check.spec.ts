// @req REQ-QA-014
/**
 * REQ-QA-014 — `pnpm req:check` : chaque paire (tâche, exigence) a son test ANNOTÉ et VERT (QA-T03).
 *
 * `req:check` n'est pas un second script : c'est la garde DÉJÀ inscrite sous cet identifiant dans
 * `docs/gates.json` (`scripts/gates/gov-trace.ts`, alias `gov:trace`), lancée avec les RÉSULTATS de
 * la passe de tests. Une seconde matrice serait une seconde source (RM-01).
 *
 * CE QUE REQ-QA-014 DIT, ET QUE LA GARDE NE TENAIT PAS :
 *
 *   — « un test VERT » : aucun statut n'était lu. Un `it.skip` titré de l'identifiant couvrait.
 *   — titre de `it()` ET `@req` EN TÊTE du fichier : la garde acceptait l'un OU l'autre, et lisait
 *     `@req` n'importe où dans le fichier. Le titre d'un `describe` n'est pas celui du test.
 *   — « chaque `@req` pointe une REQ EN VIGUEUR » : une annotation qui nomme une exigence ABSORBÉE
 *     sans porter son renvoi passait (seuls les TITRES étaient jugés).
 *
 * LES PANNES, ET OÙ ELLES SONT FABRIQUÉES. Le jugement d'une paire se prouve sur l'univers de
 * FIXTURE de `gov:trace --prove` — un témoin NOMMÉ par panne, qui doit rougir sur SA famille avec
 * SON motif, et des contre-témoins verts. Ce fichier exige chacun de ces témoins par sa clé. Ce qui
 * dépend du DISQUE se prouve ici : la lecture de l'en-tête et du titre du test (panne-3, panne-7), des
 * résultats absents, tronqués ou partiels donnés à la garde sur le dépôt réel (panne-5), le câblage
 * (`package.json`, Gate A — panne-8) et l'absence d'un second script.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as LECTURE from '../../../scripts/lot/titres-ecrits';
import { estObjet, lireYaml } from '../ci/lire-yaml';

const TRACE = 'scripts/gates/gov-trace.ts';
const CI = '.github/workflows/ci.yml';
const CE_FICHIER = 'tests/unit/qualite/req-check.spec.ts';
const LONG = 300_000;

/** `npx tsx`, JAMAIS `node node_modules/tsx/…` : l'enfant `vitest list` rendrait une liste vide. */
function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', TRACE, ...args], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GOV_TRACE_SANS_PR: '1' },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const DOSSIERS: string[] = [];
afterAll(() => {
  // Ces dossiers ne contiennent que des fichiers JSON écrits ici : aucun `node_modules`.
  for (const d of DOSSIERS) rmSync(d, { recursive: true, force: true });
});
function fichierJetable(nom: string, contenu: string): string {
  const d = mkdtempSync(join(tmpdir(), 'req-check-'));
  DOSSIERS.push(d);
  const f = join(d, nom);
  writeFileSync(f, contenu, 'utf8');
  return f;
}

// ── la lecture : l'en-tête du fichier, et le titre du test lui-même ────────────────────────────

/**
 * Les textes de fichier fabriqués ci-dessous sont ASSEMBLÉS, jamais écrits d'un bloc : `gov:trace`
 * lit CE fichier-ci avec la même lecture, et une annotation ou une ouverture de test écrite en clair
 * dans une chaîne y serait comptée comme une citation — d'exigences qui n'existent pas.
 */
const REQ = '@' + 'req ';
const [IT, TEST, DESCRIBE] = ['it', 'test', 'describe'];

describe('REQ-QA-014 — la lecture : `@req` EN TÊTE, et le titre du `it()` lui-même', () => {
  it('REQ-QA-014 — panne-3 : un `@req` écrit ligne 40, après les `import`, n’est PAS en tête ; ceux du premier bloc de commentaires le sont', () => {
    const texte =
      `// ${REQ}REQ-AAA-001\n` +
      `/**\n * ${REQ}REQ-AAA-002 — dans le docblock\n */\n` +
      "import { it } from 'vitest';\n" +
      '\n'.repeat(34) +
      `// ${REQ}REQ-AAA-003\n` +
      IT +
      "('REQ-AAA-003 — x', () => {});\n";
    expect(typeof LECTURE.annotationsReq, 'annotationsReq() n’existe pas').toBe('function');
    const a = LECTURE.annotationsReq(texte);
    expect(a.map((x) => [x.req, x.ligne, x.enTete])).toEqual([
      ['REQ-AAA-001', 1, true],
      ['REQ-AAA-002', 3, true],
      ['REQ-AAA-003', 40, false],
    ]);
    // La ligne ENTIÈRE est rendue : c'est là que se lit le renvoi d'une exigence absorbée (panne-4).
    expect(a[1]!.texteLigne).toContain('dans le docblock');
  });

  it('REQ-QA-014 — un fichier qui commence par du CODE n’a aucun en-tête : son `@req` de la ligne 2 n’y est pas', () => {
    const a = LECTURE.annotationsReq(`import 'x';\n// ${REQ}REQ-AAA-001\n`);
    expect(a.map((x) => x.enTete)).toEqual([false]);
  });

  it('REQ-QA-014 — panne-7 : le titre d’un `describe` n’est pas un titre de `it()` ; `it`, `test` et leurs variantes le sont', () => {
    expect(typeof LECTURE.titresDeTest, 'titresDeTest() n’existe pas').toBe('function');
    const texte =
      `${DESCRIBE}('REQ-AAA-001 — le describe', () => {\n` +
      `  ${IT}('sans identifiant', () => {});\n` +
      `  ${TEST}.each([1])('REQ-AAA-002 %s', () => {});\n` +
      `  ${IT}.skip(\n    'REQ-AAA-003 — ouvert à la ligne suivante', () => {});\n` +
      `  ${DESCRIBE}.each([1])('REQ-AAA-004 imbriqué', () => {});\n` +
      '});\n';
    expect(LECTURE.titresDeTest(texte)).toEqual([
      'sans identifiant',
      'REQ-AAA-002 %s',
      'REQ-AAA-003 — ouvert à la ligne suivante',
    ]);
    // Contre-témoin : la lecture de TOUS les titres, elle, garde les `describe`.
    expect(LECTURE.titresEcrits(texte)).toHaveLength(5);
  });
});

// ── le jugement d'une paire, prouvé sur l'univers de fixture ───────────────────────────────────

/** Chaque panne du brief, et la famille qui DOIT la nommer. Clé = celle que `--prove` imprime. */
const TEMOINS_ATTENDUS: Record<string, string> = {
  'panne-1': 'test_promis_non_vert',
  'panne-2a': 'req_non_citee_par_son_test',
  'panne-2b': 'req_non_citee_par_son_test',
  'panne-3': 'req_non_citee_par_son_test',
  'panne-4': 'annotation_absorbee_sans_renvoi',
  'panne-5-absents': 'resultats_illisibles',
  'panne-5-illisibles': 'resultats_illisibles',
  'panne-5-perimes': 'resultats_illisibles',
  'panne-6': 'test_promis_non_vert',
  'panne-7': 'req_non_citee_par_son_test',
  'panne-7-resolu': 'req_non_citee_par_son_test',
  'panne-milieu': 'test_promis_non_vert',
};
const CONTRE_TEMOINS_ATTENDUS = [
  'renvoi-porte',
  'sans-resultats',
  'saute-et-vert',
  'gabarit-resolu',
];

describe('REQ-QA-014 — `gov:trace --prove` : chaque panne a son témoin nommé, chaque famille neuve est prouvée', () => {
  let preuve: { code: number; sortie: string } | null = null;
  const prouver = () => (preuve ??= lancer('--prove'));

  it(
    'REQ-QA-014 — les trois familles neuves figurent dans la liste des familles prouvées',
    () => {
      const { code, sortie } = prouver();
      expect(code, sortie).toBe(0);
      const familles = sortie
        .split('\n')
        .filter((l) => l.trim().startsWith('•'))
        .map((l) => l.trim().slice(1).trim());
      for (const f of [
        'test_promis_non_vert',
        'annotation_absorbee_sans_renvoi',
        'resultats_illisibles',
      ]) {
        expect(familles, sortie).toContain(f);
      }
    },
    LONG
  );

  it(
    'REQ-QA-014 — panne-1 à panne-7 : chaque panne a SON témoin, qui rougit sur SA famille avec SON motif',
    () => {
      const { code, sortie } = prouver();
      expect(code, sortie).toBe(0);
      const vus: Record<string, string> = {};
      for (const m of sortie.matchAll(/◦ témoin (\S+) \[(\w+)\]/g)) vus[m[1]!] = m[2]!;
      expect(vus, sortie).toEqual(TEMOINS_ATTENDUS);
    },
    LONG
  );

  it(
    'REQ-QA-014 — les contre-témoins : l’absorbée AVEC son renvoi, la garde sans résultats, tous les tests verts',
    () => {
      const { code, sortie } = prouver();
      expect(code, sortie).toBe(0);
      const vus = [...sortie.matchAll(/◦ contre-témoin (\S+)/g)].map((m) => m[1]!);
      expect(vus.sort(), sortie).toEqual([...CONTRE_TEMOINS_ATTENDUS].sort());
    },
    LONG
  );
});

// ── sur le dépôt réel : des résultats qu'on ne peut pas lire ne donnent JAMAIS un vert (panne-5) ─────

describe('REQ-QA-014 — panne-5 : résultats absents, illisibles ou périmés, sur le dépôt réel', () => {
  it(
    'REQ-QA-014 — un chemin de résultats qui n’existe pas rougit `resultats_illisibles` (absents)',
    () => {
      const absent = join(tmpdir(), 'req-check-ce-fichier-n-existe-pas', 'vitest.json');
      const { code, sortie } = lancer('--resultats', absent);
      expect(sortie).toContain('resultats_illisibles');
      expect(sortie).toContain('absents');
      expect(code).not.toBe(0);
    },
    LONG
  );

  it(
    'REQ-QA-014 — un JSON tronqué rougit `resultats_illisibles` (illisibles)',
    () => {
      const tronque = fichierJetable('vitest.json', '{"testResults": [{"name": "x", "asser');
      const { code, sortie } = lancer('--resultats', tronque);
      expect(sortie).toContain('resultats_illisibles');
      expect(sortie).toContain('illisibles');
      expect(code).not.toBe(0);
    },
    LONG
  );

  it(
    'REQ-QA-014 — les résultats d’une passe PARTIELLE rougissent (perimes) et nomment un fichier exécuté qui manque',
    () => {
      const partiel = fichierJetable(
        'vitest.json',
        JSON.stringify({
          testResults: [
            {
              name: resolve(CE_FICHIER).replace(/\\/g, '/'),
              status: 'passed',
              assertionResults: [{ ancestorTitles: [], title: 'REQ-QA-014 — x', status: 'passed' }],
            },
          ],
        })
      );
      const { code, sortie } = lancer('--resultats', partiel);
      expect(sortie).toContain('resultats_illisibles');
      expect(sortie).toContain('perimes');
      expect(sortie).toContain('tests/unit/gouvernance/tracabilite.spec.ts');
      expect(code).not.toBe(0);
    },
    LONG
  );

  it(
    'REQ-QA-014 — sans `--resultats`, la garde DIT que le vert n’est pas jugé, et compte les paires confrontées',
    () => {
      const { code, sortie } = lancer();
      expect(sortie, sortie).toContain('NON JUGÉ');
      expect(sortie, sortie).toMatch(/(\d+) paire\(s\) \(tâche, exigence\) confrontée\(s\)/);
      expect(code, sortie).toBe(0);
    },
    LONG
  );
});

// ── le câblage : UNE garde, lancée APRÈS les tests, sans tolérance d'échec (panne-8) ─────────────────

type Paquet = { scripts: Record<string, string> };
const paquet = () => JSON.parse(readFileSync('package.json', 'utf8')) as Paquet;

describe('REQ-QA-014 — `pnpm req:check` est la garde inscrite, lancée avec les résultats de `pnpm test`', () => {
  it('REQ-QA-014 — aucun second script : `req:check` lance `gov-trace.ts`, que `docs/gates.json` inscrit sous cet identifiant', () => {
    const s = paquet().scripts;
    expect(s['req:check'], 'aucun script `req:check` dans package.json').toMatch(
      /^tsx scripts\/gates\/gov-trace\.ts --resultats \S+$/
    );
    const gates = (
      JSON.parse(readFileSync('docs/gates.json', 'utf8')) as {
        gates: { id: string; script: string; alias?: string[] }[];
      }
    ).gates;
    const entree = gates.find((g) => g.id === 'req:check');
    expect(entree?.script).toBe(TRACE);
    expect(entree?.alias ?? []).toContain('gov:trace');
    expect(existsSync('scripts/gates/req-check.ts'), 'un second script de matrice existe').toBe(
      false
    );
  });

  it('REQ-QA-014 — le fichier que `req:check` LIT est celui que `pnpm test` ÉCRIT en JSON (un chemin, deux usages)', () => {
    const s = paquet().scripts;
    const lu = /--resultats (\S+)$/.exec(s['req:check'] ?? '')?.[1];
    expect(lu, 'req:check ne dit pas quels résultats il lit').toBeDefined();
    expect(s.test ?? '').toContain('--reporter=json');
    expect(s.test ?? '').toContain(`--outputFile.json=${lu}`);
    // Et les résultats restent hors de l'index : un fichier de résultats commité serait périmé
    // au commit suivant, et le lire serait juger une autre passe.
    expect(readFileSync('.gitignore', 'utf8').split(/\r?\n/)).toContain(`${lu!.split('/')[0]}/`);
  });
});

/** La place de l'étape `pnpm req:check` dans `gate-a`. Rend les défauts NOMMÉS, jamais un booléen. */
function jugerEtapeReqCheck(workflow: unknown): string[] {
  if (!estObjet(workflow) || !estObjet(workflow.jobs)) return ['workflow illisible'];
  const job = workflow.jobs['gate-a'];
  if (!estObjet(job) || !Array.isArray(job.steps)) return ['job gate-a illisible'];
  const etapes = job.steps.filter(estObjet);
  const iTests = etapes.findIndex((e) => e.run === 'pnpm test');
  const iReq = etapes.findIndex((e) => e.run === 'pnpm req:check');
  if (iTests < 0) return ['étape « Tests » (`pnpm test`) introuvable'];
  if (iReq < 0) return ['étape `pnpm req:check` ABSENTE de gate-a'];
  const defauts: string[] = [];
  if (iReq < iTests)
    defauts.push('étape `pnpm req:check` placée AVANT « Tests » : elle ne verrait aucun résultat');
  else if (iReq !== iTests + 1) defauts.push('étape `pnpm req:check` pas JUSTE APRÈS « Tests »');
  const e = etapes[iReq]!;
  if ('if' in e) defauts.push('étape `pnpm req:check` conditionnelle (`if:`)');
  if ('continue-on-error' in e)
    defauts.push('étape `pnpm req:check` tolérante (`continue-on-error`)');
  return defauts;
}

describe('REQ-QA-014 — panne-8 : Gate A lance `pnpm req:check` juste après « Tests », sans tolérance d’échec', () => {
  it('REQ-QA-014 — le `ci.yml` du dépôt : l’étape existe, juste après « Tests », inconditionnelle', async () => {
    expect(jugerEtapeReqCheck(await lireYaml(readFileSync(CI, 'utf8')))).toEqual([]);
  });

  it('REQ-QA-014 — une copie SANS l’étape, ou avec l’étape AVANT « Tests », est nommée', async () => {
    const reel = (await lireYaml(readFileSync(CI, 'utf8'))) as {
      jobs: Record<string, { steps: Record<string, unknown>[] }>;
    };
    const etapes = reel.jobs['gate-a']!.steps;
    const iReq = etapes.findIndex((e) => e.run === 'pnpm req:check');
    expect(
      iReq,
      'le ci.yml réel ne porte pas l’étape : la copie ne prouverait rien'
    ).toBeGreaterThan(0);

    const sans = structuredClone(reel);
    sans.jobs['gate-a']!.steps.splice(iReq, 1);
    expect(jugerEtapeReqCheck(sans).join(' ; ')).toContain('ABSENTE');

    const avant = structuredClone(reel);
    const [etape] = avant.jobs['gate-a']!.steps.splice(iReq, 1);
    const iTests = avant.jobs['gate-a']!.steps.findIndex((e) => e.run === 'pnpm test');
    avant.jobs['gate-a']!.steps.splice(iTests, 0, etape!);
    expect(jugerEtapeReqCheck(avant).join(' ; ')).toContain('AVANT « Tests »');

    const tolerante = structuredClone(reel);
    tolerante.jobs['gate-a']!.steps[iReq]!['continue-on-error'] = true;
    expect(jugerEtapeReqCheck(tolerante).join(' ; ')).toContain('tolérante');
  });
});
