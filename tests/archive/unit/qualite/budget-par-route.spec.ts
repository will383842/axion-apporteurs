// @req REQ-UX-033
// @req REQ-QA-031 → REQ-UX-033
/**
 * `perf:bundle` — le poids que le navigateur charge VRAIMENT sur chaque route de l'espace.
 *
 * CE QUE CE FICHIER VISE. La garde `perf:budgets` vérifie que chaque route A un budget ;
 * celle-ci vérifie qu'elle le TIENT. Trois pannes, toutes mesurées sur ce dépôt le 2026-09-29, sont
 * exercées ici plutôt que supposées :
 *
 *   1. LE PÉRIMÈTRE QUI N'EXISTE PLUS. `perf/budgets.json` et l'entrée `perf:bundle` de
 *      `docs/gates.json` désignaient `.next/static/chunks/app/` : sous Next 16 (Turbopack), ce
 *      répertoire N'EST PAS PRODUIT. Un mesureur qui suivrait ces globs sommerait zéro fichier et
 *      rendrait 0 octet, donc un vert permanent. La mesure passe donc par les manifestes, et une
 *      mesure nulle est une FAUTE (`mesure_nulle`), jamais un succès.
 *   2. LE MANIFESTE QU'ON EXÉCUTERAIT. Le manifeste client d'une route est un fichier JavaScript ;
 *      il est LU (son objet JSON extrait), jamais exécuté, et une forme inconnue échoue fermé.
 *   3. LE DÉPASSEMENT QUI SE TAIRAIT. La garde est BLOQUANTE dès sa livraison (arbitrage -d7 du
 *      2026-09-30) : il n'existe aucun mode souple, et une route livrée sans budget rougit aussi.
 *
 * DEUX PLAFONDS (arbitrage -d7 sur délégation de Williams du 2026-09-29) : le JS PROPRE à une
 * route se juge contre le plafond par route ; le SOCLE commun à toutes les routes (le runtime
 * React/Next, `rootMainFiles`) se juge contre le sien, une seule fois.
 *
 * RM-11 : chaque fixture de build est explicite — liste des paquets communs, paquets de chaque
 * route, taille de chaque fichier. Aucune valeur par défaut sur ce que les tests font varier.
 */
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  mesurer,
  depassements,
  codeDeSortie,
  lireManifesteClient,
  cheminDuManifeste,
  FAMILLES,
  nomDeRoute,
  type VueBuild,
} from '../../../scripts/gates/bundle-par-route';

const SCRIPT = 'scripts/gates/bundle-par-route.ts';
/** Sans shell : les parenthèses de `(espace)` casseraient `/bin/sh`. */
const TSX = 'node_modules/tsx/dist/cli.mjs';
const lancerScript = (...args: string[]) =>
  spawnSync(process.execPath, [TSX, SCRIPT, ...args], { encoding: 'utf8' });

/** Des octets incompressibles et déterministes : leur taille gzip suit leur taille brute. */
function octets(n: number, graine: number): Buffer {
  const b = Buffer.alloc(n);
  let x = graine >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    b[i] = x & 0xff;
  }
  return b;
}

function manifeste(cle: string, entryJSFiles: Record<string, string[]>): string {
  return (
    'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n' +
    `globalThis.__RSC_MANIFEST[${JSON.stringify(cle)}] = ${JSON.stringify({
      moduleLoading: { prefix: '', crossOrigin: 'none' },
      clientModules: {},
      entryCSSFiles: {},
      entryJSFiles,
    })};\n`
  );
}

type Fixture = {
  racine: string[];
  polyfills: string[];
  routes: { page: string; entrees: Record<string, string[]> }[];
  tailles: Record<string, number>;
};

/** Une vue de build en mémoire, construite champ par champ depuis la fixture. */
function vueDe(f: Fixture): VueBuild {
  const disque = new Map<string, Buffer | string>();
  disque.set('BUILD_ID', 'fixture');
  disque.set(
    'build-manifest.json',
    JSON.stringify({ rootMainFiles: f.racine, polyfillFiles: f.polyfills, pages: {} })
  );
  let graine = 1;
  for (const [chemin, n] of Object.entries(f.tailles)) disque.set(chemin, octets(n, graine++));
  for (const r of f.routes) {
    const cle = r.page.replace(/^src\/app/, '').replace(/\.(t|j)sx?$/, '');
    disque.set(cheminDuManifeste(r.page), manifeste(cle, r.entrees));
  }
  const pages = f.routes.map((r) => r.page);
  return {
    pages,
    // Toute route de la fixture est budgétée ; le témoin `budget_absent` en retire une, nommément.
    budgetees: new Set(pages.map(nomDeRoute)),
    lire: (chemin) => {
      const v = disque.get(chemin);
      return v === undefined ? null : Buffer.from(v);
    },
  };
}

const gz = (n: number, g: number) => gzipSync(octets(n, g), { level: 9 }).length;
const PAGE_A = 'src/app/(espace)/connexion/page.tsx';
const PAGE_B = 'src/app/(espace)/mes-entreprises/page.tsx';
const PLAFONDS_LARGES = { routeOctets: 1_000_000, socleOctets: 1_000_000 };

describe('la mesure est celle que le navigateur charge', () => {
  it('REQ-UX-033 : somme les paquets communs et ceux de la route, en gzip, sans les polyfills noModule', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js', 'static/chunks/r2.js'],
      polyfills: ['static/chunks/poly.js'],
      routes: [{ page: PAGE_A, entrees: { '[project]/src/app/layout': ['static/chunks/p1.js'] } }],
      tailles: {
        'static/chunks/r1.js': 4000,
        'static/chunks/r2.js': 6000,
        'static/chunks/p1.js': 3000,
        'static/chunks/poly.js': 50000,
      },
    });
    const { mesures, fautes, socle } = mesurer(vue);
    expect(fautes).toEqual([]);
    expect(mesures).toHaveLength(1);
    const m = mesures[0]!;
    expect(m.route).toBe('/connexion');
    expect(m.premierChargement).toBe(gz(4000, 1) + gz(6000, 2) + gz(3000, 3));
    expect(m.propre).toBe(gz(3000, 3));
    expect(socle).toBe(gz(4000, 1) + gz(6000, 2));
    expect(m.fichiers).not.toContain('static/chunks/poly.js');
  });

  it('un paquet partagé entre la racine et la route ne compte qu’une fois, et pas dans le propre', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [
        { page: PAGE_A, entrees: { a: ['static/chunks/r1.js'], b: ['static/chunks/r1.js'] } },
      ],
      tailles: { 'static/chunks/r1.js': 5000 },
    });
    const m = mesurer(vue).mesures[0]!;
    expect(m.fichiers).toEqual(['static/chunks/r1.js']);
    expect(m.propre).toBe(0);
  });

  it('nomme la route depuis le fichier de page — groupes de routes retirés, segments gardés', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [{ page: 'src/app/(espace)/connexion/[jeton]/page.tsx', entrees: {} }],
      tailles: { 'static/chunks/r1.js': 100 },
    });
    expect(mesurer(vue).mesures[0]!.route).toBe('/connexion/[jeton]');
  });
});

describe('ce qui ne se mesure pas est une faute, jamais zéro octet', () => {
  it('build_absent : aucun build, la garde rougit au lieu de rendre un vert vide', () => {
    const vue: VueBuild = { pages: [PAGE_A], budgetees: new Set(['/connexion']), lire: () => null };
    const r = mesurer(vue);
    expect(r.fautes.map((f) => f.famille)).toEqual(['build_absent']);
    expect(codeDeSortie(r, PLAFONDS_LARGES)).toBe(1);
  });

  it('manifeste_absent : une route de l’espace sans manifeste client est nommée', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [],
      tailles: { 'static/chunks/r1.js': 100 },
    });
    const { fautes } = mesurer({
      ...vue,
      pages: [PAGE_B],
      budgetees: new Set(['/mes-entreprises']),
    });
    expect(fautes.map((f) => f.famille)).toEqual(['manifeste_absent']);
    expect(fautes[0]!.message).toContain('/mes-entreprises');
  });

  it('manifeste_illisible : une forme inconnue échoue fermé, sans exécuter le fichier', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [{ page: PAGE_A, entrees: {} }],
      tailles: { 'static/chunks/r1.js': 100 },
    });
    const piege: VueBuild = {
      ...vue,
      lire: (c) =>
        c === cheminDuManifeste(PAGE_A)
          ? Buffer.from('globalThis.__PWNED = 1; module.exports = {};')
          : vue.lire(c),
    };
    expect(mesurer(piege).fautes.map((f) => f.famille)).toEqual(['manifeste_illisible']);
    expect((globalThis as Record<string, unknown>).__PWNED).toBeUndefined();
  });

  it('paquet_introuvable : un paquet cité par un manifeste et absent du disque est nommé', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [{ page: PAGE_A, entrees: { a: ['static/chunks/fantome.js'] } }],
      tailles: { 'static/chunks/r1.js': 100 },
    });
    const { fautes } = mesurer(vue);
    expect(fautes.map((f) => f.famille)).toEqual(['paquet_introuvable']);
    expect(fautes[0]!.message).toContain('static/chunks/fantome.js');
  });

  it('mesure_nulle : aucun fichier trouvé, c’est le piège des globs morts — la garde ROUGIT', () => {
    const vue = vueDe({
      racine: [],
      polyfills: [],
      routes: [{ page: PAGE_A, entrees: {} }],
      tailles: {},
    });
    const r = mesurer(vue);
    expect(r.fautes.map((f) => f.famille)).toEqual(['mesure_nulle']);
    expect(codeDeSortie(r, PLAFONDS_LARGES)).toBe(1);
  });

  it('zéro route balayée n’est pas une faute, mais le résultat le porte', () => {
    const vue = vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [],
      tailles: { 'static/chunks/r1.js': 1 },
    });
    const r = mesurer(vue);
    expect(r.fautes).toEqual([]);
    expect(r.mesures).toEqual([]);
    expect(codeDeSortie(r, PLAFONDS_LARGES)).toBe(0);
  });
});

describe('le dépassement : nommé, et bloquant dès la livraison', () => {
  const plafonds = { routeOctets: 10_000, socleOctets: 5_000 };
  const construire = (tailleRacine: number, tailleGraphiques: number) =>
    vueDe({
      racine: ['static/chunks/r1.js'],
      polyfills: [],
      routes: [
        { page: PAGE_A, entrees: { a: ['static/chunks/leger.js'] } },
        { page: PAGE_B, entrees: { b: ['static/chunks/graphiques.js'] } },
      ],
      tailles: {
        'static/chunks/r1.js': tailleRacine,
        'static/chunks/leger.js': 1000,
        'static/chunks/graphiques.js': tailleGraphiques,
      },
    });

  it('la route qui embarque une librairie lourde est la seule nommée', () => {
    const r = mesurer(construire(1000, 20_000));
    expect(depassements(r, plafonds).map((d) => [d.famille, d.route])).toEqual([
      ['budget_depasse', '/mes-entreprises'],
    ]);
  });

  it('le socle commun au-dessus de son plafond est nommé une fois, pas une fois par route', () => {
    const r = mesurer(construire(8000, 1000));
    expect(depassements(r, plafonds).map((d) => d.famille)).toEqual(['socle_depasse']);
  });

  it('un dépassement de route sort en non nul, sans aucun drapeau', () => {
    expect(codeDeSortie(mesurer(construire(1000, 20_000)), plafonds)).toBe(1);
  });

  it('un dépassement du socle sort en non nul', () => {
    expect(codeDeSortie(mesurer(construire(8000, 1000)), plafonds)).toBe(1);
  });

  it('tout sous les plafonds sort en zéro', () => {
    expect(codeDeSortie(mesurer(construire(1000, 1000)), plafonds)).toBe(0);
  });

  it('une route livrée sans entrée dans perf/budgets.json est une faute, nommée', () => {
    const vue = construire(1000, 1000);
    const r = mesurer({ ...vue, budgetees: new Set(['/connexion']) });
    expect(r.fautes.map((f) => [f.famille, f.message.split(' ')[0]])).toEqual([
      ['budget_absent', '/mes-entreprises'],
    ]);
    expect(codeDeSortie(r, plafonds)).toBe(1);
  });

  it('une faute de mesure rougit', () => {
    const vue: VueBuild = { pages: [PAGE_A], budgetees: new Set(['/connexion']), lire: () => null };
    expect(codeDeSortie(mesurer(vue), plafonds)).toBe(1);
  });
});

describe('le manifeste est lu, jamais exécuté', () => {
  it('extrait l’objet entryJSFiles de la forme que Next 16 écrit', () => {
    const texte = manifeste('/(espace)/connexion/page', { a: ['static/chunks/x.js'] });
    expect(lireManifesteClient(texte)).toEqual({ a: ['static/chunks/x.js'] });
  });

  it('rend null sur tout ce qui n’est pas cette forme', () => {
    expect(lireManifesteClient('module.exports = {}')).toBeNull();
    expect(lireManifesteClient('globalThis.__RSC_MANIFEST["x"] = {pas du json};')).toBeNull();
  });
});

describe('les familles déclarées et la ligne de commande', () => {
  it('déclare exactement les familles que ce fichier exerce', () => {
    expect([...FAMILLES].sort()).toEqual(
      [
        'budget_absent',
        'budget_depasse',
        'socle_depasse',
        'build_absent',
        'manifeste_absent',
        'manifeste_illisible',
        'mesure_nulle',
        'paquet_introuvable',
      ].sort()
    );
  });

  it('sur un répertoire de build absent, la commande sort en non nul et nomme build_absent', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'perf-bundle-'));
    try {
      const r = lancerScript('--build', join(dossier, 'absent'));
      expect(r.status).not.toBe(0);
      expect((r.stdout ?? '') + (r.stderr ?? '')).toContain('build_absent');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 60_000);

  it('sur un build sur disque, une route lourde sort en un et est nommée ; une route légère en zéro', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'perf-bundle-'));
    try {
      const ecrire = (rel: string, contenu: Buffer | string) => {
        const p = join(dossier, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, contenu);
      };
      ecrire('BUILD_ID', 'fixture');
      ecrire(
        'build-manifest.json',
        JSON.stringify({ rootMainFiles: ['static/chunks/r.js'], polyfillFiles: [] })
      );
      ecrire('static/chunks/r.js', octets(1000, 7));
      ecrire('static/chunks/graphiques.js', octets(200_000, 8));
      ecrire('static/chunks/leger.js', octets(1000, 9));
      ecrire(
        cheminDuManifeste('src/app/(espace)/connexion/page.tsx'),
        manifeste('/(espace)/connexion/page', { a: ['static/chunks/graphiques.js'] })
      );
      ecrire(
        cheminDuManifeste('src/app/(espace)/confidentialite/page.tsx'),
        manifeste('/(espace)/confidentialite/page', { a: ['static/chunks/leger.js'] })
      );
      const lancer = (page: string) => lancerScript('--build', dossier, '--pages', page);
      const lourde = lancer('src/app/(espace)/connexion/page.tsx');
      expect(lourde.status).toBe(1);
      expect(lourde.stdout + lourde.stderr).toContain('[budget_depasse] /connexion');
      const legere = lancer('src/app/(espace)/confidentialite/page.tsx');
      expect(legere.stdout + legere.stderr).toContain('/confidentialite');
      expect(legere.status).toBe(0);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 60_000);
});
