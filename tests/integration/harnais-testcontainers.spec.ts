// @req REQ-QA-006
/**
 * QA-T02 — le harnais d'intégration, jugé par ce qu'il FAIT, pas par ce qu'il dit.
 *
 * ENVIRONNEMENT. Celui du sous-processus `prisma` se CONSTRUIT : une source qui porte des variables
 * piégées (une URL de base du poste, une URL d'ombre, un réglage `PRISMA_*`) n'en laisse traverser
 * aucune ; l'URL de base reçue est celle du conteneur ; les variables admises passent.
 * DÉMON ABSENT. La commande `test:integration` du dépôt sort en code non nul, et chaque fichier
 * d'intégration échoue en NOMMANT le motif. Aucun ne passe.
 * ISOLATION. Deux fichiers posent le même SIREN sous contrainte d'unicité et la même clé de cache ;
 * chacun ne voit que les siens. Le contre-témoin prouve que la contrainte mord dans UNE base. Le
 * résumé imprime le compte des fichiers exécutés.
 * SCHÉMA. Celui du disque : une migration appliquée par dossier de `prisma/migrations`.
 * GARDE STATIQUE. Sur tout le dossier d'intégration : aucun test sauté ni isolé, aucune lecture de
 * l'environnement de l'hôte hors du harnais, chaque faute nommée `fichier:ligne`.
 * COLLECTE PAR GATE A. Ce témoin-là ne vit PAS ici : logé dans le dossier qu'il garde, il disparaît
 * avec lui (mesuré). Il vit dans `tests/unit/ci/integration-collectee-par-gate-a.spec.ts`.
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

// ── Constantes et outils ─────────────────────────────────────────────────────────────────────────

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

/**
 * Les deux fichiers de bac, SÉQUENCÉS : B ne démarre ses conteneurs qu'une fois que A a inséré son
 * SIREN et posé sa clé, et A garde les siens vivants jusqu'à la fin de B. Sans ce séquencement, les
 * deux démarrent au même instant et chacun crée son conteneur même quand le harnais les partage
 * (mesuré : un `.withReuse()` posé dans le harnais SURVIVAIT au témoin, le verrou de réutilisation
 * de testcontainers ne valant que dans un processus). Les marques sont des fichiers du bac.
 */
const ATTENDRE = `
const attendre = async (marque) => {
  const fin = Date.now() + 150000;
  while (!existsSync(new URL(marque, import.meta.url))) {
    if (Date.now() > fin) throw new Error('attente de la marque ' + marque + ' dépassée');
    await new Promise((r) => setTimeout(r, 200));
  }
};
const marquer = (marque) => writeFileSync(new URL(marque, import.meta.url), '');
`;

const fichierDIsolation = (valeur: 'A' | 'B') => `
import { existsSync, writeFileSync } from 'node:fs';
import { demarrerBase, demarrerCache } from ${IMPORT_HARNAIS};
${ATTENDRE}
let base;
let cache;
beforeAll(async () => {
  ${valeur === 'B' ? "await attendre('a-pret');" : ''}
  [base, cache] = await Promise.all([demarrerBase(), demarrerCache()]);
}, 180000);
afterAll(async () => {
  ${valeur === 'A' ? "await attendre('b-fini');" : "marquer('b-fini');"}
  await base?.arreter();
  await cache?.arreter();
}, 180000);
it('isolation ${valeur}', async () => {
  try {
    await base.prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS t (siren text UNIQUE)');
    await base.prisma.$executeRawUnsafe("INSERT INTO t (siren) VALUES ('${SIREN}')");
    expect(await cache.commande(['GET', 'cle'])).toBe('');
    expect(await cache.commande(['SET', 'cle', '${valeur}'])).toBe('OK');
    expect(await cache.commande(['GET', 'cle'])).toBe('${valeur}');
  } finally {
    ${valeur === 'A' ? "marquer('a-pret');" : ''}
  }
});
`;

// ── La garde statique ────────────────────────────────────────────────────────────────────────────

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

// ── Environnement ────────────────────────────────────────────────────────────────────────────────

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

// ── Garde statique ───────────────────────────────────────────────────────────────────────────────

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

// ── Schéma, contre-témoin d'isolation, cache (conteneurs de CE fichier) ──────────────────────────

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

  it('REQ-QA-006 — le cache répond par redis-cli dans son conteneur, sans passer par un client', async () => {
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

// ── Démon absent, isolation : témoin à deux faces, en sous-processus ─────────────────────────────

/**
 * Face rouge : un `DOCKER_HOST` injoignable. Mesuré (testcontainers 12.1.0, docker-modem 5.0.7) :
 * aucune stratégie ne se replie sur une autre socket, le démon est donc ABSENT pour le sous-processus.
 * ⚠️ vitest 2.1.9 compte « skipped » les tests d'un fichier dont le `beforeAll` lève, alors que le
 * FICHIER échoue et que le code de sortie vaut 1 : on juge donc le code, le compte de fichiers en
 * échec et le motif, jamais l'absence du mot « skipped ». Un vrai saut, lui, est refusé par la garde
 * statique avant toute exécution.
 */
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
