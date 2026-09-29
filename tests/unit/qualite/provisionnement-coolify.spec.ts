// @req REQ-INT-031
/**
 * QA-T50 — le provisionnement de Partners sur la plateforme : application, base Postgres séparée,
 * cache, et variables posées depuis les secrets du dépôt, JAMAIS en clair (REQ-INT-031).
 *
 * Tout est exercé contre une plateforme FACTICE, un vrai serveur HTTP local qui tient en mémoire les
 * projets, serveurs, applications, bases et variables — jamais un mock de `fetch`. Les faces :
 *
 *   1. secrets de la plateforme ou secrets applicatifs absents : SAUTÉ, code 0, chacun nommé en
 *      `::warning::` (arbitrage -d7 sur délégation de Williams du 2026-09-29) — rien n'est appelé ;
 *   2. une valeur hors règle (`src/lib/env.ts`) : refusée AVANT tout appel, la variable nommée,
 *      jamais la valeur ;
 *   3. plateforme vide : la base, le cache et l'application sont créés, puis les variables posées ;
 *      `DATABASE_URL` et `REDIS_URL` viennent des bases créées, jamais d'un secret ;
 *   4. relancé : rien n'est recréé, et c'est dit ; les variables sont reposées ;
 *   5. une réponse qui ne porte pas l'adresse interne d'une base : ROUGE, le champ nommé — aucune
 *      adresse n'est devinée (l'API ne documente pas cette réponse, lue le 2026-09-29) ;
 *   6. plateforme en 401 : ROUGE, le statut nommé ;
 *   7. AUCUNE valeur de secret n'apparaît dans la sortie, dans aucun cas.
 *
 * RM-11 : chaque cas pose explicitement son environnement et l'état de la plateforme.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { lireYaml } from '../../../scripts/lib/lire-yaml';
import { NOMS_DES_SECRETS, NOMS_DE_CONFIGURATION, NOMS_FACULTATIFS } from '../../../src/lib/env';

const SCRIPT = 'scripts/deploiement/provisionner.ts';
const TSX = 'node_modules/tsx/dist/cli.mjs';
const SHA = 'c'.repeat(40);

type Appel = { methode: string; chemin: string; corps: unknown; auth: string | undefined };
type Plateforme = {
  url: string;
  appels: Appel[];
  applications: { uuid: string; name: string }[];
  bases: { uuid: string; name: string; type: string }[];
  envs: Map<string, { key: string; value: string }[]>;
};

let serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.map((s) => new Promise((r) => s.close(r))));
  serveurs = [];
});

async function plateforme(options: {
  statut: number;
  adresseInterne: boolean;
  applications: { uuid: string; name: string }[];
  bases: { uuid: string; name: string; type: string }[];
}): Promise<Plateforme> {
  const p: Plateforme = {
    url: '',
    appels: [],
    applications: [...options.applications],
    bases: [...options.bases],
    envs: new Map(),
  };
  let n = 0;
  const s = createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => (brut += c));
    req.on('end', () => {
      const chemin = req.url ?? '';
      const corps = brut ? (JSON.parse(brut) as unknown) : null;
      p.appels.push({ methode: req.method ?? '', chemin, corps, auth: req.headers.authorization });
      const repondre = (statut: number, objet: unknown) => {
        res.writeHead(statut, { 'content-type': 'application/json' });
        res.end(JSON.stringify(objet));
      };
      if (options.statut !== 200) return repondre(options.statut, { message: 'Unauthenticated.' });
      const m = req.method;
      if (m === 'GET' && chemin === '/api/v1/projects')
        return repondre(200, [{ id: 1, uuid: 'projet-1', name: 'Axion-Partners', description: '' }]);
      if (m === 'GET' && chemin === '/api/v1/servers')
        return repondre(200, [{ uuid: 'serveur-1', name: 'localhost' }]);
      if (m === 'GET' && chemin === '/api/v1/applications') return repondre(200, p.applications);
      if (m === 'GET' && chemin === '/api/v1/databases') return repondre(200, p.bases);
      if (m === 'POST' && chemin === '/api/v1/applications/dockerimage') {
        const uuid = `app-${++n}`;
        p.applications.push({ uuid, name: (corps as { name: string }).name });
        return repondre(201, { uuid });
      }
      const creation = /^\/api\/v1\/databases\/(postgresql|redis)$/.exec(chemin);
      if (m === 'POST' && creation) {
        const uuid = `base-${++n}`;
        p.bases.push({ uuid, name: (corps as { name: string }).name, type: creation[1]! });
        return repondre(201, { uuid });
      }
      const lecture = /^\/api\/v1\/databases\/([\w-]+)$/.exec(chemin);
      if (m === 'GET' && lecture) {
        const b = p.bases.find((x) => x.uuid === lecture[1]);
        if (!b) return repondre(404, { message: 'Not found.' });
        const url =
          b.type === 'redis'
            ? `redis://default:mdp-cache-factice@${b.uuid}:6379/0`
            : `postgres://postgres:mdp-base-factice@${b.uuid}:5432/postgres`;
        return repondre(200, options.adresseInterne ? { uuid: b.uuid, internal_db_url: url } : { uuid: b.uuid });
      }
      const envs = /^\/api\/v1\/applications\/([\w-]+)\/envs\/bulk$/.exec(chemin);
      if (m === 'PATCH' && envs) {
        p.envs.set(envs[1]!, (corps as { data: { key: string; value: string }[] }).data);
        return repondre(201, { message: 'ok' });
      }
      return repondre(404, { message: `route factice inconnue : ${m} ${chemin}` });
    });
  });
  serveurs.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const a = s.address();
  if (a === null || typeof a === 'string') throw new Error('adresse');
  p.url = `http://127.0.0.1:${a.port}`;
  return p;
}

/** Des valeurs factices VALIDES pour chaque secret applicatif : distinctes, 40 caractères. */
function secretsApplicatifs(): Record<string, string> {
  const e: Record<string, string> = {};
  NOMS_DES_SECRETS.forEach((nom, i) => {
    e[nom] =
      nom === 'PII_ENCRYPTION_KEY' ? i.toString(16).padStart(64, 'a') : `valeur-factice-${i}-`.padEnd(40, 'x');
  });
  return e;
}

function lancer(env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    const propre: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(propre)) {
      if (k.startsWith('COOLIFY_') || k === 'GITHUB_SHA' || NOMS_DES_SECRETS.includes(k) || NOMS_DE_CONFIGURATION.includes(k))
        delete propre[k];
    }
    const p = spawn(process.execPath, [TSX, SCRIPT], { env: { ...propre, ...env } });
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

function sansValeurDeSecret(sortie: string, env: Record<string, string>) {
  for (const nom of [...NOMS_DES_SECRETS, 'COOLIFY_API_TOKEN']) {
    if (env[nom]) expect(sortie, `la valeur de ${nom} fuit`).not.toContain(env[nom]);
  }
  expect(sortie).not.toContain('mdp-base-factice');
  expect(sortie).not.toContain('mdp-cache-factice');
}

const PLATEFORME_VIDE = { statut: 200, adresseInterne: true, applications: [], bases: [] };

describe('REQ-INT-031 — sans ses secrets, le provisionnement est SAUTÉ et nomme chacun', () => {
  it('secrets de la plateforme absents : code 0, chacun nommé, rien appelé', async () => {
    const r = await lancer({ ...secretsApplicatifs(), GITHUB_SHA: SHA });
    expect(r.code).toBe(0);
    for (const nom of ['COOLIFY_URL', 'COOLIFY_API_TOKEN', 'PARTNERS_URL_PUBLIQUE'])
      expect(r.sortie).toContain(`::warning title=coolify:provisionner::${nom}`);
  });

  it('un secret applicatif absent : lui seul est nommé, et la plateforme n’est pas appelée', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    const manquant = NOMS_DES_SECRETS[0]!;
    delete env[manquant];
    const r = await lancer(env);
    expect(r.code).toBe(0);
    expect(r.sortie).toContain(`::warning title=coolify:provisionner::${manquant}`);
    expect(r.sortie).not.toContain(`::warning title=coolify:provisionner::${NOMS_DES_SECRETS[1]}`);
    expect(p.appels).toEqual([]);
  });
});

describe('REQ-INT-031 — une valeur hors règle est refusée avant tout appel', () => {
  it('un secret trop court : code non nul, la variable nommée, la valeur tue, rien appelé', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    env.SESSION_SECRET = 'court-et-secret';
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('SESSION_SECRET');
    expect(r.sortie).not.toContain('court-et-secret');
    expect(p.appels).toEqual([]);
  });
});

describe('REQ-INT-031 — sur une plateforme vide, tout est créé puis les variables posées', () => {
  it('base, cache et application créés ; DATABASE_URL et REDIS_URL viennent des bases ; aucune valeur imprimée', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    const r = await lancer(env);
    expect(r.code).toBe(0);
    sansValeurDeSecret(r.sortie, env);

    const creations = p.appels.filter((a) => a.methode === 'POST').map((a) => a.chemin);
    expect(creations).toEqual([
      '/api/v1/databases/postgresql',
      '/api/v1/databases/redis',
      '/api/v1/applications/dockerimage',
    ]);
    const app = p.appels.find((a) => a.chemin === '/api/v1/applications/dockerimage')!.corps as Record<string, unknown>;
    expect(app).toMatchObject({
      project_uuid: 'projet-1',
      server_uuid: 'serveur-1',
      environment_name: 'production',
      docker_registry_image_name: 'ghcr.io/will383842/axion-apporteurs',
      docker_registry_image_tag: `sha-${SHA.slice(0, 7)}`,
      ports_exposes: '3000',
      health_check_enabled: true,
      health_check_path: '/api/readyz',
      domains: 'https://partners.exemple.fr',
      instant_deploy: false,
    });
    const pg = p.appels.find((a) => a.chemin === '/api/v1/databases/postgresql')!.corps as Record<string, unknown>;
    expect(pg).toMatchObject({ project_uuid: 'projet-1', server_uuid: 'serveur-1', is_public: false, instant_deploy: true });

    const posees = new Map((p.envs.get(p.applications[0]!.uuid) ?? []).map((v) => [v.key, v.value]));
    for (const nom of NOMS_DES_SECRETS) expect(posees.get(nom)).toBe(env[nom]);
    expect(posees.get('DATABASE_URL')).toMatch(/^postgres:\/\/postgres:mdp-base-factice@base-\d+:5432\/postgres$/);
    expect(posees.get('REDIS_URL')).toMatch(/^redis:\/\/default:mdp-cache-factice@base-\d+:6379\/0$/);
    expect(posees.get('PARTNERS_ENV')).toBe('production');
    expect(posees.has('NOTIFY_SINK')).toBe(false);
    for (const a of p.appels) expect(a.auth).toBe('Bearer jeton-factice-plateforme');
  });

  it('relancé : rien n’est recréé, c’est dit, et les variables sont reposées', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    expect((await lancer(env)).code).toBe(0);
    const avant = p.appels.filter((a) => a.methode === 'POST').length;
    const r = await lancer(env);
    expect(r.code).toBe(0);
    expect(p.appels.filter((a) => a.methode === 'POST').length).toBe(avant);
    expect(r.sortie).toMatch(/existe déjà/);
    expect(p.appels.filter((a) => a.methode === 'PATCH').length).toBe(2);
  });
});

describe('REQ-INT-031 — ce que la plateforme ne dit pas n’est jamais deviné', () => {
  it('une base sans adresse interne dans la réponse : ROUGE, le champ nommé, aucune variable posée', async () => {
    const p = await plateforme({ ...PLATEFORME_VIDE, adresseInterne: false });
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('internal_db_url');
    expect(p.appels.filter((a) => a.methode === 'PATCH')).toEqual([]);
  });

  it('plateforme en 401 : ROUGE, statut nommé, jeton jamais imprimé', async () => {
    const p = await plateforme({ ...PLATEFORME_VIDE, statut: 401 });
    const env = { ...secretsApplicatifs(), COOLIFY_URL: p.url, COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('401');
    sansValeurDeSecret(r.sortie, env);
  });

  it('une adresse de plateforme en clair hors de la boucle locale est refusée', async () => {
    const env = { ...secretsApplicatifs(), COOLIFY_URL: 'http://coolify.exemple.fr', COOLIFY_API_TOKEN: 'jeton-factice-plateforme', PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr', GITHUB_SHA: SHA };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('https');
  });
});

describe('REQ-INT-031 — le workflow : manuel, sans droit, chaque secret par son nom', () => {
  type Job = { permissions?: Record<string, string>; steps?: { run?: string; env?: Record<string, string> }[] };
  let wf: { on?: unknown; jobs?: Record<string, Job> } = {};
  beforeAll(async () => {
    wf = (await lireYaml(readFileSync('.github/workflows/coolify-provisionner.yml', 'utf8'))) as typeof wf;
  });

  it('ne se déclenche QUE à la main', () => {
    expect(Object.keys(wf.on as Record<string, unknown>)).toEqual(['workflow_dispatch']);
  });

  it('un seul job, contents: read seul, et son étape est `pnpm coolify:provisionner`', () => {
    const jobs = Object.values(wf.jobs ?? {});
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.permissions).toEqual({ contents: 'read' });
    expect((jobs[0]!.steps ?? []).map((s) => s.run).filter(Boolean)).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm coolify:provisionner',
    ]);
  });

  it('chaque secret applicatif vient du secret du dépôt de MÊME nom ; la configuration facultative, des variables', () => {
    const etape = (Object.values(wf.jobs ?? {})[0]!.steps ?? []).find((s) => s.run === 'pnpm coolify:provisionner');
    const env = etape?.env ?? {};
    for (const nom of NOMS_DES_SECRETS) expect(env[nom]).toBe(`\${{ secrets.${nom} }}`);
    for (const nom of NOMS_FACULTATIFS.filter((n) => n !== 'PARTNERS_ENV'))
      expect(env[nom]).toBe(`\${{ vars.${nom} }}`);
    expect(env.COOLIFY_URL).toBe('${{ secrets.COOLIFY_URL }}');
    expect(env.COOLIFY_API_TOKEN).toBe('${{ secrets.COOLIFY_API_TOKEN }}');
    expect(env.PARTNERS_URL_PUBLIQUE).toBe('${{ vars.PARTNERS_URL_PUBLIQUE }}');
    // DATABASE_URL et REDIS_URL viennent des bases créées, jamais d'un secret.
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
  });
});
