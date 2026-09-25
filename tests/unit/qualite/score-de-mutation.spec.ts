// @req REQ-QA-002
/**
 * score-de-mutation.spec.ts — QA-T30 : Stryker sur `src/domain/**`, un seuil DÉCLARÉ et TENU.
 *
 * REQ-QA-002 fait de la couverture à 100 % la condition d'entrée du domaine. Une couverture se
 * satisfait de tests qui exécutent sans rien affirmer ; le score de mutation est ce qui l'en
 * empêche : un mutant qui survit est une ligne exécutée qu'aucune assertion ne tient.
 *
 * CE QUI EST JUGÉ :
 *  - la configuration porte sur `src/domain/**` SEUL, et déclare son seuil de rupture ;
 *  - le rapport est lu par une décision pure : sous le seuil, code non nul ; et les survivants
 *    sont NOMMÉS — fichier, ligne, mutateur — jamais seulement comptés ;
 *  - le seuil est LU dans la configuration, jamais retapé (RM-01) ;
 *  - le travail tourne la nuit, pas en porte A : son coût ne tient pas dans une PR ;
 *  - TÉMOIN À DEUX FACES, sur un projet jetable qui porte la vraie chaîne (`scripts/gates/stryker.sh`,
 *    Stryker, le lecteur de rapport) : un test privé de son assertion fait sortir le travail en
 *    non nul en nommant le mutant survivant ; le même test avec son assertion le fait sortir en 0.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
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
  TEMOINS,
  decider,
  lireSeuil,
  type Rapport,
} from '../../../scripts/gates/mutation';

const RACINE = process.cwd();

type Statut = 'Killed' | 'Survived' | 'NoCoverage' | 'Timeout' | 'CompileError';

/** Un rapport au schéma de Stryker (`mutation-testing-report-schema`), réduit à ce qui est lu. */
function rapport(mutants: { fichier: string; ligne: number; statut: Statut }[]): Rapport {
  const files: Rapport['files'] = {};
  mutants.forEach((m, i) => {
    const f = (files[m.fichier] ??= { mutants: [] });
    f.mutants.push({
      id: String(i),
      mutatorName: 'ConditionalExpression',
      replacement: 'true',
      status: m.statut,
      location: { start: { line: m.ligne, column: 3 }, end: { line: m.ligne, column: 9 } },
    });
  });
  return { schemaVersion: '2', files };
}

describe('REQ-QA-002 — la configuration de Stryker', () => {
  const config = JSON.parse(readFileSync(join(RACINE, 'stryker.config.json'), 'utf8')) as {
    mutate: string[];
    thresholds: { break: number | null; low: number };
  };

  it('REQ-QA-002 : Stryker ne mute que src/domain/**, déclare un seuil de rupture, et vise 80 au moins', () => {
    expect(config.mutate.length).toBeGreaterThan(0);
    for (const m of config.mutate) expect(m.replace(/^!/, '')).toMatch(/^src\/domain\//);
    // Le seuil de RUPTURE est ALIGNÉ SUR LA MESURE (79,38 % le 2026-09-26, rapport de la première
    // passe complète) : un seuil au-dessus de la mesure rougirait chaque nuit sur une dette que
    // personne n'a créée, et finirait désarmé (RM-02). La CIBLE, elle, est 80 : `thresholds.low`.
    // La rupture ne descend jamais sous la mesure, et ne dépasse jamais la cible.
    const seuil = lireSeuil(readFileSync(join(RACINE, 'stryker.config.json'), 'utf8'));
    expect(seuil).toBe(config.thresholds.break);
    expect(seuil).not.toBeNull();
    expect(config.thresholds.low).toBeGreaterThanOrEqual(80);
    expect(seuil!).toBeLessThanOrEqual(config.thresholds.low);
    expect(seuil!).toBeGreaterThan(0);
  });

  it('REQ-QA-002 : le travail tourne la nuit, et pas en porte A', () => {
    const nuit = readFileSync(join(RACINE, '.github/workflows/nightly.yml'), 'utf8');
    const porteA = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8');
    expect(nuit.split('\n').some((l) => l.trim() === `run: pnpm ${ID_REGISTRE}`)).toBe(true);
    expect(porteA.split('\n').some((l) => l.trim() === `run: pnpm ${ID_REGISTRE}`)).toBe(false);
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(paquet.scripts[ID_REGISTRE]).toContain('scripts/gates/stryker.sh');
  });
});

describe('REQ-QA-002 — la décision sur le rapport', () => {
  it('REQ-QA-002 : sous le seuil, code non nul, et chaque survivant est nommé par fichier et ligne', () => {
    const d = decider({
      rapport: rapport([
        { fichier: 'src/domain/a.ts', ligne: 12, statut: 'Killed' },
        { fichier: 'src/domain/a.ts', ligne: 30, statut: 'Survived' },
        { fichier: 'src/domain/b.ts', ligne: 7, statut: 'NoCoverage' },
        { fichier: 'src/domain/b.ts', ligne: 8, statut: 'Killed' },
      ]),
      seuil: 80,
    });
    expect(d.code).toBe(1);
    expect(d.familles).toEqual(['score_sous_le_seuil']);
    const texte = d.lignes.join('\n');
    expect(texte).toContain('src/domain/a.ts:30');
    expect(texte).toContain('src/domain/b.ts:7');
    expect(texte).toContain('ConditionalExpression');
    expect(texte).toMatch(/50[.,]00/);
  });

  it('REQ-QA-002 : au seuil ou au-dessus, code 0 — et les survivants restants sont nommés quand même', () => {
    const mutants = [
      ...Array.from({ length: 4 }, (_, i) => ({
        fichier: 'src/domain/a.ts',
        ligne: i + 1,
        statut: 'Killed' as const,
      })),
      { fichier: 'src/domain/a.ts', ligne: 9, statut: 'Survived' as const },
    ];
    const d = decider({ rapport: rapport(mutants), seuil: 80 });
    expect(d.code).toBe(0);
    expect(d.lignes.join('\n')).toContain('src/domain/a.ts:9');
    // Le seuil est LU : le même rapport sous un seuil plus haut rougit.
    expect(decider({ rapport: rapport(mutants), seuil: 81 }).code).toBe(1);
  });

  it('REQ-QA-002 : les erreurs de compilation ne comptent ni pour ni contre le score', () => {
    const d = decider({
      rapport: rapport([
        { fichier: 'src/domain/a.ts', ligne: 1, statut: 'Killed' },
        { fichier: 'src/domain/a.ts', ligne: 2, statut: 'CompileError' },
        { fichier: 'src/domain/a.ts', ligne: 3, statut: 'Timeout' },
      ]),
      seuil: 100,
    });
    expect(d.code).toBe(0);
  });

  it('REQ-QA-002 : rapport absent ou illisible, seuil absent — refus nommés, jamais un vert', () => {
    expect(decider({ rapport: null, seuil: 80 }).familles).toEqual(['rapport_illisible']);
    expect(decider({ rapport: { files: {} }, seuil: 80 }).familles).toEqual(['rapport_illisible']);
    expect(
      decider({
        rapport: rapport([{ fichier: 'src/domain/a.ts', ligne: 1, statut: 'Killed' }]),
        seuil: null,
      }).familles
    ).toEqual(['seuil_absent']);
    expect(lireSeuil('{"thresholds": {}}')).toBeNull();
    expect(lireSeuil('pas du json')).toBeNull();
  });

  it('REQ-QA-002 : chaque famille a son témoin, et chaque témoin fait rougir SA famille', () => {
    expect([...new Set(TEMOINS.map((t) => t.famille))].sort()).toEqual([...FAMILLES].sort());
    for (const t of TEMOINS) {
      const d = decider(t.entree());
      expect(d.code, t.famille).toBe(1);
      expect(d.familles, t.famille).toContain(t.famille);
    }
  });
});

describe('REQ-QA-002 — témoin à deux faces : la vraie chaîne sur un projet jetable', () => {
  const PROJET = mkdtempSync(join(tmpdir(), 'qat30-'));
  afterAll(() => {
    unlinkSync(join(PROJET, 'node_modules'));
    rmSync(PROJET, { recursive: true, force: true });
  });
  const ecrire = (chemin: string, texte: string) => {
    mkdirSync(join(PROJET, chemin, '..'), { recursive: true });
    writeFileSync(join(PROJET, chemin), texte);
  };
  // La configuration du dépôt, recopiée telle quelle SAUF la configuration de test : le projet
  // jetable a la sienne. Le seuil, le périmètre et le greffon sont ceux du dépôt.
  const configDuDepot = JSON.parse(readFileSync(join(RACINE, 'stryker.config.json'), 'utf8')) as {
    vitest: Record<string, unknown>;
  };
  ecrire(
    'stryker.config.json',
    JSON.stringify({
      ...configDuDepot,
      vitest: { ...configDuDepot.vitest, configFile: 'vitest.config.mjs' },
    })
  );
  ecrire('vitest.config.mjs', "export default { test: { include: ['tests/**/*.spec.ts'] } };\n");
  ecrire(
    'src/domain/plafond.ts',
    'export function plafonner(montantCents: number, plafondCents: number): number {\n' +
      '  return montantCents > plafondCents ? plafondCents : montantCents;\n}\n'
  );
  symlinkSync(
    join(RACINE, 'node_modules'),
    join(PROJET, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  const lancer = () => {
    const r = spawnSync('bash', [resolve(RACINE, 'scripts/gates/stryker.sh')], {
      cwd: PROJET,
      encoding: 'utf8',
      timeout: 300_000,
    });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

  it('REQ-QA-002 : un test privé de ses assertions — le travail sort en non nul et nomme le mutant survivant', () => {
    ecrire(
      'tests/plafond.spec.ts',
      "import { it } from 'vitest';\nimport { plafonner } from '../src/domain/plafond';\n" +
        "it('plafonne', () => {\n  plafonner(500, 300);\n  plafonner(100, 300);\n});\n"
    );
    const s = lancer();
    console.log(
      s.sortie
        .split('\n')
        .filter((l) => l.includes('src/domain/plafond.ts:'))
        .join('\n')
    );
    expect(s.code).not.toBe(0);
    expect(s.code).not.toBeNull();
    expect(s.sortie).toContain('score_sous_le_seuil');
    expect(s.sortie).toMatch(/src\/domain\/plafond\.ts:2 .*Survived/);
  }, 320_000);

  it('REQ-QA-002 : le même test avec ses assertions — le travail sort en 0', () => {
    ecrire(
      'tests/plafond.spec.ts',
      "import { it, expect } from 'vitest';\nimport { plafonner } from '../src/domain/plafond';\n" +
        "it('plafonne', () => {\n  expect(plafonner(500, 300)).toBe(300);\n" +
        '  expect(plafonner(100, 300)).toBe(100);\n  expect(plafonner(300, 300)).toBe(300);\n' +
        '  expect(plafonner(301, 300)).toBe(300);\n});\n'
    );
    const s = lancer();
    console.log(
      s.sortie
        .split('\n')
        .filter((l) => /mutation/.test(l))
        .slice(-3)
        .join('\n')
    );
    expect(s.code).toBe(0);
  }, 320_000);
});
