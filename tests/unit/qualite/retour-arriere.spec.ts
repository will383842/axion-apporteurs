// @req REQ-QA-022
/**
 * QA-T13 — un retour arrière qui ne vérifie pas ce qu'il a remis en place n'a rien remis en place
 * (REQ-QA-022).
 *
 * `pnpm deploy:retour-arriere` (`scripts/gates/deploy-verify.ts --retour-arriere`) : pose
 * `SKIP_MIGRATE=1`, étiquette l'application `sha-<cible>`, déploie, puis VÉRIFIE l'en-tête de build
 * servi ET `readyz` ; et il remet `SKIP_MIGRATE=0` quoi qu'il arrive — l'entrée n'honore que `1`
 * (`docker-entrypoint.sh`), toute autre valeur rend l'échappatoire inerte au déploiement suivant,
 * comme le veut l'étape 5 du runbook (`docs/runbooks/retour-arriere.md`).
 *
 * Exercé sur de VRAIS serveurs HTTP locaux — une plateforme et une application factices — jamais sur
 * un mock de `fetch`. RM-11 : chaque cas pose ses réponses et ses secrets.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { lireYaml } from '../../../scripts/lib/lire-yaml';

const SCRIPT = 'scripts/gates/deploy-verify.ts';
const TSX = 'node_modules/tsx/dist/cli.mjs';
const CIBLE = 'd'.repeat(40);
const AUTRE = 'e'.repeat(40);

type Appel = { methode: string; chemin: string; corps: unknown };
let serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.map((s) => new Promise((r) => s.close(r))));
  serveurs = [];
});

async function serveur(
  repondre: (a: Appel) => { statut: number; entetes: Record<string, string>; corps: string }
) {
  const appels: Appel[] = [];
  const s = createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => (brut += c));
    req.on('end', () => {
      const a = {
        methode: req.method ?? '',
        chemin: req.url ?? '',
        corps: brut ? (JSON.parse(brut) as unknown) : null,
      };
      appels.push(a);
      const r = repondre(a);
      res.writeHead(r.statut, r.entetes);
      res.end(r.corps);
    });
  });
  serveurs.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const ad = s.address();
  if (ad === null || typeof ad === 'string') throw new Error('adresse');
  return { url: `http://127.0.0.1:${ad.port}`, appels };
}

function lancer(env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    const propre: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(propre))
      if (/^(COOLIFY_|PARTNERS_URL_PUBLIQUE|SHA_CIBLE|GITHUB_SHA)/.test(k)) delete propre[k];
    const p = spawn(
      process.execPath,
      [TSX, SCRIPT, '--retour-arriere', '--essais', '2', '--delai-ms', '50'],
      { env: { ...propre, ...env } }
    );
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

const plateformeQuiAccepte = () =>
  serveur(() => ({
    statut: 200,
    entetes: { 'content-type': 'application/json' },
    corps: '{"message":"ok"}',
  }));
const application = (sha: string | null, readyz: number) =>
  serveur((a) =>
    a.chemin === '/api/readyz'
      ? { statut: readyz, entetes: {}, corps: '{}' }
      : {
          statut: 200,
          entetes: (sha ? { 'x-partners-build-sha': sha } : {}) as Record<string, string>,
          corps: '',
        }
  );
const envs = (p: { appels: Appel[] }) =>
  p.appels
    .filter((a) => a.chemin === '/api/v1/applications/uuid-factice/envs/bulk')
    .map((a) => (a.corps as { data: { key: string; value: string }[] }).data);

describe('REQ-QA-022 — le retour arrière remet en place, puis le VÉRIFIE', () => {
  it('REQ-QA-022 : SKIP_MIGRATE=1, étiquette sha-<cible>, déploiement, en-tête et readyz vérifiés, puis SKIP_MIGRATE=0', async () => {
    const coolify = await plateformeQuiAccepte();
    const app = await application(CIBLE, 200);
    const r = await lancer({
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'jeton-factice-retour',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).toBe(0);
    expect(r.sortie).not.toContain('jeton-factice-retour');
    expect(coolify.appels.map((a) => `${a.methode} ${a.chemin}`)).toEqual([
      'PATCH /api/v1/applications/uuid-factice/envs/bulk',
      'PATCH /api/v1/applications/uuid-factice',
      'POST /api/v1/deploy?uuid=uuid-factice&force=false',
      'PATCH /api/v1/applications/uuid-factice/envs/bulk',
    ]);
    expect(envs(coolify)).toEqual([
      [{ key: 'SKIP_MIGRATE', value: '1' }],
      [{ key: 'SKIP_MIGRATE', value: '0' }],
    ]);
    expect(coolify.appels[1]!.corps).toEqual({
      docker_registry_image_tag: `sha-${CIBLE.slice(0, 7)}`,
    });
    expect(app.appels.some((a) => a.chemin === '/api/readyz')).toBe(true);
  });

  it('REQ-QA-022 : l’ancienne image jamais servie : ROUGE, les deux sha nommés, et SKIP_MIGRATE remis à 0', async () => {
    const coolify = await plateformeQuiAccepte();
    const app = await application(AUTRE, 200);
    const r = await lancer({
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain(CIBLE);
    expect(r.sortie).toContain(AUTRE);
    expect(envs(coolify).at(-1)).toEqual([{ key: 'SKIP_MIGRATE', value: '0' }]);
  });

  it('REQ-QA-022 : l’en-tête est le bon mais readyz répond 503 : ROUGE, readyz nommé, SKIP_MIGRATE remis à 0', async () => {
    const coolify = await plateformeQuiAccepte();
    const app = await application(CIBLE, 503);
    const r = await lancer({
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/readyz/);
    expect(envs(coolify).at(-1)).toEqual([{ key: 'SKIP_MIGRATE', value: '0' }]);
  });

  it('REQ-QA-022 : un sha cible illisible est refusé avant tout appel', async () => {
    const coolify = await plateformeQuiAccepte();
    const r = await lancer({
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: 'http://127.0.0.1:1',
      SHA_CIBLE: 'main; rm -rf /',
    });
    expect(r.code).not.toBe(0);
    expect(coolify.appels).toEqual([]);
  });

  it('REQ-QA-022 : secrets absents : SAUTÉ, chaque absent nommé, rien appelé', async () => {
    const r = await lancer({ SHA_CIBLE: CIBLE });
    expect(r.code).toBe(0);
    for (const n of [
      'COOLIFY_URL',
      'COOLIFY_API_TOKEN',
      'COOLIFY_APP_UUID',
      'PARTNERS_URL_PUBLIQUE',
    ])
      expect(r.sortie).toContain(n);
  });
});

describe('REQ-QA-022 — le workflow : à la main, un sha, la file du déploiement', () => {
  type Job = {
    permissions?: Record<string, string>;
    concurrency?: { group?: string; ['cancel-in-progress']?: unknown };
    steps?: { run?: string; env?: Record<string, string> }[];
  };
  let wf: {
    on?: Record<string, { inputs?: Record<string, { required?: unknown }> }>;
    jobs?: Record<string, Job>;
  } = {};
  beforeAll(async () => {
    wf = (await lireYaml(readFileSync('.github/workflows/rollback.yml', 'utf8'))) as typeof wf;
  });

  it('REQ-QA-022 : déclenché à la main seulement, avec un sha exigé', () => {
    expect(Object.keys(wf.on ?? {})).toEqual(['workflow_dispatch']);
    expect(String(wf.on?.workflow_dispatch?.inputs?.sha?.required)).toBe('true');
  });

  it('REQ-QA-022 : un seul producteur — la même file que le déploiement, jamais annulée', () => {
    const j = Object.values(wf.jobs ?? {})[0]!;
    expect(j.concurrency?.group).toBe('deploiement-production');
    expect(String(j.concurrency?.['cancel-in-progress'])).toBe('false');
    expect(j.permissions).toEqual({ contents: 'read' });
  });

  it('REQ-QA-022 : le sha passe par l’environnement de l’étape, jamais interpolé dans une commande', () => {
    const e = (Object.values(wf.jobs ?? {})[0]!.steps ?? []).find(
      (s) => s.run === 'pnpm deploy:retour-arriere'
    );
    expect(e?.env?.SHA_CIBLE).toBe('${{ inputs.sha }}');
  });
});
