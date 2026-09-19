// @req REQ-QA-006
/**
 * QA-T02 — le harnais d'intégration, jugé par ce qu'il FAIT, pas par ce qu'il dit.
 *
 * R1 — L'environnement du sous-processus `prisma` se CONSTRUIT : une source qui porte des
 * variables piégées (une URL de base du poste, une URL d'ombre, un réglage `PRISMA_*`) n'en laisse
 * traverser aucune ; l'URL de base reçue est celle du conteneur ; les variables admises passent.
 * R2 — Démon injoignable : la commande `test:integration` du dépôt sort en code non nul, et chaque
 * fichier d'intégration échoue en NOMMANT le motif. Aucun ne passe.
 * R3, R5 — Isolation par fichier : deux fichiers posent le même SIREN sous contrainte d'unicité et
 * la même clé de cache ; chacun ne voit que les siens. Le contre-témoin prouve que la contrainte
 * mord dans UNE base. Le résumé imprime le compte des fichiers exécutés.
 * R4 — Le schéma est celui du disque : une migration appliquée par dossier de `prisma/migrations`.
 * R6, R8 — Garde statique sur tout le dossier d'intégration : aucun test sauté ni isolé, aucune
 * lecture de l'environnement de l'hôte hors du harnais, chaque faute nommée `fichier:ligne`.
 * R7 — L'étape « Tests » de Gate A atteint le harnais : `pnpm test` collecte chaque fichier
 * d'intégration du disque, et une configuration privée du motif fait rougir le témoin.
 *
 * ⚠️ Ce fichier est lui-même lu par la garde statique : les jetons qu'elle refuse y sont écrits en
 * morceaux (`P`, `SAUTS`), jamais en toutes lettres. C'est voulu : aucune exemption ne le protège.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import configuration from '../../vitest.config';
import {
  IMAGE_BASE,
  IMAGE_CACHE,
  RACINE,
  VARIABLES_ADMISES,
  demarrerBase,
  demarrerCache,
  environnementDeLHote,
  environnementDuSousProcessus,
  type Base,
  type Cache,
} from './harnais';

// ── Constantes et outils ────────────────────────────────────────────────────────────────────────

const DOSSIER = 'tests/integration';
const HARNAIS = `${DOSSIER}/harnais.ts`;
const SOI = `${DOSSIER}/harnais-testcontainers.spec.ts`;
const VITEST = join(RACINE, 'node_modules/vitest/vitest.mjs');
/** Un SIREN valide (clé de Luhn), le même pour les deux fichiers du bac. */
const SIREN = '552100554';
/** Un démon qui n'existe pas : port 9 (discard), jamais servi par Docker. */
const DEMON_ABSENT = 'tcp://127.0.0.1:9';
const MOTIF_ABSENCE = 'démon Docker injoignable';

const enBarres = (chemin: string) => chemin.replace(/\\/g, '/');

/** Les fichiers d'un dossier, récursivement, en chemins relatifs à `racine`, triés. */
function fichiersSous(racine: string, dossier: string): string[] {
  const absolu = join(racine, dossier);
  if (!existsSync(absolu)) return [];
  return readdirSync(absolu, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) =>
      enBarres(join(e.parentPath, e.name)).slice(enBarres(racine).replace(/\/$/, '').length + 1)
    )
    .sort();
}

/** Les fichiers de test d'intégration présents sur le DISQUE. */
const fichiersDIntegration = () =>
  fichiersSous(RACINE, DOSSIER).filter((f) => /\.(test|spec)\.tsx?$/.test(f));

/** Lance vitest en sous-processus, sous l'environnement construit par le harnais, sans couleurs. */
function lancerVitest(args: string[], poses: Record<string, string> = {}, cwd: string = RACINE) {
  const r = spawnSync(process.execPath, [VITEST, ...args], {
    cwd,
    env: environnementDeLHote({ NO_COLOR: '1', ...poses }),
    encoding: 'utf8',
    timeout: 600_000,
  });
  return { code: r.status, stdout: r.stdout ?? '', sortie: `${r.stdout}${r.stderr}` };
}

/** Un dossier jetable sous le dossier temporaire du système. */
const nouveauBac = () => mkdtempSync(join(tmpdir(), 'qat02-'));

/** Retire un bac — jamais un dossier qui porterait un `node_modules`. */
function retirerBac(bac: string): void {
  if (existsSync(join(bac, 'node_modules'))) {
    throw new Error(`bac ${bac} : un node_modules y est apparu, il n'est pas retiré`);
  }
  rmSync(bac, { recursive: true, force: true });
}

/** Un bac vitest : des fichiers de test à la racine, et une configuration qui ne lit qu'eux. */
function bacVitest(fichiers: Record<string, string>): string {
  const bac = nouveauBac();
  for (const [nom, contenu] of Object.entries(fichiers)) writeFileSync(join(bac, nom), contenu);
  const config = {
    cacheDir: join(bac, '.vite'),
    test: {
      root: bac,
      include: ['*.spec.ts'],
      globals: true,
      cache: false,
      testTimeout: 60_000,
      hookTimeout: 180_000,
      poolOptions: { forks: { minForks: 1, maxForks: 3 } },
    },
  };
  writeFileSync(join(bac, 'vitest.config.mjs'), `export default ${JSON.stringify(config)};\n`);
  return bac;
}

const IMPORT_HARNAIS = JSON.stringify(enBarres(join(RACINE, HARNAIS)));

/** Un fichier de bac : sa base et son cache, le même SIREN et la même clé que son voisin. */
const fichierDIsolation = (valeur: string) => `
import { demarrerBase, demarrerCache } from ${IMPORT_HARNAIS};
let base;
let cache;
beforeAll(async () => {
  [base, cache] = await Promise.all([demarrerBase(), demarrerCache()]);
}, 180000);
afterAll(async () => {
  await base?.arreter();
  await cache?.arreter();
});
it('isolation ${valeur}', async () => {
  await base.prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS t (siren text UNIQUE)');
  await base.prisma.$executeRawUnsafe("INSERT INTO t (siren) VALUES ('${SIREN}')");
  expect(await cache.commande(['GET', 'cle'])).toBe('');
  expect(await cache.commande(['SET', 'cle', '${valeur}'])).toBe('OK');
  expect(await cache.commande(['GET', 'cle'])).toBe('${valeur}');
});
`;

// ── La garde statique (R6, R8) ──────────────────────────────────────────────────────────────────

/** Écrits en morceaux : ce fichier est lu par la garde qu'il définit. */
const P = 'proc' + 'ess';
const SAUTS = ['sk' + 'ip', 'sk' + 'ipIf', 'run' + 'If', 'to' + 'do', 'on' + 'ly'];
const ALTERNANCE = SAUTS.join('|');
const DOTENV = 'dot' + 'env';
const LOAD_ENV_FILE = 'load' + 'EnvFile';
const ENV_FILE = '--env' + '-file';
const META = 'import' + '.meta';
/** La seule forme admise, et seulement dans le harnais : l'hôte lu à travers le filtre. */
const LECTURE_ADMISE = `environnementDuSousProcessus(${P}.env,`;

const REGLES: readonly { motif: string; re: RegExp }[] = [
  {
    motif: `lecture de l'environnement de l'hôte (objet ${P})`,
    re: new RegExp(`\\b${P}\\b(?!\\s*\\.\\s*execPath\\b)`, 'g'),
  },
  {
    motif: `lecture de l'environnement de l'hôte (méta-données du module)`,
    re: new RegExp(`\\bimport\\s*\\.\\s*meta\\b(?!\\s*\\.\\s*url\\b)`, 'g'),
  },
  {
    motif: `chargement d'un fichier d'environnement`,
    re: new RegExp(`${DOTENV}|${LOAD_ENV_FILE}|${ENV_FILE}`, 'g'),
  },
  { motif: 'test sauté ou isolé', re: new RegExp(`\\.\\s*(?:${ALTERNANCE})\\b`, 'g') },
  {
    motif: 'test sauté ou isolé (accès calculé)',
    re: new RegExp(`\\[\\s*['"\`](?:${ALTERNANCE})['"\`]\\s*\\]`, 'g'),
  },
  { motif: 'test sauté ou isolé (option)', re: new RegExp(`\\b(?:${ALTERNANCE})\\s*:`, 'g') },
];

/**
 * Lit CHAQUE fichier du dossier d'intégration sous `racine`, et rend ce qu'il a lu et ce qu'il y a
 * trouvé. Une faute par occurrence, nommée `fichier:ligne — motif`.
 */
function gardeStatique(racine: string): { lus: string[]; fautes: string[] } {
  const lus = fichiersSous(racine, DOSSIER);
  const fautes: string[] = [];
  for (const fichier of lus) {
    const lignes = readFileSync(join(racine, fichier), 'utf8').split(/\r?\n/);
    lignes.forEach((ligne, i) => {
      for (const { motif, re } of REGLES) {
        re.lastIndex = 0;
        for (let m = re.exec(ligne); m !== null; m = re.exec(ligne)) {
          const admise =
            fichier === HARNAIS &&
            ligne.slice(0, m.index + `${P}.env,`.length).endsWith(LECTURE_ADMISE);
          if (!admise) fautes.push(`${fichier}:${i + 1} — ${motif}`);
        }
      }
    });
  }
  return { lus, fautes };
}

/** Les numéros de ligne fautifs d'un fichier, dans l'ordre, sans doublon. */
const lignesFautives = (fautes: string[], fichier: string) => [
  ...new Set(
    fautes
      .filter((f) => f.startsWith(`${fichier}:`))
      .map((f) => Number(f.slice(fichier.length + 1).split(' ')[0]))
  ),
];

// ── R1 ──────────────────────────────────────────────────────────────────────────────────────────

const URL_CONTENEUR = 'postgresql://test:test@localhost:55432/test';

/** Les pièges sont posés AU MILIEU de la source : un filtre qui ne lit que le début les laisse. */
const SOURCE_PIEGEE: Record<string, string> = {
  PATH: '/usr/bin',
  SystemRoot: 'C:\\Windows',
  PRISMA_PIEGE: '1',
  SHADOW_DATABASE_URL: 'postgresql://ombre@localhost:1/ombre',
  DATABASE_URL: 'postgresql://piege@localhost:1/piege',
  NODE_OPTIONS: '--require ./piege.js',
  TEMP: '/tmp',
};
const PIEGES = ['PRISMA_PIEGE', 'SHADOW_DATABASE_URL', 'NODE_OPTIONS'];

describe('REQ-QA-006 — le sous-processus prisma ne reçoit que ce que le harnais construit', () => {
  it('REQ-QA-006 — aucune variable piégée de la source ne traverse, et la base est celle du conteneur', () => {
    const env = environnementDuSousProcessus(SOURCE_PIEGEE, { DATABASE_URL: URL_CONTENEUR });
    const traversees = PIEGES.filter((nom) => env[nom] !== undefined);
    expect(traversees, `variables de l'hôte qui traversent : ${traversees.join(', ')}`).toEqual([]);
    expect(env.DATABASE_URL).toBe(URL_CONTENEUR);
  });

  it('REQ-QA-006 — chaque variable reçue est admise ou posée par le harnais, et les admises passent', () => {
    const env = environnementDuSousProcessus(SOURCE_PIEGEE, { DATABASE_URL: URL_CONTENEUR });
    const admises: readonly string[] = VARIABLES_ADMISES;
    const intruses = Object.keys(env).filter(
      (nom) =>
        !admises.includes(nom) && !['DATABASE_URL', 'PRISMA_HIDE_UPDATE_MESSAGE'].includes(nom)
    );
    expect(intruses, `variables reçues sans être admises : ${intruses.join(', ')}`).toEqual([]);
    // Une liste blanche vidée laisserait le sous-processus sans PATH : elle doit se voir ICI.
    expect(env).toMatchObject({ PATH: '/usr/bin', SystemRoot: 'C:\\Windows', TEMP: '/tmp' });
  });
});

// ── R6, R8 ──────────────────────────────────────────────────────────────────────────────────────

describe('REQ-QA-006 — garde statique : aucun test sauté, aucune lecture de l’environnement de l’hôte', () => {
  it('REQ-QA-006 — le dossier d’intégration du dépôt est lu en entier et ne porte aucune faute', () => {
    const { lus, fautes } = gardeStatique(RACINE);
    console.log(
      `garde statique : ${lus.length} fichier(s) lu(s) sous ${DOSSIER}, ${fautes.length} faute(s)`
    );
    expect(lus.length).toBeGreaterThan(0);
    expect(lus).toEqual(expect.arrayContaining([HARNAIS, SOI]));
    expect(fautes, fautes.join('\n')).toEqual([]);
  });

  it('REQ-QA-006 — chaque saut, chaque isolement, chaque lecture d’environnement est nommé fichier:ligne', () => {
    const bac = nouveauBac();
    try {
      const dossier = join(bac, DOSSIER);
      mkdirSync(dossier, { recursive: true });
      const [skip, skipIf, runIf, todo, only] = SAUTS;
      // Le fichier fautif est au MILIEU : une garde qui ne lit que le premier ou le dernier le rate.
      const fautif = [
        `it.${skipIf}(true)('a', () => {});`,
        `it.${only}('b', () => {});`,
        `describe.${skip}('c', () => {});`,
        `it.concurrent.${skip}('d', () => {});`,
        `it['${only}']('e', () => {});`,
        `it('f', { ${skip}: true }, () => {});`,
        `it.${todo}('g');`,
        `describe.${runIf}(false)('h', () => {});`,
        `const { X } = ${P}.env;`,
        `const y = ${P}.env['X'];`,
        `const z = { ...${P}.env };`,
        `const w = ${META}.env;`,
        `import '${DOTENV}/config';`,
        `${P}.${LOAD_ENV_FILE}();`,
        `import { env } from 'node:${P}';`,
        `const g = globalThis.${P};`,
        `spawnSync('node', ['${ENV_FILE}=.env', 'x.js']);`,
        `const h = environnementDuSousProcessus(${P}.env, {});`,
      ];
      writeFileSync(join(dossier, 'a-propre.spec.ts'), `it('a', () => expect(1).toBe(1));\n`);
      writeFileSync(join(dossier, 'b-fautif.spec.ts'), fautif.join('\n'));
      writeFileSync(
        join(dossier, 'c-propre.spec.ts'),
        `spawnSync(${P}.execPath, []);\nconst u = new URL('.', ${META}.url);\n`
      );
      writeFileSync(
        join(dossier, 'harnais.ts'),
        [
          `const e = environnementDuSousProcessus(${P}.env, poses);`,
          `const tout = { ...${P}.env };`,
        ].join('\n')
      );

      const { lus, fautes } = gardeStatique(bac);
      console.log(
        `bac : ${lus.length} fichier(s) lu(s), ${fautes.length} faute(s)\n${fautes.join('\n')}`
      );
      expect(lus).toEqual([
        `${DOSSIER}/a-propre.spec.ts`,
        `${DOSSIER}/b-fautif.spec.ts`,
        `${DOSSIER}/c-propre.spec.ts`,
        HARNAIS,
      ]);
      expect(lignesFautives(fautes, `${DOSSIER}/b-fautif.spec.ts`)).toEqual(
        fautif.map((_, i) => i + 1)
      );
      expect(lignesFautives(fautes, `${DOSSIER}/a-propre.spec.ts`)).toEqual([]);
      expect(lignesFautives(fautes, `${DOSSIER}/c-propre.spec.ts`)).toEqual([]);
      // Dans le harnais, la lecture filtrée est admise ; l'étalement de l'hôte ne l'est pas.
      expect(lignesFautives(fautes, HARNAIS)).toEqual([2]);
    } finally {
      retirerBac(bac);
    }
  });

  it('REQ-QA-006 — une passe d’intégration qui ne trouve aucun fichier sort en code non nul', () => {
    const { code, sortie } = lancerVitest(['run', `${DOSSIER}-inexistant`]);
    expect(sortie).toMatch(/No test files found/);
    expect(code).not.toBe(0);
  }, 120_000);
});

// ── R7 ──────────────────────────────────────────────────────────────────────────────────────────

/** Le motif d'intégration de la configuration du dépôt, tel que DM-01 l'a écrit. */
const MOTIF_INTEGRATION = (configuration.test?.include ?? []).find((m) =>
  m.startsWith(`${DOSSIER}/`)
);

/** Ce que `vitest list` collecte sous une configuration, en chemins relatifs à la racine. */
function fichiersCollectes(cheminConfig: string): string[] {
  const { code, stdout, sortie } = lancerVitest([
    'list',
    '--filesOnly',
    '--json',
    '--config',
    cheminConfig,
  ]);
  if (code !== 0) throw new Error(`vitest list a échoué (code ${code}) :\n${sortie}`);
  const liste = JSON.parse(stdout.slice(stdout.indexOf('['))) as { file: string }[];
  const racine = enBarres(RACINE).replace(/\/$/, '');
  return liste.map(({ file }) => enBarres(file).slice(racine.length + 1));
}

/** Les fautes de collecte : le motif absent de l'include, puis chaque fichier du disque non collecté. */
function fautesDeCollecte(cheminConfig: string, include: readonly string[]): string[] {
  const fautes: string[] = [];
  if (MOTIF_INTEGRATION === undefined || !include.includes(MOTIF_INTEGRATION)) {
    fautes.push(
      `motif d'intégration absent de l'include : ${MOTIF_INTEGRATION ?? `${DOSSIER}/**`}`
    );
  }
  const collectes = new Set(fichiersCollectes(cheminConfig));
  for (const f of fichiersDIntegration()) if (!collectes.has(f)) fautes.push(`non collecté : ${f}`);
  return fautes;
}

describe('REQ-QA-006 — l’étape « Tests » de Gate A atteint le harnais', () => {
  it('REQ-QA-006 — la configuration du dépôt collecte chaque fichier d’intégration du disque', () => {
    const integration = fichiersDIntegration();
    console.log(`collecte : ${integration.length} fichier(s) d'intégration sur le disque`);
    expect(integration.length).toBeGreaterThan(0);
    const fautes = fautesDeCollecte(
      join(RACINE, 'vitest.config.ts'),
      configuration.test?.include ?? []
    );
    expect(fautes, fautes.join('\n')).toEqual([]);
  }, 120_000);

  it('REQ-QA-006 — une configuration privée du motif d’intégration fait rougir le témoin, qui le nomme', () => {
    const bac = nouveauBac();
    try {
      const include = (configuration.test?.include ?? []).filter((m) => m !== MOTIF_INTEGRATION);
      const config = { test: { root: RACINE, include, exclude: configuration.test?.exclude } };
      const chemin = join(bac, 'vitest.config.mjs');
      writeFileSync(chemin, `export default ${JSON.stringify(config)};\n`);
      const fautes = fautesDeCollecte(chemin, include);
      expect(fautes[0]).toBe(`motif d'intégration absent de l'include : ${MOTIF_INTEGRATION}`);
      expect(fautes.slice(1)).toEqual(fichiersDIntegration().map((f) => `non collecté : ${f}`));
    } finally {
      retirerBac(bac);
    }
  }, 120_000);

  it('REQ-QA-006 — `pnpm test` lance vitest sans filtre, et l’étape « Tests » du job gate-a le lance sans condition', () => {
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const [outil, verbe, ...options] = paquet.scripts.test!.split(/\s+/);
    expect([outil, verbe]).toEqual(['vitest', 'run']);
    // Liste FERMÉE : un chemin, un `--exclude` ou un `--dir` retirerait l'intégration de la passe.
    expect(options.filter((o) => o !== '--coverage')).toEqual([]);

    const lignes = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8').split(/\r?\n/);
    const debutJob = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
    expect(debutJob).toBeGreaterThanOrEqual(0);
    const finJob = lignes.findIndex((l, i) => i > debutJob && /^ {2}\S/.test(l));
    const job = lignes.slice(debutJob, finJob === -1 ? undefined : finJob);
    const ligneRun = job.findIndex((l) => /^\s+(- )?run:\s*pnpm test\s*$/.test(l));
    expect(ligneRun, 'aucune étape `run: pnpm test` dans le job gate-a').toBeGreaterThan(0);
    let debutEtape = ligneRun;
    while (debutEtape > 0 && !/^\s+- /.test(job[debutEtape]!)) debutEtape--;
    const indentation = job[debutEtape]!.search(/-/);
    const finEtape = job.findIndex(
      (l, i) => i > ligneRun && l.search(/\S/) <= indentation && l.trim() !== ''
    );
    const etape = job.slice(debutEtape, finEtape === -1 ? undefined : finEtape);
    const conditions = etape.filter((l) => /^\s*(- )?(if|continue-on-error)\s*:/.test(l));
    expect(
      conditions,
      `l'étape qui lance pnpm test est conditionnée : ${conditions.join(' | ')}`
    ).toEqual([]);
  });
});

// ── R4, contre-témoin R3, cache (conteneurs de CE fichier) ─────────────────────────────────────

describe('REQ-QA-006 — la base et le cache éphémères de ce fichier', () => {
  let base: Base;
  let cache: Cache;

  beforeAll(async () => {
    [base, cache] = await Promise.all([demarrerBase(), demarrerCache()]);
  }, 180_000);

  afterAll(async () => {
    await base?.arreter();
    await cache?.arreter();
  });

  it('REQ-QA-006 — Postgres 16 avec pgvector, et une migration appliquée par dossier du disque', async () => {
    const [serveur] = await base.prisma.$queryRaw<{ version: string }[]>`
      SELECT current_setting('server_version_num') AS version`;
    expect(serveur?.version).toMatch(/^16\d{4}$/);
    const vecteur = await base.prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM pg_available_extensions WHERE name = 'vector'`;
    expect(vecteur).toEqual([{ name: 'vector' }]);

    const dossiers = readdirSync(join(RACINE, 'prisma/migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const appliquees = await base.prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    console.log(
      `migrations : ${dossiers.length} dossier(s) sur le disque, ${appliquees.length} appliquée(s)`
    );
    expect(dossiers.length).toBeGreaterThan(0);
    expect(appliquees.map((m) => m.migration_name)).toEqual(dossiers);
  });

  it('REQ-QA-006 — les conteneurs tournent les images épinglées au tag exact et au condensat', async () => {
    for (const image of [IMAGE_BASE, IMAGE_CACHE]) {
      expect(image).toMatch(/^[a-z0-9./-]+:\d+\.\d+\.\d+-[a-z0-9]+@sha256:[0-9a-f]{64}$/);
    }
    // La version que porte le tag est celle que le conteneur SERT : dérivée, pas recopiée.
    const vecteur = /:(\d+\.\d+\.\d+)-pg16@/.exec(IMAGE_BASE)?.[1];
    const [extension] = await base.prisma.$queryRaw<{ default_version: string }[]>`
      SELECT default_version FROM pg_available_extensions WHERE name = 'vector'`;
    expect(vecteur).toBeDefined();
    expect(extension?.default_version).toBe(vecteur);
    const redis = /^redis:(\d+\.\d+\.\d+)-/.exec(IMAGE_CACHE)?.[1];
    expect(redis).toBeDefined();
    const info = (await cache.commande(['INFO', 'server'])).split(/\r?\n/).map((l) => l.trim());
    expect(info).toContain(`redis_version:${redis}`);
  });

  it('REQ-QA-006 — contre-témoin : dans UNE base, le même SIREN inséré deux fois lève 23505', async () => {
    await base.prisma.$executeRawUnsafe('CREATE TABLE contre_temoin (siren text UNIQUE)');
    await base.prisma.$executeRawUnsafe(`INSERT INTO contre_temoin (siren) VALUES ('${SIREN}')`);
    await expect(
      base.prisma.$executeRawUnsafe(`INSERT INTO contre_temoin (siren) VALUES ('${SIREN}')`)
    ).rejects.toThrow(/23505/);
  });

  it('REQ-QA-006 — le cache répond par redis-cli dans son conteneur, sans client installé', async () => {
    expect(cache.url).toMatch(/^redis:\/\//);
    expect(await cache.commande(['GET', 'cle'])).toBe('');
    expect(await cache.commande(['SET', 'cle', 'valeur'])).toBe('OK');
    expect(await cache.commande(['GET', 'cle'])).toBe('valeur');
  });

  it('REQ-QA-006 — arreter() retire les conteneurs : la base et le cache ne répondent plus', async () => {
    const [autreBase, autreCache] = await Promise.all([demarrerBase(), demarrerCache()]);
    await autreBase.arreter();
    await autreCache.arreter();
    const sonde = new PrismaClient({ datasourceUrl: autreBase.url });
    try {
      await expect(sonde.$queryRawUnsafe('SELECT 1')).rejects.toThrow();
    } finally {
      await sonde.$disconnect();
    }
    await expect(autreCache.commande(['PING'])).rejects.toThrow();
  }, 180_000);
});

// ── R2, R3, R5 : témoin à deux faces, en sous-processus ─────────────────────────────────────────

describe('REQ-QA-006 — témoin à deux faces : démon absent, démon présent', () => {
  it('REQ-QA-006 — sans démon joignable, `test:integration` sort en non nul et chaque fichier nomme le motif', () => {
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const commande = paquet.scripts['test:integration'];
    expect(commande).toBe(`vitest run ${DOSSIER}`);
    // Tous les fichiers d'intégration du dépôt, sauf celui-ci (qui relancerait ce témoin).
    const autres = fichiersDIntegration().filter((f) => f !== SOI);
    expect(autres.length).toBeGreaterThan(0);
    const { code, sortie } = lancerVitest([...commande!.split(/\s+/).slice(1), '--exclude', SOI], {
      DOCKER_HOST: DEMON_ABSENT,
    });
    console.log(`démon absent : code ${code}, ${autres.length} fichier(s) d'intégration lancé(s)`);
    expect(code).not.toBe(0);
    expect(sortie).toMatch(
      new RegExp(`Test Files\\s+${autres.length} failed \\(${autres.length}\\)`)
    );
    expect(sortie.split(MOTIF_ABSENCE).length - 1).toBeGreaterThanOrEqual(autres.length);
    expect(sortie).not.toMatch(/\d+ passed/);
  }, 600_000);

  it('REQ-QA-006 — deux fichiers, même SIREN et même clé : chacun sa base et son cache, compte imprimé', () => {
    const bac = bacVitest({
      'a.spec.ts': fichierDIsolation('A'),
      'b.spec.ts': fichierDIsolation('B'),
    });
    try {
      const { code, sortie } = lancerVitest(
        ['run', '--config', join(bac, 'vitest.config.mjs')],
        {},
        bac
      );
      console.log(
        sortie
          .split('\n')
          .filter((l) => /Test Files|Tests /.test(l))
          .join('\n')
      );
      expect(sortie).toMatch(/Test Files\s+2 passed \(2\)/);
      expect(sortie).toMatch(/Tests\s+2 passed \(2\)/);
      expect(sortie).not.toMatch(/skipped/);
      expect(code, sortie).toBe(0);
    } finally {
      retirerBac(bac);
    }
  }, 600_000);
});
