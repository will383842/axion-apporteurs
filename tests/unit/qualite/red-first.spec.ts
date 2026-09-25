// @req REQ-CPL-022
/**
 * red-first.spec.ts — CPL-T22 : les tests NOUVEAUX d'une PR, exécutés contre `main`, doivent échouer.
 *
 * RM-02 : une garde ne vaut que si on l'a vue rougir. Le bloc ROUGE/VERT d'une PR le déclare ; ce
 * job le MESURE. Un test qui passe déjà contre le code de `main` ne prouve rien de ce que la PR
 * ajoute : il passerait aussi sans elle. Seule sortie : le marqueur `@no-red-first` suivi d'une
 * justification écrite — et la sortie l'imprime, pour qu'une exemption se lise.
 *
 * DEUX ÉTAGES :
 *  - la DÉCISION (`decider`) est pure : les fichiers nouveaux et une exécution injectée ;
 *  - le BINAIRE est joué de bout en bout sur un dépôt git jetable : une branche qui ajoute un test
 *    déjà vert contre `main` le fait sortir en non nul en NOMMANT le fichier ; une branche dont le
 *    test nouveau rougit contre `main` le fait sortir en 0.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  FAMILLES,
  ID_REGISTRE,
  MARQUEUR,
  TEMOINS,
  baseParDefaut,
  decider,
  justificationDe,
  type Execution,
  type Univers,
} from '../../../scripts/gates/red-first';

const RACINE = process.cwd();
const SCRIPT = resolve(RACINE, 'scripts/gates/red-first.ts');

const rouge: Execution = { code: 1, sortie: 'FAIL  AssertionError: expected 2 to be 3' };
const vert: Execution = { code: 0, sortie: 'Tests  1 passed (1)' };

function univers(
  nouveaux: { chemin: string; texte: string; execution: Execution }[],
  horsVitest: string[] = []
): Univers {
  const parChemin = new Map(nouveaux.map((n) => [n.chemin, n.execution]));
  return {
    base: 'origin/main',
    nouveaux: nouveaux.map(({ chemin, texte }) => ({ chemin, texte })),
    horsVitest,
    executer: (chemin) => {
      const e = parChemin.get(chemin);
      if (e === undefined) throw new Error(`exécution non préparée : ${chemin}`);
      return e;
    },
  };
}

describe('REQ-CPL-022 — la décision', () => {
  it('REQ-CPL-022 : un test nouveau déjà VERT contre main fait sortir la garde en non nul, et la sortie le nomme', () => {
    const d = decider(
      univers([
        { chemin: 'tests/unit/a.spec.ts', texte: "it('a', () => {});", execution: vert },
        { chemin: 'tests/unit/b.spec.ts', texte: "it('b', () => {});", execution: rouge },
      ])
    );
    expect(d.code).toBe(1);
    expect(d.fautes.map((f) => [f.famille, f.chemin])).toEqual([
      ['test_deja_vert_sur_main', 'tests/unit/a.spec.ts'],
    ]);
    expect(d.lignes.join('\n')).toContain('tests/unit/a.spec.ts');
    expect(d.lignes[0]).toContain(ID_REGISTRE);
  });

  it('REQ-CPL-022 : tous les tests nouveaux rougissent contre main — la garde sort en 0 et imprime le compte jugé', () => {
    const d = decider(
      univers([
        { chemin: 'tests/unit/a.spec.ts', texte: "it('a', () => {});", execution: rouge },
        { chemin: 'tests/unit/b.spec.ts', texte: "it('b', () => {});", execution: rouge },
      ])
    );
    expect(d.code).toBe(0);
    expect(d.fautes).toEqual([]);
    expect(d.lignes.join('\n')).toMatch(/2 test\(s\) nouveau\(x\) jugé\(s\)/);
  });

  it('REQ-CPL-022 : @no-red-first suivi d’une justification exempte le fichier, sans l’exécuter, et l’imprime', () => {
    const texte = `// ${MARQUEUR}: caractérise un comportement déjà livré par la PR 59, avant son extraction\nit('a', () => {});`;
    const d = decider(univers([{ chemin: 'tests/unit/a.spec.ts', texte, execution: vert }]));
    expect(d.code).toBe(0);
    expect(d.lignes.join('\n')).toContain('caractérise un comportement déjà livré');
    expect(justificationDe(texte)).toContain('PR 59');
  });

  it('REQ-CPL-022 : @no-red-first sans justification, ou d’une justification trop courte, est un refus nommé', () => {
    for (const texte of [`// ${MARQUEUR}\nit('a', () => {});`, `// ${MARQUEUR}: parce que\n`]) {
      const d = decider(univers([{ chemin: 'tests/unit/a.spec.ts', texte, execution: rouge }]));
      expect(d.code, texte).toBe(1);
      expect(d.fautes.map((f) => f.famille)).toEqual(['no_red_first_sans_justification']);
    }
    expect(justificationDe("it('a', () => {});")).toBeUndefined();
  });

  it('REQ-CPL-022 : un fichier que main n’a pas pu exécuter (aucun test trouvé) n’est pas un rouge — refus nommé', () => {
    const d = decider(
      univers([
        {
          chemin: 'tests/unit/a.spec.ts',
          texte: "it('a', () => {});",
          execution: { code: 1, sortie: 'No test files found, exiting with code 1' },
        },
      ])
    );
    expect(d.code).toBe(1);
    expect(d.fautes.map((f) => f.famille)).toEqual(['non_execute_sur_main']);
  });

  it('REQ-CPL-022 : aucun test nouveau — vert, et la sortie le DIT ; les fichiers hors vitest sont nommés comme non jugés', () => {
    const d = decider(univers([], ['tests/a11y/axe.spec.ts']));
    expect(d.code).toBe(0);
    const texte = d.lignes.join('\n');
    expect(texte).toMatch(/0 test\(s\) nouveau\(x\) jugé\(s\)/);
    expect(texte).toContain('tests/a11y/axe.spec.ts');
  });

  it('REQ-CPL-022 : chaque famille a son témoin, et chaque témoin fait rougir SA famille', () => {
    expect([...new Set(TEMOINS.map((t) => t.famille))].sort()).toEqual([...FAMILLES].sort());
    for (const t of TEMOINS) {
      const d = decider(t.univers());
      expect(d.code, t.famille).toBe(1);
      expect(
        d.fautes.map((f) => f.famille),
        t.famille
      ).toContain(t.famille);
    }
  });
});

describe('REQ-CPL-022 — le binaire, sur un dépôt git jetable', () => {
  const DEPOT = mkdtempSync(join(tmpdir(), 'cplt22-'));
  // Le lien vers les dépendances du dépôt d'abord, et lui seul : un effacement récursif qui le
  // suivrait viderait `node_modules`. On ne détruit que ce qu'on a posé.
  afterAll(() => {
    unlinkSync(join(DEPOT, 'node_modules'));
    rmSync(DEPOT, { recursive: true, force: true });
  });

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ecrire = (chemin: string, texte: string) => {
    mkdirSync(join(DEPOT, chemin, '..'), { recursive: true });
    writeFileSync(join(DEPOT, chemin), texte);
  };

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'temoin@example.invalid');
  git('config', 'user.name', 'temoin');
  ecrire('vitest.config.mjs', "export default { test: { include: ['tests/**/*.spec.ts'] } };\n");
  ecrire('.gitignore', 'node_modules\n');
  ecrire('src/somme.mjs', 'export const somme = (a, b) => a + b;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'main');
  symlinkSync(
    join(RACINE, 'node_modules'),
    join(DEPOT, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  const lancer = () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--base', 'main'], {
      cwd: DEPOT,
      encoding: 'utf8',
      timeout: 180_000,
    });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

  it('REQ-CPL-022 : une branche qui ajoute un test déjà vert contre main — sortie non nulle, le fichier nommé', () => {
    git('checkout', '-q', '-b', 'deja-vert', 'main');
    ecrire(
      'tests/somme.spec.ts',
      "import { it, expect } from 'vitest';\nimport { somme } from '../src/somme.mjs';\n" +
        "it('somme', () => expect(somme(1, 2)).toBe(3));\n"
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'test vert');
    const s = lancer();
    console.log(s.sortie.trim().split('\n').slice(-4).join('\n'));
    expect(s.code).toBe(1);
    expect(s.sortie).toContain('test_deja_vert_sur_main');
    expect(s.sortie).toContain('tests/somme.spec.ts');
  }, 200_000);

  it('REQ-CPL-022 : une branche dont le test nouveau rougit contre main — sortie 0, et l’arbre de main est retiré', () => {
    git('checkout', '-q', '-b', 'rouge-d-abord', 'main');
    ecrire('src/produit.mjs', 'export const produit = (a, b) => a * b;\n');
    ecrire(
      'tests/produit.spec.ts',
      "import { it, expect } from 'vitest';\nimport { produit } from '../src/produit.mjs';\n" +
        "it('produit', () => expect(produit(2, 3)).toBe(6));\n"
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'test et code');
    const s = lancer();
    console.log(s.sortie.trim().split('\n').slice(-4).join('\n'));
    expect(s.code).toBe(0);
    expect(s.sortie).toContain('tests/produit.spec.ts');
    expect(git('worktree', 'list').trim().split('\n')).toHaveLength(1);
  }, 200_000);
});

describe('REQ-CPL-022 — le câblage', () => {
  it('REQ-CPL-022 : la porte A joue la garde sur les PR contre leur base, et sa preuve, sans continue-on-error', () => {
    const ci = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8');
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(paquet.scripts[ID_REGISTRE]).toContain('scripts/gates/red-first.ts');
    expect(paquet.scripts[`${ID_REGISTRE}:prove`]).toContain('--prove');
    const lignes = ci.split('\n');
    // La commande est FERMÉE (`gardes-transposees.spec.ts`) : la base vient de `GITHUB_BASE_REF`,
    // que GitHub pose sur `pull_request`, et `origin/main` ailleurs.
    const appel = lignes.findIndex((l) => l.trim() === `run: pnpm ${ID_REGISTRE}`);
    expect(appel, 'étape `pnpm red-first` absente de ci.yml').toBeGreaterThan(0);
    expect(baseParDefaut('main')).toBe('origin/main');
    expect(baseParDefaut('release')).toBe('origin/release');
    expect(baseParDefaut(undefined)).toBe('origin/main');
    expect(baseParDefaut('')).toBe('origin/main');
    expect(lignes[appel - 1]).toMatch(/if: github\.event_name == 'pull_request'/);
    expect(lignes.some((l) => l.trim() === `run: pnpm ${ID_REGISTRE}:prove`)).toBe(true);
    // L'étape ENTIÈRE, de son `- name:` au suivant : aucun `continue-on-error` n'y entre.
    let debut = appel;
    while (debut > 0 && !/^\s+- name:/.test(lignes[debut] ?? '')) debut--;
    let fin = appel + 1;
    while (fin < lignes.length && !/^\s+- (name|run|uses):/.test(lignes[fin] ?? '')) fin++;
    expect(lignes.slice(debut, fin).join('\n')).not.toContain('continue-on-error');
  });
});
