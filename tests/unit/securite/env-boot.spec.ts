/**
 * env-boot.spec.ts — le démarrage refuse un jeu de secrets absent, faible, préfixé ou dédoublé.
 *
 * @req REQ-SEC-028
 *
 * Livré par SEC-01, témoin de la gate `G-SEC-ENV`. QA-T04 étend CE fichier et CE schéma.
 *
 * CE QUI EST JUGÉ, ET PAR QUOI.
 *  - Le CODE DE SORTIE d'un vrai sous-processus Node chargé par `tsx`, lancé avec un environnement construit à
 *    partir de zéro (le chemin des exécutables et la racine système seulement) : un secret posé sur
 *    le poste qui lance la suite masquerait exactement la panne « variable absente ».
 *  - La liste des secrets n'est JAMAIS retapée ici. Elle est lue dans le schéma de `src/lib/env.ts`
 *    (RM-01), et les noms que cite le texte de l'exigence sont lus dans `docs/requirements.json`.
 *  - Toutes les valeurs sont tirées au hasard à l'exécution : aucune n'est écrite dans le dépôt.
 *
 * Arbitrages et contrat de format : partners/ADR-0013. Le câblage au démarrage réel du serveur
 * n'est pas ici : la fonction `exigerEnvironnement()` est livrée, son appelant viendra.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MOTIFS_DE_REFUS,
  NOMS_DES_SECRETS,
  formaterRefus,
  kidDe,
  lireEnvironnement,
  type Refus,
} from '../../../src/lib/env';

const RACINE = process.cwd();
const MODULE = pathToFileURL(resolve(RACINE, 'src/lib/env.ts')).href;

/**
 * La seule variable que l'exigence veut en hexadécimal. Un nom seul n'est pas une copie de la liste :
 * c'est la clé que le texte de REQ-SEC-028 distingue (« 64 hex pour la clé »).
 */
const CLE_HEX = 'PII_ENCRYPTION_KEY';

// ── Bac des scripts lancés en sous-processus ────────────────────────────────────────────────────
const BAC = mkdtempSync(join(tmpdir(), 'sec01-'));
afterAll(() => rmSync(BAC, { recursive: true, force: true }));

const BOOT = join(BAC, 'boot.ts');
writeFileSync(
  BOOT,
  `import { exigerEnvironnement } from ${JSON.stringify(MODULE)};\n` +
    `const env = exigerEnvironnement();\n` +
    'process.stdout.write(`boot accepte, variables confrontees : ${Object.keys(env).length}\\n`);\n'
);
const IMPORT_SEUL = join(BAC, 'import-seul.ts');
writeFileSync(
  IMPORT_SEUL,
  `import ${JSON.stringify(MODULE)};\nprocess.stdout.write('import sans effet\\n');\n`
);

/** Le strict nécessaire pour que le processus se lance — et rien du poste qui porte un secret. */
const BASE: Record<string, string> = Object.fromEntries(
  (
    [
      ['PATH', process.env.PATH],
      ['SystemRoot', process.env.SystemRoot],
    ] as const
  ).filter((e): e is readonly [string, string] => typeof e[1] === 'string')
);

interface Sortie {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

/**
 * Un VRAI processus Node, qui charge `tsx` comme chargeur de modules. Pas `npx tsx` : mesuré le
 * 2026-09-18 sur ce poste, `npx` coûte 7 à 9 s par lancement contre 0,7 s ici, et ce fichier en
 * lance une quinzaine. Pas non plus `node node_modules/tsx/dist/cli.mjs`, dont l'enfant peut rendre
 * une sortie vide à code 0 : ici l'enfant ne lance rien, et son code de sortie est celui du boot.
 */
function lancer(script: string, variables: Record<string, string>): Sortie {
  const debut = Date.now();
  const r = spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: RACINE,
    env: { ...BASE, ...variables },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ms: Date.now() - debut };
}

const boot = (variables: Record<string, string>): Sortie => lancer(BOOT, variables);

/** 40 à 60 caractères hexadécimaux : jamais 32, jamais 64, pour qu'une longueur imprimée se voie. */
const valeurAuHasard = (): string => randomBytes(randomInt(20, 31)).toString('hex');

function environnementComplet(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const nom of NOMS_DES_SECRETS) {
    env[nom] = nom === CLE_HEX ? randomBytes(32).toString('hex') : valeurAuHasard();
  }
  return env;
}

/** Les noms de secret autres que la clé, dans l'ordre du schéma. */
const NOMS_LONGS = NOMS_DES_SECRETS.filter((n) => n !== CLE_HEX);

/**
 * Aucune valeur, aucun fragment de huit caractères d'une valeur, aucune longueur exacte. Le rapport
 * d'échec nomme la variable et la position du fragment, jamais le fragment lui-même.
 */
function fuitesDans(sortie: string, env: Record<string, string>): string[] {
  const fuites: string[] = [];
  for (const [nom, v] of Object.entries(env)) {
    for (let i = 0; i + 8 <= v.length; i++) {
      if (sortie.includes(v.slice(i, i + 8))) {
        fuites.push(`${nom} : fragment en position ${i}`);
        break;
      }
    }
    for (const n of new Set([v.length, Buffer.byteLength(v, 'utf8')])) {
      if (new RegExp(`(?<!\\d)${n}(?!\\d)`).test(sortie)) fuites.push(`${nom} : longueur imprimée`);
    }
  }
  return fuites;
}

/** Les lignes de refus imprimées par le boot : `  <NOM> : <motif>[ <autres noms>]`. */
function refusImprimes(stderr: string): string[] {
  return stderr
    .split(/\r?\n/)
    .filter((l) => l.startsWith('  '))
    .map((l) => l.trim());
}

describe('REQ-SEC-028 — la liste des secrets et sa source unique', () => {
  it('REQ-SEC-028 : la liste est dérivée du schéma et contient chaque nom que le texte de l’exigence cite', () => {
    const registre = JSON.parse(readFileSync(join(RACINE, 'docs/requirements.json'), 'utf8')) as {
      exigences: { id: string; texte: string }[];
    };
    const req = registre.exigences.find((e) => e.id === 'REQ-SEC-028');
    expect(req, 'REQ-SEC-028 introuvable dans docs/requirements.json').toBeDefined();
    const cites = [...(req?.texte ?? '').matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1] ?? '');
    console.log(
      `REQ-SEC-028 cite ${cites.length} noms ; le schéma en porte ${NOMS_DES_SECRETS.length}.`
    );
    expect(cites.length).toBeGreaterThan(0);
    const absents = cites.filter((n) => !NOMS_DES_SECRETS.includes(n));
    expect(absents, 'noms cités par REQ-SEC-028 et absents du schéma de src/lib/env.ts').toEqual(
      []
    );
    expect(NOMS_DES_SECRETS).toContain(CLE_HEX);
  });

  it('REQ-SEC-028 : .env.example porte exactement les noms du schéma, dans les deux sens, sans aucune valeur', () => {
    const lignes = readFileSync(join(RACINE, '.env.example'), 'utf8').split(/\r?\n/);
    const declarees = new Map<string, string>();
    const etrangeres: string[] = [];
    for (const l of lignes) {
      if (l === '' || l.startsWith('#')) continue;
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
      if (m?.[1] === undefined) etrangeres.push(l);
      else declarees.set(m[1], m[2] ?? '');
    }
    expect(etrangeres, '.env.example ne porte que des commentaires et des lignes NOM=').toEqual([]);
    expect(declarees.size).toBeGreaterThan(0);
    const horsExemple = NOMS_DES_SECRETS.filter((n) => !declarees.has(n));
    const horsSchema = [...declarees.keys()].filter((n) => !NOMS_DES_SECRETS.includes(n));
    expect(horsExemple, 'dans le schéma de src/lib/env.ts, absents de .env.example').toEqual([]);
    expect(horsSchema, 'dans .env.example, absents du schéma de src/lib/env.ts').toEqual([]);
    const valorisees = [...declarees].filter(([, v]) => v !== '').map(([n]) => n);
    expect(valorisees, '.env.example ne porte aucune valeur').toEqual([]);
  });

  it('REQ-SEC-028 : sous src/ et scripts/, aucun fichier autre que src/lib/env.ts ne cite deux noms de secret entre délimiteurs de chaîne', () => {
    const cite = (texte: string, nom: string): boolean =>
      new RegExp(`['"\`]${nom}['"\`]`).test(texte);
    const nomsCites = (texte: string): string[] => NOMS_DES_SECRETS.filter((n) => cite(texte, n));
    // Contre-témoins : le détecteur voit une recopie, et laisse passer une lecture.
    const [a, b] = NOMS_DES_SECRETS;
    expect(nomsCites(`const l = ['${a}', "${b}"];`)).toHaveLength(2);
    expect(nomsCites(`f(env.${a}, env.${b});`)).toHaveLength(0);

    const fichiers = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'scripts'],
      { cwd: RACINE, encoding: 'utf8' }
    )
      .split(/\r?\n/)
      .filter((f) => f !== '' && f !== 'src/lib/env.ts');
    console.log(`${fichiers.length} fichiers lus sous src/ et scripts/.`);
    expect(fichiers.length).toBeGreaterThan(0);
    const recopies = fichiers.filter(
      (f) => nomsCites(readFileSync(join(RACINE, f), 'utf8')).length >= 2
    );
    expect(recopies, 'la liste des secrets vit dans src/lib/env.ts et nulle part ailleurs').toEqual(
      []
    );
  });
});

describe('REQ-SEC-028 — le boot, jugé par le code de sortie d’un sous-processus', () => {
  it('REQ-SEC-028 : environnement complet et distinct — le boot sort en 0 et n’imprime aucun secret', () => {
    const env = environnementComplet();
    const s = boot(env);
    console.log(`boot complet : code ${s.code}, ${s.ms} ms — ${s.stdout.trim()}`);
    expect(s.stderr).toBe('');
    expect(s.code).toBe(0);
    expect(s.stdout).toContain(`variables confrontees : ${NOMS_DES_SECRETS.length}`);
    expect(fuitesDans(s.stdout + s.stderr, env)).toEqual([]);
  });

  it('REQ-SEC-028 : chaque secret retiré tour à tour fait sortir le boot en non nul, en nommant cette variable et elle seule', () => {
    expect(NOMS_DES_SECRETS.length).toBeGreaterThan(0);
    let confrontees = 0;
    for (const nom of NOMS_DES_SECRETS) {
      const env = environnementComplet();
      delete env[nom];
      const s = boot(env);
      expect(s.code, `${nom} retiré : code de sortie`).not.toBe(0);
      expect(s.code, `${nom} retiré : le processus a été tué, il n'a pas refusé`).not.toBeNull();
      expect(s.ms, `${nom} retiré : refus en moins de 60 s`).toBeLessThan(60_000);
      expect(refusImprimes(s.stderr), `${nom} retiré : lignes de refus`).toEqual([
        `${nom} : absente`,
      ]);
      expect(fuitesDans(s.stdout + s.stderr, env)).toEqual([]);
      confrontees++;
    }
    console.log(`${confrontees} variables retirées tour à tour, sur ${NOMS_DES_SECRETS.length}.`);
    expect(confrontees).toBe(NOMS_DES_SECRETS.length);
  }, 300_000);

  it('REQ-SEC-028 : deux secrets égaux sont un refus à part entière — le boot sort en non nul et nomme les deux', () => {
    // Deux noms du MILIEU de la liste, non adjacents : un contrôle qui ne compare que des voisins,
    // ou qui saute le premier ou le dernier, ne les voit pas.
    const [x, y] = [NOMS_LONGS[1], NOMS_LONGS[3]];
    expect(x !== undefined && y !== undefined).toBe(true);
    const env = environnementComplet();
    env[y ?? ''] = env[x ?? ''] ?? '';
    const s = boot(env);
    expect(s.code).not.toBe(0);
    expect(s.code).not.toBeNull();
    expect(refusImprimes(s.stderr)).toEqual([`${x} : egale_a ${y}`]);
    expect(fuitesDans(s.stdout + s.stderr, env)).toEqual([]);
  }, 120_000);

  it('REQ-SEC-028 : trois secrets égaux — le refus nomme les trois, et un seul refus par groupe', () => {
    const [x, y, z] = [NOMS_LONGS[0], NOMS_LONGS[2], NOMS_LONGS[4]];
    expect(x !== undefined && y !== undefined && z !== undefined).toBe(true);
    const env = environnementComplet();
    const commune = env[x ?? ''] ?? '';
    env[y ?? ''] = commune;
    env[z ?? ''] = commune;
    const s = boot(env);
    expect(s.code).not.toBe(0);
    expect(s.code).not.toBeNull();
    expect(refusImprimes(s.stderr)).toEqual([`${x} : egale_a ${y}, ${z}`]);
    expect(fuitesDans(s.stdout + s.stderr, env)).toEqual([]);
  }, 120_000);

  it('REQ-SEC-028 : préfixes dev_ et stub refusés hors développement et test, NODE_ENV absent compris', () => {
    const nom = NOMS_LONGS[2] ?? '';
    const avecStub = { ...environnementComplet(), [nom]: `stub${valeurAuHasard()}` };
    const absent = boot(avecStub);
    expect(
      absent.code,
      'NODE_ENV absent : un prédicat de production ouvert laisse passer'
    ).not.toBe(0);
    expect(absent.code).not.toBeNull();
    expect(refusImprimes(absent.stderr)).toEqual([`${nom} : prefixe_interdit`]);
    expect(fuitesDans(absent.stdout + absent.stderr, avecStub)).toEqual([]);

    const avecDev = { ...environnementComplet(), [nom]: `dev_${valeurAuHasard()}` };
    const enDeveloppement = boot({ ...avecDev, NODE_ENV: 'development' });
    expect(enDeveloppement.code, 'NODE_ENV=development : dev_ est admis').toBe(0);
  }, 120_000);

  it('REQ-SEC-028 : une valeur suivie d’un saut de ligne fait sortir le boot en non nul — jamais rognée', () => {
    const nom = NOMS_LONGS[3] ?? '';
    const env = environnementComplet();
    env[nom] = `${env[nom] ?? ''}\n`;
    const s = boot(env);
    expect(s.code).not.toBe(0);
    expect(s.code).not.toBeNull();
    expect(refusImprimes(s.stderr)).toEqual([`${nom} : espace_en_bordure`]);
  }, 120_000);

  it('REQ-SEC-028 : importer le module n’évalue rien — seul l’appel au boot juge l’environnement', () => {
    const s = lancer(IMPORT_SEUL, {});
    expect(s.stderr).toBe('');
    expect(s.code).toBe(0);
    expect(s.stdout).toContain('import sans effet');
  });
});

describe('REQ-SEC-028 — les règles de forme, jugées par la fonction pure', () => {
  const refusDe = (env: Record<string, string | undefined>): Refus[] => {
    const r = lireEnvironnement(env);
    return r.ok ? [] : r.refus;
  };

  it('REQ-SEC-028 : 31 octets refusés, 32 acceptés — comptés en octets UTF-8, pas en caractères', () => {
    const nom = NOMS_LONGS[2] ?? '';
    const base = environnementComplet();
    // 31 et 32 caractères ASCII : le seuil lui-même (un « > » au lieu de « >= » rougit ici).
    const court = randomBytes(16).toString('hex').slice(0, 31);
    const juste = randomBytes(16).toString('hex');
    expect(refusDe({ ...base, [nom]: court })).toEqual([{ variable: nom, motif: 'trop_courte' }]);
    expect(refusDe({ ...base, [nom]: juste })).toEqual([]);
    // 16 caractères de deux octets chacun : 32 octets, donc admis ; compter `.length` les refuserait.
    const accents = Array.from({ length: 16 }, () => 'éèàùçâêîôû'[randomInt(10)]).join('');
    expect(Buffer.byteLength(accents, 'utf8')).toBe(32);
    expect(refusDe({ ...base, [nom]: accents })).toEqual([]);
    // Et une chaîne vide est une variable absente, pas une valeur courte.
    expect(refusDe({ ...base, [nom]: '' })).toEqual([{ variable: nom, motif: 'absente' }]);
  });

  it('REQ-SEC-028 : la clé de chiffrement fait exactement 64 caractères hexadécimaux, ancrés aux deux bouts', () => {
    const base = environnementComplet();
    const hex = randomBytes(32).toString('hex');
    const essais: [string, string][] = [
      ['63 caractères', hex.slice(0, 63)],
      ['65 caractères', `${hex}a`],
      ['un g parmi 64', `${hex.slice(0, 40)}g${hex.slice(41)}`],
      ['64 hexadécimaux précédés', `zz${hex}`],
      ['64 hexadécimaux suivis', `${hex}zz`],
    ];
    for (const [cas, v] of essais) {
      expect(refusDe({ ...base, [CLE_HEX]: v }), cas).toEqual([
        { variable: CLE_HEX, motif: 'format_invalide' },
      ]);
    }
    expect(refusDe({ ...base, [CLE_HEX]: hex.toUpperCase() }), 'majuscules admises').toEqual([]);
  });

  it('REQ-SEC-028 : les préfixes se jugent sans casse, et seul development ou test les admet', () => {
    const nom = NOMS_LONGS[4] ?? '';
    const base = environnementComplet();
    const refuse: Refus = { variable: nom, motif: 'prefixe_interdit' };
    const cas: [string | undefined, string, Refus[]][] = [
      ['production', `dev_${valeurAuHasard()}`, [refuse]],
      ['staging', `DEV_${valeurAuHasard()}`, [refuse]],
      [undefined, `Stub${valeurAuHasard()}`, [refuse]],
      ['production', `STUB_${valeurAuHasard()}`, [refuse]],
      ['test', `stub${valeurAuHasard()}`, []],
      ['development', `DEV_${valeurAuHasard()}`, []],
      // Un préfixe proche n'est pas le préfixe : « dev » sans souligné, « stu » sans b.
      ['production', `deva${valeurAuHasard()}`, []],
      ['production', `stu${valeurAuHasard()}`, []],
    ];
    for (const [nodeEnv, v, attendu] of cas) {
      expect(refusDe({ ...base, [nom]: v, NODE_ENV: nodeEnv }), `NODE_ENV=${nodeEnv}`).toEqual(
        attendu
      );
    }
  });

  it('REQ-SEC-028 : une espace ou un saut de ligne en bordure est refusé, jamais rogné', () => {
    const nom = NOMS_LONGS[1] ?? '';
    const base = environnementComplet();
    const v = valeurAuHasard();
    for (const bord of [`${v}\n`, ` ${v}`, `${v} `, `\t${v}`, `${v}\r\n`]) {
      expect(refusDe({ ...base, [nom]: bord })).toEqual([
        { variable: nom, motif: 'espace_en_bordure' },
      ]);
    }
    expect(refusDe({ ...base, [CLE_HEX]: `${base[CLE_HEX]}\n` })).toEqual([
      { variable: CLE_HEX, motif: 'espace_en_bordure' },
    ]);
  });

  it('REQ-SEC-028 : l’égalité se juge sur tout le jeu — le premier et le dernier nom compris', () => {
    const premier = NOMS_DES_SECRETS[0] ?? '';
    const dernier = NOMS_DES_SECRETS[NOMS_DES_SECRETS.length - 1] ?? '';
    expect(premier === CLE_HEX || dernier === CLE_HEX).toBe(false);
    const base = environnementComplet();
    expect(refusDe({ ...base, [dernier]: base[premier] })).toEqual([
      { variable: premier, motif: 'egale_a', avec: [dernier] },
    ]);
    // Deux groupes distincts : deux refus.
    const [a, b, c, d] = NOMS_LONGS;
    const deux = { ...base, [b ?? '']: base[a ?? ''], [d ?? '']: base[c ?? ''] };
    expect(refusDe(deux)).toEqual([
      { variable: a, motif: 'egale_a', avec: [b] },
      { variable: c, motif: 'egale_a', avec: [d] },
    ]);
  });

  it('REQ-SEC-028 : aucun refus n’imprime une valeur, un fragment de huit caractères ni une longueur', () => {
    const base = environnementComplet();
    const [a, b, c, d, e] = NOMS_LONGS;
    const env: Record<string, string> = {
      ...base,
      [a ?? '']: randomBytes(10).toString('hex').slice(0, 19),
      [b ?? '']: `dev_${valeurAuHasard()}`,
      [c ?? '']: `${valeurAuHasard()}\n`,
      [d ?? '']: base[e ?? ''] ?? '',
      [CLE_HEX]: randomBytes(31).toString('hex'),
    };
    const refus = refusDe(env);
    expect(refus.length).toBeGreaterThanOrEqual(5);
    const texte = refus.map(formaterRefus).join('\n');
    expect(fuitesDans(texte, env)).toEqual([]);
    // La grammaire est FERMÉE : un message de Zod recopié tel quel n'y entre pas.
    const motifs = MOTIFS_DE_REFUS.join('|');
    const noms = NOMS_DES_SECRETS.join('|');
    const ligne = new RegExp(`^(${noms}) : (${motifs})( (${noms})(, (${noms}))*)?$`);
    for (const l of texte.split('\n')) expect(l).toMatch(ligne);
  });

  it('REQ-SEC-028 : kidDe rend huit caractères hexadécimaux, stables pour une valeur, distincts d’un secret à l’autre', () => {
    const env = environnementComplet();
    const kids = NOMS_DES_SECRETS.map((n) => kidDe(env[n] ?? ''));
    for (const k of kids) expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(new Set(kids).size).toBe(NOMS_DES_SECRETS.length);
    const v = valeurAuHasard();
    expect(kidDe(v)).toBe(kidDe(v));
    expect(v).not.toContain(kidDe(v));
  });
});
