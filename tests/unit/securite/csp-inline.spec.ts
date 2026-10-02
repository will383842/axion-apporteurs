// @req REQ-SEC-029
/**
 * SEC-46 — la garde `csp:inline` (écart C13 de la vérification de bout en bout) : aucun attribut
 * `style` ni `dangerouslySetInnerHTML` sous `src/app/`, parce que la politique de contenu refuse un
 * style en ligne et ne voit pas venir du HTML injecté.
 *
 * TÉMOIN À DEUX FACES. Face rouge : chaque famille rougit sur un fichier synthétique, nommé à sa
 * ligne. Face verte : le dépôt réel, une fois le style passé en module CSS, rend zéro faute, et le
 * compte des fichiers et des attributs confrontés est un plancher strictement positif — un périmètre
 * vidé ne passerait pas pour un vert.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  FAMILLES,
  estJuge,
  jugerLesSources,
  type FichierVu,
} from '../../../scripts/gates/csp-inline';

const APP = (source: string, chemin = 'src/app/(espace)/bac/page.tsx'): FichierVu => ({
  chemin,
  source,
});

describe('REQ-SEC-029 — aucun style en ligne ni HTML injecté sous src/app/', () => {
  it('REQ-SEC-029 : un attribut style rougit, nommé à sa ligne — littéral comme constante', () => {
    const j = jugerLesSources([
      APP('const S = { padding: 4 };\nexport const P = () => <main style={S} />;'),
      APP("export const B = () => <button style={{ minHeight: '3rem' }} />;", 'src/app/b.tsx'),
    ]);
    expect(j.fautes.map((f) => [f.famille, f.message.split(' — ')[0]])).toEqual([
      ['style_en_ligne', 'src/app/(espace)/bac/page.tsx:2'],
      ['style_en_ligne', 'src/app/b.tsx:1'],
    ]);
  });

  it('REQ-SEC-029 : dangerouslySetInnerHTML rougit, en attribut et par des props étalées', () => {
    const j = jugerLesSources([
      APP("export const H = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;"),
      APP(
        "const p = { dangerouslySetInnerHTML: { __html: 'x' } };\nexport const H = () => <div {...p} />;",
        'src/app/p.tsx'
      ),
    ]);
    expect(j.fautes.map((f) => f.famille)).toEqual(['html_injecte', 'html_injecte']);
  });

  it('REQ-SEC-029 : un fichier illisible n’est pas sauté — il rougit', () => {
    expect(jugerLesSources([APP('export const C = () => <div>')]).fautes[0]?.famille).toBe(
      'source_illisible'
    );
  });

  it('REQ-SEC-029 : contre-témoin — une classe de module CSS et une variable « style » hors JSX passent', () => {
    const j = jugerLesSources([
      APP(
        "import s from './p.module.css';\nconst style = 1;\nexport const B = () => <button className={s.bouton}>{style}</button>;"
      ),
    ]);
    expect(j.fautes).toEqual([]);
    expect(j.attributs).toBe(1);
  });

  it('REQ-SEC-029 : le périmètre est src/app/, en .tsx et .jsx, et lui seul', () => {
    expect(estJuge('src/app/(espace)/confidentialite/error.tsx')).toBe(true);
    expect(estJuge('src/app/x.jsx')).toBe(true);
    expect(estJuge('src/app/x.ts')).toBe(false);
    expect(estJuge('src/components/x.tsx')).toBe(false);
  });

  it('REQ-SEC-029 : chaque famille a son témoin dans la preuve de la garde', () => {
    const preuve = execFileSync('npx', ['tsx', 'scripts/gates/csp-inline.ts', '--prove'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    for (const f of FAMILLES) expect(preuve).toContain(`[${f}]`);
    expect(preuve).toMatch(/^✅ csp:inline/m);
  });

  it('REQ-SEC-029 : le dépôt réel — aucune faute, et un plancher de fichiers et d’attributs confrontés', () => {
    const chemins = execFileSync('git', ['ls-files', 'src/app'], { encoding: 'utf8' })
      .split('\n')
      .filter(estJuge);
    const j = jugerLesSources(chemins.map((c) => ({ chemin: c, source: readFileSync(c, 'utf8') })));
    expect(j.fichiers).toBeGreaterThan(0);
    expect(j.attributs).toBeGreaterThan(0);
    expect(j.fautes.map((f) => f.message)).toEqual([]);
  });
});
