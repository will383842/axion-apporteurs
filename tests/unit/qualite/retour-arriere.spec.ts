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
/** QA-T65 : l'empreinte de l'image publiée, et l'étiquette que la plateforme reçoit pour elle. */
const EMPREINTE = `sha256:${'c'.repeat(64)}`;
const ETIQUETTE = `sha256-${'c'.repeat(64)}`;

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
      if (/^(COOLIFY_|PARTNERS_|SHA_CIBLE|GITHUB_|GH_TOKEN)/.test(k)) delete propre[k];
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

/** La plateforme accepte, et rend l'étiquette que l'application tire (QA-T65 : relue après le déploiement). */
const plateformeQuiAccepte = (tiree: string = ETIQUETTE) =>
  serveur((a) => ({
    statut: 200,
    entetes: { 'content-type': 'application/json' },
    corps:
      a.methode === 'GET' && a.chemin === '/api/v1/applications/uuid-factice'
        ? JSON.stringify({ docker_registry_image_tag: tiree })
        : '{"message":"ok"}',
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
/**
 * La forge factice : l'API de comparaison de GitHub et le registre d'images, sur un même serveur. Le
 * sha cible est-il un ANCÊTRE de la branche principale, et son image `sha-<7>` a-t-elle été publiée ?
 * (consignes de la lentille `securite` pour la livraison de QA-T13).
 */
async function forge(ancetre: boolean, image: boolean): Promise<Record<string, string>> {
  const f = await serveur(
    (a): { statut: number; entetes: Record<string, string>; corps: string } => {
      if (a.chemin.startsWith('/repos/proprio/depot/compare/'))
        return {
          statut: 200,
          entetes: { 'content-type': 'application/json' },
          corps: JSON.stringify({ status: ancetre ? 'ahead' : 'diverged' }),
        };
      if (a.chemin.startsWith('/token'))
        return { statut: 200, entetes: {}, corps: '{"token":"jeton-anonyme"}' };
      if (a.chemin.startsWith('/v2/proprio/depot/manifests/sha-'))
        return {
          statut: image ? 200 : 404,
          entetes: (image ? { 'docker-content-digest': EMPREINTE } : {}) as Record<string, string>,
          corps: '',
        };
      return { statut: 404, entetes: {}, corps: '' };
    }
  );
  return {
    GITHUB_API_URL: f.url,
    PARTNERS_REGISTRE_URL: f.url,
    GITHUB_REPOSITORY: 'proprio/depot',
    GH_TOKEN: 'jeton-factice-forge',
  };
}
const envs = (p: { appels: Appel[] }) =>
  p.appels
    .filter((a) => a.chemin === '/api/v1/applications/uuid-factice/envs/bulk')
    .map((a) => (a.corps as { data: { key: string; value: string }[] }).data);

describe('REQ-QA-022 — le retour arrière remet en place, puis le VÉRIFIE', () => {
  it('REQ-QA-022 : SKIP_MIGRATE=1, empreinte de l’image cible, déploiement, en-tête et readyz vérifiés, puis SKIP_MIGRATE=0', async () => {
    const coolify = await plateformeQuiAccepte();
    const app = await application(CIBLE, 200);
    const r = await lancer({
      ...(await forge(true, true)),
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
      // QA-T65 : l'étiquette que l'application tire est RELUE après le déploiement.
      'GET /api/v1/applications/uuid-factice',
      'PATCH /api/v1/applications/uuid-factice/envs/bulk',
    ]);
    expect(envs(coolify)).toEqual([
      [{ key: 'SKIP_MIGRATE', value: '1' }],
      [{ key: 'SKIP_MIGRATE', value: '0' }],
    ]);
    expect(coolify.appels[1]!.corps).toEqual({
      docker_registry_image_tag: ETIQUETTE,
    });
    expect(app.appels.some((a) => a.chemin === '/api/readyz')).toBe(true);
  });

  it('REQ-QA-022 : l’ancienne image jamais servie : ROUGE, les deux sha nommés, et SKIP_MIGRATE remis à 0', async () => {
    const coolify = await plateformeQuiAccepte();
    const app = await application(AUTRE, 200);
    const r = await lancer({
      ...(await forge(true, true)),
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
      ...(await forge(true, true)),
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

  it('REQ-QA-022 : un sha qui n’est pas un ancêtre de la branche principale est refusé avant tout appel à la plateforme', async () => {
    const coolify = await plateformeQuiAccepte();
    const r = await lancer({
      ...(await forge(false, true)),
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: 'http://127.0.0.1:1',
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/ancêtre/);
    expect(coolify.appels).toEqual([]);
  });

  it('REQ-QA-022 : un sha dont l’image n’a jamais été publiée est refusé avant tout appel à la plateforme', async () => {
    const coolify = await plateformeQuiAccepte();
    const r = await lancer({
      ...(await forge(true, false)),
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: 'http://127.0.0.1:1',
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain(`sha-${CIBLE.slice(0, 7)}`);
    expect(coolify.appels).toEqual([]);
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

  // Arbitrage -d7 du 2026-09-30 : le saut en code 0 ne valait que pour le déploiement d'un push sur
  // main. Un retour arrière est un geste MANUEL d'incident : un vert qui n'a rien fait tromperait
  // l'opérateur. Sans ses secrets, il ÉCHOUE, chacun nommé.
  it('REQ-QA-022 : secrets absents : ÉCHEC (code non nul), chaque absent nommé en erreur, rien appelé', async () => {
    const r = await lancer({ SHA_CIBLE: CIBLE });
    expect(r.code).not.toBe(0);
    expect(r.sortie).not.toContain('SAUTÉ');
    for (const n of [
      'COOLIFY_URL',
      'COOLIFY_API_TOKEN',
      'COOLIFY_APP_UUID',
      'PARTNERS_URL_PUBLIQUE',
    ])
      expect(r.sortie).toContain(`::error title=deploy:retour-arriere::${n} absent`);
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

  it('REQ-QA-022 : SKIP_MIGRATE est retiré par une étape à part, qui tourne même si le retour arrière a échoué', () => {
    const etapes = Object.values(wf.jobs ?? {})[0]!.steps ?? [];
    const i = etapes.findIndex((e) => e.run === 'pnpm deploy:retour-arriere');
    const j = etapes.findIndex((e) => e.run === 'pnpm deploy:retirer-echappatoire');
    expect(j).toBeGreaterThan(i);
    expect((etapes[j] as { if?: string }).if).toBe('${{ always() }}');
  });

  it('REQ-QA-022 : le sha passe par l’environnement de l’étape, jamais interpolé dans une commande', () => {
    const e = (Object.values(wf.jobs ?? {})[0]!.steps ?? []).find(
      (s) => s.run === 'pnpm deploy:retour-arriere'
    );
    expect(e?.env?.SHA_CIBLE).toBe('${{ inputs.sha }}');
  });
});

describe('REQ-QA-022 — le retour arrière ne part que de main, dans l’environnement production', () => {
  it('REQ-QA-022 : environment: production, et la branche principale seulement', async () => {
    const wf = (await lireYaml(readFileSync('.github/workflows/rollback.yml', 'utf8'))) as {
      jobs?: Record<string, { environment?: unknown; if?: string }>;
    };
    const job = Object.values(wf.jobs ?? {})[0]!;
    expect(job.environment).toBe('production');
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
  });

  it('REQ-QA-022 : TÉMOIN — la plateforme tire une AUTRE empreinte que celle publiée : NON ATTERRI, et SKIP_MIGRATE remis à 0', async () => {
    const coolify = await plateformeQuiAccepte(`sha256-${'f'.repeat(64)}`);
    const app = await application(CIBLE, 200);
    const r = await lancer({
      ...(await forge(true, true)),
      COOLIFY_URL: coolify.url,
      COOLIFY_API_TOKEN: 'j',
      COOLIFY_APP_UUID: 'uuid-factice',
      PARTNERS_URL_PUBLIQUE: app.url,
      SHA_CIBLE: CIBLE,
    });
    expect(r.code).not.toBe(0);
    expect(r.sortie).toContain('NON ATTERRI');
    expect(r.sortie).toContain(EMPREINTE);
    expect(envs(coolify).at(-1)).toEqual([{ key: 'SKIP_MIGRATE', value: '0' }]);
  });
});
