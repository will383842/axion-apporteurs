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
import { describe, it, expect, afterAll, vi } from 'vitest';
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
  NOMS_DES_SECRETS_CONDITIONNELS,
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
    expect(NOMS_DES_VARIABLES).toEqual([
      ...NOMS_DES_SECRETS,
      ...NOMS_DES_SECRETS_CONDITIONNELS,
      ...NOMS_DE_CONFIGURATION,
    ]);
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

/**
 * LE MODULE RECHARGÉ, JUGÉ EN PROCESSUS, À LA VALEUR PRÈS.
 *
 * Les listes, les expressions régulières, les rôles et les schémas de `src/lib/env.ts` sont évalués
 * AU CHARGEMENT : importés une fois en tête de fichier, ils seraient lus avant que l'outil de
 * mutation n'active son mutant, et aucun test ne les jugerait. Chaque témoin ci-dessous vide donc le
 * cache des modules et réimporte la source (même procédé que `journal-redige.spec.ts`). Les
 * démarrages en sous-processus, plus haut, ne jugent aucun mutant : l'enfant charge la source sans
 * mutant actif. Toutes les valeurs de secret sont FACTICES, fabriquées à l'exécution.
 */
type ModuleEnv = typeof import('../../../src/lib/env');

async function envRecharge(): Promise<ModuleEnv> {
  vi.resetModules();
  return import('../../../src/lib/env');
}

const CLE_FACTICE = '0123456789abcdef'.repeat(4);
const valeurFactice = (graine: string): string =>
  `factice-${graine.toLowerCase()}-`.padEnd(48, 'x');
const INSTANT_DE_REFERENCE = Date.UTC(2026, 9, 2, 10, 0, 0);

/** Chaque secret toujours exigé, factice et distinct des autres. */
function secretsFactices(m: ModuleEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const nom of m.NOMS_DES_SECRETS) {
    env[nom] = nom === CLE_HEX ? CLE_FACTICE : valeurFactice(nom);
  }
  return env;
}

/** Un démarrage complet hors production (`NODE_ENV=test`), puits armé. */
function demarrageFactice(m: ModuleEnv): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    ...secretsFactices(m),
    DATABASE_URL: 'postgresql://partners@localhost:5432/partners',
    REDIS_URL: 'redis://localhost:6379',
    NOTIFY_SINK: 'true',
  };
}

/** Les refus d'un démarrage, en lignes `<NOM> : <motif>` formées par le module lui-même. */
function lignesDe(m: ModuleEnv, source: Readonly<Record<string, string | undefined>>): string[] {
  const r = m.lireDemarrage(source, INSTANT_DE_REFERENCE);
  return r.ok ? [] : r.refus.map(m.formaterRefus);
}

describe('REQ-QA-030 — le module rechargé : les listes dérivées du schéma, à la valeur près', () => {
  it('REQ-QA-030 : la configuration, les facultatives, les secrets conditionnels et la liste complète sont exactement ceux-ci', async () => {
    const m = await envRecharge();
    expect(m.NOMS_DE_CONFIGURATION).toEqual([
      'DATABASE_URL',
      // QA-T62 : l'URL du rôle propriétaire, réservée à la migration ; requise en production par
      // l'entrée de l'image, jamais facultative pour la vue.
      'DATABASE_MIGRATION_URL',
      'REDIS_URL',
      'NOTIFY_SINK',
      'PARTNERS_ENV',
      'LOG_LEVEL',
      'SENTRY_DSN',
      'PARTNERS_EMAIL_DMARC_VERIFIE',
      'PARTNERS_EMAIL_EXPEDITEUR',
      'AXIONIA_BASE_URL',
      'AXIONIA_API_ALLOWLIST',
      'ZEPTOMAIL_API_URL',
    ]);
    // NOTIFY_SINK est facultative pour Zod, mais exigée hors production : elle n'est PAS ici.
    expect(m.NOMS_FACULTATIFS).toEqual([
      'PARTNERS_ENV',
      'LOG_LEVEL',
      'SENTRY_DSN',
      'PARTNERS_EMAIL_DMARC_VERIFIE',
      'PARTNERS_EMAIL_EXPEDITEUR',
      'AXIONIA_BASE_URL',
      'AXIONIA_API_ALLOWLIST',
      'ZEPTOMAIL_API_URL',
    ]);
    expect(m.NOMS_DES_SECRETS_CONDITIONNELS).toEqual([
      'ZEPTOMAIL_SEND_TOKEN',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
      // SEC-14 (REQ-SEC-017, REQ-GOV-031) : le réglage des signaux de sincérité, hors dépôt.
      'PARTNERS_SINCERITE_REGLAGE',
    ]);
    // Douze secrets toujours exigés, lus au schéma : leurs noms ne sont pas retapés ici.
    expect(m.NOMS_DES_SECRETS).toHaveLength(12);
    expect(m.NOMS_DES_SECRETS).toContain(CLE_HEX);
    expect(m.NOMS_DES_VARIABLES).toHaveLength(28);
    expect(m.NOMS_DES_VARIABLES).toEqual([
      ...m.NOMS_DES_SECRETS,
      ...m.NOMS_DES_SECRETS_CONDITIONNELS,
      ...m.NOMS_DE_CONFIGURATION,
    ]);
    // Un jeu vide : chaque secret toujours exigé est refusé `absente`, et lui seul.
    const vide = m.lireEnvironnement({ NODE_ENV: 'test' });
    expect(vide.ok).toBe(false);
    expect(vide.ok ? [] : vide.refus).toEqual(
      m.NOMS_DES_SECRETS.map((variable) => ({ variable, motif: 'absente' }))
    );
  });

  it('REQ-QA-030 : le chemin de la vue, la fenêtre de rotation et les variables de la clé précédente sont exactement ceux-ci', async () => {
    const m = await envRecharge();
    expect(m.CHEMIN_DOC_ENV).toBe('docs/env.md');
    expect(m.ROTATION_MAX_MS).toBe(86_400_000);
    for (const nom of m.NOMS_EN_ROTATION) {
      expect(m.variablesDeRotation(nom)).toEqual({
        cle: `${nom}_PRECEDENT`,
        echeance: `${nom}_PRECEDENT_ECHEANCE`,
      });
    }
    // Le `kid` d'une valeur fixe, figé : huit hexadécimaux de l'empreinte séparée par domaine.
    expect(m.kidDe('valeur-temoin-kid')).toBe('427b2cbb');
  });

  it('REQ-QA-030 : la vue rendue par le module rechargé est celle du disque — chaque rôle, chaque règle, à la lettre', async () => {
    const m = await envRecharge();
    const surLeDisque = readFileSync(join(RACINE, 'docs/env.md'), 'utf8').replace(/\r\n/g, '\n');
    const rendu = m.documenterEnvironnement();
    expect(rendu === surLeDisque, 'docs/env.md diffère du rendu du module rechargé').toBe(true);
    // Chaque ligne de variable porte un rôle non vide en dernière colonne.
    for (const nom of m.NOMS_DES_VARIABLES) {
      const ligne = rendu.split('\n').find((l) => l.startsWith(`| \`${nom}\` |`)) ?? '';
      const role = ligne.split(' | ').at(-1)?.replace(/ \|$/, '').trim() ?? '';
      expect(role, nom).not.toBe('');
    }
    expect(rendu).toContain(
      '| `ZEPTOMAIL_SEND_TOKEN` | facultative, requise si l’envoi réel est allumé |'
    );
    expect(rendu).toContain(
      '| `LOG_LEVEL` | facultative | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |'
    );
  });
});

describe('REQ-QA-030 — le module rechargé : les règles de forme des secrets', () => {
  it('REQ-QA-030 : la clé hexadécimale est ancrée aux deux bouts — 64 hexadécimaux exactement, ni avant, ni après', async () => {
    const m = await envRecharge();
    const base = secretsFactices(m);
    const refusDeLaCle = (v: string) => {
      const r = m.lireEnvironnement({ NODE_ENV: 'test', ...base, [CLE_HEX]: v });
      return r.ok ? [] : r.refus;
    };
    expect(refusDeLaCle(CLE_FACTICE)).toEqual([]);
    expect(refusDeLaCle(CLE_FACTICE.toUpperCase())).toEqual([]);
    const horsFormat = [{ variable: CLE_HEX, motif: 'format_invalide' }];
    expect(refusDeLaCle(`g${CLE_FACTICE}`)).toEqual(horsFormat);
    expect(refusDeLaCle(`${CLE_FACTICE}g`)).toEqual(horsFormat);
    expect(refusDeLaCle(`${CLE_FACTICE}a`)).toEqual(horsFormat);
    expect(refusDeLaCle(CLE_FACTICE.slice(1))).toEqual(horsFormat);
  });

  it('REQ-QA-030 : une espace EN BORDURE est refusée, une espace intérieure ne l’est pas', async () => {
    const m = await envRecharge();
    const base = secretsFactices(m);
    const nom = m.NOMS_DES_SECRETS[0] ?? '';
    const refusDe = (v: string) => {
      const r = m.lireEnvironnement({ NODE_ENV: 'test', ...base, [nom]: v });
      return r.ok ? [] : r.refus;
    };
    expect(refusDe('factice avec une espace interieure'.padEnd(48, 'x'))).toEqual([]);
    const bordure = [{ variable: nom, motif: 'espace_en_bordure' }];
    expect(refusDe(` ${valeurFactice('bordure')}`)).toEqual(bordure);
    expect(refusDe(`${valeurFactice('bordure')} `)).toEqual(bordure);
    expect(refusDe(`${valeurFactice('bordure')}\n`)).toEqual(bordure);
  });

  it('REQ-QA-030 : le préfixe interdit est jugé en tête seulement, sans égard à la casse, et seulement en production', async () => {
    const m = await envRecharge();
    const base = secretsFactices(m);
    const nom = m.NOMS_DES_SECRETS[0] ?? '';
    const refusDe = (nodeEnv: string | undefined, v: string) => {
      const r = m.lireEnvironnement({ ...base, NODE_ENV: nodeEnv, [nom]: v });
      return r.ok ? [] : r.refus;
    };
    const prefixe = [{ variable: nom, motif: 'prefixe_interdit' }];
    expect(refusDe('production', 'dev_'.padEnd(48, 'x'))).toEqual(prefixe);
    expect(refusDe('production', 'STUB'.padEnd(48, 'x'))).toEqual(prefixe);
    // Le prédicat échoue FERMÉ : NODE_ENV absent ou inconnu vaut production.
    expect(refusDe(undefined, 'dev_'.padEnd(48, 'x'))).toEqual(prefixe);
    expect(refusDe('preview', 'stub'.padEnd(48, 'x'))).toEqual(prefixe);
    // Hors production — development ET test —, le préfixe est admis.
    expect(refusDe('development', 'dev_'.padEnd(48, 'x'))).toEqual([]);
    expect(refusDe('test', 'dev_'.padEnd(48, 'x'))).toEqual([]);
    // Au milieu de la valeur, ce n'est pas un préfixe.
    expect(refusDe('production', 'factice-dev_-stub-'.padEnd(48, 'x'))).toEqual([]);
    // Une valeur DÉJÀ refusée ne reçoit pas un second motif.
    expect(refusDe('production', 'dev_court')).toEqual([{ variable: nom, motif: 'trop_courte' }]);
  });

  it('REQ-QA-030 : des secrets égaux forment UN refus `egale_a` qui nomme les autres ; des secrets vides ne sont pas égaux entre eux', async () => {
    const m = await envRecharge();
    const base = secretsFactices(m);
    const [n0 = '', n1 = '', n2 = ''] = m.NOMS_DES_SECRETS;
    const meme = valeurFactice('partagee');
    const egaux = m.lireEnvironnement({
      NODE_ENV: 'test',
      ...base,
      [n0]: meme,
      [n1]: meme,
      [n2]: meme,
    });
    expect(egaux.ok ? [] : egaux.refus).toEqual([
      { variable: n0, motif: 'egale_a', avec: [n1, n2] },
    ]);
    expect(egaux.ok ? [] : egaux.refus.map(m.formaterRefus)).toEqual([
      `${n0} : egale_a ${n1}, ${n2}`,
    ]);
    const vides = m.lireEnvironnement({ NODE_ENV: 'test', ...base, [n0]: '', [n1]: '' });
    expect(vides.ok ? [] : vides.refus).toEqual([
      { variable: n0, motif: 'absente' },
      { variable: n1, motif: 'absente' },
    ]);
  });

  it('REQ-QA-030 : une ligne de refus porte le nom, le motif, et pour une égalité les autres noms séparés par une virgule', async () => {
    const m = await envRecharge();
    expect(m.formaterRefus({ variable: 'A', motif: 'absente' })).toBe('A : absente');
    expect(m.formaterRefus({ variable: 'A', motif: 'egale_a', avec: ['B', 'C'] })).toBe(
      'A : egale_a B, C'
    );
  });
});

describe('REQ-QA-030 — le module rechargé : la configuration, valeur admise par valeur admise', () => {
  it('REQ-QA-030 : chaque protocole admis est accepté, un autre est `format_invalide`', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    const admises: [string, string][] = [
      ['DATABASE_URL', 'postgresql://partners@localhost:5432/partners'],
      ['DATABASE_URL', 'postgres://partners@localhost:5432/partners'],
      ['REDIS_URL', 'redis://localhost:6379'],
      ['REDIS_URL', 'rediss://localhost:6380'],
      ['SENTRY_DSN', 'https://collecte.exemple.invalid/1'],
      ['AXIONIA_BASE_URL', 'https://axionia.exemple.invalid'],
      ['ZEPTOMAIL_API_URL', 'https://api.zeptomail.eu/v1.1/email'],
    ];
    for (const [nom, v] of admises) {
      expect(lignesDe(m, { ...base, [nom]: v }), `${nom}=${v}`).toEqual([]);
    }
    for (const nom of ['SENTRY_DSN', 'AXIONIA_BASE_URL', 'ZEPTOMAIL_API_URL']) {
      expect(lignesDe(m, { ...base, [nom]: 'http://hote.exemple.invalid/x' }), nom).toEqual([
        `${nom} : format_invalide`,
      ]);
    }
    expect(lignesDe(m, { ...base, DATABASE_URL: 'pas une url' })).toEqual([
      'DATABASE_URL : format_invalide',
    ]);
  });

  it('REQ-QA-030 : chaque niveau de journal de pino est admis, tout autre est `format_invalide` — même le mot « undefined »', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    for (const niveau of ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']) {
      expect(lignesDe(m, { ...base, LOG_LEVEL: niveau }), niveau).toEqual([]);
    }
    for (const v of ['bavard', 'undefined', 'INFO']) {
      expect(lignesDe(m, { ...base, LOG_LEVEL: v }), v).toEqual(['LOG_LEVEL : format_invalide']);
    }
  });

  it('REQ-QA-030 : une valeur non textuelle est `format_invalide`, pas `absente`', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    const nombre = 42 as unknown as string;
    expect(lignesDe(m, { ...base, DATABASE_URL: nombre })).toEqual([
      'DATABASE_URL : format_invalide',
    ]);
    expect(lignesDe(m, { ...base, LOG_LEVEL: nombre })).toEqual(['LOG_LEVEL : format_invalide']);
  });

  it('REQ-QA-030 : le drapeau d’envoi admet `true` et `false`, rien d’autre', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    const allume = {
      ...base,
      PARTNERS_EMAIL_DMARC_VERIFIE: 'true',
      ZEPTOMAIL_API_URL: 'https://api.zeptomail.eu/v1.1/email',
      ZEPTOMAIL_SEND_TOKEN: valeurFactice('jeton-d-envoi'),
    };
    expect(lignesDe(m, allume)).toEqual([]);
    expect(lignesDe(m, { ...base, PARTNERS_EMAIL_DMARC_VERIFIE: 'false' })).toEqual([]);
    expect(lignesDe(m, { ...base, PARTNERS_EMAIL_DMARC_VERIFIE: 'oui' })).toEqual([
      'PARTNERS_EMAIL_DMARC_VERIFIE : format_invalide',
    ]);
  });

  it('REQ-QA-030 : une variable facultative posée est nette — ni vide, ni entourée d’une espace', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    for (const nom of ['PARTNERS_ENV', 'PARTNERS_EMAIL_EXPEDITEUR']) {
      expect(lignesDe(m, { ...base, [nom]: '' }), nom).toEqual([`${nom} : absente`]);
      expect(lignesDe(m, { ...base, [nom]: ' preview' }), nom).toEqual([
        `${nom} : espace_en_bordure`,
      ]);
      expect(lignesDe(m, { ...base, [nom]: 'preview' }), nom).toEqual([]);
    }
  });

  it('REQ-QA-030 : envoi allumé, un jeton ou une URL VIDE est exigé comme une variable absente', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    expect(
      lignesDe(m, {
        ...base,
        PARTNERS_EMAIL_DMARC_VERIFIE: 'true',
        ZEPTOMAIL_SEND_TOKEN: '',
        ZEPTOMAIL_API_URL: '',
      })
    ).toEqual([
      'ZEPTOMAIL_SEND_TOKEN : absente',
      'ZEPTOMAIL_API_URL : absente',
      'ZEPTOMAIL_SEND_TOKEN : requise_envoi_actif',
      'ZEPTOMAIL_API_URL : requise_envoi_actif',
    ]);
  });

  it('REQ-QA-030 : un démarrage accepté rend les secrets, le secret conditionnel posé ET la configuration', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    const jeton = valeurFactice('jeton-d-envoi');
    const r = m.lireDemarrage({ ...base, ZEPTOMAIL_SEND_TOKEN: jeton, LOG_LEVEL: 'warn' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nom = m.NOMS_DES_SECRETS[0] ?? '';
    expect((r.env as Record<string, unknown>)[nom]).toBe(base[nom]);
    expect(r.env.ZEPTOMAIL_SEND_TOKEN).toBe(jeton);
    expect(r.env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(r.env.LOG_LEVEL).toBe('warn');
  });
});

describe('REQ-QA-030 — le module rechargé : l’échéance de la clé précédente', () => {
  it('REQ-QA-030 : l’échéance est un instant UTC écrit en entier, avec ou sans millisecondes, au plus 24 h après le démarrage', async () => {
    const m = await envRecharge();
    const nom = m.NOMS_EN_ROTATION[0];
    const v = m.variablesDeRotation(nom);
    const precedente = valeurFactice('cle-precedente');
    const avec = (echeance: string) => ({
      NODE_ENV: 'test',
      ...secretsFactices(m),
      [v.cle]: precedente,
      [v.echeance]: echeance,
    });
    for (const e of ['2026-10-02T12:00:00Z', '2026-10-02T12:00:00.123Z', '2026-10-03T10:00:00Z']) {
      const r = m.lireTrousseaux(avec(e), INSTANT_DE_REFERENCE);
      expect(r.ok, e).toBe(true);
      if (r.ok) {
        expect(r.trousseaux[nom].precedente, e).toEqual({
          valeur: precedente,
          echeanceMs: Date.parse(e),
        });
      }
    }
    const refusDe = (e: string) => {
      const r = m.lireTrousseaux(avec(e), INSTANT_DE_REFERENCE);
      return r.ok ? [] : r.refus;
    };
    // Une milliseconde au-delà des 24 h : refusée.
    expect(refusDe('2026-10-03T10:00:00.001Z')).toEqual([
      { variable: v.echeance, motif: 'echeance_au_dela_de_24_h' },
    ]);
    // L'ancre de tête : une année étendue est lisible par Date.parse, mais n'est pas la forme admise.
    for (const e of ['+002026-10-02T12:00:00Z', '2026-10-02', '2026-10-02T12:00:00+02:00']) {
      expect(refusDe(e), e).toEqual([{ variable: v.echeance, motif: 'format_invalide' }]);
    }
  });
});

describe('REQ-QA-030 — le module rechargé : le refus de démarrer écrit les refus et sort en 1', () => {
  /** Espionne la sortie : `process.exit` LÈVE au lieu de sortir ; tout est restauré après. */
  function capturer(appel: () => unknown): { sortie: string; ecrit: string; rendu: unknown } {
    const sortie = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`sortie ${String(code)}`);
    });
    const ecriture = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      let rendu: unknown;
      let leve = '';
      try {
        rendu = appel();
      } catch (e) {
        leve = (e as Error).message;
      }
      return { sortie: leve, ecrit: ecriture.mock.calls.map((c) => String(c[0])).join(''), rendu };
    } finally {
      sortie.mockRestore();
      ecriture.mockRestore();
    }
  }

  it('REQ-QA-030 : secrets en défaut — l’en-tête, une ligne par refus, puis la sortie en 1', async () => {
    const m = await envRecharge();
    const base: Record<string, string | undefined> = { NODE_ENV: 'test', ...secretsFactices(m) };
    const [n0 = '', n1 = ''] = m.NOMS_DES_SECRETS;
    delete base[n0];
    delete base[n1];
    const c = capturer(() => m.exigerEnvironnement(base));
    expect(c.sortie).toBe('sortie 1');
    expect(c.ecrit).toBe(
      "Démarrage refusé : secrets d'environnement en défaut (src/lib/env.ts, .env.example).\n" +
        `  ${n0} : absente\n  ${n1} : absente\n`
    );
    expect(c.rendu).toBeUndefined();
  });

  it('REQ-QA-030 : secrets valides — ils sont rendus, rien n’est écrit, rien ne sort', async () => {
    const m = await envRecharge();
    const secrets = secretsFactices(m);
    const c = capturer(() => m.exigerEnvironnement({ NODE_ENV: 'test', ...secrets }));
    expect(c.sortie).toBe('');
    expect(c.ecrit).toBe('');
    expect(c.rendu).toEqual(secrets);
  });

  it('REQ-QA-030 : démarrage en défaut — l’en-tête des variables, une ligne par refus, puis la sortie en 1', async () => {
    const m = await envRecharge();
    const base = { ...demarrageFactice(m), DATABASE_URL: undefined, NOTIFY_SINK: 'false' };
    const c = capturer(() => m.exigerDemarrage(base));
    expect(c.sortie).toBe('sortie 1');
    expect(c.ecrit).toBe(
      "Démarrage refusé : variables d'environnement en défaut (src/lib/env.ts, docs/env.md).\n" +
        '  DATABASE_URL : absente\n  NOTIFY_SINK : requise_hors_production\n'
    );
  });

  it('REQ-QA-030 : démarrage complet — l’environnement est rendu, rien n’est écrit, rien ne sort', async () => {
    const m = await envRecharge();
    const base = demarrageFactice(m);
    const c = capturer(() => m.exigerDemarrage(base));
    expect(c.sortie).toBe('');
    expect(c.ecrit).toBe('');
    expect((c.rendu as Record<string, unknown>).DATABASE_URL).toBe(base.DATABASE_URL);
  });
});

describe('REQ-QA-030 — l’identifiant du salon d’alerte, rechargé, à deux faces', () => {
  it.each(['-1001234567890', '123456789', '-'.concat('9'.repeat(20))])(
    'REQ-QA-030 : TÉMOIN — %s, un entier signé d’au plus vingt chiffres, est admis',
    async (salon) => {
      const m = await envRecharge();
      expect(m.schemaSecretsConditionnels.safeParse({ TELEGRAM_CHAT_ID: salon }).success).toBe(
        true
      );
    }
  );

  it.each([
    ['des lettres', 'abc'],
    ['la lettre d seule, que le motif sans barre oblique admettait', 'ddd'],
    ['un chiffre suivi d’une lettre', '12a'],
    ['un double signe', '--1'],
    ['vingt et un chiffres', '1'.repeat(21)],
    ['une espace en bordure', ' -1001234567890'],
  ])('REQ-QA-030 : TÉMOIN — %s est refusé', async (_q, salon) => {
    const m = await envRecharge();
    expect(m.schemaSecretsConditionnels.safeParse({ TELEGRAM_CHAT_ID: salon }).success).toBe(false);
  });
});

describe('REQ-QA-030 — le module rechargé : chaque refus à son code exact (mutants nommés de QA-T62)', () => {
  it.each([
    ['un salon d’alerte hors forme', 'TELEGRAM_CHAT_ID', 'abc'],
    ['une clé de chiffrement non hexadécimale', CLE_HEX, 'z'.repeat(64)],
    ['une URL de base illisible', 'DATABASE_URL', 'pas une url'],
    ['une URL de base au mauvais protocole', 'DATABASE_URL', 'mysql://partners@localhost/partners'],
    [
      'une URL de migration au mauvais protocole',
      'DATABASE_MIGRATION_URL',
      'mysql://proprio@localhost/partners',
    ],
  ])(
    'REQ-QA-030 : TÉMOIN — %s est refusée `format_invalide`, ce motif exactement',
    async (_q, nom, valeur) => {
      const m = await envRecharge();
      expect(lignesDe(m, { ...demarrageFactice(m), [nom]: valeur })).toEqual([
        `${nom} : format_invalide`,
      ]);
    }
  );

  it.each([
    'postgresql://proprio@localhost:5432/partners',
    'postgres://proprio@localhost:5432/partners',
  ])('REQ-QA-030 : l’URL de migration admet les deux protocoles de Postgres (%s)', async (url) => {
    const m = await envRecharge();
    expect(lignesDe(m, { ...demarrageFactice(m), DATABASE_MIGRATION_URL: url })).toEqual([]);
  });

  it('REQ-QA-030 : TÉMOIN — une échéance de rotation suivie d’un caractère de plus est refusée (instant ancré)', async () => {
    const m = await envRecharge();
    const nom = m.NOMS_EN_ROTATION[0]!;
    const { cle, echeance } = m.variablesDeRotation(nom);
    const r = m.lireTrousseaux(
      {
        ...demarrageFactice(m),
        [cle]: valeurFactice('precedente'),
        [echeance]: '2026-10-02T11:00:00Z!',
      },
      INSTANT_DE_REFERENCE
    );
    expect(r.ok ? [] : r.refus.map(m.formaterRefus)).toEqual([`${echeance} : format_invalide`]);
  });

  it('REQ-QA-030 : TÉMOIN — une échéance sans sa clé précédente nomme la clé `absente`, elle seule', async () => {
    const m = await envRecharge();
    const nom = m.NOMS_EN_ROTATION[0]!;
    const { cle, echeance } = m.variablesDeRotation(nom);
    const r = m.lireTrousseaux(
      { ...demarrageFactice(m), [echeance]: '2026-10-02T11:00:00Z' },
      INSTANT_DE_REFERENCE
    );
    expect(r.ok ? [] : r.refus.map(m.formaterRefus)).toEqual([`${cle} : absente`]);
  });
});
