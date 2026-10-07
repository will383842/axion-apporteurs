// @req REQ-UX-017
/**
 * UX-P1-49 — la charte commune des maquettes, retravaillée en contraste et en lisibilité (Williams,
 * 2026-10-03 : il trouve que les maquettes manquent de contraste et font trop textuelles, puis il
 * retient la VERSION 2 de l'aperçu).
 *
 * CE QUE CE FICHIER GARDE.
 *
 *   (1) LE BLOC IDENTIQUE. Il n'existe ni feuille de style commune ni jetons séparés : la charte est
 *       un bloc `charte:debut … charte:fin` recopié dans chaque maquette. Une copie qui dérive est une
 *       charte qui ment. Le bloc est le MÊME dans les quatorze maquettes de l'espace, et le même dans
 *       les treize de la console (la console a ses jetons propres, REQ-UX-034, et sa barre latérale
 *       viendra avec sa propre refonte).
 *
 *   (2) LES COULEURS DE LA MARQUE, dans le thème clair de l'espace : terracotta pour l'action, ivoire
 *       en fond, mocha pour le texte, bleu pour l'information et le focus, et une ALERTE en rouge
 *       DISTINCT du terracotta — sans quoi une erreur se lit comme un bouton.
 *
 *   (3) LE CONTRASTE AA, recalculé depuis le CSS de chaque maquette, dans les DEUX thèmes : chaque
 *       texte sur son fond ≥ 4,5:1 ; bordures, focus et surface d'action ≥ 3:1 (WCAG 1.4.11).
 *
 *   (4) LE RELIEF : cartes et encarts ne sont plus du texte posé à plat — une bordure et une ombre,
 *       et un liseré d'état sur les encarts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireValidation } from '../../../scripts/gates/maquettes-validees';

const DOSSIER = 'docs/maquettes';
const lire = (f: string) => readFileSync(`${DOSSIER}/${f}`, 'utf8');
const lignes = lireValidation(lire('VALIDATION.md')).lignes;
const ESPACE = lignes.filter((l) => /espace/i.test(l.section)).map((l) => l.fichier!);
const CONSOLE = lignes.filter((l) => /console/i.test(l.section)).map((l) => l.fichier!);

/** Le bloc de la charte, délimiteurs compris, ou '' s'il manque. */
function charte(html: string): string {
  const m = html.match(/\/\* charte:debut[\s\S]*?\/\* charte:fin \*\//);
  return m ? m[0] : '';
}

function luminance(hex: string): number {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function rapport(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** Les jetons `--nom: #hex;` du premier bloc qui suit le sélecteur. */
function jetons(css: string, selecteur: RegExp): Record<string, string> {
  const debut = css.search(selecteur);
  if (debut < 0) return {};
  const bloc = css.slice(debut, css.indexOf('}', debut));
  return Object.fromEntries(
    [...bloc.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ])
  );
}
const CLAIR = /:root\s*\{/;
const SOMBRE = /:root\[data-theme='sombre'\]\s*\{/;

/** Texte sur fond : 4,5:1 (WCAG 1.4.3). */
const TEXTES: [string, string][] = [
  ['texte', 'fond'],
  ['texte', 'surface'],
  ['texte', 'surface-2'],
  ['texte-doux', 'fond'],
  ['texte-doux', 'surface'],
  ['lien', 'fond'],
  ['lien', 'surface'],
  ['sur-primaire', 'primaire'],
  ['accent-texte', 'accent-fond'],
  ['nav-texte', 'nav-fond'],
  ['nav-actif-texte', 'nav-actif-fond'],
  ['ok-texte', 'ok-fond'],
  ['attente-texte', 'attente-fond'],
  ['bloque-texte', 'bloque-fond'],
  ['info-texte', 'info-fond'],
  ['neutre-texte', 'neutre-fond'],
];
/** Composants et états non textuels : 3:1 (WCAG 1.4.11). */
const COMPOSANTS: [string, string][] = [
  ['bord', 'fond'],
  ['bord', 'surface'],
  ['focus', 'fond'],
  ['focus', 'surface'],
  ['primaire', 'fond'],
  ['primaire', 'surface'],
];

describe('REQ-UX-017 — la charte commune, un seul bloc par famille', () => {
  it('REQ-UX-017 — le bloc charte est IDENTIQUE dans les quatorze maquettes de l’espace', () => {
    expect(ESPACE).toHaveLength(14);
    const reference = charte(lire(ESPACE[0]!));
    expect(reference.length).toBeGreaterThan(1000);
    for (const f of ESPACE) expect(charte(lire(f)), f).toBe(reference);
  });

  it('REQ-UX-017 — le bloc charte est IDENTIQUE dans les treize maquettes de la console', () => {
    expect(CONSOLE).toHaveLength(13);
    const reference = charte(lire(CONSOLE[0]!));
    expect(reference.length).toBeGreaterThan(1000);
    for (const f of CONSOLE) expect(charte(lire(f)), f).toBe(reference);
  });

  it('REQ-UX-017 — TÉMOIN : une copie qui dérive d’un seul caractère est vue', () => {
    const a = charte(lire(ESPACE[0]!));
    const b = a.replace(/--primaire:\s*#[0-9a-fA-F]{6}/, '--primaire: #c2410d');
    expect(b).not.toBe(a);
  });
});

describe('REQ-UX-017 — les couleurs de la marque, dans le thème clair de l’espace', () => {
  const j = jetons(charte(lire(ESPACE[0]!)), CLAIR);

  it('REQ-UX-017 — terracotta pour l’action, ivoire en fond, mocha pour le texte, bleu pour l’information', () => {
    expect(j.primaire).toBe('#c24a1b');
    expect(j['nav-actif-fond']).toBe('#c24a1b');
    expect(j.fond).toBe('#faf8f3');
    expect(j.texte).toBe('#2a2520');
    expect(j['nav-fond']).toBe('#2a2520');
    expect(j['info-texte']).toBe('#1a4dd9');
    expect(j.focus).toBe('#1a4dd9');
  });

  it('REQ-UX-017 — l’alerte est un rouge DISTINCT du terracotta, dans les deux thèmes', () => {
    expect(j['bloque-texte']).toBe('#b91c1c');
    for (const motif of [CLAIR, SOMBRE]) {
      const t = jetons(charte(lire(ESPACE[0]!)), motif);
      expect(t['bloque-texte']).not.toBe(t.primaire);
      expect(t['bloque-texte']).not.toBe(t['accent-texte']);
      expect(t['bloque-fond']).not.toBe(t['accent-fond']);
      // Une issue heureuse ne se peint plus aux couleurs de l'action : elle a son vert.
      expect(t['ok-texte']).not.toBe(t['accent-texte']);
    }
  });
});

describe('REQ-UX-017 — le contraste AA, recalculé dans chaque maquette de l’espace', () => {
  it('REQ-UX-017 — chaque texte ≥ 4,5:1 et chaque composant ≥ 3:1, dans les DEUX thèmes', () => {
    let mesures = 0;
    for (const f of ESPACE) {
      const css = charte(lire(f));
      for (const [nom, motif] of [
        ['clair', CLAIR],
        ['sombre', SOMBRE],
      ] as const) {
        const t = jetons(css, motif);
        for (const [seuil, paires] of [
          [4.5, TEXTES],
          [3, COMPOSANTS],
        ] as const) {
          for (const [avant, arriere] of paires) {
            expect(t[avant], `${f} ${nom} --${avant}`).toMatch(/^#[0-9a-f]{6}$/);
            expect(t[arriere], `${f} ${nom} --${arriere}`).toMatch(/^#[0-9a-f]{6}$/);
            expect(
              rapport(t[avant]!, t[arriere]!),
              `${f} ${nom} --${avant}/--${arriere}`
            ).toBeGreaterThanOrEqual(seuil);
            mesures += 1;
          }
        }
      }
    }
    expect(mesures).toBe(14 * 2 * (TEXTES.length + COMPOSANTS.length));
  });

  it('REQ-UX-017 — TÉMOIN : un texte doux éclairci sous le seuil rougit', () => {
    const t: Record<string, string> = {
      ...jetons(charte(lire(ESPACE[0]!)), CLAIR),
      'texte-doux': '#b8b2aa',
    };
    expect(rapport(t['texte-doux']!, t.fond!)).toBeLessThan(4.5);
  });
});

describe('REQ-UX-017 — le relief : cartes et encarts ne sont plus du texte à plat', () => {
  const css = charte(lire(ESPACE[0]!));
  /** Les déclarations de la DERNIÈRE règle dont le sélecteur commence exactement ainsi. */
  const regle = (selecteur: string) => {
    const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toutes = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${echappe}\\s*[,{][^}]*\\}`, 'g'))];
    return toutes.map((m) => m[0]).join('\n');
  };

  it('REQ-UX-017 — la carte porte une bordure ET une ombre', () => {
    expect(regle('.carte')).toMatch(/border:\s*1px solid/);
    expect(regle('.carte')).toMatch(/box-shadow:/);
  });

  it('REQ-UX-017 — l’encart porte un liseré d’état à gauche, un cadre et une ombre', () => {
    expect(regle('.encart')).toMatch(/border-left(?:-width)?:\s*6px/);
    expect(regle('.encart')).toMatch(/border:\s*1px solid/);
    expect(regle('.encart')).toMatch(/box-shadow:/);
  });

  it('REQ-UX-017 — la barre d’onglets garde son fond mocha : son texte clair ne tombe jamais sur un fond clair', () => {
    // Vu par axe sur l'aperçu : un relief qui repeignait la barre en blanc laissait `--nav-texte`
    // (clair) sur `--surface`. La DERNIÈRE couleur de fond posée sur `.onglets` est celle qui gagne.
    const fonds = [...regle('.onglets').matchAll(/background:\s*([^;]+);/g)].map((m) => m[1]);
    expect(fonds.at(-1)).toBe('var(--nav-fond)');
    const t = jetons(css, CLAIR);
    expect(rapport(t['nav-texte']!, t['nav-fond']!)).toBeGreaterThanOrEqual(4.5);
  });
});
