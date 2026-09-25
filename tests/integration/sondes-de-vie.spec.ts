// @req REQ-QA-019
// @req REQ-QA-020
/**
 * sondes-de-vie.spec.ts — QA-T04 : la vie, la disponibilité, et la migration bloquante.
 *
 * REQ-QA-020. `livez` répond 200 dès que le serveur répond ; `readyz` répond 503 si l'environnement,
 * la base, le cache OU une migration en attente est en défaut, et 200 sinon. Chaque panne est jouée
 * CONTRE UN VRAI CONTENEUR, seule, et la réponse doit NOMMER le sous-système fautif — et lui seul
 * quand il est seul en cause. Puis tout est remis en place, et `readyz` rend 200 : une sonde qui
 * rend 503 en toute circonstance passerait les trois cas de panne sans rien mesurer.
 * `livez` est interrogée dans CHAQUE situation et rend 200 dans chacune.
 *
 * REQ-QA-019. L'entrée de l'image lance `prisma migrate deploy` AVANT le serveur, en mode bloquant :
 * un échec sort en code non nul en moins de 60 s et le serveur n'est jamais lancé. L'échappatoire
 * `SKIP_MIGRATE=1` ne s'écrit que dans l'entrée (qui la lit) et dans le runbook de retour arrière (qui
 * l'emploie) : ce fichier le vérifie sur les fichiers suivis. Et le `HEALTHCHECK` de l'image interroge
 * `readyz`, jamais `livez` — une sonde de vie déclare saine une instance qui ne sait pas servir.
 *
 * CE QUI TOURNE SANS DÉMON DOCKER : le bloc de l'entrée (base injoignable, échappatoire, garde
 * statique). CE QUI L'EXIGE : le bloc des pannes, et la migration cassée contre une vraie base. Le
 * harnais LÈVE en nommant le démon absent — jamais un saut.
 *
 * Aucune lecture de l'environnement du poste ici : les sous-processus reçoivent celui que le harnais
 * construit (`environnementDeLHote`), et l'environnement jugé par `readyz` est POSÉ par le test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET as livez } from '../../src/app/api/livez/route';
import {
  SOUS_SYSTEMES,
  fermerSondes,
  repondreDisponibilite,
  type EtatDisponibilite,
} from '../../src/server/sante/disponibilite';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { fichiersSuivis } from '../../scripts/lot/fichiers-suivis';
import {
  RACINE,
  demarrerBase,
  demarrerCache,
  environnementDeLHote,
  type Base,
  type Cache,
} from './harnais';

const CLE_HEX = 'PII_ENCRYPTION_KEY';
const ENTREE = join(RACINE, 'docker-entrypoint.sh');
const MIGRATIONS = join(RACINE, 'prisma', 'migrations');
/** Un port où rien n'écoute : la base ou le cache « coupé », sans toucher au conteneur partagé. */
const BASE_COUPEE = 'postgresql://partners@127.0.0.1:1/partners';
const CACHE_COUPE = 'redis://127.0.0.1:1';

const BAC = mkdtempSync(join(tmpdir(), 'qat04-sondes-'));
afterAll(() => rmSync(BAC, { recursive: true, force: true }));

function secretsAuHasard(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const nom of NOMS_DES_SECRETS) {
    env[nom] = nom === CLE_HEX ? randomBytes(32).toString('hex') : randomBytes(24).toString('hex');
  }
  return env;
}

interface Sortie {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

/** L'entrée de l'image, lancée par `sh`, suivie d'une commande témoin qui écrit `serveur lance`. */
function lancerEntree(cwd: string, poses: Record<string, string>): Sortie {
  const debut = Date.now();
  const r = spawnSync(
    'sh',
    [ENTREE, process.execPath, '-e', "require('node:fs').writeSync(1, 'serveur lance')"],
    { cwd, env: environnementDeLHote(poses), encoding: 'utf8', timeout: 90_000 }
  );
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ms: Date.now() - debut };
}

async function lire(r: Response): Promise<{ statut: number; corps: EtatDisponibilite }> {
  return { statut: r.status, corps: (await r.json()) as EtatDisponibilite };
}

describe('REQ-QA-019 — l’entrée de l’image migre en bloquant, et son échappatoire est confinée', () => {
  it('REQ-QA-019 : base injoignable — l’entrée sort en non nul en moins de 60 s, sans lancer le serveur', () => {
    const s = lancerEntree(RACINE, { DATABASE_URL: BASE_COUPEE });
    console.log(`entrée sur base injoignable : code ${s.code}, ${s.ms} ms`);
    expect(s.code).not.toBe(0);
    expect(s.code, 'tué par le délai du test : l’entrée n’a pas refusé d’elle-même').not.toBeNull();
    expect(s.ms).toBeLessThan(60_000);
    expect(s.stdout).not.toContain('serveur lance');
    expect(s.stderr).toContain('migration');
  });

  it('REQ-QA-019 : SKIP_MIGRATE=1 saute la migration, le dit sur la sortie d’erreur, et lance le serveur', () => {
    const s = lancerEntree(RACINE, { DATABASE_URL: BASE_COUPEE, SKIP_MIGRATE: '1' });
    expect(s.code).toBe(0);
    expect(s.stdout).toContain('serveur lance');
    expect(s.stderr).toContain('SKIP_MIGRATE=1');
    // Toute autre valeur n'est PAS l'échappatoire : la migration est tentée, et elle échoue ici.
    const presque = lancerEntree(RACINE, { DATABASE_URL: BASE_COUPEE, SKIP_MIGRATE: 'true' });
    expect(presque.code).not.toBe(0);
    expect(presque.stdout).not.toContain('serveur lance');
  });

  it('REQ-QA-019 : SKIP_MIGRATE ne s’écrit que dans l’entrée et le runbook de retour arrière, parmi les fichiers qui s’exécutent ou se déploient', () => {
    const RUNBOOK = 'docs/runbooks/retour-arriere.md';
    const admis = new Set(['docker-entrypoint.sh', RUNBOOK]);
    // Ce qui s'exécute ou se déploie : le code, les scripts, l'image, les workflows, les runbooks.
    const executables = fichiersSuivis().filter(
      (f) =>
        /^(src|scripts|\.github|docs\/runbooks|prisma)\//.test(f) ||
        /^(Dockerfile|docker-entrypoint\.sh|package\.json|next\.config\.ts)$/.test(f)
    );
    console.log(`${executables.length} fichiers suivis confrontés.`);
    expect(executables.length).toBeGreaterThan(20);
    expect(executables).toContain(RUNBOOK);
    const porteurs = executables.filter((f) =>
      readFileSync(join(RACINE, f), 'utf8').includes('SKIP_MIGRATE')
    );
    expect(porteurs.filter((f) => !admis.has(f))).toEqual([]);
    expect(porteurs.sort()).toEqual([...admis].sort());
    expect(readFileSync(join(RACINE, RUNBOOK), 'utf8')).toContain('SKIP_MIGRATE=1');
  });

  it('REQ-QA-020 : le HEALTHCHECK de l’image interroge readyz, jamais livez', () => {
    const dockerfile = readFileSync(join(RACINE, 'Dockerfile'), 'utf8');
    const sondes = dockerfile.split(/\r?\n/).filter((l) => /^\s*HEALTHCHECK\b/.test(l));
    expect(sondes).toHaveLength(1);
    expect(sondes[0]).toContain('/api/readyz');
    expect(dockerfile).not.toMatch(/HEALTHCHECK[^\n]*livez/);
    expect(dockerfile).toMatch(/^ENTRYPOINT \[.*docker-entrypoint\.sh.*\]$/m);
  });
});

describe('REQ-QA-020 — readyz nomme le sous-système en défaut, livez répond toujours', () => {
  let base: Base;
  let cache: Cache;
  let sain: Record<string, string>;

  beforeAll(async () => {
    [base, cache] = await Promise.all([demarrerBase(), demarrerCache()]);
    sain = {
      ...secretsAuHasard(),
      DATABASE_URL: base.url,
      REDIS_URL: cache.url,
      NOTIFY_SINK: 'true',
    };
  }, 240_000);

  afterAll(async () => {
    await fermerSondes();
    await base?.arreter();
    await cache?.arreter();
  }, 120_000);

  async function juger(env: Record<string, string | undefined>, dossierMigrations = MIGRATIONS) {
    const vie = await livez();
    expect(vie.status, 'livez dans cette situation').toBe(200);
    return lire(await repondreDisponibilite({ env, dossierMigrations }));
  }

  it('REQ-QA-020 : tout est en place — readyz 200, chaque sous-système ok, livez 200', async () => {
    const { statut, corps } = await juger(sain);
    expect(statut).toBe(200);
    expect(corps.pret).toBe(true);
    expect(corps.enDefaut).toEqual([]);
    expect(Object.keys(corps.sousSystemes).sort()).toEqual([...SOUS_SYSTEMES].sort());
  });

  it('REQ-QA-020 : base coupée — readyz 503 et nomme la base ; le cache et l’environnement restent ok', async () => {
    const { statut, corps } = await juger({ ...sain, DATABASE_URL: BASE_COUPEE });
    expect(statut).toBe(503);
    expect(corps.pret).toBe(false);
    expect(corps.enDefaut).toContain('base');
    expect(corps.sousSystemes.cache).toBe('ok');
    expect(corps.sousSystemes.environnement).toBe('ok');
    expect(JSON.stringify(corps)).not.toContain('127.0.0.1');
  });

  it('REQ-QA-020 : cache coupé — readyz 503 et nomme le cache, lui seul', async () => {
    const { statut, corps } = await juger({ ...sain, REDIS_URL: CACHE_COUPE });
    expect(statut).toBe(503);
    expect(corps.enDefaut).toEqual(['cache']);
  });

  it('REQ-QA-020 : une migration en attente — readyz 503 et nomme les migrations, elles seules', async () => {
    const dossier = join(BAC, 'migrations-en-attente');
    cpSync(MIGRATIONS, dossier, { recursive: true });
    mkdirSync(join(dossier, '29991231000000_en_attente'));
    writeFileSync(join(dossier, '29991231000000_en_attente', 'migration.sql'), 'SELECT 1;\n');
    const { statut, corps } = await juger(sain, dossier);
    expect(statut).toBe(503);
    expect(corps.enDefaut).toEqual(['migrations']);
  });

  it('REQ-QA-020 : environnement invalide — readyz 503 et nomme l’environnement, lui seul', async () => {
    const env: Record<string, string | undefined> = { ...sain };
    delete env[NOMS_DES_SECRETS[0] ?? ''];
    const { statut, corps } = await juger(env);
    expect(statut).toBe(503);
    expect(corps.enDefaut).toEqual(['environnement']);
  });

  it('REQ-QA-020 : tout remis en place — readyz rend de nouveau 200', async () => {
    const { statut, corps } = await juger(sain);
    expect(statut).toBe(200);
    expect(corps.enDefaut).toEqual([]);
  });

  it('REQ-QA-019 : une migration cassée contre une vraie base — l’entrée sort en non nul, sans lancer le serveur', () => {
    const arbre = join(BAC, 'arbre-casse');
    mkdirSync(join(arbre, 'prisma'), { recursive: true });
    cpSync(join(RACINE, 'prisma', 'schema.prisma'), join(arbre, 'prisma', 'schema.prisma'));
    cpSync(MIGRATIONS, join(arbre, 'prisma', 'migrations'), { recursive: true });
    mkdirSync(join(arbre, 'prisma', 'migrations', '29991231000001_cassee'));
    writeFileSync(
      join(arbre, 'prisma', 'migrations', '29991231000001_cassee', 'migration.sql'),
      'ALTER TABLE table_qui_n_existe_pas ADD COLUMN x INT;\n'
    );
    const s = lancerEntree(arbre, { DATABASE_URL: base.url });
    console.log(`entrée sur migration cassée : code ${s.code}, ${s.ms} ms`);
    expect(s.code).not.toBe(0);
    expect(s.code).not.toBeNull();
    expect(s.ms).toBeLessThan(60_000);
    expect(s.stdout).not.toContain('serveur lance');
  });
});
