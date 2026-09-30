// @req REQ-INT-031
/**
 * QA-T50 — le provisionnement de Partners sur la plateforme : application, base Postgres séparée,
 * cache, et variables posées depuis les secrets du dépôt, JAMAIS en clair (REQ-INT-031).
 *
 * Tout est exercé contre une plateforme FACTICE, un vrai serveur HTTP local qui tient en mémoire les
 * projets, serveurs, applications, bases et variables — jamais un mock de `fetch`. Les faces :
 *
 *   1. secrets de la plateforme ou secrets applicatifs absents : ÉCHEC, code 1, chacun nommé en
 *      `::error::` — rien n'est appelé. Le provisionnement ne part qu'à la main : un vert qui n'a
 *      rien créé ferait croire la production provisionnée (arbitrage -d7 du 2026-09-30) ;
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
        return repondre(200, [
          { id: 1, uuid: 'projet-1', name: 'Axion-Partners', description: '' },
        ]);
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
        return repondre(
          200,
          options.adresseInterne ? { uuid: b.uuid, internal_db_url: url } : { uuid: b.uuid }
        );
      }
      const reglage = /^\/api\/v1\/applications\/([\w-]+)$/.exec(chemin);
      if (m === 'PATCH' && reglage) {
        if (!p.applications.some((a) => a.uuid === reglage[1]))
          return repondre(404, { message: 'Not found.' });
        return repondre(200, { uuid: reglage[1] });
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
      nom === 'PII_ENCRYPTION_KEY'
        ? i.toString(16).padStart(64, 'a')
        : `valeur-factice-${i}-`.padEnd(40, 'x');
  });
  return e;
}

function lancer(env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    const propre: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(propre)) {
      if (
        k.startsWith('COOLIFY_') ||
        k === 'GITHUB_SHA' ||
        NOMS_DES_SECRETS.includes(k) ||
        NOMS_DE_CONFIGURATION.includes(k)
      )
        delete propre[k];
    }
    const p = spawn(process.execPath, [TSX, SCRIPT], { env: { ...propre, ...env } });
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

/** Les lignes `::add-mask::` sont le SEUL endroit où une valeur dérivée peut paraître : la forge les consomme. */
function sansValeurDeSecret(brute: string, env: Record<string, string>) {
  const sortie = brute
    .split('\n')
    .filter((l) => !l.startsWith('::add-mask::'))
    .join('\n');
  for (const nom of [...NOMS_DES_SECRETS, 'COOLIFY_API_TOKEN']) {
    if (env[nom]) expect(sortie, `la valeur de ${nom} fuit`).not.toContain(env[nom]);
  }
  expect(sortie).not.toContain('mdp-base-factice');
  expect(sortie).not.toContain('mdp-cache-factice');
}

const PLATEFORME_VIDE = { statut: 200, adresseInterne: true, applications: [], bases: [] };

describe('REQ-INT-031 — sans ses secrets, le provisionnement ÉCHOUE et nomme chacun', () => {
  it('REQ-INT-031 : secrets de la plateforme absents : code 1, chacun nommé en erreur, rien appelé', async () => {
    const r = await lancer({ ...secretsApplicatifs(), GITHUB_SHA: SHA });
    expect(r.code).toBe(1);
    expect(r.sortie).not.toContain('SAUTÉ');
    for (const nom of ['COOLIFY_URL', 'COOLIFY_API_TOKEN', 'PARTNERS_URL_PUBLIQUE'])
      expect(r.sortie).toContain(`::error title=coolify:provisionner::${nom}`);
  });

  it('REQ-INT-031 : un secret applicatif absent : lui seul est nommé, et la plateforme n’est pas appelée', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const manquant = NOMS_DES_SECRETS[0]!;
    delete env[manquant];
    const r = await lancer(env);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain(`::error title=coolify:provisionner::${manquant}`);
    expect(r.sortie).not.toContain(`::error title=coolify:provisionner::${NOMS_DES_SECRETS[1]}`);
    expect(p.appels).toEqual([]);
  });
});

describe('REQ-INT-031 — une valeur hors règle est refusée avant tout appel', () => {
  it('REQ-INT-031 : un secret trop court : code non nul, la variable nommée, la valeur tue, rien appelé', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    env.SESSION_SECRET = 'court-et-secret';
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('SESSION_SECRET');
    expect(r.sortie).not.toContain('court-et-secret');
    expect(p.appels).toEqual([]);
  });
});

describe('REQ-INT-031 — sur une plateforme vide, tout est créé puis les variables posées', () => {
  it('REQ-INT-031 : base, cache et application créés ; DATABASE_URL et REDIS_URL viennent des bases ; aucune valeur imprimée', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const r = await lancer(env);
    expect(r.code).toBe(0);
    sansValeurDeSecret(r.sortie, env);

    const creations = p.appels.filter((a) => a.methode === 'POST').map((a) => a.chemin);
    expect(creations).toEqual([
      '/api/v1/databases/postgresql',
      '/api/v1/databases/redis',
      '/api/v1/applications/dockerimage',
    ]);
    const app = p.appels.find((a) => a.chemin === '/api/v1/applications/dockerimage')!
      .corps as Record<string, unknown>;
    expect(app).toMatchObject({
      project_uuid: 'projet-1',
      server_uuid: 'serveur-1',
      environment_name: 'production',
      docker_registry_image_name: 'ghcr.io/will383842/axion-apporteurs',
      docker_registry_image_tag: `sha-${SHA.slice(0, 7)}`,
      ports_exposes: '3000',
      health_check_enabled: false,
      domains: 'https://partners.exemple.fr',
      instant_deploy: false,
    });
    const pg = p.appels.find((a) => a.chemin === '/api/v1/databases/postgresql')!.corps as Record<
      string,
      unknown
    >;
    expect(pg).toMatchObject({
      project_uuid: 'projet-1',
      server_uuid: 'serveur-1',
      is_public: false,
      instant_deploy: true,
    });

    const posees = new Map(
      (p.envs.get(p.applications[0]!.uuid) ?? []).map((v) => [v.key, v.value])
    );
    for (const nom of NOMS_DES_SECRETS) expect(posees.get(nom)).toBe(env[nom]);
    expect(posees.get('DATABASE_URL')).toMatch(
      /^postgres:\/\/postgres:mdp-base-factice@base-\d+:5432\/postgres$/
    );
    expect(posees.get('REDIS_URL')).toMatch(
      /^redis:\/\/default:mdp-cache-factice@base-\d+:6379\/0$/
    );
    expect(posees.get('PARTNERS_ENV')).toBe('production');
    expect(posees.has('NOTIFY_SINK')).toBe(false);
    for (const a of p.appels) expect(a.auth).toBe('Bearer jeton-factice-plateforme');
  });

  it('REQ-INT-031 : relancé : rien n’est recréé, c’est dit, et les variables sont reposées', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    expect((await lancer(env)).code).toBe(0);
    const avant = p.appels.filter((a) => a.methode === 'POST').length;
    const r = await lancer(env);
    expect(r.code).toBe(0);
    expect(p.appels.filter((a) => a.methode === 'POST').length).toBe(avant);
    expect(r.sortie).toMatch(/existe déjà/);
    // Par passage : le réglage de la sonde, puis les variables.
    expect(p.appels.filter((a) => a.methode === 'PATCH').length).toBe(4);
  });
});

/**
 * PREMIER DÉPLOIEMENT RÉEL (2026-09-30) : Coolify a retiré le conteneur (« New container is not healthy,
 * rolling back »). Sa sonde s'exécute DANS le conteneur par curl ou wget, que l'image n'a pas. Arbitrage
 * de la coordination, accepté par la lentille `securite` : la sonde de Coolify est coupée, et le
 * HEALTHCHECK natif de l'image (en node, Dockerfile) reste la sonde de vérité. Le réglage vise
 * l'application Partners SEULE, à la création ET sur une application existante, sans effet si on relance.
 */
describe('REQ-INT-031 — la sonde de la plateforme est coupée sur l’application Partners seule', () => {
  const envDeBase = (url: string): Record<string, string> => ({
    ...secretsApplicatifs(),
    COOLIFY_URL: url,
    COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
    PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
    GITHUB_SHA: SHA,
  });
  const reglages = (p: Plateforme) =>
    p.appels.filter(
      (a) => a.methode === 'PATCH' && /^\/api\/v1\/applications\/[\w-]+$/.test(a.chemin)
    );

  it('REQ-INT-031 : une application EXISTANTE reçoit health_check_enabled=false, par son seul uuid', async () => {
    const p = await plateforme({
      ...PLATEFORME_VIDE,
      applications: [
        { uuid: 'app-partners', name: 'axion-partners' },
        { uuid: 'app-voisine', name: 'axion-ia' },
      ],
      bases: [
        { uuid: 'base-pg', name: 'axion-partners-postgres', type: 'postgresql' },
        { uuid: 'base-redis', name: 'axion-partners-redis', type: 'redis' },
      ],
    });
    const r = await lancer(envDeBase(p.url));
    expect(r.code).toBe(0);
    const faits = reglages(p);
    expect(faits.map((a) => a.chemin)).toEqual(['/api/v1/applications/app-partners']);
    expect(faits[0]!.corps).toEqual({ health_check_enabled: false });
    // Jamais une base, jamais une autre application.
    expect(p.appels.some((a) => a.methode === 'PATCH' && a.chemin.includes('app-voisine'))).toBe(
      false
    );
    expect(p.appels.some((a) => a.methode === 'PATCH' && a.chemin.includes('/databases/'))).toBe(
      false
    );
  });

  it('REQ-INT-031 : une application CRÉÉE naît sans la sonde de la plateforme, et le réglage est reposé', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    expect((await lancer(envDeBase(p.url))).code).toBe(0);
    const creee = p.appels.find((a) => a.chemin === '/api/v1/applications/dockerimage')!
      .corps as Record<string, unknown>;
    expect(creee.health_check_enabled).toBe(false);
    const faits = reglages(p);
    expect(faits).toHaveLength(1);
    expect(faits[0]!.chemin).toBe(`/api/v1/applications/${p.applications[0]!.uuid}`);
  });

  it('REQ-INT-031 : le réglage passe AVANT la pose des variables', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    expect((await lancer(envDeBase(p.url))).code).toBe(0);
    const patches = p.appels.filter((a) => a.methode === 'PATCH').map((a) => a.chemin);
    expect(patches[0]).toMatch(/^\/api\/v1\/applications\/[\w-]+$/);
    expect(patches[1]).toMatch(/\/envs\/bulk$/);
  });
});

describe('REQ-INT-031 — dans la forge, chaque valeur dérivée est masquée dès sa lecture', () => {
  it('REQ-INT-031 : DATABASE_URL et REDIS_URL sont déclarées ::add-mask:: AVANT l’annonce de la pose des variables', async () => {
    const p = await plateforme(PLATEFORME_VIDE);
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
      GITHUB_ACTIONS: 'true',
    };
    const r = await lancer(env);
    expect(r.code).toBe(0);
    const lignes = r.sortie.split('\n');
    const masques = lignes.filter((l) => l.startsWith('::add-mask::'));
    expect(masques).toHaveLength(2);
    expect(masques.some((l) => l.includes('mdp-base-factice'))).toBe(true);
    expect(masques.some((l) => l.includes('mdp-cache-factice'))).toBe(true);
    const annonce = lignes.findIndex((l) => l.includes('variable(s) posée(s)'));
    expect(Math.max(...masques.map((m) => lignes.indexOf(m)))).toBeLessThan(annonce);
    sansValeurDeSecret(r.sortie, env);
  });
});

describe('REQ-INT-031 — ce que la plateforme ne dit pas n’est jamais deviné', () => {
  it('REQ-INT-031 : une base sans adresse interne dans la réponse : ROUGE, le champ nommé, aucune variable posée', async () => {
    const p = await plateforme({ ...PLATEFORME_VIDE, adresseInterne: false });
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('internal_db_url');
    expect(p.appels.filter((a) => a.methode === 'PATCH')).toEqual([]);
  });

  it('REQ-INT-031 : plateforme en 401 : ROUGE, statut nommé, jeton jamais imprimé', async () => {
    const p = await plateforme({ ...PLATEFORME_VIDE, statut: 401 });
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('401');
    sansValeurDeSecret(r.sortie, env);
  });

  it('REQ-INT-031 : une adresse de plateforme en clair hors de la boucle locale est refusée', async () => {
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: 'http://coolify.exemple.fr',
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('https');
  });
});

describe('REQ-INT-031 — le workflow : manuel, sans droit, chaque secret par son nom', () => {
  type Job = {
    permissions?: Record<string, string>;
    steps?: { run?: string; env?: Record<string, string> }[];
  };
  let wf: { on?: unknown; jobs?: Record<string, Job> } = {};
  beforeAll(async () => {
    wf = (await lireYaml(
      readFileSync('.github/workflows/coolify-provisionner.yml', 'utf8')
    )) as typeof wf;
  });

  it('REQ-INT-031 : ne se déclenche QUE à la main', () => {
    expect(Object.keys(wf.on as Record<string, unknown>)).toEqual(['workflow_dispatch']);
  });

  it('REQ-INT-031 : un seul job, contents: read seul, et son étape est `pnpm coolify:provisionner`', () => {
    const jobs = Object.values(wf.jobs ?? {});
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.permissions).toEqual({ contents: 'read' });
    expect((jobs[0]!.steps ?? []).map((s) => s.run).filter(Boolean)).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm coolify:provisionner',
    ]);
  });

  it('REQ-INT-031 : chaque secret applicatif vient du secret du dépôt de MÊME nom ; la configuration facultative, des variables', () => {
    const etape = (Object.values(wf.jobs ?? {})[0]!.steps ?? []).find(
      (s) => s.run === 'pnpm coolify:provisionner'
    );
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

/**
 * CONSIGNE DE LA LENTILLE `securite` (refus des PR 268 et 272) : un secret de DÉPÔT est servi à tout
 * workflow d'une PR de branche, avec le fichier de la PR, avant toute relecture ; et un déclenchement
 * manuel part de n'importe quelle branche. Les secrets de production vivent donc dans l'ENVIRONNEMENT
 * `production`, dont la règle de branche (« main seulement », réglage de la forge par Williams) est
 * la vraie serrure. Ce témoin tient la moitié qui est dans le dépôt : AUCUN job, dans AUCUN workflow,
 * ne lit un secret de production hors d'un job de l'environnement `production`.
 */
describe('REQ-INT-031 — les secrets de production ne sont lus que dans l’environnement production', () => {
  const SECRETS_DE_PRODUCTION =
    /secrets\.(COOLIFY_(?!PREVIEW_)[A-Z_]+|R2_[A-Z_]+|PARTNERS_BACKUP_PASSPHRASE|TELEGRAM_[A-Z_]+|SESSION_SECRET|MAGIC_LINK_SECRET|DEPOSIT_TOKEN_SECRET|AXIONIA_[A-Z_]+|DOCUSEAL_[A-Z_]+|PII_[A-Z_]+|IP_HASH_SALT|PARTNERS_MCP_SHARED_SECRET|ZEPTOMAIL_[A-Z_]+)\b/;

  it('REQ-INT-031 : chaque job qui lit un secret de production porte `environment: production`', async () => {
    const { readdirSync } = await import('node:fs');
    const fautes: string[] = [];
    let confrontes = 0;
    for (const f of readdirSync('.github/workflows').filter((x) => /\.ya?ml$/.test(x))) {
      const wf = (await lireYaml(readFileSync(`.github/workflows/${f}`, 'utf8'))) as {
        jobs?: Record<string, { environment?: unknown }>;
      };
      for (const [nom, job] of Object.entries(wf.jobs ?? {})) {
        if (!SECRETS_DE_PRODUCTION.test(JSON.stringify(job))) continue;
        confrontes++;
        const env = job.environment;
        const nomEnv =
          typeof env === 'object' && env !== null ? (env as { name?: unknown }).name : env;
        if (nomEnv !== 'production') fautes.push(`${f} › ${nom}`);
      }
    }
    expect(confrontes).toBeGreaterThan(0);
    expect(
      fautes,
      `jobs qui lisent un secret de production hors de l'environnement production :\n${fautes.join('\n')}`
    ).toEqual([]);
  });
});

describe('REQ-INT-031 — le provisionnement ne tourne que sur main, et ne réutilise jamais une ressource ambiguë', () => {
  it('REQ-INT-031 : le job porte environment: production et ne tourne que sur la branche principale', async () => {
    const wf = (await lireYaml(
      readFileSync('.github/workflows/coolify-provisionner.yml', 'utf8')
    )) as {
      jobs?: Record<string, { environment?: unknown; if?: string }>;
    };
    const job = Object.values(wf.jobs ?? {})[0]!;
    expect(job.environment).toBe('production');
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
  });

  it('REQ-INT-031 : deux bases du même nom sur la plateforme : ROUGE, nommé, rien créé ni posé', async () => {
    const p = await plateforme({
      ...PLATEFORME_VIDE,
      bases: [
        { uuid: 'base-ici', name: 'axion-partners-postgres', type: 'postgresql' },
        { uuid: 'base-ailleurs', name: 'axion-partners-postgres', type: 'postgresql' },
      ],
    });
    const env: Record<string, string> = {
      ...secretsApplicatifs(),
      COOLIFY_URL: p.url,
      COOLIFY_API_TOKEN: 'jeton-factice-plateforme',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
      GITHUB_SHA: SHA,
    };
    const r = await lancer(env);
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/axion-partners-postgres/);
    expect(p.appels.filter((a) => a.methode === 'POST' || a.methode === 'PATCH')).toEqual([]);
  });
});
