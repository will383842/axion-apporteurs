// @req REQ-GOV-006
// @req REQ-QA-013
/**
 * QA-T64 (REQ-GOV-006, REQ-QA-013) — la forge lue UNE fois par porte A : une étape en tête du job
 * gate-a écrit l'instantané et pose `GOV_FORGE`, que les gardes lisent.
 *
 * CE QUE CE FICHIER GARDE : un run fait UNE lecture par type ; un instantané corrompu, ou sans la
 * lecture demandée, fait échouer en le nommant ; `GOV_FORGE` hors de la CI et de vitest est refusé ;
 * `GOV_ETAT_GH` l'emporte ; l'étape ne tourne que dans la porte A ; et la vraie garde `gov:etat`,
 * lancée avec l'instantané, ne parle plus à la forge.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LECTURES_DE_LA_PORTE_A,
  NOM_DE_L_INSTANTANE,
  cleDeLecture,
  contextesAdmis,
  figerLesLectures,
  instantaneEnVigueur,
  lireDansLInstantane,
  poserLInstantane,
  type Lire,
} from '../../../scripts/gates/forge-instantane';

const DOSSIER = mkdtempSync(join(tmpdir(), 'qa-t64-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));

const CI = { CI: 'true', GITHUB_ACTIONS: 'true' };
let n = 0;
function ecrire(contenu: string): string {
  const chemin = join(DOSSIER, `instantane-${n++}.json`);
  writeFileSync(chemin, contenu);
  return chemin;
}

describe('REQ-GOV-006 REQ-QA-013 — la forge lue une fois par porte A', () => {
  it('REQ-QA-013 : TÉMOIN — l’instantané fait UNE lecture par type, et chaque lecture une seule fois', () => {
    const appels: string[] = [];
    const lire: Lire = (args) => {
      appels.push(cleDeLecture(args));
      return '[]';
    };
    const instantane = figerLesLectures(lire);
    expect(appels).toEqual(LECTURES_DE_LA_PORTE_A.map(cleDeLecture));
    expect(new Set(appels).size).toBe(appels.length);
    expect(Object.keys(instantane ?? {})).toEqual(appels);
  });

  it('REQ-QA-013 : une lecture qui échoue ou rend autre chose que du JSON : aucun instantané', () => {
    expect(
      figerLesLectures(() => {
        throw new Error('limite d’API');
      })
    ).toBeNull();
    expect(figerLesLectures((a) => (a[0] === 'issue' ? 'pas du json' : '[]'))).toBeNull();
  });

  it('REQ-GOV-006 : TÉMOINS — instantané corrompu, ou sans la lecture demandée : échec nommé', () => {
    const lecture = LECTURES_DE_LA_PORTE_A[0];
    const corrompu = { variable: 'GOV_FORGE' as const, chemin: ecrire('{ pas du json') };
    expect(() => lireDansLInstantane(corrompu, lecture, CI)).toThrow(/illisible/);
    const partiel = { variable: 'GOV_FORGE' as const, chemin: ecrire('{}') };
    expect(() => lireDansLInstantane(partiel, lecture, CI)).toThrow(
      `instantané de la forge sans la lecture « ${cleDeLecture(lecture)} »`
    );
    const absent = { variable: 'GOV_FORGE' as const, chemin: join(DOSSIER, 'absent.json') };
    expect(() => lireDansLInstantane(absent, lecture, CI)).toThrow(/illisible/);
  });

  it('REQ-GOV-006 : TÉMOIN — GOV_FORGE hors de la CI et de vitest est refusé, nommé ; admis dans les deux', () => {
    const lecture = LECTURES_DE_LA_PORTE_A[0];
    const bon = {
      variable: 'GOV_FORGE' as const,
      chemin: ecrire(JSON.stringify({ [cleDeLecture(lecture)]: '[]' })),
    };
    expect(() => lireDansLInstantane(bon, lecture, {})).toThrow(
      /GOV_FORGE refusée hors de la CI et de vitest/
    );
    expect(() => lireDansLInstantane(bon, lecture, { CI: 'true' })).toThrow(/refusée/);
    expect(lireDansLInstantane(bon, lecture, CI)).toBe('[]');
    expect(lireDansLInstantane(bon, lecture, { VITEST: 'true' })).toBe('[]');
    expect(contextesAdmis({})).toEqual({ ci: false, vitest: false });
  });

  it('REQ-GOV-006 : TÉMOIN — vitest lancé EN CI reste vitest : GOV_ETAT_FORGE y est admise, et refusée en CI hors de vitest', () => {
    const lecture = LECTURES_DE_LA_PORTE_A[0];
    const temoin = {
      variable: 'GOV_ETAT_FORGE' as const,
      chemin: ecrire(JSON.stringify({ [cleDeLecture(lecture)]: '[]' })),
    };
    expect(contextesAdmis({ ...CI, VITEST: 'true' })).toEqual({ ci: true, vitest: true });
    expect(lireDansLInstantane(temoin, lecture, { ...CI, VITEST: 'true' })).toBe('[]');
    expect(() => lireDansLInstantane(temoin, lecture, CI)).toThrow(
      /GOV_ETAT_FORGE refusée hors de vitest/
    );
  });

  it('REQ-GOV-006 : PRÉSÉANCE — GOV_ETAT_GH l’emporte ; GOV_ETAT_FORGE (vitest) prime sur GOV_FORGE', () => {
    expect(instantaneEnVigueur({ GOV_ETAT_GH: 'node faux.js', GOV_FORGE: 'x' })).toBeUndefined();
    expect(instantaneEnVigueur({ GOV_ETAT_FORGE: 'a', GOV_FORGE: 'b' })).toEqual({
      variable: 'GOV_ETAT_FORGE',
      chemin: 'a',
    });
    expect(instantaneEnVigueur({ GOV_FORGE: 'b' })).toEqual({ variable: 'GOV_FORGE', chemin: 'b' });
    expect(instantaneEnVigueur({})).toBeUndefined();
  });

  it('REQ-GOV-006 : TÉMOIN — l’étape ne tourne que dans la porte A ; elle y écrit l’instantané, sous le nom que les étapes lisent, après UNE lecture par type', () => {
    expect(poserLInstantane(() => '[]', {})).toBe(
      'RUNNER_TEMP est exigé : cette étape ne tourne que dans la porte A'
    );
    let lectures = 0;
    const refus = poserLInstantane(
      () => {
        lectures++;
        return '[]';
      },
      { RUNNER_TEMP: DOSSIER }
    );
    expect(refus).toBeNull();
    expect(lectures).toBe(LECTURES_DE_LA_PORTE_A.length);
    const ecrit = { variable: 'GOV_FORGE' as const, chemin: join(DOSSIER, NOM_DE_L_INSTANTANE) };
    for (const lecture of LECTURES_DE_LA_PORTE_A)
      expect(lireDansLInstantane(ecrit, lecture, CI)).toBe('[]');
    expect(poserLInstantane(() => 'pas du json', { RUNNER_TEMP: DOSSIER })).toMatch(
      /aucun instantané posé/
    );
  });

  it('REQ-GOV-006 : le chemin que les étapes de la porte A reçoivent dans GOV_FORGE est celui que l’étape écrit', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const attendu = `GOV_FORGE: \${{ runner.temp }}/${NOM_DE_L_INSTANTANE}`;
    const lignes = ci.split('\n').filter((l) => l.includes('GOV_FORGE:'));
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) expect(l.trim()).toBe(attendu);
    expect(ci).toContain('run: pnpm forge:instantane');
  });

  it('REQ-GOV-006 REQ-QA-013 : la vraie garde gov:trace, sans `gh` sur le chemin, lit les PR fusionnées dans l’instantané ; corrompu, elle échoue en le nommant', () => {
    const lecture = LECTURES_DE_LA_PORTE_A[3];
    const lancer = (chemin: string) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const k of Object.keys(env))
        if (/^(path|gov_etat_forge|gov_etat_gh|gov_forge|gov_trace_sans_pr)$/i.test(k))
          delete env[k];
      env['PATH'] = process.execPath.replace(/[\\/][^\\/]+$/, '');
      const r = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/gov-trace.ts', '--sources'],
        { encoding: 'utf8', env: { ...env, ...CI, GOV_FORGE: chemin } }
      );
      return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
    };
    const lu = lancer(
      ecrire(
        JSON.stringify({
          [cleDeLecture(lecture)]: JSON.stringify([{ number: 7, body: 'Couvre : REQ-QA-013' }]),
        })
      )
    );
    expect(lu.sortie).toContain('PR fusionnées : lues ✓ (1,');
    const corrompu = lancer(ecrire('{ pas du json'));
    expect(corrompu.code).not.toBe(0);
    expect(corrompu.sortie).toContain('instantané de la forge illisible');
  }, 120_000);

  it('REQ-GOV-006 : la vraie garde gov:etat, avec GOV_FORGE et sans `gh` sur le chemin, lit l’instantané et ne parle pas à la forge', () => {
    const instantane = Object.fromEntries(
      LECTURES_DE_LA_PORTE_A.map((a) => [cleDeLecture(a), '[]'])
    );
    const chemin = ecrire(JSON.stringify(instantane));
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(env))
      if (/^(path|gov_etat_forge|gov_etat_gh|gov_forge|vitest.*)$/i.test(k)) delete env[k];
    env['PATH'] = process.execPath.replace(/[\\/][^\\/]+$/, '');
    const r = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/gov-etat.ts'],
      { encoding: 'utf8', env: { ...env, ...CI, GOV_FORGE: chemin } }
    );
    const sortie = `${r.stdout}${r.stderr}`;
    expect(sortie).not.toContain('[github_illisible]');
    expect(sortie).not.toContain('refusée');
  }, 120_000);
});
