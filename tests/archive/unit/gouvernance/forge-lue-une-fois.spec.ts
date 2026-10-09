// @req REQ-GOV-006
// @req REQ-QA-013
/**
 * QA-T63 — la forge est lue une fois par run de tests (REQ-GOV-006, REQ-QA-013).
 *
 * Ce fichier mesure, sans réseau :
 *   1. le `globalSetup` fait AU PLUS une lecture de la forge par type (PR ouvertes, PR fusionnées,
 *      issues ouvertes) — compté sur un lecteur injecté ;
 *   2. `gov:etat`, `GOV_ETAT_FORGE` posée, relit l'instantané et N'APPELLE PAS la forge : lancé
 *      avec un PATH sans `gh`, il ne rapporte aucune forge illisible ;
 *   3. sans `GOV_ETAT_FORGE`, il appelle la forge — le même PATH sans `gh` le fait échouer ;
 *   4. un instantané corrompu, ou sans l'une des lectures, le fait ÉCHOUER en le nommant ;
 *   5. PRÉSÉANCE : `GOV_ETAT_GH` posé (un faux `gh`) → l'instantané est ignoré.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import setup, { figerLaForge, preparer, LECTURES_DE_LA_FORGE, type Lire } from '../../setup-forge';

const DOSSIER = mkdtempSync(join(tmpdir(), 'forge-lue-une-fois-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));

function ecrire(nom: string, contenu: string): string {
  const chemin = join(DOSSIER, nom);
  writeFileSync(chemin, contenu);
  return chemin;
}

/** Un environnement SANS `gh` sur le chemin : seul le dossier de node y reste. */
function sansGh(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env))
    if (/^(path|gov_etat_forge|gov_etat_gh|gov_forge)$/i.test(k)) delete env[k];
  env['PATH'] = dirname(process.execPath);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) env[k] = v;
  return env;
}

function govEtat(env: NodeJS.ProcessEnv): { code: number | null; sortie: string } {
  const r = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/gov-etat.ts'],
    { encoding: 'utf8', env }
  );
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

const vide: Lire = () => '[]';
const INSTANTANE_VIDE = ecrire('vide.json', JSON.stringify(figerLaForge(vide)));
const ILLISIBLE = '[github_illisible]';

describe('REQ-GOV-006 REQ-QA-013 — le run de tests lit la forge une fois', () => {
  it('REQ-GOV-006 REQ-QA-013 : le globalSetup fait une lecture par type, pas une de plus', () => {
    const appels: string[] = [];
    const instantane = figerLaForge((args) => {
      appels.push(args.join(' '));
      return '[]';
    });
    expect(appels).toEqual(LECTURES_DE_LA_FORGE.map((a) => a.join(' ')));
    expect(new Set(appels).size).toBe(LECTURES_DE_LA_FORGE.length);
    expect(Object.keys(instantane ?? {})).toEqual(appels);
  });

  it('REQ-GOV-006 REQ-QA-013 : une lecture qui échoue ou rend autre chose que du JSON : aucun instantané', () => {
    expect(
      figerLaForge(() => {
        throw new Error('gh absent');
      })
    ).toBeNull();
    expect(figerLaForge((a) => (a[0] === 'issue' ? 'pas du json' : '[]'))).toBeNull();
  });

  it('REQ-GOV-006 REQ-QA-013 : GOV_ETAT_GH, GOV_ETAT_FORGE ou GOV_FORGE déjà posé, ou vitest list : le setup ne lit rien et ne pose rien', () => {
    const avant = {
      gh: process.env['GOV_ETAT_GH'],
      forge: process.env['GOV_ETAT_FORGE'],
      porte: process.env['GOV_FORGE'],
    };
    let lectures = 0;
    const compter: Lire = () => {
      lectures += 1;
      return '[]';
    };
    try {
      delete process.env['GOV_ETAT_FORGE'];
      // QA-T64 : la porte A a posé GOV_FORGE, le setup ne relit pas la forge.
      process.env['GOV_FORGE'] = INSTANTANE_VIDE;
      expect(preparer(compter, [])).toBeUndefined();
      expect(process.env['GOV_ETAT_FORGE']).toBeUndefined();
      delete process.env['GOV_FORGE'];
      process.env['GOV_ETAT_GH'] = 'faux-gh';
      expect(preparer(compter, [])).toBeUndefined();
      expect(process.env['GOV_ETAT_FORGE']).toBeUndefined();
      delete process.env['GOV_ETAT_GH'];
      expect(preparer(compter, ['node', 'vitest', 'list'])).toBeUndefined();
      expect(process.env['GOV_ETAT_FORGE']).toBeUndefined();
      process.env['GOV_ETAT_FORGE'] = INSTANTANE_VIDE;
      expect(preparer(compter, [])).toBeUndefined();
      expect(process.env['GOV_ETAT_FORGE']).toBe(INSTANTANE_VIDE);
      expect(lectures).toBe(0);
      // Contre-témoin : rien de posé, un run qui exécute → une lecture par type, l'instantané posé.
      delete process.env['GOV_ETAT_FORGE'];
      const retirer = preparer(compter, ['node', 'vitest', 'run']);
      expect(lectures).toBe(LECTURES_DE_LA_FORGE.length);
      const chemin = process.env['GOV_ETAT_FORGE'];
      expect(Object.keys(JSON.parse(readFileSync(chemin ?? '', 'utf8')) as object)).toHaveLength(
        LECTURES_DE_LA_FORGE.length
      );
      retirer?.();
      expect(process.env['GOV_ETAT_FORGE']).toBeUndefined();
    } finally {
      for (const [k, v] of [
        ['GOV_ETAT_GH', avant.gh],
        ['GOV_ETAT_FORGE', avant.forge],
        ['GOV_FORGE', avant.porte],
      ] as const)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });

  it('REQ-GOV-006 REQ-QA-013 : GOV_ETAT_FORGE posée, gov:etat relit l’instantané et n’appelle pas la forge', () => {
    const r = govEtat(sansGh({ GOV_ETAT_FORGE: INSTANTANE_VIDE }));
    expect(r.sortie).not.toContain(ILLISIBLE);
  }, 60_000);

  it('REQ-GOV-006 REQ-QA-013 : sans GOV_ETAT_FORGE, gov:etat appelle la forge (PATH sans gh : échec nommé)', () => {
    const r = govEtat(sansGh({}));
    expect([r.code, r.sortie]).toEqual([
      1,
      expect.stringContaining(`${ILLISIBLE} \`gh pr list --state open\``),
    ]);
  }, 60_000);

  it('REQ-GOV-006 REQ-QA-013 : un instantané corrompu, ou sans l’une des lectures, fait échouer en le nommant', () => {
    const corrompu = ecrire('corrompu.json', '{ pas du json');
    const r = govEtat(sansGh({ GOV_ETAT_FORGE: corrompu }));
    expect([r.code, r.sortie]).toEqual([1, expect.stringContaining(corrompu)]);
    const partiel = JSON.parse(readFileSync(INSTANTANE_VIDE, 'utf8')) as Record<string, string>;
    delete partiel[LECTURES_DE_LA_FORGE[2].join(' ')];
    const incomplet = ecrire('incomplet.json', JSON.stringify(partiel));
    const s = govEtat(sansGh({ GOV_ETAT_FORGE: incomplet }));
    expect([s.code, s.sortie]).toEqual([1, expect.stringContaining('gh issue list --state open')]);
    expect(s.sortie).toContain(incomplet);
  }, 120_000);

  it('REQ-GOV-006 REQ-QA-013 : PRÉSÉANCE — GOV_ETAT_GH posé, l’instantané (même corrompu) est ignoré', () => {
    const faux = ecrire('faux-gh.mjs', "process.stdout.write('[]');\n");
    const corrompu = ecrire('ignore.json', '{ pas du json');
    const r = govEtat(sansGh({ GOV_ETAT_FORGE: corrompu, GOV_ETAT_GH: `node ${faux}` }));
    expect(r.sortie).not.toContain(ILLISIBLE);
    expect(r.sortie).not.toContain(corrompu);
  }, 60_000);

  it('REQ-GOV-006 REQ-QA-013 : HORS de vitest, GOV_ETAT_FORGE est refusée, nommée — une porte réelle lit la forge', () => {
    const env = sansGh({ GOV_ETAT_FORGE: INSTANTANE_VIDE });
    for (const k of Object.keys(env)) if (/^vitest/i.test(k)) delete env[k];
    const r = govEtat(env);
    expect([r.code, r.sortie]).toEqual([
      1,
      expect.stringContaining(`GOV_ETAT_FORGE refusée hors de vitest (${INSTANTANE_VIDE})`),
    ]);
  }, 60_000);

  it('REQ-GOV-006 REQ-QA-013 : la configuration du dépôt déclare le setup de la forge', () => {
    expect(readFileSync('vitest.config.ts', 'utf8')).toMatch(
      /globalSetup:\s*\[\s*'tests\/setup-forge\.ts'\s*\]/
    );
    // vitest appelle le globalSetup avec le PROJET en argument : un paramètre injectable l'aurait
    // pris pour le lecteur, et l'instantané n'aurait jamais été posé.
    expect(setup.length).toBe(0);
  });
});
