/**
 * bundle-par-route.ts — le poids que le navigateur charge sur chaque route de l'espace apporteur.
 * (REQ-UX-033, qui absorbe REQ-QA-031 ; tâche QA-T20 ; gate `perf:bundle`)
 *
 * USAGE : pnpm perf:bundle              mesure `.next`, NOMME les dépassements, sort en 0 s'il n'y a
 *                                       aucune faute de mesure (jusqu'à QA-T20b)
 *         pnpm perf:bundle:prove        un témoin par famille, des contre-témoins verts
 *         … --bloquant                  un dépassement fait sortir en 1 (ce que QA-T20b armera)
 *         … --build <dir>               un autre répertoire de build que `.next`
 *         … --pages <fichier>           une page à mesurer (répétable) ; défaut : les pages suivies
 *                                       sous `src/app/(espace)`, dérivées par `perf-budgets.ts`
 *
 * ── CE QUI EST MESURÉ, ET POURQUOI PAS CE QUE DISAIENT LES DOCUMENTS ─────────────────────────
 *
 * `perf/budgets.json` et l'entrée `perf:bundle` de `docs/gates.json` désignaient les paquets de
 * `.next/static/chunks/app/<route>/`. Sous Next 16, qui construit avec Turbopack, CE RÉPERTOIRE
 * N'EST PAS PRODUIT (mesuré le 2026-09-29 sur 0d31086) : les paquets sont plats, nommés par
 * empreinte, sous `.next/static/chunks/`. Un mesureur qui suivrait ces globs sommerait zéro
 * fichier et rendrait un vert permanent. La mesure passe donc par les deux manifestes que Next
 * écrit au build :
 *
 *   • `.next/build-manifest.json`, `rootMainFiles` — le SOCLE, chargé par toute route (runtime
 *     React et Next). `polyfillFiles` est servi en `noModule` : un navigateur moderne ne le charge
 *     pas, il n'est pas compté ;
 *   • `.next/server/app/<segments>/page_client-reference-manifest.js`, `entryJSFiles` — les
 *     paquets que la route ajoute (layouts, composants client, pages d'erreur intégrées).
 *
 * Recoupé le même jour contre la réalité : `next start` sur ce build, puis lecture des
 * `<script src>` servis sur `/connexion` et `/connexion/[jeton]` — exactement `rootMainFiles`, plus
 * l'union des `entryJSFiles`, plus le polyfill en `noModule`. Le chiffre est le gzip niveau 9 de
 * chaque fichier, chaque fichier compté une fois par route.
 *
 * ── DEUX PLAFONDS ────────────────────────────────────────────────────────────────────────────
 *
 * Le runtime React 19 + Next 16 pèse à lui seul 129 523 octets gz (133 174 au premier chargement
 * de `/connexion`), soit plus que les 75 KB de
 * REQ-UX-033, même sur une page sans aucun code client. Arbitrage -d7 sur délégation de Williams du
 * 2026-09-29 : le plafond par route (dérivé de REQ-GOV-028, comme `perf:budgets`) juge le JS PROPRE
 * à la route, c'est-à-dire ses paquets hors du socle ; le socle a son plafond à lui, lu dans
 * `perf/budgets.json` (clé `socle` : mesure, marge, sha, source et date), jugé UNE fois.
 *
 * ── CE QUI EST UNE FAUTE, ET CE QUI N'EST QU'UN DÉPASSEMENT ─────────────────────────────────
 *
 * Une faute de MESURE rougit toujours : pas de build, manifeste absent ou illisible, paquet cité
 * et absent du disque, mesure nulle. Un DÉPASSEMENT est nommé (route, octets, plafond) et, dans
 * la forge, annoté `::warning::` ; il ne rougit que sous `--bloquant`. C'est l'acceptation de
 * QA-T20 (« non bloquant jusqu'à QA-T20b ») ; ce n'est pas un `continue-on-error` : l'étape de CI
 * rougit sur toute faute de mesure, et `--prove` montre dès aujourd'hui la face rouge du blocage.
 *
 * ── CE QU'ELLE NE FAIT PAS ───────────────────────────────────────────────────────────────────
 *
 * Elle n'exécute jamais un manifeste : l'objet JSON en est EXTRAIT, et toute autre forme échoue
 * fermé (`manifeste_illisible`). Elle ne mesure ni le CSS, ni les paquets chargés à la demande
 * après le premier rendu (`import()` dynamique) — ce n'est pas du « First Load ». Elle ne lance ni
 * `lhci` ni Lighthouse : LCP, CLS et INP restent à QA-T20b.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { routesDeLEspace, seuilsDepuisRegistre, texteDeLExigence } from './perf-budgets';

const CHEMIN_BUDGETS = 'perf/budgets.json';
const CHEMIN_REGISTRE = 'docs/requirements.json';
const BUILD_PAR_DEFAUT = '.next';
/** `size-limit` et `bytes` lisent « KB » comme 1 024 octets ; le plafond suit la même lecture. */
const OCTETS_PAR_KO = 1024;

export const FAMILLES = [
  'build_absent',
  'manifeste_absent',
  'manifeste_illisible',
  'paquet_introuvable',
  'mesure_nulle',
  'budget_depasse',
  'socle_depasse',
] as const;

export type Famille = (typeof FAMILLES)[number];
export type Faute = { famille: Famille; message: string };

/** Un build vu par le mesureur : chemins RELATIFS au répertoire de build ; `null` = absent. */
export type VueBuild = {
  pages: string[];
  lire: (chemin: string) => Buffer | null;
};

export type Mesure = {
  route: string;
  page: string;
  fichiers: string[];
  /** octets gz chargés au premier rendu : socle + paquets propres */
  premierChargement: number;
  /** octets gz des paquets de la route hors du socle */
  propre: number;
};

export type Resultat = { mesures: Mesure[]; fautes: Faute[]; socle: number };
export type Plafonds = { routeOctets: number; socleOctets: number };
export type Depassement = {
  famille: 'budget_depasse' | 'socle_depasse';
  route: string | null;
  octets: number;
  plafond: number;
};

/** `src/app/(espace)/connexion/page.tsx` → `server/app/(espace)/connexion/page_client-reference-manifest.js` */
export function cheminDuManifeste(page: string): string {
  const rel = page.split('\\').join('/').replace(/^src\/app\//, '');
  return `server/app/${rel.replace(/page\.(tsx|ts|jsx|js)$/, 'page_client-reference-manifest.js')}`;
}

/**
 * L'objet `entryJSFiles` d'un manifeste client, EXTRAIT sans exécuter le fichier. La forme
 * reconnue est celle que Next 16 écrit : une affectation de `globalThis.__RSC_MANIFEST[<clé>]` à
 * un littéral JSON. Tout autre texte rend `null`.
 */
export function lireManifesteClient(texte: string): Record<string, string[]> | null {
  const m = texte.match(
    /^(?:globalThis\.__RSC_MANIFEST = globalThis\.__RSC_MANIFEST \|\| \{\};\s*)?globalThis\.__RSC_MANIFEST\["(?:[^"\\]|\\.)*"\] = (\{[\s\S]*\});?\s*$/
  );
  if (!m || m[1] === undefined) return null;
  let objet: unknown;
  try {
    objet = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const entrees = (objet as { entryJSFiles?: unknown } | null)?.entryJSFiles;
  if (typeof entrees !== 'object' || entrees === null || Array.isArray(entrees)) return null;
  for (const v of Object.values(entrees)) {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
  }
  return entrees as Record<string, string[]>;
}

function nomDeRoute(page: string): string {
  const r = routesDeLEspace([page]);
  return r[0]?.route ?? page;
}

function listeDeChaines(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

export function mesurer(vue: VueBuild): Resultat {
  const fautes: Faute[] = [];
  if (vue.lire('BUILD_ID') === null) {
    return {
      mesures: [],
      socle: 0,
      fautes: [
        {
          famille: 'build_absent',
          message: 'aucun build Next (BUILD_ID absent) : lancer `next build` avant de mesurer',
        },
      ],
    };
  }

  const brut = vue.lire('build-manifest.json');
  let racine: string[] | null = null;
  let polyfills: string[] = [];
  try {
    const bm = brut ? (JSON.parse(brut.toString('utf8')) as Record<string, unknown>) : null;
    racine = bm ? listeDeChaines(bm.rootMainFiles) : null;
    polyfills = (bm && listeDeChaines(bm.polyfillFiles)) ?? [];
  } catch {
    racine = null;
  }
  if (racine === null) {
    return {
      mesures: [],
      socle: 0,
      fautes: [
        {
          famille: 'manifeste_illisible',
          message: 'build-manifest.json absent ou sans liste `rootMainFiles` lisible',
        },
      ],
    };
  }

  const tailles = new Map<string, number | null>();
  const taille = (f: string): number | null => {
    if (!tailles.has(f)) {
      const b = vue.lire(f);
      tailles.set(f, b === null ? null : gzipSync(b, { level: 9 }).length);
    }
    return tailles.get(f) ?? null;
  };

  const exclus = new Set(polyfills);
  const duSocle = new Set(racine.filter((f) => !exclus.has(f)));
  let socle = 0;
  for (const f of duSocle) {
    const t = taille(f);
    if (t === null) fautes.push({ famille: 'paquet_introuvable', message: `socle : ${f} cité par build-manifest.json, absent du disque` });
    else socle += t;
  }

  const mesures: Mesure[] = [];
  for (const page of vue.pages) {
    const route = nomDeRoute(page);
    const chemin = cheminDuManifeste(page);
    const texte = vue.lire(chemin);
    if (texte === null) {
      fautes.push({ famille: 'manifeste_absent', message: `${route} : ${chemin} absent du build` });
      continue;
    }
    const entrees = lireManifesteClient(texte.toString('utf8'));
    if (entrees === null) {
      fautes.push({ famille: 'manifeste_illisible', message: `${route} : ${chemin} n'a pas la forme attendue` });
      continue;
    }
    const fichiers = new Set(duSocle);
    for (const liste of Object.values(entrees)) for (const f of liste) if (!exclus.has(f)) fichiers.add(f);
    let premierChargement = 0;
    let propre = 0;
    let manquant = false;
    for (const f of fichiers) {
      const t = taille(f);
      if (t === null) {
        if (!duSocle.has(f)) fautes.push({ famille: 'paquet_introuvable', message: `${route} : ${f} cité par ${chemin}, absent du disque` });
        manquant = true;
        continue;
      }
      premierChargement += t;
      if (!duSocle.has(f)) propre += t;
    }
    if (manquant) continue;
    if (fichiers.size === 0 || premierChargement === 0) {
      fautes.push({
        famille: 'mesure_nulle',
        message: `${route} : zéro octet mesuré — aucun paquet trouvé, ce n'est pas une page légère, c'est une mesure qui ne voit rien`,
      });
      continue;
    }
    mesures.push({ route, page, fichiers: [...fichiers].sort(), premierChargement, propre });
  }
  return { mesures, fautes, socle };
}

export function depassements(r: Resultat, p: Plafonds): Depassement[] {
  const d: Depassement[] = [];
  if (r.mesures.length > 0 && r.socle > p.socleOctets) {
    d.push({ famille: 'socle_depasse', route: null, octets: r.socle, plafond: p.socleOctets });
  }
  for (const m of r.mesures) {
    if (m.propre > p.routeOctets) {
      d.push({ famille: 'budget_depasse', route: m.route, octets: m.propre, plafond: p.routeOctets });
    }
  }
  return d;
}

export function codeDeSortie(r: Resultat, p: Plafonds, bloquant: boolean): 0 | 1 {
  if (r.fautes.length > 0) return 1;
  if (bloquant && depassements(r, p).length > 0) return 1;
  return 0;
}

// ── les plafonds : dérivés, jamais tapés (RM-01, RM-10) ──────────────────────────────────────

type Socle = { mesureOctetsGz?: unknown; marge?: unknown; sha?: unknown; source?: unknown; verifieLe?: unknown };

/** Le plafond du socle : la mesure datée plus sa marge, lues dans `perf/budgets.json`. */
export function plafondDuSocle(budgetsJson: string): { octets: number; libelle: string } {
  const s = (JSON.parse(budgetsJson) as { socle?: Socle }).socle;
  const ok =
    s &&
    typeof s.mesureOctetsGz === 'number' &&
    typeof s.marge === 'number' &&
    typeof s.sha === 'string' &&
    typeof s.source === 'string' &&
    typeof s.verifieLe === 'string';
  if (!ok) {
    throw new Error(
      `${CHEMIN_BUDGETS} : la clé \`socle\` doit porter mesureOctetsGz, marge, sha, source et verifieLe — ` +
        `sans elles il n'y a pas de plafond du socle, et aucun défaut n'est inventé.`
    );
  }
  const octets = Math.floor((s.mesureOctetsGz as number) * (1 + (s.marge as number)));
  return {
    octets,
    libelle: `${s.mesureOctetsGz} o mesurés sur ${s.sha} + ${Math.round((s.marge as number) * 100)} % (${s.source}, ${s.verifieLe})`,
  };
}

function plafondsDuDepot(): { plafonds: Plafonds; libelleSocle: string; koRoute: number } {
  const koRoute = seuilsDepuisRegistre(texteDeLExigence(readFileSync(CHEMIN_REGISTRE, 'utf8'))).plafondKoGz;
  const socle = plafondDuSocle(readFileSync(CHEMIN_BUDGETS, 'utf8'));
  return {
    plafonds: { routeOctets: koRoute * OCTETS_PAR_KO, socleOctets: socle.octets },
    libelleSocle: socle.libelle,
    koRoute,
  };
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────

/** Octets incompressibles et déterministes : leur gzip suit leur taille. */
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

function buildDeFixture(f: {
  racine: string[];
  routes: { page: string; paquets: string[] }[];
  tailles: Record<string, number>;
  sans?: string[];
  manifesteBrut?: Record<string, string>;
}): VueBuild {
  const disque = new Map<string, Buffer>();
  disque.set('BUILD_ID', Buffer.from('preuve'));
  disque.set('build-manifest.json', Buffer.from(JSON.stringify({ rootMainFiles: f.racine, polyfillFiles: [] })));
  let g = 1;
  for (const [c, n] of Object.entries(f.tailles)) disque.set(c, octets(n, g++));
  for (const r of f.routes) {
    const cle = r.page.replace(/^src\/app/, '').replace(/\.(t|j)sx?$/, '');
    disque.set(
      cheminDuManifeste(r.page),
      Buffer.from(
        f.manifesteBrut?.[r.page] ??
          `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(cle)}] = ${JSON.stringify({ entryJSFiles: { e: r.paquets } })};\n`
      )
    );
  }
  for (const c of f.sans ?? []) disque.delete(c);
  return { pages: f.routes.map((r) => r.page), lire: (c) => disque.get(c) ?? null };
}

function prouver(): number {
  const { plafonds } = plafondsDuDepot();
  const P = 'src/app/(espace)/mes-entreprises/page.tsx';
  const leger = plafonds.routeOctets / 4;
  const socleLeger = Math.floor(plafonds.socleOctets / 2);
  const juste = () =>
    buildDeFixture({
      racine: ['static/chunks/socle.js'],
      routes: [{ page: P, paquets: ['static/chunks/page.js'] }],
      tailles: { 'static/chunks/socle.js': socleLeger, 'static/chunks/page.js': leger },
    });

  type Cas = { quoi: string; vue: VueBuild; bloquant: boolean; attendu: 0 | 1; famille: Famille | null };
  const cas: Cas[] = [
    { quoi: 'contre-témoin : une route légère sur un socle sous son plafond, sous --bloquant', vue: juste(), bloquant: true, attendu: 0, famille: null },
    {
      quoi: 'contre-témoin : un dépassement sans --bloquant sort en zéro (QA-T20 non bloquant)',
      vue: buildDeFixture({
        racine: ['static/chunks/socle.js'],
        routes: [{ page: P, paquets: ['static/chunks/graphiques.js'] }],
        tailles: { 'static/chunks/socle.js': socleLeger, 'static/chunks/graphiques.js': plafonds.routeOctets * 2 },
      }),
      bloquant: false,
      attendu: 0,
      famille: null,
    },
    { quoi: 'aucun build', vue: { pages: [P], lire: () => null }, bloquant: false, attendu: 1, famille: 'build_absent' },
    { quoi: 'manifeste de la route supprimé', vue: buildDeFixture({ racine: ['static/chunks/socle.js'], routes: [{ page: P, paquets: [] }], tailles: { 'static/chunks/socle.js': 100 }, sans: [cheminDuManifeste(P)] }), bloquant: false, attendu: 1, famille: 'manifeste_absent' },
    { quoi: 'manifeste réécrit en code exécutable', vue: buildDeFixture({ racine: ['static/chunks/socle.js'], routes: [{ page: P, paquets: [] }], tailles: { 'static/chunks/socle.js': 100 }, manifesteBrut: { [P]: 'module.exports = {}' } }), bloquant: false, attendu: 1, famille: 'manifeste_illisible' },
    { quoi: 'paquet cité et absent du disque', vue: buildDeFixture({ racine: ['static/chunks/socle.js'], routes: [{ page: P, paquets: ['static/chunks/fantome.js'] }], tailles: { 'static/chunks/socle.js': 100 } }), bloquant: false, attendu: 1, famille: 'paquet_introuvable' },
    { quoi: 'aucun fichier trouvé — le piège des globs morts', vue: buildDeFixture({ racine: [], routes: [{ page: P, paquets: [] }], tailles: {} }), bloquant: false, attendu: 1, famille: 'mesure_nulle' },
    {
      quoi: 'une librairie de graphiques importée dans une route, sous --bloquant',
      vue: buildDeFixture({
        racine: ['static/chunks/socle.js'],
        routes: [{ page: P, paquets: ['static/chunks/graphiques.js'] }],
        tailles: { 'static/chunks/socle.js': socleLeger, 'static/chunks/graphiques.js': plafonds.routeOctets + 4096 },
      }),
      bloquant: true,
      attendu: 1,
      famille: 'budget_depasse',
    },
    {
      quoi: 'un socle grossi au-delà de son plafond, sous --bloquant',
      vue: buildDeFixture({
        racine: ['static/chunks/socle.js'],
        routes: [{ page: P, paquets: [] }],
        tailles: { 'static/chunks/socle.js': plafonds.socleOctets + 4096 },
      }),
      bloquant: true,
      attendu: 1,
      famille: 'socle_depasse',
    },
  ];

  let echecs = 0;
  const vues = new Set<Famille>();
  for (const c of cas) {
    const r = mesurer(c.vue);
    const code = codeDeSortie(r, plafonds, c.bloquant);
    const familles = [...r.fautes.map((f) => f.famille), ...depassements(r, plafonds).map((d) => d.famille)];
    const bon = code === c.attendu && (c.famille === null ? c.attendu === 0 : familles.includes(c.famille));
    if (c.famille) vues.add(c.famille);
    console.log(`${bon ? '✅' : '❌'} ${c.quoi} → code ${code}${c.famille ? `, famille ${c.famille}` : ''}`);
    if (!bon) echecs++;
  }
  const muettes = FAMILLES.filter((f) => !vues.has(f));
  if (muettes.length > 0) {
    console.error(`❌ familles sans témoin : ${muettes.join(', ')}`);
    echecs++;
  }
  if (echecs > 0) {
    console.error(`❌ perf:bundle --prove — ${echecs} témoin(s) en défaut`);
    return 1;
  }
  console.log(`✅ perf:bundle --prove — ${FAMILLES.length} familles rougissent chacune sur son témoin, 2 contre-témoins verts.`);
  return 0;
}

// ── le dépôt ─────────────────────────────────────────────────────────────────────────────────

function arguments_(argv: string[]): { build: string; pages: string[]; bloquant: boolean } {
  let build = BUILD_PAR_DEFAUT;
  const pages: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--build' && argv[i + 1]) build = argv[++i]!;
    else if (argv[i] === '--pages' && argv[i + 1]) pages.push(argv[++i]!);
  }
  return { build, pages, bloquant: argv.includes('--bloquant') };
}

function controlerLeDepot(argv: string[]): number {
  const { build, pages: explicites, bloquant } = arguments_(argv);
  const pages =
    explicites.length > 0
      ? explicites
      : routesDeLEspace(fichiersSuivisOuRefus('perf:bundle')).map((r) => r.fichier);
  const vue: VueBuild = {
    pages,
    lire: (c) => {
      const p = join(build, c);
      return existsSync(p) ? readFileSync(p) : null;
    },
  };
  const r = mesurer(vue);
  const { plafonds, libelleSocle, koRoute } = plafondsDuDepot();
  const forge = process.env.GITHUB_ACTIONS === 'true';

  if (r.fautes.length > 0) {
    console.error(`❌ perf:bundle — ${r.fautes.length} faute(s) de mesure sur ${pages.length} route(s) :`);
    for (const f of r.fautes) console.error(`   [${f.famille}] ${f.message}`);
    return 1;
  }

  console.log(`perf:bundle — ${r.mesures.length} route(s) de l'espace mesurée(s) dans \`${build}\` :`);
  console.log(`   socle commun : ${r.socle} o gz, plafond ${plafonds.socleOctets} o (${libelleSocle})`);
  for (const m of r.mesures) {
    console.log(
      `   ${m.route} : ${m.propre} o gz propres (plafond ${koRoute} KB = ${plafonds.routeOctets} o), ` +
        `${m.premierChargement} o au premier chargement, ${m.fichiers.length} paquet(s)`
    );
  }
  if (r.mesures.length === 0) {
    console.log(`   ⚠ ZÉRO ROUTE : ce vert ne juge aucune route de l'espace.`);
  }
  const d = depassements(r, plafonds);
  for (const x of d) {
    const quoi = x.route === null ? 'le socle commun' : x.route;
    const texte = `[${x.famille}] ${quoi} : ${x.octets} o gz pour un plafond de ${x.plafond} o`;
    console.log(`   ⚠ ${texte}`);
    if (forge) console.log(`::warning title=perf:bundle::${texte}`);
  }
  const code = codeDeSortie(r, plafonds, bloquant);
  if (d.length > 0 && !bloquant) {
    console.log(`   Dépassement(s) NOMMÉ(S), non bloquant(s) jusqu'à QA-T20b ; \`--bloquant\` les ferait rougir.`);
  }
  console.log(code === 0 ? '✅ perf:bundle' : `❌ perf:bundle — ${d.length} dépassement(s) sous --bloquant`);
  return code;
}

// Gardée : ce module est importé par son test (même garde que perf-budgets.ts).
const APPELE_DIRECTEMENT = /bundle-par-route\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const argv = process.argv.slice(2);
  process.exit(argv.includes('--prove') ? prouver() : controlerLeDepot(argv));
}
