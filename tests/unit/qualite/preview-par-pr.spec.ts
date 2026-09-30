// @req REQ-QA-015
/**
 * QA-T06 — une preview par PR, isolée, semée, plafonnée, détruite (REQ-QA-015).
 *
 * Arbitrage -d7 sur délégation de Williams du 2026-09-29, option (B) sous six conditions, que ce
 * fichier TIENT au lieu de les rappeler :
 *   (1) l'image de preview n'est publiée que pour une PR du MÊME dépôt ;
 *   (2) le job qui publie ne lit aucun secret de production, et ne pousse que dans le paquet de
 *       preview : `latest` et `sha-*` de production sont hors d'atteinte ;
 *   (3) la preview reçoit des secrets factices tirés pour elle, et une base semée, jamais copiée ;
 *   (4) le déploiement est un job SÉPARÉ, qui n'extrait jamais le code de la PR, et qui seul détient
 *       un jeton de plateforme, dédié aux previews ;
 *   (5) plafond de deux, sérialisé ; destruction de l'application, de la base et des étiquettes à
 *       la fermeture ;
 *   (6) la règle jumelle vit dans `pipeline-image.spec.ts`.
 * Et les règles du semeur que l'acceptation de la tâche fixe : modules par préfixe, aucune horloge,
 * aucun tirage, vocabulaire lu dans l'enum de Prisma.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { lireYaml } from '../../../scripts/lib/lire-yaml';
import {
  decider,
  nomDePreview,
  PARAMETRES_PREVIEW,
  type Decision,
} from '../../../scripts/preview/preview';
import { modulesDeSemis, uuidV5, ESPACE_DE_NOMS } from '../../../prisma/seed';

const SOURCES_DU_SEMEUR = [
  'prisma/seed.ts',
  ...readdirSync('prisma/seed')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join('prisma/seed', f)),
];

describe('REQ-QA-015 — le semeur ne lit aucune horloge et ne tire rien', () => {
  const INTERDITS: [RegExp, string][] = [
    [/Date\.now\s*\(/, 'Date.now()'],
    [/new Date\(\s*\)/, 'new Date() sans argument'],
    [/Math\.random\s*\(/, 'Math.random()'],
    [/randomUUID\s*\(/, 'randomUUID()'],
    [/randomBytes\s*\(/, 'randomBytes()'],
  ];
  for (const f of SOURCES_DU_SEMEUR) {
    it(`REQ-QA-015 : ${f} n’appelle ni horloge ni tirage`, () => {
      const texte = readFileSync(f, 'utf8');
      for (const [motif, nom] of INTERDITS)
        expect(motif.test(texte), `${f} appelle ${nom}`).toBe(false);
    });
  }

  it('REQ-QA-015 : chaque module porte un export par défaut, et ils sont chargés dans l’ordre du préfixe', async () => {
    const noms = (await modulesDeSemis()).map((m) => m.nom);
    expect(noms.length).toBeGreaterThan(0);
    expect([...noms].sort()).toEqual(noms);
    for (const n of noms) expect(n).toMatch(/^\d{2}-[a-z0-9-]+$/);
  });

  it('REQ-QA-015 : l’uuid v5 est stable, de version 5, et change avec le nom', () => {
    const a = uuidV5('console/administrateur-de-preview');
    expect(uuidV5('console/administrateur-de-preview')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidV5('console/autre')).not.toBe(a);
    // Le vecteur officiel de la RFC 4122 (annexe B, espace DNS, « www.example.com »).
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    );
    expect(ESPACE_DE_NOMS).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('REQ-QA-015 : une valeur de vocabulaire écrite par un module est lue dans l’enum de Prisma, jamais tapée', () => {
    const texte = readFileSync('prisma/seed/06-console.ts', 'utf8');
    expect(texte).toMatch(/role: ConsoleRoleEnum\.admin/);
    expect(texte).not.toMatch(/role:\s*'[a-z]+'/);
  });
});

describe('REQ-QA-015 — TÉMOIN À DEUX FACES sur le plafond : jamais trois previews', () => {
  const plafond = PARAMETRES_PREVIEW.PREVIEWS_SIMULTANEES_MAX.valeur;

  it('REQ-QA-015 : le plafond vaut deux, avec sa source', () => {
    expect(plafond).toBe(2);
    expect(PARAMETRES_PREVIEW.PREVIEWS_SIMULTANEES_MAX.source).toMatch(/HYP-E1-5/);
  });

  it('REQ-QA-015 : trois demandes simultanées, sérialisées, laissent deux previews vivantes et une en attente', () => {
    const vivantes: string[] = [];
    const decisions: Decision[] = [];
    for (const pr of [101, 102, 103]) {
      const d = decider(vivantes, pr);
      decisions.push(d);
      if (d === 'creer') vivantes.push(nomDePreview(pr));
    }
    expect(decisions).toEqual(['creer', 'creer', 'attendre']);
    expect(vivantes).toHaveLength(2);
  });

  it('REQ-QA-015 : une PR qui a déjà sa preview la met à jour, même au plafond', () => {
    expect(decider([nomDePreview(101), nomDePreview(102)], 102)).toBe('mettre_a_jour');
  });

  it('REQ-QA-015 : une preview détruite libère une place', () => {
    expect(decider([nomDePreview(102)], 103)).toBe('creer');
  });

  it('REQ-QA-015 : le nom d’une preview dit sa PR, et seulement elle', () => {
    expect(nomDePreview(7)).toBe('axion-partners-pr-7');
    expect(() => nomDePreview(0)).toThrow();
  });
});

describe('REQ-QA-015 — le workflow de preview tient les six conditions', () => {
  type Etape = {
    run?: string;
    uses?: string;
    with?: Record<string, unknown>;
    env?: Record<string, string>;
  };
  type Job = {
    if?: string;
    needs?: string | string[];
    permissions?: Record<string, string>;
    concurrency?: { group?: string; ['cancel-in-progress']?: unknown };
    steps?: Etape[];
  };
  let wf: { on?: Record<string, unknown>; jobs?: Record<string, Job> } = {};
  let texte = '';
  beforeAll(async () => {
    texte = readFileSync('.github/workflows/preview.yml', 'utf8');
    wf = (await lireYaml(texte)) as typeof wf;
  });
  const job = (n: string) => wf.jobs?.[n] ?? {};
  const secretsDe = (j: Job) => JSON.stringify(j).match(/secrets\.[A-Z_]+/g) ?? [];

  it('REQ-QA-015 : (1) publier-image ne tourne que pour une PR du même dépôt, après le workflow Image réussi', () => {
    expect(Object.keys(wf.on ?? {}).sort()).toEqual(['pull_request_target', 'workflow_run']);
    const si = job('publier-image').if ?? '';
    expect(si).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository'
    );
    expect(si).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(si).toContain("github.event.workflow_run.event == 'pull_request'");
  });

  it('REQ-QA-015 : (2) publier-image ne lit que GITHUB_TOKEN, et ne pousse que dans le paquet de preview', () => {
    expect(job('publier-image').permissions).toEqual({ contents: 'read', packages: 'write' });
    expect([...new Set(secretsDe(job('publier-image')))]).toEqual(['secrets.GITHUB_TOKEN']);
    const runs = (job('publier-image').steps ?? []).map((s) => s.run).filter(Boolean);
    expect(runs).toContain('pnpm preview:publier-image');
  });

  it('REQ-QA-015 : (4) deployer est séparé, n’extrait que la branche principale, et seul détient le jeton de preview', () => {
    const d = job('deployer');
    expect([d.needs].flat()).toContain('publier-image');
    // `pull-requests: write` : l'URL de la preview est commentée sur la PR (acceptation, point 2).
    expect(d.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    const checkout = (d.steps ?? []).find((s) => s.uses?.startsWith('actions/checkout'));
    expect(checkout?.with?.ref).toBe('${{ github.event.repository.default_branch }}');
    expect([...new Set(secretsDe(d))].sort()).toEqual([
      'secrets.COOLIFY_PREVIEW_TOKEN',
      'secrets.COOLIFY_PREVIEW_URL',
    ]);
    expect(secretsDe(job('publier-image'))).not.toContain('secrets.COOLIFY_PREVIEW_TOKEN');
  });

  it('REQ-QA-015 : (4) deployer et detruire vivent dans l’environnement `preview`, jamais dans celui de production', () => {
    expect((job('deployer') as { environment?: unknown }).environment).toBe('preview');
    expect((job('detruire') as { environment?: unknown }).environment).toBe('preview');
    expect(texte).not.toMatch(/secrets.COOLIFY_URL|secrets.COOLIFY_API_TOKEN/);
  });

  it('REQ-QA-015 : (5) une seule décision à la fois, jamais annulée', () => {
    expect(job('deployer').concurrency?.group).toBe('preview-attribution');
    expect(String(job('deployer').concurrency?.['cancel-in-progress'])).toBe('false');
  });

  it('REQ-QA-015 : (5) à la fermeture de la PR, detruire supprime la preview sans extraire le code de la PR', () => {
    const d = job('detruire');
    expect(d.if).toContain("github.event.action == 'closed'");
    const checkout = (d.steps ?? []).find((s) => s.uses?.startsWith('actions/checkout'));
    expect(checkout?.with?.ref).toBe('${{ github.event.repository.default_branch }}');
    expect((d.steps ?? []).map((s) => s.run)).toContain('pnpm preview:detruire');
    expect(d.permissions).toEqual({ contents: 'read', packages: 'write' });
  });

  it('REQ-QA-015 : aucun job n’EXTRAIT le code de la PR, sauf publier-image, qui n’a que GITHUB_TOKEN', () => {
    for (const [nom, j] of Object.entries(wf.jobs ?? {})) {
      if (nom === 'publier-image') continue;
      for (const s of (j.steps ?? []).filter((e) => e.uses?.startsWith('actions/checkout'))) {
        expect(s.with?.ref, `${nom} extrait autre chose que la branche principale`).toBe(
          '${{ github.event.repository.default_branch }}'
        );
      }
    }
  });

  it('REQ-QA-015 : aucune étape n’est tolérée en échec', () => {
    expect(texte).not.toMatch(/continue-on-error/);
  });
});

describe('REQ-QA-015 — la preview est semée à son démarrage, et seule la preview peut l’être', () => {
  const entree = (env: Record<string, string>) =>
    spawnSync('sh', ['docker-entrypoint.sh', 'true'], {
      encoding: 'utf8',
      // SKIP_MIGRATE=1 : ce témoin juge la garde du semis, pas la migration (aucune base ici).
      // Un environnement MINIMAL, délibérément : rien du poste ne doit décider du verdict. NODE_ENV
      // vaut ce que l'image de production pose (Dockerfile).
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', SKIP_MIGRATE: '1', ...env },
    });

  it('REQ-QA-015 : un instant de semis hors preview refuse le démarrage, en le nommant', () => {
    const r = entree({ SEMEUR_INSTANT: '2026-01-01T00:00:00.000Z', PARTNERS_ENV: 'production' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/preview/);
  });

  it('REQ-QA-015 : sans instant de semis, l’entrée lance le serveur comme avant', () => {
    expect(entree({ PARTNERS_ENV: 'production' }).status).toBe(0);
  });

  it('REQ-QA-015 : la preview reçoit un instant de semis FIXE, le même pour toutes', () => {
    expect(PARAMETRES_PREVIEW.INSTANT_DE_SEMIS.valeur).toMatch(
      /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/
    );
    expect(readFileSync('scripts/preview/preview.ts', 'utf8')).toMatch(/key: 'SEMEUR_INSTANT'/);
  });
});
