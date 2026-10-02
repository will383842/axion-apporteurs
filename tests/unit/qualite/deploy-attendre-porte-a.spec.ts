// @req REQ-GOV-014
/**
 * QA-T67 (REQ-GOV-014) — le déploiement attend la porte A du MÊME sha, lue avec DEUX lectures
 * seulement : `contents` et `actions`. Lentille sécurité du 2026-10-02, quatre conditions :
 *
 *   1. les runs viennent de `GET /actions/workflows/ci.yml/runs?head_sha=<sha>&event=push&branch=main` ;
 *      un run rendu hors de ce filtre (une PR sur le même sha, une autre branche, un autre sha,
 *      un autre workflow) est REFUSÉ, nommé : la forge n'aurait pas dû le rendre ;
 *   2. le plus récent se choisit sur des champs du SERVEUR, `run_number` puis `run_attempt`, jamais
 *      sur une date ni sur un nom ;
 *   3. ce run est `completed` et `success`, PUIS `GET /actions/runs/{id}/jobs` : le job `gate-a`
 *      est `success` ;
 *   4. la PAIRE de permissions est figée par `un-seul-producteur-de-deploiement.spec.ts`.
 *
 * Les jugements sont des fonctions pures ; le bout en bout tourne sur un vrai serveur HTTP local.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import {
  jugerLesRuns,
  jugerLesJobs,
  JOB_DE_LA_PORTE_A,
  WORKFLOW_DE_LA_PORTE_A,
} from '../../../scripts/gates/deploy-verify';

const SHA = 'a'.repeat(40);
const AUTRE = 'b'.repeat(40);

const run = (o: Record<string, unknown>) => ({
  id: 77,
  run_number: 10,
  run_attempt: 1,
  head_sha: SHA,
  head_branch: 'main',
  event: 'push',
  path: WORKFLOW_DE_LA_PORTE_A,
  status: 'completed',
  conclusion: 'success',
  ...o,
});
const runs = (...r: Record<string, unknown>[]) => ({ total_count: r.length, workflow_runs: r });
const job = (o: Record<string, unknown>) => ({
  name: JOB_DE_LA_PORTE_A,
  status: 'completed',
  conclusion: 'success',
  ...o,
});
const jobs = (...j: Record<string, unknown>[]) => ({ total_count: j.length, jobs: j });

describe('REQ-GOV-014 — le run de la porte A : ci.yml, push de main, le même sha, le plus récent', () => {
  it('REQ-GOV-014 : un run de ci.yml réussi, sur push de main et le sha : son identifiant est rendu', () => {
    expect(jugerLesRuns(runs(run({})), SHA)).toEqual({ etat: 'reussie', runId: 77 });
  });

  it('REQ-GOV-014 : TÉMOIN — un run d’une PR sur le même sha est refusé, nommé', () => {
    expect(
      jugerLesRuns(runs(run({}), run({ id: 78, event: 'pull_request', head_branch: 't/x' })), SHA)
    ).toMatchObject({ etat: 'refusee', raison: expect.stringContaining('hors_filtre') });
  });

  it('REQ-GOV-014 : TÉMOINS — une autre branche, un autre sha, un autre workflow : refusés, nommés', () => {
    for (const o of [
      { head_branch: 'autre' },
      { head_sha: AUTRE },
      { path: '.github/workflows/autre.yml' },
    ])
      expect(jugerLesRuns(runs(run(o)), SHA)).toMatchObject({
        etat: 'refusee',
        raison: expect.stringContaining('hors_filtre'),
      });
  });

  it('REQ-GOV-014 : TÉMOIN — un run PLUS RÉCENT en échec est refusé, le plus récent se lit au run_number', () => {
    const ancien = run({ id: 77, run_number: 10, conclusion: 'success' });
    const recent = run({ id: 78, run_number: 11, conclusion: 'failure' });
    expect(jugerLesRuns(runs(recent, ancien), SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('failure'),
    });
    // L'ordre de la réponse ne compte pas : seul le run_number du serveur départage.
    expect(jugerLesRuns(runs(ancien, recent), SHA)).toMatchObject({ etat: 'refusee' });
    expect(jugerLesRuns(runs(run({ id: 79, run_number: 12 }), recent), SHA)).toEqual({
      etat: 'reussie',
      runId: 79,
    });
  });

  it('REQ-GOV-014 : TÉMOIN — à run_number égal, le run_attempt départage : une relance en échec refuse', () => {
    const premier = run({ run_attempt: 1, conclusion: 'success' });
    const relance = run({ run_attempt: 2, conclusion: 'failure' });
    expect(jugerLesRuns(runs(premier, relance), SHA)).toMatchObject({ etat: 'refusee' });
    expect(jugerLesRuns(runs(relance, run({ run_attempt: 3 })), SHA)).toEqual({
      etat: 'reussie',
      runId: 77,
    });
  });

  it('REQ-GOV-014 : absent ou en cours : on attend', () => {
    expect(jugerLesRuns(runs(), SHA)).toEqual({ etat: 'absente' });
    expect(jugerLesRuns(runs(run({ status: 'in_progress', conclusion: null })), SHA)).toEqual({
      etat: 'en_cours',
    });
  });

  it('REQ-GOV-014 : TÉMOINS — une réponse illisible, un run_number illisible : refusés, nommés', () => {
    for (const illisible of [null, 'texte', { workflow_runs: 'non' }])
      expect(jugerLesRuns(illisible, SHA)).toMatchObject({
        etat: 'refusee',
        raison: expect.stringContaining('illisible'),
      });
    expect(jugerLesRuns(runs(run({ run_number: '11' })), SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('illisible'),
    });
  });
});

describe('REQ-GOV-014 — le job gate-a du run choisi', () => {
  it('REQ-GOV-014 : le job gate-a réussi : la porte A est réussie', () => {
    expect(jugerLesJobs(jobs(job({ name: 'autre' }), job({})))).toEqual({ etat: 'reussie' });
  });

  it('REQ-GOV-014 : TÉMOINS — gate-a absent du run, en échec, illisible : refusés, nommés', () => {
    expect(jugerLesJobs(jobs(job({ name: 'autre' })))).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('gate_a_absent'),
    });
    expect(jugerLesJobs(jobs(job({ conclusion: 'skipped' })))).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('skipped'),
    });
    for (const illisible of [null, { jobs: 'non' }])
      expect(jugerLesJobs(illisible)).toMatchObject({
        etat: 'refusee',
        raison: expect.stringContaining('illisible'),
      });
  });
});

// ── de bout en bout, sur un vrai serveur HTTP local ─────────────────────────────────────────

let serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.map((s) => new Promise((r) => s.close(r))));
  serveurs = [];
});

type Requete = { url: string; auth: string | undefined };

async function forge(
  repondre: (url: string) => unknown
): Promise<{ url: string; recues: Requete[] }> {
  const recues: Requete[] = [];
  const s = createServer((req, res) => {
    recues.push({ url: req.url ?? '', auth: req.headers.authorization });
    const corps = repondre(req.url ?? '');
    if (corps === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(corps));
  });
  serveurs.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const a = s.address();
  if (a === null || typeof a === 'string') throw new Error('adresse du serveur de test');
  return { url: `http://127.0.0.1:${a.port}`, recues };
}

function lancer(env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    const propre: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(propre)) if (/^(GITHUB_|GH_TOKEN)/.test(k)) delete propre[k];
    const p = spawn(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/gates/deploy-verify.ts',
        '--attendre-porte-a',
        '--essais',
        '2',
        '--delai-ms',
        '50',
      ],
      { env: { ...propre, ...env } }
    );
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

describe(
  'REQ-GOV-014 — de bout en bout : deux lectures, aucun jeton imprimé',
  { timeout: 60_000 },
  () => {
    const JETON = 'jeton-de-test-ne-doit-pas-sortir';
    const env = (url: string) => ({
      GITHUB_API_URL: url,
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SHA: SHA,
      GH_TOKEN: JETON,
    });
    const LES_RUNS = `/repos/o/r/actions/workflows/ci.yml/runs?head_sha=${SHA}&event=push&branch=main&per_page=100`;

    it('REQ-GOV-014 : les runs filtrés puis les jobs du run : 0, et rien d’autre n’est lu', async () => {
      const f = await forge((url) =>
        url === LES_RUNS
          ? runs(run({}))
          : url === '/repos/o/r/actions/runs/77/jobs?per_page=100'
            ? jobs(job({}))
            : undefined
      );
      const r = await lancer(env(f.url));
      expect([r.code, r.sortie]).toEqual([0, expect.stringContaining('gate-a')]);
      expect(f.recues.map((q) => q.url)).toEqual([
        LES_RUNS,
        '/repos/o/r/actions/runs/77/jobs?per_page=100',
      ]);
      expect(f.recues.every((q) => q.auth === `Bearer ${JETON}`)).toBe(true);
      expect(r.sortie).not.toContain(JETON);
    });

    it('REQ-GOV-014 : TÉMOIN — gate-a absent du run : non nul, nommé, sans jeton imprimé', async () => {
      const f = await forge((url) =>
        url === LES_RUNS
          ? runs(run({}))
          : url.includes('/jobs')
            ? jobs(job({ name: 'autre' }))
            : undefined
      );
      const r = await lancer(env(f.url));
      expect(r.code).not.toBe(0);
      expect(r.sortie).toContain('gate_a_absent');
      expect(r.sortie).not.toContain(JETON);
    });

    it('REQ-GOV-014 : la porte A jamais vue dans la borne : non nul, nommé', async () => {
      const f = await forge(() => runs());
      const r = await lancer(env(f.url));
      expect(r.code).not.toBe(0);
      expect(r.sortie).toContain('absente');
    });
  }
);
