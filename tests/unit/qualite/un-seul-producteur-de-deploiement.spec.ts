// @req REQ-QA-033 → REQ-GOV-014
/**
 * QA-T34 — la plateforme TIRE l'image publiée, un seul producteur de déploiement à la fois, et
 * l'atterrissage est VÉRIFIÉ sur l'en-tête servi, jamais sur la couleur d'un run.
 *
 * Trois faces, chacune exercée sur un vrai serveur HTTP local (jamais sur un mock de `fetch`) :
 *
 *   1. `deploy:verify <sha>` — l'en-tête `x-partners-build-sha` servi porte le sha : 0 ; un autre
 *      sha : non nul, et les DEUX sha sont nommés ; aucun en-tête : non nul, et l'absence est dite.
 *   2. `deploy:coolify` — secrets absents : SAUTÉ, 0, et CHAQUE secret manquant est nommé dans une
 *      annotation `::warning::` (arbitrage -d7 sur délégation de Williams du 2026-09-29 : un `main`
 *      rouge en permanence finit désarmé) ; secrets présents et plateforme qui refuse : ROUGE.
 *      Secrets présents et plateforme qui accepte : l'étiquette `sha-<7>` est posée PUIS le
 *      déploiement déclenché, dans cet ordre — la plateforme tire, elle ne construit rien.
 *   3. La structure : un job de déploiement après la publication, sur `main` seulement, une file
 *      par environnement qui n'annule jamais un déploiement commencé, sans droit d'écriture sur le
 *      registre ; l'en-tête est posé par l'application depuis le sha injecté au build de l'image.
 *
 * RM-11 : chaque serveur de test déclare explicitement ses réponses ; aucun défaut sur l'en-tête,
 * le statut ou les secrets, qui sont ce que les tests font varier.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { lireYaml } from '../../../scripts/lib/lire-yaml';
import { jugerLesChecks, jugerLeRun } from '../../../scripts/gates/deploy-verify';

const SCRIPT = 'scripts/gates/deploy-verify.ts';
const TSX = 'node_modules/tsx/dist/cli.mjs';
const SHA = 'a'.repeat(40);
const AUTRE = 'b'.repeat(40);

type Requete = { methode: string; url: string; auth: string | undefined; corps: string };
let serveurs: Server[] = [];

afterEach(async () => {
  await Promise.all(serveurs.map((s) => new Promise((r) => s.close(r))));
  serveurs = [];
});

async function serveur(
  repondre: (r: Requete) => { statut: number; entetes: Record<string, string>; corps: string }
): Promise<{ url: string; recues: Requete[] }> {
  const recues: Requete[] = [];
  const s = createServer((req: IncomingMessage, res) => {
    let corps = '';
    req.on('data', (c) => (corps += c));
    req.on('end', () => {
      const r: Requete = {
        methode: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization,
        corps,
      };
      recues.push(r);
      const rep = repondre(r);
      res.writeHead(rep.statut, rep.entetes);
      res.end(rep.corps);
    });
  });
  serveurs.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const adresse = s.address();
  if (adresse === null || typeof adresse === 'string')
    throw new Error('adresse du serveur de test');
  return { url: `http://127.0.0.1:${adresse.port}`, recues };
}

/** Asynchrone : le serveur de test tourne dans CE processus, un appel synchrone le bloquerait. */
function lancer(
  args: string[],
  env: Record<string, string>
): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    // Aucune variable du poste ne fuit dans le témoin : ce que le test fait varier, il le pose (RM-11).
    const propre: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(propre)) {
      if (/^(COOLIFY_|PARTNERS_URL_PUBLIQUE|GITHUB_SHA)/.test(k)) delete propre[k];
    }
    const p = spawn(process.execPath, [TSX, SCRIPT, ...args], { env: { ...propre, ...env } });
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

const RAPIDE = ['--essais', '2', '--delai-ms', '50'];

describe('deploy:verify — l’atterrissage se lit sur l’en-tête servi', () => {
  it('sur le sha servi, sort en zéro', async () => {
    const app = await serveur(() => ({
      statut: 200,
      entetes: { 'x-partners-build-sha': SHA },
      corps: '',
    }));
    const r = await lancer(['--verifier', SHA, ...RAPIDE], { PARTNERS_URL_PUBLIQUE: app.url });
    expect(r.sortie).toContain(SHA);
    expect(r.code).toBe(0);
  });

  it('REQ-GOV-014 : sur un sha non atterri, sort en non nul et nomme les DEUX sha', async () => {
    const app = await serveur(() => ({
      statut: 200,
      entetes: { 'x-partners-build-sha': AUTRE },
      corps: '',
    }));
    const r = await lancer(['--verifier', SHA, ...RAPIDE], { PARTNERS_URL_PUBLIQUE: app.url });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain(SHA);
    expect(r.sortie).toContain(AUTRE);
  });

  it('sans en-tête servi, sort en non nul et dit que l’en-tête est absent', async () => {
    const app = await serveur(() => ({ statut: 200, entetes: {}, corps: '' }));
    const r = await lancer(['--verifier', SHA, ...RAPIDE], { PARTNERS_URL_PUBLIQUE: app.url });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/absent/i);
  });

  it('sans adresse publique, sort en 2 — indéterminé, jamais un vert', async () => {
    const r = await lancer(['--verifier', SHA, ...RAPIDE], {});
    expect(r.code).toBe(2);
    expect(r.sortie).toContain('PARTNERS_URL_PUBLIQUE');
  });

  it('refuse un sha qui n’a pas quarante caractères hexadécimaux', async () => {
    const r = await lancer(['--verifier', 'main', ...RAPIDE], {
      PARTNERS_URL_PUBLIQUE: 'http://127.0.0.1:1',
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/sha/i);
  });

  it('lit le sha dans GITHUB_SHA quand aucun n’est donné', async () => {
    const app = await serveur(() => ({
      statut: 200,
      entetes: { 'x-partners-build-sha': SHA },
      corps: '',
    }));
    const r = await lancer(['--verifier', ...RAPIDE], {
      PARTNERS_URL_PUBLIQUE: app.url,
      GITHUB_SHA: SHA,
    });
    expect(r.code).toBe(0);
  });
});

describe('deploy:coolify — la plateforme tire l’image, ou le saut est NOMMÉ', () => {
  it('secrets absents : SAUTÉ, zéro, et chaque secret manquant est nommé en ::warning::', async () => {
    const r = await lancer(['--declencher', ...RAPIDE], { GITHUB_SHA: SHA });
    expect(r.code).toBe(0);
    expect(r.sortie).toContain('::warning');
    for (const nom of [
      'COOLIFY_URL',
      'COOLIFY_API_TOKEN',
      'COOLIFY_APP_UUID',
      'PARTNERS_URL_PUBLIQUE',
    ]) {
      expect(r.sortie).toContain(nom);
    }
  });

  it('un seul secret absent : lui seul est nommé, et rien n’est appelé', async () => {
    const coolify = await serveur(() => ({ statut: 200, entetes: {}, corps: '{}' }));
    const r = await lancer(['--declencher', ...RAPIDE], {
      GITHUB_SHA: SHA,
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'jeton-factice-de-test',
      COOLIFY_APP_UUID: 'uuid-factice',
    });
    expect(r.code).toBe(0);
    expect(r.sortie).toContain('PARTNERS_URL_PUBLIQUE');
    expect(r.sortie).not.toContain('COOLIFY_API_TOKEN');
    expect(coolify.recues).toEqual([]);
  });

  it('secrets présents, plateforme qui refuse : ROUGE, et le statut est nommé', async () => {
    const coolify = await serveur(() => ({
      statut: 401,
      entetes: {},
      corps: '{"message":"Unauthenticated."}',
    }));
    const r = await lancer(['--declencher', ...RAPIDE], {
      GITHUB_SHA: SHA,
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'jeton-factice-de-test',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: 'http://127.0.0.1:1',
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('401');
    expect(r.sortie).not.toContain('jeton-factice-de-test');
  });

  it('secrets présents, plateforme qui accepte : étiquette sha-<7> posée PUIS déploiement, puis atterrissage vérifié', async () => {
    const coolify = await serveur((q) =>
      q.methode === 'PATCH'
        ? { statut: 200, entetes: {}, corps: '{"uuid":"uuid-factice"}' }
        : {
            statut: 200,
            entetes: {},
            corps:
              '{"deployments":[{"message":"ok","resource_uuid":"uuid-factice","deployment_uuid":"d1"}]}',
          }
    );
    const app = await serveur(() => ({
      statut: 200,
      entetes: { 'x-partners-build-sha': SHA },
      corps: '',
    }));
    const r = await lancer(['--declencher', ...RAPIDE], {
      GITHUB_SHA: SHA,
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'jeton-factice-de-test',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
    });
    expect(r.sortie).not.toContain('jeton-factice-de-test');
    expect(r.code).toBe(0);
    expect(coolify.recues.map((q) => q.methode)).toEqual(['PATCH', 'POST']);
    const [patch, post] = coolify.recues;
    expect(patch!.url).toBe('/api/v1/applications/uuid-factice');
    expect(JSON.parse(patch!.corps)).toEqual({
      docker_registry_image_tag: `sha-${SHA.slice(0, 7)}`,
    });
    expect(post!.url).toBe('/api/v1/deploy?uuid=uuid-factice&force=false');
    for (const q of coolify.recues) expect(q.auth).toBe('Bearer jeton-factice-de-test');
  });

  it('plateforme qui accepte mais image jamais servie : ROUGE, les deux sha nommés', async () => {
    const coolify = await serveur(() => ({
      statut: 200,
      entetes: {},
      corps: '{"deployments":[]}',
    }));
    const app = await serveur(() => ({
      statut: 200,
      entetes: { 'x-partners-build-sha': AUTRE },
      corps: '',
    }));
    const r = await lancer(['--declencher', ...RAPIDE], {
      GITHUB_SHA: SHA,
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'jeton-factice-de-test',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain(SHA);
    expect(r.sortie).toContain(AUTRE);
  });

  it('refuse une adresse de plateforme en clair hors de la boucle locale', async () => {
    const r = await lancer(['--declencher', ...RAPIDE], {
      GITHUB_SHA: SHA,
      COOLIFY_URL: 'http://coolify.exemple.fr',
      COOLIFY_API_TOKEN: 'jeton-factice-de-test',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: 'https://partners.exemple.fr',
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('https');
  });
});

describe('la structure : un seul producteur, qui tire, sans droit sur le registre', () => {
  type Etape = {
    run?: string;
    uses?: string;
    env?: Record<string, string>;
    ['continue-on-error']?: unknown;
  };
  type Job = {
    needs?: string | string[];
    if?: string;
    permissions?: Record<string, string>;
    concurrency?: { group?: string; ['cancel-in-progress']?: boolean };
    steps?: Etape[];
  };
  let deployer: Job | undefined;
  beforeAll(async () => {
    const wf = (await lireYaml(readFileSync('.github/workflows/deploy.yml', 'utf8'))) as {
      jobs: Record<string, Job>;
    };
    deployer = wf.jobs.deployer;
  });

  it('un job `deployer` existe, après `publier`, sur un push de main seulement', () => {
    expect(deployer).toBeDefined();
    expect([deployer!.needs].flat()).toContain('publier');
    expect(deployer!.if).toContain("github.event_name == 'push'");
    expect(deployer!.if).toContain("github.ref == 'refs/heads/main'");
  });

  it('une file par environnement, qui n’annule jamais un déploiement commencé', () => {
    expect(deployer!.concurrency?.group).toBe('deploiement-production');
    // Le lecteur YAML du dépôt rend les scalaires en chaîne.
    expect(String(deployer!.concurrency?.['cancel-in-progress'])).toBe('false');
  });

  it('REQ-GOV-014 : aucun droit d’écriture — EXACTEMENT trois lectures : le dépôt, les checks, les runs', () => {
    // QA-T55 (lentille securite, voie V2) : `checks: read` pour le check-run `gate-a`, `actions: read`
    // pour remonter à son workflow (`path`). Une permission de plus, ou une écriture, rougit.
    expect(deployer!.permissions).toEqual({
      contents: 'read',
      checks: 'read',
      actions: 'read',
    });
  });

  it('REQ-GOV-014 : la porte A du même sha est attendue AVANT l’AIPD et la plateforme, jeton à l’étape seule', () => {
    const runs = (deployer!.steps ?? []).map((s) => s.run ?? '');
    const porte = runs.indexOf('pnpm deploy:attendre-porte-a');
    expect(porte).toBeGreaterThan(-1);
    expect(porte).toBeLessThan(runs.indexOf('pnpm aipd:signee'));
    expect(porte).toBeLessThan(runs.indexOf('pnpm deploy:coolify'));
    const etape = (deployer!.steps ?? [])[porte];
    expect(Object.keys(etape?.env ?? {})).toEqual(['GH_TOKEN']);
    for (const s of deployer!.steps ?? [])
      if (s !== etape) expect(Object.keys(s.env ?? {})).not.toContain('GH_TOKEN');
    expect((deployer as { env?: unknown }).env).toBeUndefined();
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['deploy:attendre-porte-a']).toBe(
      'tsx scripts/gates/deploy-verify.ts --attendre-porte-a'
    );
  });

  it('les étapes sont des scripts nommés, sans continue-on-error, et le seul appel à la plateforme est `pnpm deploy:coolify`', () => {
    const runs = (deployer!.steps ?? []).map((s) => s.run).filter((r): r is string => !!r);
    expect(runs).toContain('pnpm deploy:coolify');
    for (const r of runs) expect(r).toMatch(/^pnpm (install --frozen-lockfile|[a-z:-]+)$/);
    for (const s of deployer!.steps ?? []) expect(s['continue-on-error']).toBeUndefined();
  });

  it('les secrets arrivent par l’environnement de l’étape, jamais en argument', () => {
    const etape = (deployer!.steps ?? []).find((s) => s.run === 'pnpm deploy:coolify');
    expect(Object.keys(etape?.env ?? {}).sort()).toEqual(
      ['COOLIFY_API_TOKEN', 'COOLIFY_APP_UUID', 'COOLIFY_URL', 'PARTNERS_URL_PUBLIQUE'].sort()
    );
  });

  it('l’image est construite avec le sha du commit, et l’application le pose en en-tête', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['image:construire']).toContain('--build-arg GITHUB_SHA');
    expect(pkg.scripts['deploy:verify']).toBe('tsx scripts/gates/deploy-verify.ts --verifier');
    expect(pkg.scripts['deploy:coolify']).toBe('tsx scripts/gates/deploy-verify.ts --declencher');
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    expect(dockerfile).toMatch(
      /ARG GITHUB_SHA\s+ENV PARTNERS_BUILD_SHA=\$\{?GITHUB_SHA\}?\s+RUN pnpm exec next build/
    );
  });
});

describe('l’en-tête de build posé par l’application', () => {
  async function entetes(sha: string | undefined) {
    const avant = process.env.PARTNERS_BUILD_SHA;
    if (sha === undefined) delete process.env.PARTNERS_BUILD_SHA;
    else process.env.PARTNERS_BUILD_SHA = sha;
    try {
      const { enteteDeBuild } = await import('../../../next.config');
      return enteteDeBuild();
    } finally {
      if (avant === undefined) delete process.env.PARTNERS_BUILD_SHA;
      else process.env.PARTNERS_BUILD_SHA = avant;
    }
  }

  it('porte le sha injecté au build', async () => {
    expect(await entetes(SHA)).toEqual([{ key: 'x-partners-build-sha', value: SHA }]);
  });

  it('n’affirme rien quand aucun sha n’a été injecté', async () => {
    expect(await entetes(undefined)).toEqual([]);
    expect(await entetes('')).toEqual([]);
  });

  it('refuse un sha mal formé au lieu de servir une valeur fausse', async () => {
    await expect(entetes('pas-un-sha')).rejects.toThrow(/PARTNERS_BUILD_SHA/);
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
describe('REQ-GOV-014 — les secrets de production ne sont lus que dans l’environnement production', () => {
  const SECRETS_DE_PRODUCTION =
    /secrets\.(COOLIFY_(?!PREVIEW_)[A-Z_]+|R2_[A-Z_]+|PARTNERS_BACKUP_PASSPHRASE|TELEGRAM_[A-Z_]+|SESSION_SECRET|MAGIC_LINK_SECRET|DEPOSIT_TOKEN_SECRET|AXIONIA_[A-Z_]+|DOCUSEAL_[A-Z_]+|PII_[A-Z_]+|IP_HASH_SALT|PARTNERS_MCP_SHARED_SECRET|ZEPTOMAIL_[A-Z_]+)\b/;

  it('REQ-GOV-014 : chaque job qui lit un secret de production porte `environment: production`', async () => {
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

/**
 * QA-T55 (REQ-GOV-014) — le déploiement attend la porte A du MÊME sha. Avant lui, `deployer` partait
 * sur tout push de `main`, que la porte A soit verte, rouge ou encore en cours. La provenance est
 * exigée (lentille securite, voie V2) : un check « gate-a » peut être posé par une autre application,
 * ou par l'API depuis un autre workflow ; seul celui de `.github/workflows/ci.yml` fait foi.
 */
describe('REQ-GOV-014 — le déploiement attend la porte A du même sha, de la bonne provenance', () => {
  const CI = '.github/workflows/ci.yml';
  const check = (o: Record<string, unknown>) => ({
    name: 'gate-a',
    app: { slug: 'github-actions' },
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-10-02T10:00:00Z',
    details_url: 'https://github.com/o/r/actions/runs/77/job/1',
    ...o,
  });
  const reponse = (...c: Record<string, unknown>[]) => ({ total_count: c.length, check_runs: c });

  it('REQ-GOV-014 : la porte A réussie, de github-actions, sur le sha : son run est rendu', () => {
    expect(jugerLesChecks(reponse(check({})), SHA)).toEqual({ etat: 'reussie', runId: 77 });
  });

  it('REQ-GOV-014 : TÉMOINS — une autre application, un échec plus récent, une réponse illisible : refusés, nommés', () => {
    expect(jugerLesChecks(reponse(check({ app: { slug: 'autre-app' } })), SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('autre_application'),
    });
    const ok = check({ started_at: '2026-10-02T10:00:00Z' });
    const ko = check({ started_at: '2026-10-02T10:05:00Z', conclusion: 'failure' });
    expect(jugerLesChecks(reponse(ok, ko), SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('failure'),
    });
    for (const illisible of [null, 'texte', { check_runs: 'non' }])
      expect(jugerLesChecks(illisible, SHA)).toMatchObject({
        etat: 'refusee',
        raison: expect.stringContaining('illisible'),
      });
    expect(jugerLesChecks(reponse(check({ details_url: 'https://ailleurs' })), SHA)).toMatchObject({
      etat: 'refusee',
    });
  });

  it('REQ-GOV-014 : absente ou en cours : on attend ; un check d’un autre sha ne compte pas', () => {
    expect(jugerLesChecks(reponse(), SHA)).toEqual({ etat: 'absente' });
    expect(jugerLesChecks(reponse(check({ head_sha: AUTRE })), SHA)).toEqual({ etat: 'absente' });
    expect(
      jugerLesChecks(reponse(check({ status: 'in_progress', conclusion: null })), SHA)
    ).toEqual({ etat: 'en_cours' });
  });

  it('REQ-GOV-014 : TÉMOINS — le run doit être celui de ci.yml, sur le même sha', () => {
    expect(jugerLeRun({ path: CI, head_sha: SHA }, SHA)).toEqual({ etat: 'reussie' });
    expect(jugerLeRun({ path: '.github/workflows/autre.yml', head_sha: SHA }, SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('autre_workflow'),
    });
    expect(jugerLeRun({ path: CI, head_sha: AUTRE }, SHA)).toMatchObject({ etat: 'refusee' });
    expect(jugerLeRun('illisible', SHA)).toMatchObject({
      etat: 'refusee',
      raison: expect.stringContaining('illisible'),
    });
  });

  async function forge(chemin: string) {
    type Reponse = { statut: number; entetes: Record<string, string>; corps: string };
    return serveur((r): Reponse => {
      if (r.url.startsWith(`/repos/o/r/commits/${SHA}/check-runs`))
        return {
          statut: 200,
          entetes: { 'content-type': 'application/json' },
          corps: JSON.stringify(reponse(check({}))),
        };
      if (r.url === '/repos/o/r/actions/runs/77')
        return {
          statut: 200,
          entetes: { 'content-type': 'application/json' },
          corps: JSON.stringify({ path: chemin, head_sha: SHA }),
        };
      return { statut: 404, entetes: {}, corps: '' };
    });
  }

  it('REQ-GOV-014 : de bout en bout — la porte A de ci.yml réussie : 0 ; d’un autre workflow : non nul, sans jeton imprimé', async () => {
    const JETON = 'jeton-de-test-ne-doit-pas-sortir';
    const bonne = await forge(CI);
    const env = (url: string) => ({
      GITHUB_API_URL: url,
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SHA: SHA,
      GH_TOKEN: JETON,
    });
    const r = await lancer(['--attendre-porte-a', ...RAPIDE], env(bonne.url));
    expect([r.code, r.sortie]).toEqual([0, expect.stringContaining('gate-a')]);
    expect(bonne.recues.every((q) => q.auth === `Bearer ${JETON}`)).toBe(true);
    const mauvaise = await forge('.github/workflows/autre.yml');
    const s = await lancer(['--attendre-porte-a', ...RAPIDE], env(mauvaise.url));
    expect(s.code).not.toBe(0);
    expect(s.sortie).toContain('autre_workflow');
    expect(r.sortie + s.sortie).not.toContain(JETON);
  });

  it('REQ-GOV-014 : la porte A jamais vue dans la borne : non nul, nommé', async () => {
    const vide = await serveur(() => ({
      statut: 200,
      entetes: { 'content-type': 'application/json' },
      corps: JSON.stringify(reponse()),
    }));
    const r = await lancer(['--attendre-porte-a', ...RAPIDE], {
      GITHUB_API_URL: vide.url,
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SHA: SHA,
      GH_TOKEN: 'x',
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('absente');
  });
});
