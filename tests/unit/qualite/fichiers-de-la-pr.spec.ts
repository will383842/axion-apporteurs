// @req REQ-GOV-011
/**
 * GOV-160 — le périmètre d'une garde qui ne juge que la PR (`scripts/gates/fichiers-de-la-pr.ts`),
 * et ce que la garde de PR lit du même diff (`scripts/gates/gov-pr-niveaux.ts`).
 *
 * Refus des lentilles sur #859 : un fichier RENOMMÉ ou COPIÉ échappait aux gardes de contenu
 * (`--diff-filter=AM`), et un renommage était classé sur son seul chemin d'arrivée — un fichier
 * critique déplacé vers `tests/archive/` ou `docs/` rendait la PR légère.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  cheminsJuges,
  cheminsTouches,
  lireLeDiff,
  restreindreALaPr,
} from '../../../scripts/gates/fichiers-de-la-pr';
import {
  fautesDeStatut,
  niveauDeLaPr,
  niveauDuFichier,
} from '../../../scripts/gates/gov-pr-niveaux';

const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const PUBLICATION = resolve('scripts/gates/gov-publication.ts');
const rien = () => null;

describe('lireLeDiff — la sortie de git diff --name-status, tous statuts', () => {
  const sortie = [
    'A\tsrc/content/neuf.ts',
    'M\tsrc/content/modifie.ts',
    'D\tsrc/content/supprime.ts',
    'R087\tsrc/server/releves/calcul.ts\ttests/archive/calcul.ts',
    'C075\tsrc/content/modele.ts\tsrc/content/copie.ts',
    'T\tsrc/content/lien.ts',
    '',
  ].join('\n');

  it('les gardes de contenu jugent l’arrivée de tout ajout, modification, renommage ou copie', () => {
    expect(cheminsJuges(lireLeDiff(sortie))).toEqual([
      'src/content/neuf.ts',
      'src/content/modifie.ts',
      'tests/archive/calcul.ts',
      'src/content/copie.ts',
      'src/content/lien.ts',
    ]);
  });

  it('la garde de PR voit les deux côtés d’un renommage, et la suppression', () => {
    expect(cheminsTouches(lireLeDiff(sortie))).toEqual([
      'src/content/neuf.ts',
      'src/content/modifie.ts',
      'src/content/supprime.ts',
      'src/server/releves/calcul.ts',
      'tests/archive/calcul.ts',
      'src/content/modele.ts',
      'src/content/copie.ts',
      'src/content/lien.ts',
    ]);
  });
});

describe('restreindreALaPr — sur un vrai dépôt', () => {
  let depot = '';
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'core.quotePath=false', ...a], { cwd: depot, encoding: 'utf8' });
  const ecrire = (f: string, t: string) => {
    mkdirSync(dirname(join(depot, f)), { recursive: true });
    writeFileSync(join(depot, f), t);
  };

  beforeEach(() => {
    depot = mkdtempSync(join(tmpdir(), 'fichiers-de-la-pr-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.invalid');
    git('config', 'user.name', 't');
    ecrire('docs/inchange.md', 'inchangé\n');
    ecrire('docs/modifie.md', 'avant\n');
    ecrire('docs/supprime.md', 'adieu\n');
    ecrire('docs/ancien-nom.md', 'Un texte assez long pour que git reconnaisse le renommage.\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('switch', '-qc', 'pr');
    ecrire('docs/modifie.md', 'après\n');
    ecrire('docs/ajoute.md', 'neuf\n');
    git('rm', '-q', 'docs/supprime.md');
    git('mv', 'docs/ancien-nom.md', 'docs/nouveau-nom.md');
    git('add', '-A');
    git('commit', '-qm', 'pr');
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('GITHUB_BASE_REF', 'main');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(depot, { recursive: true, force: true });
  });

  const tous = [
    'docs/inchange.md',
    'docs/modifie.md',
    'docs/ajoute.md',
    'docs/nouveau-nom.md',
    'docs/supprime.md',
  ];

  it('ajout, modification et renommage jugés ; inchangé et supprimé non', () => {
    expect(restreindreALaPr(tous, depot)).toEqual([
      'docs/modifie.md',
      'docs/ajoute.md',
      'docs/nouveau-nom.md',
    ]);
  });

  it('la base de comparaison est le point de divergence : un commit de main postérieur n’entre pas', () => {
    git('switch', '-q', 'main');
    ecrire('docs/inchange.md', 'changé sur main seulement\n');
    git('commit', '-qam', 'main avance');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('switch', '-q', 'pr');
    expect(restreindreALaPr(tous, depot)).not.toContain('docs/inchange.md');
  });

  it('hors PR, ou diff illisible : tout le périmètre, jamais une liste vide', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');
    expect(restreindreALaPr(tous, depot)).toEqual(tous);
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('GITHUB_BASE_REF', 'branche-absente');
    expect(restreindreALaPr(tous, depot)).toEqual(tous);
  });

  it('témoin : un renommage qui ajoute un seuil de détection est vu par gov:publication', () => {
    ecrire(
      'src/limites.ts',
      'export const nom = 1;\nexport const autre = 2;\nexport const x = 3;\n'
    );
    git('add', '-A');
    git('commit', '-qm', 'neutre');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('mv', 'src/limites.ts', 'src/renomme.ts');
    ecrire(
      'src/renomme.ts',
      'export const nom = 1;\nexport const autre = 2;\nexport const x = 3;\nconst RAFALE_MAX = 3;\n'
    );
    git('add', '-A');
    git('commit', '-qm', 'renommage');
    const r = spawnSync(process.execPath, [TSX, PUBLICATION], {
      cwd: depot,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' },
    });
    const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    expect(r.status, sortie).toBe(1);
    expect(sortie).toContain('src/renomme.ts');
  });
});

describe('gov:pr — l’outillage qui juge ne s’allège pas lui-même', () => {
  it('scripts de garde et de lot, CI, agents, configuration : critiques', () => {
    for (const f of [
      'scripts/gates/fichiers-de-la-pr.ts',
      'scripts/lot/revues.ts',
      '.github/workflows/ci.yml',
      '.claude/agents/dev.md',
      'vitest.config.ts',
      'package.json',
      'next.config.mjs',
      'next.config.ts',
      'src/config/entite.ts',
      'src/app/(espace)/securite/page.tsx',
    ]) {
      expect(niveauDuFichier(f, rien), f).toBe('critique');
    }
  });

  it('un fichier critique déplacé vers tests/archive ou docs rend la PR critique', () => {
    const vers = (arrivee: string) =>
      niveauDeLaPr({
        fichiers: cheminsTouches(lireLeDiff(`R100\tsrc/domain/commission/calcul.ts\t${arrivee}\n`)),
      }).niveau;
    expect(vers('tests/archive/calcul.ts')).toBe('critique');
    expect(vers('docs/ancien-calcul.md')).toBe('critique');
  });
});

describe('gov:pr — aucune PR d’auteur n’écrit de statut dans docs/tasks.json', () => {
  const taches = (statut: string) =>
    JSON.stringify({
      taches: [
        { id: 'DM-01', statut },
        { id: 'DM-02', statut: 'a_faire' },
      ],
    });

  it('un statut modifié rougit (statut_ecrit)', () => {
    expect(
      fautesDeStatut(taches('a_faire'), taches('fusionnee'), 'feat(DM-01): x').map((f) => f.famille)
    ).toEqual(['statut_ecrit']);
  });

  it('une définition modifiée sans statut touché reste verte ; GOV-160 est l’exception unique', () => {
    const avant = JSON.stringify({ taches: [{ id: 'DM-01', statut: 'a_faire', titre: 'a' }] });
    const apres = JSON.stringify({ taches: [{ id: 'DM-01', statut: 'a_faire', titre: 'b' }] });
    expect(fautesDeStatut(avant, apres, 'feat(DM-01): x')).toEqual([]);
    expect(fautesDeStatut(taches('a_faire'), taches('annulee'), 'chore(GOV-160): x')).toEqual([]);
  });
});
