// @req REQ-SEC-029
/**
 * headers.spec.ts — témoin de la gate G-SEC-HEADERS (SEC-02) : toute route sert la CSP par nonce
 * et les en-têtes de sécurité de REQ-SEC-029.
 *
 * CE QUI EST JUGÉ, ET PAR QUOI.
 *  - La VRAIE couche : la fonction `proxy` et son `matcher` (`src/proxy.ts`), et `headers()` de
 *    `next.config.ts`, passés par les outils de test de Next lui-même
 *    (`unstable_doesMiddlewareMatch`, `unstable_getResponseFromNextConfig`). Pas un serveur démarré :
 *    la mesure au navigateur appartient à la première page.
 *  - Les routes confrontées sont DÉRIVÉES : toute `page.*` / `route.*` sous `src/app/`, plus les
 *    chemins de la carte `docs/ESPACE-ROUTES.md`, qui exercent le `matcher` sur les routes à venir.
 *  - Les directives attendues sont une liste PROPRE à ce fichier, confrontée au texte de l'exigence :
 *    un vérificateur qui importerait la liste du constructeur survivrait au retrait d'une directive
 *    des deux côtés. C'est leur divergence qui rougit.
 *  - Le vérificateur `verifierEntetes` a deux faces : zéro défaut sur la couche du dépôt, et un défaut
 *    NOMMÉ sur chaque couche de bac (directive retirée, nonce rejoué, origine ouverte…).
 */
// En PREMIER : ce que le serveur Node de Next charge avant tout le reste (il expose
// `AsyncLocalStorage` en global). Sans lui, les outils de test de Next lèvent « Invariant:
// AsyncLocalStorage accessed in runtime where it is not available » — le proxy, lui, tourne
// toujours dans ce runtime (Next 16 lui impose Node.js).
import 'next/dist/server/node-environment-baseline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { NextRequest } from 'next/server';
import type { NextConfig } from 'next';
import {
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
  type MiddlewareSourceConfig,
} from 'next/experimental/testing/server';
import { config as configDuProxy, proxy } from '../../../src/proxy';
import nextConfig from '../../../next.config';

const RACINE = process.cwd();
const BASE = 'https://partners.test';

// ── Ce que la politique DOIT être, écrit ici et nulle part ailleurs ─────────────────────────────

/** `NONCE` tient la place du nonce de la réponse dans la liste attendue. */
const NONCE = Symbol('nonce');
type Source = string | typeof NONCE;

/**
 * Chaque directive, et EXACTEMENT ses sources. Une source de plus est un défaut (`'unsafe-inline'`,
 * `https:`…), une de moins aussi, et une directive absente de cette liste est un défaut : une
 * `script-src-elem` ou une `style-src-attr` ajoutée relâcherait la politique sans toucher aux autres.
 * `connect-src` admet en plus des origines précises, que le code appelle réellement.
 */
const DIRECTIVES_ATTENDUES: Readonly<Record<string, readonly Source[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", NONCE, "'strict-dynamic'"],
  'style-src': ["'self'", NONCE],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

/** Deux ans : au-dessus du plancher d'un an qu'exige l'inscription sur la liste de préchargement. */
const HSTS_MAX_AGE_MINIMAL = 31_536_000;
const REFERRER_POLICY = 'strict-origin-when-cross-origin';
/** Les fonctions que la `Permissions-Policy` doit couper, chacune à `()`. */
const FONCTIONS_COUPEES = [
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
  'bluetooth',
  'serial',
  'hid',
  'browsing-topics',
];
const OCTETS_MINIMAUX_DU_NONCE = 16;
/** Des sources qui ouvrent `connect-src` à une famille d'origines, jamais à une origine. */
const SOURCE_LARGE = /^(\*|[a-z][a-z0-9+.-]*:|'[^']*')$|\*/i;

// ── Les routes confrontées, dérivées ─────────────────────────────────────────────────────────────

/** Toute `page.*` / `route.*` sous `src/app/`, chemin reconstruit, segments dynamiques instanciés. */
function routesDuDisque(racineApp: string): string[] {
  if (!existsSync(racineApp)) return [];
  const routes = new Set<string>();
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/^(page|route)\.[cm]?[jt]sx?$/.test(entree.name)) {
        const segments = relative(racineApp, dossier).split(sep).filter(Boolean);
        // Dossier privé (`_x`) : jamais routé.
        if (segments.some((s) => s.startsWith('_'))) continue;
        const url = segments
          .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
          .flatMap((s) => {
            if (/^\[\[\.\.\..+\]\]$/.test(s)) return [];
            if (/^\[\.\.\..+\]$/.test(s)) return ['sonde-a', 'sonde-b'];
            if (/^\[.+\]$/.test(s)) return ['sonde'];
            return [s];
          });
        routes.add('/' + url.join('/'));
      }
    }
  };
  parcourir(racineApp);
  return [...routes].sort();
}

/** Les chemins de la carte : accents graves ouvrant sur `/`, `<jeton>` instancié, requête retirée. */
function routesDeLaCarte(texte: string): string[] {
  const routes = new Set<string>();
  for (const [, brut] of texte.matchAll(/`(\/[^`\s]*)`/g)) {
    routes.add(brut!.split('?')[0]!.replace(/<[^>]+>/g, 'jeton-de-sonde'));
  }
  return [...routes].sort();
}

/**
 * Aucune route d'API n'existe encore. Cette sonde rend visible, AVANT la première, un `matcher` qui
 * exclurait `api` : REQ-SEC-029 dit « toutes les routes ». Ce n'est pas une route, c'est une sonde.
 */
const SONDES_DU_MATCHER = ['/api/sonde'];
/** Les ressources statiques que le proxy ne voit pas : `next.config.ts` doit les couvrir. */
const RESSOURCES_STATIQUES = ['/_next/static/chunks/sonde.js', '/_next/image', '/favicon.ico'];

// ── Le vérificateur ──────────────────────────────────────────────────────────────────────────────

interface Couche {
  proxy: (requete: NextRequest) => Response | Promise<Response>;
  config: MiddlewareSourceConfig;
  nextConfig: NextConfig;
}

interface Verdict {
  defauts: string[];
  reponses: number;
  directives: number;
}

/** Une origine est « appelée » si un fichier de `src/` autre que la source des en-têtes la cite. */
function origineAppeleeSurLeDisque(racineSrc: string): (origine: string) => boolean {
  const source = join(racineSrc, 'server', 'securite', 'entetes.ts');
  const textes: string[] = [];
  const parcourir = (dossier: string): void => {
    if (!existsSync(dossier)) return;
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/\.[cm]?[jt]sx?$/.test(entree.name) && chemin !== source) {
        textes.push(readFileSync(chemin, 'utf8'));
      }
    }
  };
  parcourir(racineSrc);
  return (origine) => textes.some((t) => t.includes(origine));
}

function lireDirectives(csp: string): { directives: Map<string, string[]>; doublons: string[] } {
  const directives = new Map<string, string[]>();
  const doublons: string[] = [];
  for (const brute of csp.split(';')) {
    const [nom, ...sources] = brute.trim().split(/\s+/);
    if (!nom) continue;
    const cle = nom.toLowerCase();
    if (directives.has(cle)) doublons.push(cle);
    else directives.set(cle, sources);
  }
  return { directives, doublons };
}

function jugerStatiques(route: string, entetes: Headers, defauts: Set<string>): void {
  const hsts = entetes.get('strict-transport-security');
  if (hsts === null) defauts.add(`entete_absent Strict-Transport-Security (${route})`);
  else {
    const jetons = hsts.split(';').map((j) => j.trim().toLowerCase());
    const maxAge = Number(
      /^max-age=(\d+)$/.exec(jetons.find((j) => j.startsWith('max-age=')) ?? '')?.[1]
    );
    if (!(maxAge >= HSTS_MAX_AGE_MINIMAL)) defauts.add(`hsts_max_age_insuffisant (${route})`);
    if (!jetons.includes('includesubdomains'))
      defauts.add(`hsts_sans_includeSubDomains (${route})`);
    if (!jetons.includes('preload')) defauts.add(`hsts_sans_preload (${route})`);
  }
  if (entetes.get('x-content-type-options') !== 'nosniff') {
    defauts.add(`entete_absent X-Content-Type-Options: nosniff (${route})`);
  }
  if (entetes.get('referrer-policy') !== REFERRER_POLICY) {
    defauts.add(`entete_absent Referrer-Policy: ${REFERRER_POLICY} (${route})`);
  }
  const permissions = entetes.get('permissions-policy');
  if (permissions === null) defauts.add(`entete_absent Permissions-Policy (${route})`);
  else {
    const regles = new Map(
      permissions.split(',').map((r) => {
        const [nom = '', valeur = ''] = r.split('=').map((x) => x.trim());
        return [nom, valeur] as const;
      })
    );
    for (const f of FONCTIONS_COUPEES) {
      if (regles.get(f) !== '()') defauts.add(`permission_non_coupee ${f} (${route})`);
    }
  }
  // E1 : aucune CSP statique. Deux politiques s'intersectent : une sans nonce bloquerait tout.
  if (entetes.has('content-security-policy')) defauts.add(`csp_statique (${route})`);
}

function jugerPolitique(
  route: string,
  csp: string,
  origineAppelee: (origine: string) => boolean,
  defauts: Set<string>
): string | null {
  const { directives, doublons } = lireDirectives(csp);
  for (const d of doublons) defauts.add(`directive_dupliquee ${d} (${route})`);
  for (const nom of directives.keys()) {
    if (!(nom in DIRECTIVES_ATTENDUES)) defauts.add(`directive_inattendue ${nom} (${route})`);
  }
  const nonces = new Set<string>();
  for (const [nom, attendues] of Object.entries(DIRECTIVES_ATTENDUES)) {
    const sources = directives.get(nom);
    if (sources === undefined) {
      defauts.add(`directive_absente ${nom} (${route})`);
      continue;
    }
    const restantes = [...sources];
    for (const attendue of attendues) {
      const i = restantes.findIndex((s) =>
        attendue === NONCE ? /^'nonce-[^']+'$/.test(s) : s === attendue
      );
      if (i === -1) {
        defauts.add(
          `source_absente ${nom} ${attendue === NONCE ? "'nonce-…'" : attendue} (${route})`
        );
        continue;
      }
      if (attendue === NONCE) nonces.add(restantes[i]!.slice("'nonce-".length, -1));
      restantes.splice(i, 1);
    }
    for (const enTrop of restantes) {
      if (nom !== 'connect-src') defauts.add(`source_en_trop ${nom} ${enTrop} (${route})`);
      else if (SOURCE_LARGE.test(enTrop)) defauts.add(`connect_src_ouvert ${enTrop} (${route})`);
      else if (!origineAppelee(enTrop))
        defauts.add(`origine_connect_non_appelee ${enTrop} (${route})`);
    }
  }
  if (nonces.size > 1) defauts.add(`nonces_divergents_dans_la_politique (${route})`);
  const [nonce] = nonces;
  if (nonce === undefined) return null;
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(nonce) ||
    Buffer.from(nonce, 'base64').length < OCTETS_MINIMAUX_DU_NONCE
  ) {
    defauts.add(`nonce_court_ou_invalide (${route})`);
  }
  return nonce;
}

async function verifierEntetes(
  couche: Couche,
  routes: readonly string[],
  {
    requetes = 1000,
    origineAppelee = origineAppeleeSurLeDisque(join(RACINE, 'src')),
  }: { requetes?: number; origineAppelee?: (origine: string) => boolean } = {}
): Promise<Verdict> {
  const defauts = new Set<string>();
  if (routes.length === 0)
    return { defauts: ['aucune_route_confrontee'], reponses: 0, directives: 0 };

  for (const route of [...routes, ...RESSOURCES_STATIQUES]) {
    const r = await unstable_getResponseFromNextConfig({
      url: BASE + route,
      nextConfig: couche.nextConfig,
    });
    jugerStatiques(route, r.headers, defauts);
  }

  for (const route of routes) {
    const url = BASE + route;
    if (
      !unstable_doesMiddlewareMatch({ config: couche.config, url, nextConfig: couche.nextConfig })
    ) {
      defauts.add(`route_hors_proxy ${route}`);
    }
    for (const prefetch of [{ 'next-router-prefetch': '1' }, { purpose: 'prefetch' }]) {
      const vue = unstable_doesMiddlewareMatch({
        config: couche.config,
        url,
        headers: prefetch,
        nextConfig: couche.nextConfig,
      });
      if (!vue) defauts.add(`prefetch_hors_proxy ${Object.keys(prefetch)[0]} ${route}`);
    }
  }

  const vus = new Map<string, number>();
  let reponses = 0;
  let directives = 0;
  const parRoute = Math.max(2, Math.ceil(requetes / routes.length));
  for (const route of routes) {
    for (let k = 0; k < parRoute; k++) {
      // Une requête hostile : elle apporte son propre nonce et sa propre politique.
      const requete = new NextRequest(BASE + route, {
        headers: { 'x-nonce': 'nonce-de-l-attaquant', 'content-security-policy': 'script-src *' },
      });
      const reponse = await couche.proxy(requete);
      reponses++;
      const csp = reponse.headers.get('content-security-policy');
      if (csp === null) {
        defauts.add(`csp_absente (${route})`);
        continue;
      }
      directives = Math.max(directives, lireDirectives(csp).directives.size);
      const nonce = jugerPolitique(route, csp, origineAppelee, defauts);
      if (reponse.headers.get('x-middleware-request-content-security-policy') !== csp) {
        defauts.add(`csp_transmise_divergente (${route})`);
      }
      if (nonce !== null) {
        if (reponse.headers.get('x-middleware-request-x-nonce') !== nonce) {
          defauts.add(`nonce_transmis_divergent (${route})`);
        }
        vus.set(nonce, (vus.get(nonce) ?? 0) + 1);
      }
      if (reponse.headers.has('x-nonce')) defauts.add(`nonce_expose_en_reponse (${route})`);
      const cache = (reponse.headers.get('cache-control') ?? '').split(',').map((j) => j.trim());
      if (!cache.includes('no-store') || !cache.includes('private')) {
        defauts.add(`cache_control_sans_private_no_store (${route})`);
      }
    }
  }
  const repetes = [...vus.values()].filter((n) => n > 1);
  if (repetes.length > 0) {
    defauts.add(`nonce_repete : ${vus.size} nonce(s) distinct(s) pour ${reponses} reponses`);
  }
  return { defauts: [...defauts].sort(), reponses, directives };
}

// ── La couche du dépôt, et les couches de bac ───────────────────────────────────────────────────

const COUCHE: Couche = { proxy, config: configDuProxy, nextConfig };
const ROUTES_DU_DISQUE = routesDuDisque(join(RACINE, 'src', 'app'));
const ROUTES_DE_LA_CARTE = routesDeLaCarte(
  readFileSync(join(RACINE, 'docs', 'ESPACE-ROUTES.md'), 'utf8')
);
const ROUTES = [
  ...new Set([...ROUTES_DU_DISQUE, ...ROUTES_DE_LA_CARTE, ...SONDES_DU_MATCHER]),
].sort();
/** Les bacs n'ont pas besoin de mille requêtes : deux par route suffisent à voir une répétition. */
const PETIT = { requetes: 2 * ROUTES.length };

/** Une copie de travail de la couche dont la réponse du proxy est retouchée après coup. */
function retoucher(modifier: (reponse: Response) => void, base: Couche = COUCHE): Couche {
  return {
    ...base,
    proxy: async (requete) => {
      const reponse = await base.proxy(requete);
      modifier(reponse);
      return reponse;
    },
  };
}

/** Retouche la CSP de la réponse ET celle transmise à la requête, pour qu'elles restent égales. */
function retoucherPolitique(transformer: (csp: string) => string): Couche {
  return retoucher((r) => {
    const csp = transformer(r.headers.get('content-security-policy') ?? '');
    r.headers.set('content-security-policy', csp);
    r.headers.set('x-middleware-request-content-security-policy', csp);
  });
}

function sansDirective(csp: string, nom: string): string {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.split(/\s+/)[0] !== nom)
    .join('; ');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('REQ-SEC-029 — la liste attendue et les routes confrontées', () => {
  it('REQ-SEC-029 : chaque jeton que le texte de l’exigence cite entre accents graves figure dans la liste attendue du témoin', () => {
    const { exigences } = JSON.parse(
      readFileSync(join(RACINE, 'docs', 'requirements.json'), 'utf8')
    ) as {
      exigences: { id: string; texte: string }[];
    };
    const texte = exigences.find((e) => e.id === 'REQ-SEC-029')?.texte ?? '';
    const jetons = [...texte.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    expect(jetons.length).toBeGreaterThan(0);

    const vocabulaire = new Set<string>([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      `Referrer-Policy: ${REFERRER_POLICY}`,
      'Referrer-Policy',
      'Permissions-Policy',
    ]);
    for (const [nom, sources] of Object.entries(DIRECTIVES_ATTENDUES)) {
      vocabulaire.add(nom);
      for (const s of sources) {
        if (s === NONCE) continue;
        vocabulaire
          .add(s)
          .add(s.replace(/^'(.*)'$/, '$1'))
          .add(`${nom} ${s}`);
      }
    }
    expect(jetons.filter((j) => !vocabulaire.has(j))).toEqual([]);
  });

  it('REQ-SEC-029 : les routes sont dérivées du disque et de la carte — plancher strictement positif, compte imprimé', () => {
    console.log(
      `REQ-SEC-029 routes confrontees : ${ROUTES.length} (disque ${ROUTES_DU_DISQUE.length}, ` +
        `carte ${ROUTES_DE_LA_CARTE.length}, sondes ${SONDES_DU_MATCHER.length})`
    );
    expect(ROUTES_DE_LA_CARTE.length).toBeGreaterThan(0);
    expect(ROUTES.length).toBeGreaterThan(SONDES_DU_MATCHER.length);
    expect(ROUTES).toContain('/connexion');
    expect(ROUTES).toContain('/d/jeton-de-sonde');
  });

  it('REQ-SEC-029 : une page ou une route posée sous src/app est dérivée, groupe retiré et segments dynamiques instanciés', () => {
    const bac = mkdtempSync(join(tmpdir(), 'sec02-'));
    try {
      const poser = (chemin: string): void => {
        mkdirSync(join(bac, chemin, '..'), { recursive: true });
        writeFileSync(join(bac, chemin), '');
      };
      poser('page.tsx');
      poser('(espace)/mes-entreprises/page.tsx');
      poser('d/[jeton]/page.tsx');
      poser('api/depots/route.ts');
      poser('docs/[...chemin]/page.tsx');
      poser('_interne/page.tsx');
      poser('mes-entreprises/composant.tsx');
      expect(routesDuDisque(bac)).toEqual([
        '/',
        '/api/depots',
        '/d/sonde',
        '/docs/sonde-a/sonde-b',
        '/mes-entreprises',
      ]);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });
});

describe('REQ-SEC-029 — la couche du dépôt', () => {
  it('REQ-SEC-029 : la couche du dépôt rend zéro défaut sur plus de mille réponses — compte des routes et des directives imprimé', async () => {
    const verdict = await verifierEntetes(COUCHE, ROUTES);
    console.log(
      `REQ-SEC-029 G-SEC-HEADERS : ${ROUTES.length} routes, ${verdict.reponses} reponses, ` +
        `${verdict.directives} directives, ${verdict.defauts.length} defaut(s)`
    );
    expect(verdict.defauts).toEqual([]);
    expect(verdict.reponses).toBeGreaterThanOrEqual(1000);
    expect(verdict.directives).toBe(Object.keys(DIRECTIVES_ATTENDUES).length);
  });

  it('REQ-SEC-029 : next.config.ts lu par le chargeur de Next lui-même — pas par Vitest — rend zéro défaut', async () => {
    // Vitest transforme `next.config.ts` à sa façon ; Next le compile par SWC avec son propre crochet
    // de résolution. C'est le second qui fait foi en production : on le juge, lui aussi.
    const { default: chargerConfig } = await import('next/dist/server/config');
    const { PHASE_PRODUCTION_BUILD } = await import('next/dist/shared/lib/constants');
    const lue = await chargerConfig(PHASE_PRODUCTION_BUILD, RACINE);
    const { defauts } = await verifierEntetes({ ...COUCHE, nextConfig: lue }, ROUTES, PETIT);
    expect(defauts).toEqual([]);
  });

  it('REQ-SEC-029 : le nonce sort de crypto.getRandomValues, 16 octets au moins, tiré à chaque requête', async () => {
    const espion = vi.spyOn(globalThis.crypto, 'getRandomValues');
    for (let k = 0; k < 3; k++) {
      const avant = espion.mock.calls.length;
      const reponse = await proxy(new NextRequest(BASE + '/connexion'));
      const tirages = espion.mock.calls
        .slice(avant)
        .map(([octets]) => octets as unknown as Uint8Array);
      const nonce = /'nonce-([^']+)'/.exec(
        reponse.headers.get('content-security-policy') ?? ''
      )?.[1];
      const source = tirages.find(
        (o) => Buffer.from(o.buffer, o.byteOffset, o.byteLength).toString('base64') === nonce
      );
      expect(
        source,
        'le nonce n’est pas la sortie d’un appel à crypto.getRandomValues pendant la requête'
      ).toBeDefined();
      expect(source!.byteLength).toBeGreaterThanOrEqual(OCTETS_MINIMAUX_DU_NONCE);
    }
  });

  it('REQ-SEC-029 : seul NODE_ENV=development exactement ajoute unsafe-eval — absent, test, production ou mal écrit donnent la politique stricte', async () => {
    // `vi.stubEnv` et non une affectation : `next` déclare `NODE_ENV` en lecture seule, et
    // `vi.unstubAllEnvs()` rend la valeur d'origine même si une assertion lève. `undefined` la RETIRE.
    const poser = (v: string | undefined): void => {
      vi.stubEnv('NODE_ENV', v);
    };
    try {
      for (const valeur of [undefined, '', 'test', 'production', 'Development', 'development ']) {
        poser(valeur);
        expect(process.env.NODE_ENV, 'le bouchon pose bien la valeur voulue').toBe(valeur);
        const { defauts } = await verifierEntetes(COUCHE, ROUTES, PETIT);
        expect(defauts, `NODE_ENV=${JSON.stringify(valeur)}`).toEqual([]);
      }
      poser('development');
      const { defauts } = await verifierEntetes(COUCHE, ROUTES, PETIT);
      expect(new Set(defauts.map((d) => d.replace(/ \(.*\)$/, '')))).toEqual(
        new Set(["source_en_trop script-src 'unsafe-eval'"])
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('REQ-SEC-029 — les couches de bac, chacune un défaut nommé', () => {
  const nomme = async (
    couche: Couche,
    attendu: string | RegExp,
    options = PETIT
  ): Promise<string[]> => {
    const { defauts } = await verifierEntetes(couche, ROUTES, options);
    expect(
      defauts.some((d) => (typeof attendu === 'string' ? d.includes(attendu) : attendu.test(d))),
      defauts.join('\n')
    ).toBe(true);
    return defauts;
  };

  it.each(Object.keys(DIRECTIVES_ATTENDUES))(
    'REQ-SEC-029 : la directive %s retirée — défaut nommé pour elle, et pour elle seule',
    async (nom) => {
      const defauts = await nomme(
        retoucherPolitique((csp) => sansDirective(csp, nom)),
        `directive_absente ${nom} `
      );
      expect(defauts.filter((d) => !d.includes(` ${nom} `))).toEqual([]);
    }
  );

  it('REQ-SEC-029 : un nonce rejoué d’une réponse à l’autre est nommé « nonce_repete »', async () => {
    let premiere: Map<string, string> | null = null;
    const couche = retoucher((r) => {
      const noms = [
        'content-security-policy',
        'x-middleware-request-content-security-policy',
        'x-middleware-request-x-nonce',
      ];
      if (premiere === null) premiere = new Map(noms.map((n) => [n, r.headers.get(n) ?? '']));
      else for (const [n, v] of premiere) r.headers.set(n, v);
    });
    const defauts = await nomme(couche, 'nonce_repete');
    expect(defauts).toHaveLength(1);
  });

  it.each([
    ['script-src', "'unsafe-inline'"],
    ['style-src', "'unsafe-inline'"],
    ['script-src', 'https:'],
  ])('REQ-SEC-029 : %s relâchée par %s — source en trop nommée', async (nom, source) => {
    await nomme(
      retoucherPolitique((csp) => csp.replace(`${nom} `, `${nom} ${source} `)),
      `source_en_trop ${nom} ${source}`
    );
  });

  it('REQ-SEC-029 : strict-dynamic retiré de script-src — source absente nommée', async () => {
    await nomme(
      retoucherPolitique((csp) => csp.replace(" 'strict-dynamic'", '')),
      "source_absente script-src 'strict-dynamic'"
    );
  });

  it('REQ-SEC-029 : une directive qui relâche par la bande (style-src-attr) est nommée inattendue', async () => {
    await nomme(
      retoucherPolitique((csp) => `${csp}; style-src-attr 'unsafe-inline'`),
      'directive_inattendue style-src-attr'
    );
  });

  it('REQ-SEC-029 : une directive posée deux fois est nommée', async () => {
    await nomme(
      retoucherPolitique((csp) => `${csp}; frame-ancestors *`),
      'directive_dupliquee frame-ancestors'
    );
  });

  it.each(['*', 'https:', 'data:', 'blob:', 'https://*.exemple.test'])(
    'REQ-SEC-029 : connect-src ouvert par %s — nommé',
    async (source) => {
      await nomme(
        retoucherPolitique((csp) =>
          csp.replace("connect-src 'self'", `connect-src 'self' ${source}`)
        ),
        `connect_src_ouvert ${source}`
      );
    }
  );

  it('REQ-SEC-029 : une origine de connect-src que rien n’appelle est nommée, une origine appelée passe', async () => {
    const origine = 'https://api.exemple.test';
    const couche = retoucherPolitique((csp) =>
      csp.replace("connect-src 'self'", `connect-src 'self' ${origine}`)
    );
    await nomme(couche, `origine_connect_non_appelee ${origine}`);
    const { defauts } = await verifierEntetes(couche, ROUTES, {
      ...PETIT,
      origineAppelee: (o) => o === origine,
    });
    expect(defauts).toEqual([]);
  });

  it('REQ-SEC-029 : une origine n’est « appelée » que si un fichier de src autre que la source des en-têtes la cite', () => {
    const bac = mkdtempSync(join(tmpdir(), 'sec02-'));
    try {
      const origine = 'https://api.exemple.test';
      mkdirSync(join(bac, 'server', 'securite'), { recursive: true });
      writeFileSync(
        join(bac, 'server', 'securite', 'entetes.ts'),
        `export const O = ['${origine}'];`
      );
      expect(origineAppeleeSurLeDisque(bac)(origine)).toBe(false);
      mkdirSync(join(bac, 'lib'));
      writeFileSync(join(bac, 'lib', 'client.ts'), `fetch('${origine}/v1');`);
      expect(origineAppeleeSurLeDisque(bac)(origine)).toBe(true);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });

  it('REQ-SEC-029 : un nonce transmis à la requête différent de celui de la réponse est nommé', async () => {
    const couche = retoucher((r) => {
      const csp = r.headers.get('content-security-policy') ?? '';
      r.headers.set(
        'x-middleware-request-content-security-policy',
        csp.replace(/'nonce-[^']+'/g, "'nonce-AAAAAAAAAAAAAAAAAAAAAA=='")
      );
    });
    await nomme(couche, 'csp_transmise_divergente');
  });

  it('REQ-SEC-029 : x-nonce transmis différent du nonce de la politique, ou renvoyé sur la réponse — nommés', async () => {
    await nomme(
      retoucher((r) => r.headers.set('x-middleware-request-x-nonce', 'autre')),
      'nonce_transmis_divergent'
    );
    await nomme(
      retoucher((r) => r.headers.set('x-nonce', 'fuite')),
      'nonce_expose_en_reponse'
    );
  });

  it('REQ-SEC-029 : un nonce de 8 octets est nommé court', async () => {
    await nomme(
      retoucherPolitique((csp) => csp.replace(/'nonce-[^']+'/g, "'nonce-AAAAAAAAAAA='")),
      'nonce_court_ou_invalide'
    );
  });

  it('REQ-SEC-029 : un matcher qui exclut api ou les préchargements laisse des routes hors du proxy — nommées', async () => {
    const sansApi = {
      ...COUCHE,
      config: { matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'] },
    };
    await nomme(sansApi, 'route_hors_proxy /api/sonde');
    const sansPrefetch: Couche = {
      ...COUCHE,
      config: {
        matcher: [
          {
            source: '/((?!_next/static|_next/image|favicon\\.ico).*)',
            missing: [{ type: 'header', key: 'next-router-prefetch' }],
          },
        ],
      },
    };
    await nomme(sansPrefetch, 'prefetch_hors_proxy next-router-prefetch /connexion');
  });

  it('REQ-SEC-029 : Cache-Control absent ou sans no-store — nommé', async () => {
    await nomme(
      retoucher((r) => r.headers.delete('cache-control')),
      'cache_control_sans_private_no_store'
    );
    await nomme(
      retoucher((r) => r.headers.set('cache-control', 'private, max-age=60')),
      'cache_control_sans_private_no_store'
    );
  });

  it('REQ-SEC-029 : CSP absente de la réponse — nommée', async () => {
    await nomme(
      retoucher((r) => r.headers.delete('content-security-policy')),
      'csp_absente'
    );
  });

  it('REQ-SEC-029 : next.config sur la seule racine, HSTS sans preload, une permission rouverte, une CSP statique — nommés', async () => {
    const regles = await nextConfig.headers!();
    const avec = (h: NextConfig['headers']): Couche => ({
      ...COUCHE,
      nextConfig: { ...nextConfig, headers: h },
    });
    await nomme(
      avec(async () => regles.map((r) => ({ ...r, source: '/' }))),
      'entete_absent Strict-Transport-Security (/connexion)'
    );
    const modifier = (cle: string, valeur: (v: string) => string) =>
      avec(async () =>
        regles.map((r) => ({
          ...r,
          headers: r.headers.map((h) => (h.key === cle ? { key: cle, value: valeur(h.value) } : h)),
        }))
      );
    await nomme(
      modifier('Strict-Transport-Security', (v) => v.replace('; preload', '')),
      'hsts_sans_preload'
    );
    await nomme(
      modifier('Strict-Transport-Security', (v) => v.replace('63072000', '86400')),
      'hsts_max_age_insuffisant'
    );
    await nomme(
      modifier('Permissions-Policy', (v) => v.replace('geolocation=()', 'geolocation=(self)')),
      'permission_non_coupee geolocation'
    );
    await nomme(
      avec(async () => [
        ...regles,
        {
          source: '/(.*)',
          headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }],
        },
      ]),
      'csp_statique'
    );
  });

  it('REQ-SEC-029 : une liste de routes vide est un défaut, jamais un vert', async () => {
    const { defauts } = await verifierEntetes(COUCHE, []);
    expect(defauts).toEqual(['aucune_route_confrontee']);
  });
});
