/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Le harnais d'accessibilité et de mobile — UX-P0-03 (REQ-QA-016, REQ-UX-017, REQ-UX-018).
 *
 * LES SURFACES sont DÉRIVÉES du dépôt, jamais tapées :
 *  - les maquettes, lues dans les tableaux de `docs/maquettes/VALIDATION.md` — section
 *    « Espace apporteur » pour l'espace, « Console » pour la console ;
 *  - les routes réelles de la phase 0 (connexion, confidentialité) quand elles
 *    existent. Absentes aujourd'hui, elles sont NOMMÉES dans chaque verdict. Présentes, elles le
 *    sont aussi, comme NON MESURÉES : le serveur de test arrive avec QA-T16.
 * DÉCISION DU 2026-09-16 (écrite dans `docs/gates.json`) : les trois passes ne BLOQUENT pas avant la
 * phase 1 ; QA-T16 les rend bloquantes sur les routes réelles. Une faute sur une surface non
 * bloquante est IMPRIMÉE comme dette, jamais tue ; une faute sur une surface bloquante (la
 * page-piège du bac d'essai, `A11Y_BAC=1`) fait sortir la passe en code non nul.
 *
 * LES PROFILS sont ceux de `playwright.config.ts` (`PROFILS_A11Y`) : iPhone 14 Pro sous WebKit, et
 * le bureau sous Chromium. Le navigateur est celui que le profil déclare.
 *
 * LE PREMIER PLAN. Une page mesurée dans un onglet d'arrière-plan rend des zéros, et des zéros
 * passent tous les seuils. Chaque mesure amène la page au premier plan, LIT `visibilityState`, et le
 * compte des mesures faites au premier plan est imprimé et confronté au compte des mesures.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium, webkit, type Page, type PlaywrightTestConfig } from '@playwright/test';
import config from '../../playwright.config';

/** La racine du dépôt : là où `specsDuDisque` lit les parcours réels. */
export const RACINE = process.cwd();

export type Espace = 'espace' | 'console';

export interface Surface {
  /** Le chemin du fichier dans le dépôt : c'est ce que la faute nomme. */
  nom: string;
  url: string;
  espace: Espace;
  bloquante: boolean;
}

export interface Profil {
  nom: string;
  mobile: boolean;
  largeur: number;
}

export interface Faute {
  surface: string;
  profil: string;
  selecteur: string;
  detail: string;
}

export interface Mesures {
  fautes: Faute[];
  mesures: number;
  auPremierPlan: number;
  cibles: number;
}

type Mesure = (
  page: Page,
  surface: Surface,
  profil: Profil
) => Promise<{ fautes: Omit<Faute, 'surface' | 'profil'>[]; cibles: number }>;

// ── Les seuils, et d'où ils viennent (RM-10) ────────────────────────────────────────────────────

/** REQ-UX-017 : « toutes les cibles interactives mesurent ≥ 48×48 CSS px » (espace). */
const CIBLE_ESPACE = 48;
/** REQ-UX-018 : « cibles 44 px mobile / 24 px desktop du design system admin » (console). */
const CIBLE_CONSOLE = { mobile: 44, bureau: 24 } as const;
/** REQ-UX-017 : « le corps de texte est ≥ 18 px avec contraste ≥ 4.5:1 ». */
const CORPS_PX = 18;
const CONTRASTE = 4.5;
/** REQ-UX-017 : « à 320 px / zoom 200 % aucune page ne défile horizontalement ». */
const LARGEUR_MINIMALE = 320;
const ZOOM = 2;

// ── Les surfaces ────────────────────────────────────────────────────────────────────────────────

const VALIDATION = 'docs/maquettes/VALIDATION.md';
const SECTIONS: Record<string, Espace> = { 'Espace apporteur': 'espace', Console: 'console' };

/** Les maquettes, lues dans les tableaux de `VALIDATION.md`, section par section. */
export function maquettesDuDepot(): Surface[] {
  const surfaces: Surface[] = [];
  let espace: Espace | null = null;
  for (const ligne of readFileSync(join(RACINE, VALIDATION), 'utf8').split(/\r?\n/)) {
    const titre = /^## (.+)$/.exec(ligne);
    if (titre) espace = SECTIONS[titre[1]!.trim()] ?? null;
    const fichier = /^\|[^|]*\|\s*`([\w-]+\.html)`\s*\|/.exec(ligne);
    if (espace !== null && fichier) {
      const nom = `docs/maquettes/${fichier[1]}`;
      surfaces.push({ nom, url: pathToFileURL(join(RACINE, nom)).href, espace, bloquante: false });
    }
  }
  if (surfaces.length === 0)
    throw new Error(`${VALIDATION} : aucune maquette lue — le harnais ne mesurerait rien.`);
  return surfaces;
}

/** Les routes réelles de la phase 0, et la tâche qui les livre. */
const ROUTES_REELLES = [
  { nom: 'connexion', chemin: 'src/app/(espace)/connexion/page.tsx', tache: 'SEC-03' },
  { nom: 'confidentialité', chemin: 'src/app/(espace)/confidentialite/page.tsx', tache: 'JUR-T04' },
] as const;

/** Ce que le harnais dit des routes réelles : absentes, ou présentes et non mesurées. */
export function etatDesRoutesReelles(): string[] {
  return ROUTES_REELLES.map((r) =>
    existsSync(join(RACINE, r.chemin))
      ? `route réelle ${r.nom} (${r.chemin}) présente et NON MESURÉE : le serveur de test arrive avec QA-T16`
      : `route réelle ${r.nom} absente (${r.tache}) : non mesurée`
  );
}

/** La page-piège du bac d'essai : BLOQUANTE, pour prouver que chaque passe sait rougir. */
export const SURFACE_PIEGE: Surface = {
  nom: 'tests/a11y/bac/piege.html',
  url: pathToFileURL(join(RACINE, 'tests/a11y/bac/piege.html')).href,
  espace: 'espace',
  bloquante: true,
};

/** Les surfaces d'une passe du dépôt ; `A11Y_BAC=1` y ajoute la page-piège (témoin à deux faces). */
export function surfacesJugees(): Surface[] {
  return [...maquettesDuDepot(), ...(process.env.A11Y_BAC === '1' ? [SURFACE_PIEGE] : [])];
}

// ── Les profils, et la mesure au premier plan ───────────────────────────────────────────────────

function projet(nom: string) {
  const p = (config.projects ?? []).find((x) => x.name === nom);
  if (p?.use === undefined)
    throw new Error(`playwright.config.ts : aucun projet « ${nom} » utilisable.`);
  return p.use;
}

export async function mesurer(
  surfaces: readonly Surface[],
  profils: readonly string[],
  mesure: Mesure
): Promise<Mesures> {
  const resultat: Mesures = { fautes: [], mesures: 0, auPremierPlan: 0, cibles: 0 };
  for (const nom of profils) {
    const { defaultBrowserType, ...options } = projet(nom);
    const navigateur = await (defaultBrowserType === 'webkit' ? webkit : chromium).launch();
    try {
      const contexte = await navigateur.newContext(options);
      const profil: Profil = {
        nom,
        mobile: options.isMobile === true,
        largeur: options.viewport?.width ?? 1280,
      };
      for (const surface of surfaces) {
        const page = await contexte.newPage();
        await page.goto(surface.url);
        await page.bringToFront();
        const visible = await page.evaluate(() => document.visibilityState);
        resultat.mesures++;
        if (visible === 'visible') resultat.auPremierPlan++;
        const { fautes, cibles } = await mesure(page, surface, profil);
        resultat.cibles += cibles;
        for (const f of fautes) resultat.fautes.push({ ...f, surface: surface.nom, profil: nom });
        await page.close();
      }
      await contexte.close();
    } finally {
      await navigateur.close();
    }
  }
  return resultat;
}

// ── Les trois passes ────────────────────────────────────────────────────────────────────────────

/** axe-core : les violations graves et critiques, chacune par nœud. */
export const auditAxe: Mesure = async (page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const fautes = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes.map((n) => ({ selecteur: n.target.join(' '), detail: `${v.id} (${v.impact})` }))
    );
  return { fautes, cibles: 0 };
};

/** Cibles interactives au seuil de l'espace ou de la console ; corps de texte de l'espace. */
export const ciblesEtCorps: Mesure = async (page, surface, profil) => {
  const seuil =
    surface.espace === 'espace'
      ? CIBLE_ESPACE
      : profil.mobile
        ? CIBLE_CONSOLE.mobile
        : CIBLE_CONSOLE.bureau;
  return page.evaluate(
    ({ seuil, corps, corpsPx, contrasteMin }) => {
      const chemin = (e: Element): string => {
        const parts: string[] = [];
        let x: Element | null = e;
        for (let i = 0; i < 3 && x !== null && x !== document.body; i++) {
          let s = x.tagName.toLowerCase();
          if (x.id !== '') {
            parts.unshift(`${s}#${x.id}`);
            break;
          }
          const cls = [...x.classList].slice(0, 2);
          if (cls.length > 0) s += `.${cls.join('.')}`;
          parts.unshift(s);
          x = x.parentElement;
        }
        return parts.join(' > ');
      };
      const visible = (e: Element): boolean => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const fautes: { selecteur: string; detail: string }[] = [];
      const interactives = [
        ...document.querySelectorAll(
          'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
            '[role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], ' +
            '[tabindex]:not([tabindex="-1"])'
        ),
      ].filter(visible);
      for (const e of interactives) {
        const r = e.getBoundingClientRect();
        if (r.width < seuil - 0.5 || r.height < seuil - 0.5) {
          fautes.push({
            selecteur: chemin(e),
            detail: `cible de ${Math.round(r.width)} × ${Math.round(r.height)} px, seuil ${seuil}`,
          });
        }
      }
      if (corps) {
        type Rgba = { r: number; g: number; b: number; a: number };
        const lire = (c: string): Rgba | null => {
          const m = /rgba?\(([^)]+)\)/.exec(c);
          if (m === null) return null;
          const p = m[1]!
            .split(/[\s,/]+/)
            .filter((x) => x !== '')
            .map(Number);
          return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
        };
        const sur = (h: Rgba, b: Rgba): Rgba => ({
          r: h.r * h.a + b.r * (1 - h.a),
          g: h.g * h.a + b.g * (1 - h.a),
          b: h.b * h.a + b.b * (1 - h.a),
          a: 1,
        });
        const fond = (e: Element): Rgba => {
          const couches: Rgba[] = [];
          for (let x: Element | null = e; x !== null; x = x.parentElement) {
            const c = lire(getComputedStyle(x).backgroundColor);
            if (c !== null && c.a > 0) {
              couches.push(c);
              if (c.a >= 1) break;
            }
          }
          return couches.reverse().reduce((b, c) => sur(c, b), { r: 255, g: 255, b: 255, a: 1 });
        };
        const lum = (c: Rgba): number => {
          const v = [c.r, c.g, c.b].map((x) => {
            const s = x / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
        };
        const textes = [...document.querySelectorAll('p, li, dd, blockquote')].filter(
          (e) =>
            visible(e) &&
            [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
        );
        for (const e of textes) {
          const s = getComputedStyle(e);
          const taille = parseFloat(s.fontSize);
          if (taille < corpsPx - 0.01) {
            fautes.push({
              selecteur: chemin(e),
              detail: `corps de texte à ${taille} px, seuil ${corpsPx}`,
            });
          }
          const encre = lire(s.color);
          if (encre === null) continue;
          const f = fond(e);
          const [a, b] = [lum(sur(encre, f)), lum(f)];
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < contrasteMin) {
            fautes.push({
              selecteur: chemin(e),
              detail: `contraste ${ratio.toFixed(2)}:1, seuil ${contrasteMin}:1`,
            });
          }
        }
      }
      return { fautes, cibles: interactives.length };
    },
    { seuil, corps: surface.espace === 'espace', corpsPx: CORPS_PX, contrasteMin: CONTRASTE }
  );
};

/** À 320 px, puis au zoom de 200 % du profil : aucun défilement horizontal. */
export const reflux: Mesure = async (page, _surface, profil) => {
  const origine = page.viewportSize();
  const hauteur = origine?.height ?? 800;
  const largeurs = [
    ...new Set([LARGEUR_MINIMALE, Math.max(LARGEUR_MINIMALE, Math.floor(profil.largeur / ZOOM))]),
  ];
  const fautes: { selecteur: string; detail: string }[] = [];
  for (const largeur of largeurs) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    const d = await page.evaluate(() => {
      const racine = document.documentElement;
      const cw = racine.clientWidth;
      const deborde = racine.scrollWidth - cw;
      let coupable = '';
      if (deborde > 1) {
        for (const e of document.body.querySelectorAll('*')) {
          const r = e.getBoundingClientRect();
          const parent = e.parentElement?.getBoundingClientRect();
          if (r.right > cw + 1 && (parent === undefined || parent.right <= cw + 1)) {
            const cls = [...e.classList].slice(0, 2);
            coupable =
              `${e.parentElement?.tagName.toLowerCase() ?? ''} > ${e.tagName.toLowerCase()}` +
              (e.id !== '' ? `#${e.id}` : cls.length > 0 ? `.${cls.join('.')}` : '');
            break;
          }
        }
      }
      return { deborde, coupable };
    });
    if (d.deborde > 1) {
      fautes.push({
        selecteur: d.coupable || 'html',
        detail: `défilement horizontal de ${d.deborde} px à ${largeur} px de large`,
      });
    }
  }
  if (origine !== null) await page.setViewportSize(origine);
  return { fautes, cibles: 0 };
};

// ── Le verdict ──────────────────────────────────────────────────────────────────────────────────

export function juger(
  passe: string,
  surfaces: readonly Surface[],
  m: Mesures
): { code: 0 | 1; lignes: string[] } {
  const bloquantes = new Set(surfaces.filter((s) => s.bloquante).map((s) => s.nom));
  const ligne = (f: Faute) => `   · ${f.surface} [${f.profil}] ${f.selecteur} — ${f.detail}`;
  const refus = m.fautes.filter((f) => bloquantes.has(f.surface));
  const dette = m.fautes.filter((f) => !bloquantes.has(f.surface));
  const aveugle = m.mesures === 0 || m.auPremierPlan < m.mesures;
  const compte =
    `${surfaces.length} surface(s), ${m.mesures} mesure(s) dont ${m.auPremierPlan} au premier plan ` +
    `(visibilityState visible), ${m.cibles} cible(s) interactive(s) mesurée(s)`;
  const lignes = [
    `${refus.length === 0 && !aveugle ? '✅' : '❌'} a11y:${passe} — ${compte} ; ` +
      `${refus.length} faute(s) bloquante(s), ${dette.length} faute(s) non bloquante(s).`,
    ...etatDesRoutesReelles().map((l) => `   ${l}`),
    ...(aveugle
      ? [
          '   [mesure_en_arriere_plan] une mesure hors du premier plan rend des zéros : verdict refusé',
        ]
      : []),
    ...refus.map(ligne),
    ...(dette.length > 0
      ? [
          '   Dette NON BLOQUANTE avant la phase 1 (décision du 2026-09-16, docs/gates.json ; QA-T16 l’annule) :',
          ...dette.map(ligne),
        ]
      : []),
  ];
  return { code: refus.length === 0 && !aveugle ? 0 : 1, lignes };
}

// ── REQ-QA-016 : chaque parcours a ses projets ──────────────────────────────────────────────────

/** Le dossier des parcours, relatif à la racine. */
export const E2E = 'tests/e2e';

/** Les specs de parcours du DISQUE, relatives à la racine. */
export function specsDuDisque(dossier: string, racine: string): string[] {
  if (!existsSync(join(racine, dossier))) return [];
  return readdirSync(join(racine, dossier), { withFileTypes: true }).flatMap((e) => {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) return specsDuDisque(chemin, racine);
    return /\.spec\.ts$/.test(e.name) ? [chemin] : [];
  });
}

/** Un glob minimal, relatif au dossier des tests : `**` traverse, `*` non. */
function correspond(motif: string, chemin: string): boolean {
  const re = motif
    .split('**/')
    .map((morceau) =>
      morceau
        .split('*')
        .map((x) => x.replace(/[.+?^$()[\]{}|\\]/g, '\\$&'))
        .join('[^/]*')
    )
    .join('(?:.*/)?');
  return new RegExp(`^${re}$`).test(chemin);
}

/** Les specs dont les projets contredisent REQ-QA-016 : un motif par spec fautive. */
export function specsSansProjet(cfg: PlaywrightTestConfig, specs: readonly string[]): string[] {
  const racine = `${cfg.testDir ?? E2E}/`.replace(/^\.\//, '');
  const projets = cfg.projects ?? [];
  const fautes: string[] = [];
  for (const spec of specs) {
    const relatif = spec.startsWith(racine) ? spec.slice(racine.length) : spec;
    const pris = projets.filter((p) =>
      [p.testMatch ?? '**/*.spec.ts']
        .flat()
        .some((m) => typeof m === 'string' && correspond(m, relatif))
    );
    const mobiles = pris.filter((p) => p.use?.isMobile === true);
    const bureaux = pris.filter((p) => p.use?.isMobile !== true);
    if (relatif.startsWith('espace/')) {
      if (mobiles.length === 0) fautes.push(`${spec} : aucun projet mobile`);
      else if (bureaux.length > 0) fautes.push(`${spec} : pris par un projet de bureau`);
    } else if (relatif.startsWith('console/')) {
      if (mobiles.length > 0) fautes.push(`${spec} : pris par un projet mobile`);
      else if (bureaux.length === 0) fautes.push(`${spec} : aucun projet de bureau`);
    } else {
      fautes.push(`${spec} : ni sous espace/ ni sous console/`);
    }
  }
  return fautes;
}
