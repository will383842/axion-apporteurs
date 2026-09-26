// @req REQ-QA-030
// @req REQ-CPL-021
/**
 * env-fail-fast.spec.ts — QA-T04 : le démarrage RÉEL refuse un environnement incomplet.
 *
 * CE QUI EST JUGÉ, ET PAR QUOI.
 *  - REQ-QA-030 : le schéma de `src/lib/env.ts` porte TOUTES les variables — les secrets posés
 *    avant cette tâche et la configuration (base, cache, puits de notifications). Une variable requise retirée fait
 *    sortir le démarrage en code non nul, et le démarrage jugé est celui de Next : `register()` de
 *    `src/instrumentation.ts`, lancé dans un vrai sous-processus, pas la fonction pure seule. Une
 *    fonction de refus qu'aucun démarrage n'appelle ne refuse rien.
 *  - REQ-QA-030 : `docs/env.md` est le RENDU du schéma. Il se régénère par `pnpm env:doc` ; ce
 *    fichier est la garde qui rougit s'il est périmé.
 *  - REQ-CPL-021 : hors production, `NOTIFY_SINK=true` est exigé au démarrage. « Production » est
 *    jugée par le prédicat du notifieur (`productionDeclaree`, `src/lib/notify.ts`), importé, jamais réécrit.
 *
 * Les noms ne sont JAMAIS retapés ici : ils sont lus dans le schéma (RM-01). Toutes les valeurs de
 * secret sont tirées au hasard à l'exécution ; les URL désignent le poste local, sans mot de passe.
 *
 * HORS DE CE FICHIER : la double clé de rotation (`kid`, 24 h) de REQ-QA-030 a sa propre tâche,
 * qui la livrera avec son test.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CHEMIN_DOC_ENV,
  NOMS_DE_CONFIGURATION,
  NOMS_DES_SECRETS,
  NOMS_DES_VARIABLES,
  NOMS_FACULTATIFS,
  documenterEnvironnement,
  lireDemarrage,
  type Refus,
} from '../../../src/lib/env';
import { productionDeclaree } from '../../../src/lib/notify';

const RACINE = process.cwd();
const INSTRUMENTATION = pathToFileURL(resolve(RACINE, 'src/instrumentation.ts')).href;
const CLE_HEX = 'PII_ENCRYPTION_KEY';

const BAC = mkdtempSync(join(tmpdir(), 'qat04-'));
afterAll(() => rmSync(BAC, { recursive: true, force: true }));

/** Le démarrage de Next : `register()` sous le runtime Node, puis une ligne si l'on arrive au bout. */
const DEMARRAGE = join(BAC, 'demarrage.ts');
writeFileSync(
  DEMARRAGE,
  `import { register } from ${JSON.stringify(INSTRUMENTATION)};\n` +
    `register().then(() => process.stdout.write('demarrage accepte\\n'));\n`
);

/** Le strict nécessaire pour lancer un processus — rien du poste qui porterait une variable. */
const BASE: Record<string, string> = {};
for (const nom of ['PATH', 'SystemRoot']) {
  const v = process.env[nom];
  if (v !== undefined) BASE[nom] = v;
}

interface Sortie {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

function demarrer(variables: Record<string, string>): Sortie {
  const debut = Date.now();
  const env: Record<string, string> = { ...BASE, NEXT_RUNTIME: 'nodejs', ...variables };
  const r = spawnSync(process.execPath, ['--import', 'tsx', DEMARRAGE], {
    cwd: RACINE,
    env: env as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ms: Date.now() - debut };
}

/**
 * Un environnement COMPLET hors production : chaque secret tiré au hasard, la base et le cache du
 * poste, le puits de notifications armé. Chaque champ dont dépend une assertion est explicite (RM-11).
 */
function environnementComplet(): Record<string, string> {
  const env: Record<string, string> = {
    DATABASE_URL: 'postgresql://partners@localhost:5432/partners',
    REDIS_URL: 'redis://localhost:6379',
    NOTIFY_SINK: 'true',
  };
  for (const nom of NOMS_DES_SECRETS) {
    env[nom] = nom === CLE_HEX ? randomBytes(32).toString('hex') : randomBytes(24).toString('hex');
  }
  return env;
}

const refusDe = (env: Record<string, string | undefined>): Refus[] => {
  const r = lireDemarrage(env);
  return r.ok ? [] : r.refus;
};

/** Les lignes de refus imprimées : `  <NOM> : <motif>`. */
const refusImprimes = (stderr: string): string[] =>
  stderr
    .split(/\r?\n/)
    .filter((l) => l.startsWith('  '))
    .map((l) => l.trim());

/**
 * La configuration REQUISE au démarrage, écrite ICI en toutes lettres : la dériver de
 * `NOMS_FACULTATIFS` ferait dépendre l'attente du code sous test, et une base rendue facultative
 * dans le schéma resterait verte (mutant tenu par la revue de mutation de la PR 130). Les secrets
 * sont tous requis (SEC-01) ; leurs noms restent lus dans le schéma, que `env-boot.spec.ts` confronte
 * au texte de REQ-SEC-028.
 */
const CONFIGURATION_REQUISE = ['DATABASE_URL', 'REDIS_URL', 'NOTIFY_SINK'];
const REQUISES = [...NOMS_DES_SECRETS, ...CONFIGURATION_REQUISE];

describe('REQ-QA-030 — le schéma porte toutes les variables, et le démarrage réel les exige', () => {
  it('REQ-QA-030 : le schéma porte les secrets ET la configuration, sans doublon, et le code ne lit rien hors de lui', () => {
    expect(NOMS_DES_VARIABLES).toEqual([...NOMS_DES_SECRETS, ...NOMS_DE_CONFIGURATION]);
    expect(new Set(NOMS_DES_VARIABLES).size).toBe(NOMS_DES_VARIABLES.length);
    // La base et le cache sont ce que `readyz` sonde : un démarrage qui ne les exige pas démarre
    // une instance qui ne sait pas servir.
    for (const n of ['DATABASE_URL', 'REDIS_URL', 'NOTIFY_SINK']) {
      expect(NOMS_DE_CONFIGURATION).toContain(n);
    }
    // DÉRIVÉ DU DISQUE : toute lecture `process.env.<NOM>` sous `src/` porte un nom du schéma, ou
    // un nom que le runtime pose lui-même et qu'aucun opérateur ne règle.
    const POSES_PAR_LE_RUNTIME = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VITEST']);
    const lus = new Map<string, string>();
    const parcourir = (dossier: string): void => {
      for (const e of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
        const chemin = `${dossier}/${e.name}`;
        if (e.isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(e.name)) {
          const texte = readFileSync(join(RACINE, chemin), 'utf8');
          for (const m of texte.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
            lus.set(m[1] ?? '', chemin);
          }
        }
      }
    };
    parcourir('src');
    console.log(`${lus.size} variables lues sous src/ par process.env.<NOM>.`);
    expect(lus.size).toBeGreaterThan(0);
    const horsSchema = [...lus]
      .filter(([n]) => !POSES_PAR_LE_RUNTIME.has(n) && !NOMS_DES_VARIABLES.includes(n))
      .map(([n, f]) => `${n} (${f})`);
    expect(
      horsSchema,
      'variables lues par le code et absentes du schéma de src/lib/env.ts'
    ).toEqual([]);
  });

  it('REQ-QA-030 : environnement complet — le démarrage réel (register) va au bout et sort en 0', () => {
    const s = demarrer(environnementComplet());
    console.log(`démarrage complet : code ${s.code}, ${s.ms} ms`);
    expect(s.stderr).not.toContain('Démarrage refusé');
    expect(s.code).toBe(0);
    expect(s.stdout).toContain('demarrage accepte');
  });

  it('REQ-QA-030 : chaque variable requise retirée tour à tour — le démarrage réel sort en non nul et la nomme, elle seule', () => {
    expect(REQUISES.length).toBeGreaterThan(NOMS_DES_SECRETS.length);
    // Et le schéma ne peut pas déclarer facultatif ce que le démarrage exige.
    expect(NOMS_FACULTATIFS.filter((n) => REQUISES.includes(n))).toEqual([]);
    let confrontees = 0;
    for (const nom of REQUISES) {
      const env = environnementComplet();
      delete env[nom];
      const s = demarrer(env);
      expect(s.code, `${nom} retirée : code de sortie`).not.toBe(0);
      expect(s.code, `${nom} retirée : le processus a été tué, il n'a pas refusé`).not.toBeNull();
      expect(s.ms, `${nom} retirée : refus en moins de 60 s`).toBeLessThan(60_000);
      expect(s.stdout, `${nom} retirée : le démarrage est allé au bout`).not.toContain(
        'demarrage accepte'
      );
      const attendu = nom === 'NOTIFY_SINK' ? 'requise_hors_production' : 'absente';
      expect(refusImprimes(s.stderr), `${nom} retirée : lignes de refus`).toEqual([
        `${nom} : ${attendu}`,
      ]);
      confrontees++;
    }
    console.log(`${confrontees} variables requises retirées tour à tour, sur ${REQUISES.length}.`);
    expect(confrontees).toBe(REQUISES.length);
  }, 600_000);

  it('REQ-QA-030 : une URL de base ou de cache hors format est refusée, sans que la valeur soit imprimée', () => {
    const base = environnementComplet();
    const cas: [string, string][] = [
      ['DATABASE_URL', 'redis://localhost:6379'],
      ['DATABASE_URL', 'pas une url'],
      ['REDIS_URL', 'postgresql://partners@localhost:5432/partners'],
      ['REDIS_URL', ' redis://localhost:6379'],
    ];
    for (const [nom, v] of cas) {
      const refus = refusDe({ ...base, [nom]: v });
      expect(
        refus.map((r) => r.variable),
        `${nom}=${JSON.stringify(v)}`
      ).toEqual([nom]);
      expect(JSON.stringify(refus)).not.toContain(v.trim());
    }
    expect(refusDe({ ...base, DATABASE_URL: 'postgres://partners@localhost/partners' })).toEqual(
      []
    );
    expect(refusDe({ ...base, REDIS_URL: 'rediss://localhost:6380' })).toEqual([]);
  });
});

describe('REQ-CPL-021 — hors production, NOTIFY_SINK=true est exigé au démarrage', () => {
  it('REQ-CPL-021 : hors production, NOTIFY_SINK absent, vide ou différent de true est un refus qui le nomme', () => {
    const base = environnementComplet();
    const refuse: Refus = { variable: 'NOTIFY_SINK', motif: 'requise_hors_production' };
    for (const v of [undefined, '', 'false', 'TRUE', '1', 'true ']) {
      const env = { ...base, NOTIFY_SINK: v };
      expect(productionDeclaree(env)).toBe(false);
      expect(refusDe(env), `NOTIFY_SINK=${JSON.stringify(v)}`).toEqual([refuse]);
    }
    expect(refusDe({ ...base, NOTIFY_SINK: 'true' })).toEqual([]);
  });

  it('REQ-CPL-021 : le prédicat de production est celui du notifieur — production déclarée démarre sans puits, une préversion non', () => {
    const base = environnementComplet();
    delete base.NOTIFY_SINK;
    const production = { ...base, NODE_ENV: 'production', PARTNERS_ENV: 'production' };
    const preversion = { ...base, NODE_ENV: 'production', PARTNERS_ENV: 'preview' };
    const partielle = { ...base, NODE_ENV: 'development', PARTNERS_ENV: 'production' };
    expect(productionDeclaree(production)).toBe(true);
    expect(refusDe(production)).toEqual([]);
    for (const [cas, env] of [
      ['préversion', preversion],
      ['développement', partielle],
    ] as const) {
      expect(productionDeclaree(env), cas).toBe(false);
      expect(
        refusDe(env).map((r) => r.variable),
        cas
      ).toEqual(['NOTIFY_SINK']);
    }
  });

  it('REQ-CPL-021 : le démarrage réel hors production sans NOTIFY_SINK sort en non nul, et en 0 dès qu’il vaut true', () => {
    const env = environnementComplet();
    const sans = demarrer({ ...env, NOTIFY_SINK: 'false' });
    expect(sans.code).not.toBe(0);
    expect(sans.code).not.toBeNull();
    expect(refusImprimes(sans.stderr)).toEqual(['NOTIFY_SINK : requise_hors_production']);
    const avec = demarrer(env);
    expect(avec.code).toBe(0);
  });
});

describe('REQ-QA-030 — docs/env.md est le rendu du schéma', () => {
  it('REQ-QA-030 : docs/env.md est égal au rendu du schéma — régénérer par pnpm env:doc s’il est périmé', () => {
    const surLeDisque = readFileSync(join(RACINE, CHEMIN_DOC_ENV), 'utf8').replace(/\r\n/g, '\n');
    expect(
      surLeDisque === documenterEnvironnement(),
      `${CHEMIN_DOC_ENV} est périmé : lance \`pnpm env:doc\` et commite le rendu`
    ).toBe(true);
  });

  it('REQ-QA-030 : le rendu porte une ligne par variable du schéma, et dit lesquelles sont facultatives', () => {
    const rendu = documenterEnvironnement();
    for (const nom of NOMS_DES_VARIABLES) {
      const lignes = rendu.split('\n').filter((l) => l.startsWith(`| \`${nom}\` |`));
      expect(lignes, nom).toHaveLength(1);
      expect(lignes[0], nom).toContain(NOMS_FACULTATIFS.includes(nom) ? 'facultative' : 'requise');
    }
  });
});
