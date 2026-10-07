// @req REQ-GOV-010
/**
 * registre-de-la-base-de-fusion.spec.ts — GOV-152 : `gov:pr` juge ce qu'une PR d'auteur réécrit du
 * registre par sa différence avec la BASE DE FUSION, et non avec `main` courante. Deux faces, dans un
 * dépôt git jetable :
 *   — une autre tâche que `main` a changée DEPUIS le départ de la PR ne compte pas ;
 *   — une vraie réécriture d'une autre tâche par la PR rougit toujours.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as LECTEUR from '../../../scripts/lot/revues';
import * as GARDE from '../../../scripts/gates/gov-pr';

type Brute = { id: string; zone: string; paths: string[] };
const brute = (id: string, zone: string, paths: string[]): Brute & Record<string, unknown> => ({
  id,
  zone,
  sensible: [],
  schema: false,
  pr: null,
  paths,
  tests: null,
  statut: 'a_faire',
  acceptance: 'une acceptation',
});

describe('REQ-GOV-010 — GOV-152 : le registre de la PR se juge contre la BASE DE FUSION', () => {
  let dir = '';
  const git = (...a: string[]): string =>
    execFileSync('git', a, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const ecrireRegistre = (taches: Brute[]): void => {
    const f = join(dir, 'docs/tasks.json');
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify({ taches }, null, 2) + '\n');
  };
  const PR_A = brute('UX-P1-01', 'espace', ['src/a.ts']);
  const AUTRE = brute('UX-P1-02', 'espace', ['src/b.ts']);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gov-152-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'temoin@example.invalid');
    git('config', 'user.name', 'temoin');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    ecrireRegistre([PR_A, AUTRE]);
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    // La PR ajoute à SA tâche le chemin d'un fichier qu'elle touche.
    git('checkout', '-q', '-b', 'pr');
    ecrireRegistre([{ ...PR_A, paths: ['src/a.ts', 'src/a2.ts'] }, AUTRE]);
    git('add', '-A');
    git('commit', '-q', '-m', 'pr');
    // Une PR « vraie réécriture » : elle touche aussi la tâche d'une autre.
    git('checkout', '-q', '-b', 'pr-fautive', 'main');
    ecrireRegistre([
      { ...PR_A, paths: ['src/a.ts', 'src/a2.ts'] },
      { ...AUTRE, paths: ['src/b.ts', 'src/a2.ts'] },
    ]);
    git('add', '-A');
    git('commit', '-q', '-m', 'pr fautive');
    // Pendant ce temps, une autre PR fusionne sur main : elle ajoute un chemin à SA tâche.
    git('checkout', '-q', 'main');
    ecrireRegistre([PR_A, { ...AUTRE, paths: ['src/b.ts', 'src/b2.ts'] }]);
    git('add', '-A');
    git('commit', '-q', '-m', 'autre PR fusionnee');
    // GOV-153 : ce que sert `actions/checkout` sur un événement pull_request — le commit de FUSION
    // de la PR dans main courante (refs/pull/N/merge).
    git('checkout', '-q', '-b', 'fusion-ci', 'main');
    git('merge', '-q', '--no-ff', '-m', 'fusion de la PR dans main courante', 'pr');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Le registre lu par `tachesDeLaBase` ou `tachesDeLaBaseDeFusion` : le type de ces lecteurs, pas `Brute`.
  const juger = (tete: string, base: ReturnType<typeof LECTEUR.tachesDeLaBase>): string[] => {
    const taches = GARDE.projeter(LECTEUR.tachesDeLaBase(tete, dir) ?? []);
    return GARDE.ecartsDuRegistreDUnePrDAuteur(
      { gabarit: '', codeowners: '', charte: '', fiches: [], architecte: '', taches },
      {
        titre: 'feat(UX-P1-01): x',
        corps: '',
        labels: [],
        fichiers: ['docs/tasks.json', 'src/a2.ts'],
        revues: null,
        tachesBase: GARDE.projeter(base ?? []),
      },
      'UX-P1-01',
      taches.filter((t) => t.id === 'UX-P1-01')
    );
  };

  it('REQ-GOV-010 — TÉMOIN : contre main COURANTE, la PR paraissait réécrire la tâche que main a changée', () => {
    expect(juger('pr', LECTEUR.tachesDeLaBase('main', dir)).join(' ')).toContain(
      'UX-P1-02 est réécrite'
    );
  });

  it('REQ-GOV-010 — contre la BASE DE FUSION, une autre tâche changée sur main ne compte pas', () => {
    expect(juger('pr', LECTEUR.tachesDeLaBaseDeFusion('main', 'pr', dir))).toEqual([]);
  });

  it('REQ-GOV-010 — une VRAIE réécriture d’une autre tâche par la PR rougit toujours', () => {
    expect(
      juger('pr-fautive', LECTEUR.tachesDeLaBaseDeFusion('main', 'pr-fautive', dir)).join(' ')
    ).toContain('UX-P1-02 est réécrite');
  });

  it('REQ-GOV-010 — une référence illisible ou sans base commune rend null (échec fermé)', () => {
    expect(LECTEUR.tachesDeLaBaseDeFusion('main', 'branche-inconnue', dir)).toBeNull();
    expect(LECTEUR.tachesDeLaBaseDeFusion('-x', 'pr', dir)).toBeNull();
  });

  // ── GOV-153 : la paire CI — le disque est le commit de FUSION, la base est la base de FUSION ──
  const depotSur = (ref: string): GARDE.Depot => ({
    gabarit: '',
    codeowners: '',
    charte: '',
    fiches: [],
    architecte: '',
    taches: GARDE.projeter(LECTEUR.tachesDeLaBase(ref, dir) ?? []),
  });
  const ecartsCi = (depot: GARDE.Depot): string[] =>
    GARDE.ecartsDuRegistreDUnePrDAuteur(
      depot,
      {
        titre: 'feat(UX-P1-01): x',
        corps: '',
        labels: [],
        fichiers: ['docs/tasks.json', 'src/a2.ts'],
        revues: null,
        tachesBase: GARDE.projeter(LECTEUR.tachesDeLaBaseDeFusion('main', 'pr', dir) ?? []),
      },
      'UX-P1-01',
      depot.taches.filter((t) => t.id === 'UX-P1-01')
    );

  it('REQ-GOV-010 — GOV-153 : le registre du commit de FUSION imputerait à la PR ce que main a changé ; lu à sa TÊTE, il ne lui impute rien', () => {
    // Le défaut, nommé : le disque de la CI (commit de fusion) apparié à la base de fusion.
    expect(ecartsCi(depotSur('fusion-ci')).join(' ')).toContain('UX-P1-02 est réécrite');
    const pr = {
      titre: 'feat(UX-P1-01): x',
      corps: '',
      labels: [],
      fichiers: [],
      revues: null,
      tachesTete: GARDE.projeter(LECTEUR.tachesDeLaBase('pr', dir) ?? []),
    };
    const depot = GARDE.depotDeLaTete(depotSur('fusion-ci'), pr);
    expect(depot.taches.find((t) => t.id === 'UX-P1-02')?.paths).toEqual(['src/b.ts']);
    expect(ecartsCi(depot)).toEqual([]);
  });

  it('REQ-GOV-010 — GOV-153 : une tête illisible arrête la garde ; sans tête, le disque fait foi (local)', () => {
    const base = depotSur('pr');
    const sans = { titre: 'x', corps: '', labels: [], fichiers: [], revues: null };
    expect(GARDE.depotDeLaTete(base, sans)).toBe(base);
    expect(() => GARDE.depotDeLaTete(base, { ...sans, tachesTete: null })).toThrow(/illisible/);
  });
});

describe('REQ-GOV-010 — GOV-152, condition de la sécurité : le RISQUE lit aussi la base courante', () => {
  type TacheDuRisque = Parameters<typeof LECTEUR.risqueDeLaPr>[0]['taches'][number];
  const tache = (sensible: string[]): TacheDuRisque => {
    const t: TacheDuRisque = {
      ...brute('UX-P1-01', 'espace', ['docs/maquettes/x.html']),
      sensible,
    };
    return t;
  };
  const risque = (courante?: TacheDuRisque[] | null) =>
    LECTEUR.risqueDeLaPr({
      titre: 'docs(UX-P1-01): une maquette',
      pr: null,
      taches: [tache([])],
      tachesBase: [tache([])],
      ...(courante === undefined ? {} : { tachesBaseCourante: courante }),
      fichiers: ['docs/maquettes/x.html'],
      labels: [],
      liste: { source: 'complete' },
    });

  it('REQ-GOV-010 — TÉMOIN : une tâche rendue sensible sur la base COURANTE après le départ de la PR élève son risque', () => {
    expect(risque().niveau).toBe('ordinaire');
    expect(risque([tache(['argent'])]).niveau).toBe('eleve');
  });

  it('REQ-GOV-010 — la base courante illisible élève le risque (échec fermé)', () => {
    expect(risque(null).niveau).toBe('eleve');
  });
});
