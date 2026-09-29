// @req REQ-GOV-032
// @req REQ-GOV-006
/**
 * GOV-123 — LES VUES DÉRIVÉES NE SONT PLUS DANS LES PR : elles se rendent à la volée.
 *
 * Ce que cette spec tient, chacun avec son témoin rouge :
 *   1. aucune des vues de `VUES_DERIVEES` n'est suivie par git, et `.gitignore` les écarte toutes ;
 *   2. la garde `vues:hors-git` refuse une PR qui en rajoute une, en NOMMANT le fichier ;
 *   3. `vues:rendre` refuse un rendu en échec, une vue absente, et deux rendus qui diffèrent d'un
 *      octet — en nommant la vue ;
 *   4. la porte A rend les vues AVANT toute étape qui en lit une ;
 *   5. LE TÉMOIN À DEUX FACES de l'acceptation, dans de vrais dépôts git jetables : deux branches
 *      qui ajoutent chacune une tâche au registre sont en conflit quand la vue est commitée, et ne
 *      le sont plus quand elle est ignorée ; `vues:fusion` fait passer une branche d'avant GOV-123 ;
 *   6. REQ-GOV-006 : la date de `docs/PLAN-STATE.md` rendu à la volée est celle de `HEAD`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VUES_DERIVEES } from '../../../scripts/vues/vues';
import {
  CHEMINS_DES_VUES,
  dateDUneVue,
  jugerHorsGit,
  rendreDeuxFois,
} from '../../../scripts/vues/rendre-apres-fusion';
import { fusionnerMain } from '../../../scripts/vues/fusion';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';

const DELAI = 120_000;
const aNettoyer: string[] = [];
afterAll(() => {
  for (const d of aNettoyer) rmSync(d, { recursive: true, force: true });
});

describe('REQ-GOV-032 — aucune vue dérivée sous git', () => {
  it('REQ-GOV-032 — les sept vues du dépôt sont hors de l’index et écartées par .gitignore', () => {
    expect(CHEMINS_DES_VUES.length, 'liste vide : le témoin dirait toujours oui').toBe(7);
    const suivis = new Set(fichiersSuivis());
    expect(suivis.size, 'périmètre vide : git ne répond pas').toBeGreaterThan(100);
    expect(CHEMINS_DES_VUES.filter((v) => suivis.has(v))).toEqual([]);
    const nonIgnorees = CHEMINS_DES_VUES.filter(
      (v) =>
        spawnSync('git', ['check-ignore', '-q', '--no-index', '--', v], { stdio: 'ignore' })
          .status !== 0
    );
    expect(nonIgnorees).toEqual([]);
  });

  it('REQ-GOV-032 — TÉMOIN ROUGE : une PR qui AJOUTE une vue sous git est refusée en nommant le fichier', () => {
    const issue = jugerHorsGit(['src/a.ts', 'docs/TASKS.md', 'docs/tasks.json'], () => true);
    expect(issue.code).toBe(1);
    const sortie = issue.lignes.join('\n');
    expect(sortie).toContain('[vue_sous_git] `docs/TASKS.md`');
    expect(sortie).not.toContain('docs/tasks.json`');
  });

  it('REQ-GOV-032 — TÉMOIN ROUGE : une vue que .gitignore n’écarte plus est nommée', () => {
    const issue = jugerHorsGit([], (c) => c !== 'docs/PLAN-STATE.md');
    expect(issue.code).toBe(1);
    expect(issue.lignes.join('\n')).toContain('[vue_non_ignoree] `docs/PLAN-STATE.md`');
  });

  it('REQ-GOV-032 — contre-témoin : aucune vue suivie, toutes ignorées → vert, les sept nommées', () => {
    const issue = jugerHorsGit(['docs/tasks.json', 'docs/requirements.json'], () => true);
    expect(issue.code).toBe(0);
    for (const v of CHEMINS_DES_VUES) expect(issue.lignes.join('\n')).toContain(v);
  });
});

describe('REQ-GOV-032 — le rendu est reproductible, ou il rougit en nommant la vue', () => {
  const vues = ['docs/A.md', 'docs/B.md'];
  const fixe = (contenus: Record<string, string>) => (c: string) =>
    c in contenus ? Buffer.from(contenus[c]!) : null;

  it('REQ-GOV-032 — contre-témoin : deux rendus identiques → vert', () => {
    const issue = rendreDeuxFois({
      vues,
      rendre: () => true,
      lire: fixe({ 'docs/A.md': 'a\n', 'docs/B.md': 'b\n' }),
    });
    expect(issue.code, issue.lignes.join('\n')).toBe(0);
  });

  it('REQ-GOV-032 — TÉMOIN ROUGE : deux rendus qui diffèrent d’un octet sont refusés, la vue nommée', () => {
    let passe = 0;
    const issue = rendreDeuxFois({
      vues,
      rendre: () => {
        passe++;
        return true;
      },
      lire: (c) => Buffer.from(c === 'docs/B.md' ? `rendu ${passe}\n` : 'stable\n'),
    });
    expect(issue.code).toBe(1);
    const sortie = issue.lignes.join('\n');
    expect(sortie).toContain('[rendu_non_reproductible] `docs/B.md`');
    expect(sortie).toContain('octet 6');
    expect(sortie).not.toContain('`docs/A.md`');
  });

  it('REQ-GOV-032 — TÉMOIN ROUGE : un rendu en échec, ou une vue absente après rendu, est refusé', () => {
    expect(rendreDeuxFois({ vues, rendre: () => false, lire: fixe({}) }).code).toBe(1);
    const absente = rendreDeuxFois({ vues, rendre: () => true, lire: fixe({ 'docs/A.md': 'a' }) });
    expect(absente.code).toBe(1);
    expect(absente.lignes.join('\n')).toContain('docs/B.md');
  });
});

describe('REQ-GOV-032 — la porte A rend les vues avant de les lire', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const runs = [...ci.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((m) => m[1]!.trim());
  const scripts = (
    JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;

  it('REQ-GOV-032 — `pnpm vues:rendre` suit l’installation et précède tout vérificateur de vue, la suite et gov:etat', () => {
    const i = runs.indexOf('pnpm vues:rendre');
    expect(i, '`pnpm vues:rendre` absent de ci.yml').toBeGreaterThan(-1);
    expect(runs[i - 1]).toBe('pnpm install --frozen-lockfile');
    // `adr:index:verifier` n'est pas une étape : `gov:adr` le joue, et il est dans la liste ci-dessous.
    const verificateurs = VUES_DERIVEES.map((v) => v.verificateur).filter((v) => runs.includes(v));
    expect(verificateurs.length, 'les vérificateurs de vue ont quitté la porte A').toBe(6);
    const lecteurs = [
      ...verificateurs,
      'pnpm test',
      'pnpm gov:attributions',
      'pnpm gov:adr',
      'pnpm gov:inventaire',
      'pnpm gov:entite',
    ];
    for (const l of lecteurs) {
      const j = runs.findIndex((r) => r === l || r.startsWith(`${l} `));
      expect(j, `\`${l}\` absent de ci.yml`).toBeGreaterThan(-1);
      expect(j, `\`${l}\` lit une vue AVANT qu’elle soit rendue`).toBeGreaterThan(i);
    }
  });

  it('REQ-GOV-032 — `pnpm vues:hors-git` est une étape de la porte A, et les deux scripts existent', () => {
    expect(runs).toContain('pnpm vues:hors-git');
    expect(scripts['vues:rendre']).toBe('tsx scripts/vues/rendre-apres-fusion.ts');
    expect(scripts['vues:hors-git']).toBe('tsx scripts/vues/rendre-apres-fusion.ts --hors-git');
  });
});

// ── dépôts jetables ─────────────────────────────────────────────────────────────────────────

const REGISTRE = 'docs/tasks.json';
const VUE = 'docs/TASKS.md';

function depot(): {
  dir: string;
  git: (...a: string[]) => string;
  ok: (...a: string[]) => boolean;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vues-gov123-'));
  aNettoyer.push(dir);
  const opts = { cwd: dir, encoding: 'utf8' as const };
  const git = (...a: string[]): string =>
    execFileSync('git', a, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  const ok = (...a: string[]): boolean =>
    spawnSync('git', a, { ...opts, stdio: 'ignore' }).status === 0;
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  return { dir, git, ok };
}

/**
 * Le générateur du témoin, comme `docs/TASKS.md` : une ligne de SYNTHÈSE (le compte et les
 * identifiants — les vraies vues ont leurs totaux par phase et par statut), puis la liste. Deux
 * ajouts parallèles réécrivent chacun la synthèse autrement : c'est ce qui mettait les PR en conflit.
 */
function rendreLaVue(dir: string): boolean {
  const lignes = readFileSync(join(dir, REGISTRE), 'utf8').split('\n').filter(Boolean);
  const synthese = `# ${lignes.length} taches : ${lignes.join(' ')}\n`;
  writeFileSync(join(dir, VUE), `${synthese}\n${lignes.map((l) => `- ${l}\n`).join('')}`);
  return true;
}

function ecrireRegistre(dir: string, taches: string[]): void {
  writeFileSync(join(dir, REGISTRE), taches.map((t) => `${t}\n`).join(''));
}

/** Base A, C, M, P, Z ; `branche` ajoute B après A ; `main` ajoute N après M. */
function deuxAjouts(vueCommitee: boolean) {
  const d = depot();
  if (!vueCommitee) writeFileSync(join(d.dir, '.gitignore'), `${VUE}\n`);
  ecrireRegistre(d.dir, ['GOV-A', 'GOV-C', 'GOV-M', 'GOV-P', 'GOV-Z']);
  rendreLaVue(d.dir);
  d.git('add', '-A');
  d.git('commit', '-q', '-m', 'base');
  d.git('checkout', '-q', '-b', 'branche');
  ecrireRegistre(d.dir, ['GOV-A', 'GOV-B', 'GOV-C', 'GOV-M', 'GOV-P', 'GOV-Z']);
  rendreLaVue(d.dir);
  d.git('add', '-A');
  d.git('commit', '-q', '-m', 'branche : GOV-B');
  d.git('checkout', '-q', 'main');
  ecrireRegistre(d.dir, ['GOV-A', 'GOV-C', 'GOV-M', 'GOV-N', 'GOV-P', 'GOV-Z']);
  rendreLaVue(d.dir);
  d.git('add', '-A');
  d.git('commit', '-q', '-m', 'main : GOV-N');
  d.git('checkout', '-q', 'branche');
  return d;
}

describe('REQ-GOV-032 — témoin à deux faces : deux tâches ajoutées en parallèle', () => {
  it(
    'REQ-GOV-032 — TÉMOIN ROUGE : vue COMMITÉE, les deux branches sont en conflit sur la vue seule',
    () => {
      const d = deuxAjouts(true);
      expect(d.ok('merge', '--no-edit', 'main')).toBe(false);
      expect(d.git('diff', '--name-only', '--diff-filter=U').trim()).toBe(VUE);
    },
    DELAI
  );

  it(
    'REQ-GOV-032 — vue IGNORÉE : la fusion est propre, et la vue rendue compte les deux tâches',
    () => {
      const d = deuxAjouts(false);
      expect(d.ok('cat-file', '-e', `HEAD:${VUE}`), 'la vue ne doit pas être commitée').toBe(false);
      const issue = fusionnerMain({ cwd: d.dir, base: 'main', rendre: () => rendreLaVue(d.dir) });
      expect(issue.code, issue.lignes.join('\n')).toBe(0);
      expect(readFileSync(join(d.dir, VUE), 'utf8')).toContain('# 7 taches');
      expect(d.ok('cat-file', '-e', `HEAD:${VUE}`), 'la fusion a commité la vue').toBe(false);
      expect(d.git('status', '--porcelain').trim()).toBe('');
    },
    DELAI
  );

  it(
    'REQ-GOV-032 — transition : une branche d’avant GOV-123 (vue commitée) fusionne un main qui l’a retirée',
    () => {
      const d = deuxAjouts(true);
      // `main` applique GOV-123 : la vue sort de l'index et entre dans `.gitignore`.
      d.git('checkout', '-q', 'main');
      d.git('rm', '-q', '--cached', VUE);
      writeFileSync(join(d.dir, '.gitignore'), `${VUE}\n`);
      d.git('add', '.gitignore');
      d.git('commit', '-q', '-m', 'GOV-123 : la vue sort de l’index');
      d.git('checkout', '-q', '-f', 'branche');
      const issue = fusionnerMain({ cwd: d.dir, base: 'main', rendre: () => rendreLaVue(d.dir) });
      expect(issue.code, issue.lignes.join('\n')).toBe(0);
      expect(d.ok('cat-file', '-e', `HEAD:${VUE}`), 'la vue est restée commitée').toBe(false);
      expect(existsSync(join(d.dir, VUE))).toBe(true);
      expect(readFileSync(join(d.dir, VUE), 'utf8')).toContain('# 7 taches');
      expect(d.git('status', '--porcelain').trim()).toBe('');
    },
    DELAI
  );
});

describe('REQ-GOV-006 — la date de l’état vivant rendu à la volée', () => {
  it(
    'REQ-GOV-006 — vue rendue non commitée : sa date est celle de HEAD ; commitée : celle de son dernier commit ; absente : aucune',
    () => {
      const d = depot();
      const git = (args: string[]): string | null => {
        const r = spawnSync('git', args, { cwd: d.dir, encoding: 'utf8' });
        return r.status === 0 ? r.stdout.trim() || null : null;
      };
      const existe = (c: string) => existsSync(join(d.dir, c));
      const chemin = 'docs/PLAN-STATE.md';
      const env = { ...process.env, GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
      writeFileSync(join(d.dir, chemin), 'etat\n');
      d.git('add', '-A');
      execFileSync('git', ['commit', '-q', '-m', 'vue commitee'], { cwd: d.dir, env });
      writeFileSync(join(d.dir, 'autre.txt'), 'x\n');
      d.git('add', 'autre.txt');
      execFileSync('git', ['commit', '-q', '-m', 'plus tard'], {
        cwd: d.dir,
        env: { ...env, GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z' },
      });
      // Commitée : la date de SON dernier commit, pas celle de HEAD.
      expect(dateDUneVue(chemin, git, existe)).toMatch(/^2026-01-01/);
      // Rendue à la volée (hors de HEAD) : la date de HEAD.
      d.git('rm', '-q', '--cached', chemin);
      execFileSync('git', ['commit', '-q', '-m', 'hors git'], {
        cwd: d.dir,
        env: { ...env, GIT_COMMITTER_DATE: '2026-03-01T00:00:00Z' },
      });
      expect(dateDUneVue(chemin, git, existe)).toMatch(/^2026-03-01/);
      // TÉMOIN ROUGE : absente du disque (le rendu n'a pas tourné) → aucune date.
      rmSync(join(d.dir, chemin));
      expect(dateDUneVue(chemin, git, existe)).toBeNull();
    },
    DELAI
  );
});
