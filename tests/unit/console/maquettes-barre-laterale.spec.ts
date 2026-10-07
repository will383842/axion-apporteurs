// @req REQ-UX-048
/**
 * UX-P1-50 — les maquettes de la console passent en BARRE LATÉRALE (demande de Williams du
 * 2026-10-03, aperçu validé), sans toucher à leur contenu fonctionnel.
 *
 * CE QUE CE FICHIER GARDE, sur les quatorze maquettes de la console (section Console de
 * `VALIDATION.md`, lue, jamais retapée — RM-01) :
 *
 *   (1) AU BUREAU, la barre latérale : chaque écran qui porte une navigation la porte dans
 *       `header.c-tete.s-barre`, en sections titrées (le métier), au plus SEPT entrées de premier
 *       niveau, au plus une entrée courante ; plus aucune navigation horizontale `c-nav`.
 *   (2) SOUS 768 PX, la barre inférieure : au plus QUATRE entrées plus UN bouton « Menu », qui
 *       commande la barre latérale du même écran, ouverte en tiroir. Chaque entrée du bas est
 *       aussi une entrée de la barre latérale : rien n'est inventé en bas.
 *   (3) CHAQUE LIEN MÈNE QUELQUE PART : la maquette et l'état visés existent.
 *   (4) LA CHARTE de la console porte les deux régimes : au-delà de 768 px la grille à barre
 *       latérale et la barre du bas cachée ; en deçà, la barre du bas visible et la barre latérale
 *       en tiroir hors champ.
 *
 * Le reflux à 320 px sans défilement horizontal se mesure sur un navigateur réel, par le harnais
 * `tests/a11y/` (UX-P0-03), pas ici.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { lireValidation } from '../../../scripts/gates/maquettes-validees';

const DOSSIER = 'docs/maquettes';
const lire = (f: string) => readFileSync(`${DOSSIER}/${f}`, 'utf8');
const CONSOLE = lireValidation(lire('VALIDATION.md'))
  .lignes.filter((l) => /console/i.test(l.section))
  .map((l) => l.fichier!);

/** Les écrans d'une maquette : `<section class="ecran" id="…">` jusqu'au suivant. */
function ecrans(html: string): { id: string; corps: string }[] {
  return html
    .split(/<section\s+class="ecran"/)
    .slice(1)
    .map((m) => ({ id: /id="([^"]+)"/.exec(m)?.[1] ?? '?', corps: m }));
}

/** Les liens `<a … href="…">libellé</a>` d'un fragment, libellé débarrassé des balises. */
function liens(fragment: string): { href: string; libelle: string; courant: boolean }[] {
  return [...fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/g)].map((m) => ({
    href: /href="([^"]+)"/.exec(m[1]!)?.[1] ?? '',
    libelle: m[2]!
      .replace(/<span class="s-badge"[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    courant: /aria-current="page"/.test(m[1]!),
  }));
}

const entre = (corps: string, debut: RegExp, fin: string): string => {
  const i = corps.search(debut);
  if (i < 0) return '';
  const j = corps.indexOf(fin, i);
  return corps.slice(i, j < 0 ? undefined : j + fin.length);
};

const barreLaterale = (corps: string) =>
  entre(corps, /<header class="c-tete s-barre"/, '</header>');
const barreDuBas = (corps: string) => entre(corps, /<nav class="c-barre"/, '</nav>');

/** Les écrans de console qui portent une navigation, sous l'ancienne forme ou la nouvelle. */
const AVEC_NAV = CONSOLE.flatMap((f) =>
  ecrans(lire(f))
    .filter((e) => /<nav class="(?:c-nav|s-nav)"/.test(e.corps))
    .map((e) => ({ f, ...e }))
);

describe('REQ-UX-048 — au bureau, la barre latérale', () => {
  it('REQ-UX-048 — les quatorze maquettes de la console sont lues, et la plupart de leurs écrans naviguent', () => {
    expect(CONSOLE).toHaveLength(14);
    expect(AVEC_NAV.length).toBeGreaterThan(80);
  });

  it('REQ-UX-048 — chaque écran qui navigue porte la barre latérale, plus aucune navigation horizontale', () => {
    for (const { f, id, corps } of AVEC_NAV) {
      expect(corps, `${f}#${id}`).not.toMatch(/<nav class="c-nav"/);
      expect(barreLaterale(corps), `${f}#${id}`).toMatch(
        /<nav class="s-nav" aria-label="Console">/
      );
      // `est-ouvert` : l'état « Menu ouvert (téléphone) » montre le tiroir ouvert.
      expect(corps, `${f}#${id}`).toMatch(/<div class="app avec-barre(?: est-ouvert)?">/);
    }
  });

  it('REQ-UX-048 — au plus sept entrées de premier niveau, groupées en sections titrées, une seule courante au plus', () => {
    for (const { f, id, corps } of AVEC_NAV) {
      const barre = barreLaterale(corps);
      const nav = entre(barre, /<nav class="s-nav"/, '</nav>');
      const entrees = liens(nav);
      expect(entrees.length, `${f}#${id}`).toBeGreaterThan(0);
      expect(entrees.length, `${f}#${id}`).toBeLessThanOrEqual(7);
      expect(entrees.filter((e) => e.courant).length, `${f}#${id}`).toBeLessThanOrEqual(1);
      const sections = nav.split('<div class="s-section">').slice(1);
      expect(sections.length, `${f}#${id}`).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s, `${f}#${id}`).toMatch(/^\s*<p class="s-titre">\s*[^<\s][^<]*<\/p\s*>/);
        expect(liens(s).length, `${f}#${id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('REQ-UX-048 — sous 768 px, la barre du bas et son menu', () => {
  it('REQ-UX-048 — au plus quatre entrées plus UN bouton « Menu », qui commande la barre latérale de l’écran', () => {
    for (const { f, id, corps } of AVEC_NAV) {
      const bas = barreDuBas(corps);
      expect(bas, `${f}#${id} : barre du bas`).not.toBe('');
      expect(liens(bas).length, `${f}#${id}`).toBeLessThanOrEqual(4);
      const boutons = [...bas.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
      expect(boutons.length, `${f}#${id}`).toBe(1);
      expect(boutons[0]![2]!.replace(/<[^>]+>/g, '').trim(), `${f}#${id}`).toBe('Menu');
      const cible = /aria-controls="([^"]+)"/.exec(boutons[0]![1]!)?.[1];
      const idBarre = /<header class="c-tete s-barre" id="([^"]+)"/.exec(corps)?.[1];
      expect(cible, `${f}#${id}`).toBeDefined();
      expect(cible, `${f}#${id}`).toBe(idBarre);
    }
  });

  it('REQ-UX-048 — chaque entrée du bas est aussi une entrée de la barre latérale', () => {
    for (const { f, id, corps } of AVEC_NAV) {
      const haut = new Set(liens(barreLaterale(corps)).map((e) => `${e.libelle} → ${e.href}`));
      for (const e of liens(barreDuBas(corps)))
        expect(haut.has(`${e.libelle} → ${e.href}`), `${f}#${id} : ${e.libelle}`).toBe(true);
    }
  });

  it('REQ-UX-048 — les identifiants de barre sont uniques dans chaque maquette', () => {
    for (const f of CONSOLE) {
      const ids = [...lire(f).matchAll(/<header class="c-tete s-barre" id="([^"]+)"/g)].map(
        (m) => m[1]
      );
      expect(new Set(ids).size, f).toBe(ids.length);
    }
  });
});

describe('REQ-UX-048 — chaque lien mène quelque part', () => {
  it('REQ-UX-048 — la maquette et l’état que vise une entrée de navigation existent', () => {
    let vus = 0;
    for (const { f, id, corps } of AVEC_NAV) {
      for (const e of [...liens(barreLaterale(corps)), ...liens(barreDuBas(corps))]) {
        const [fichier, ancre] = e.href.split('#');
        const cible = fichier || f;
        expect(existsSync(`${DOSSIER}/${cible}`), `${f}#${id} → ${e.href}`).toBe(true);
        if (ancre) expect(lire(cible), `${f}#${id} → ${e.href}`).toContain(`id="${ancre}"`);
        vus += 1;
      }
    }
    expect(vus).toBeGreaterThan(300);
  });
});

describe('REQ-UX-048 — la charte de la console porte les deux régimes', () => {
  const charte = (lire(CONSOLE[0]!).match(/\/\* charte:debut[\s\S]*?\/\* charte:fin \*\//) ?? [
    '',
  ])[0];
  /** Le texte, de son début à l'accolade qui ferme la première ouverte, comptée. */
  const fermer = (texte: string): string => {
    let n = 0;
    for (let j = texte.indexOf('{'); j >= 0 && j < texte.length; j++) {
      if (texte[j] === '{') n += 1;
      if (texte[j] === '}' && --n === 0) return texte.slice(0, j + 1);
    }
    return '';
  };
  /** Tous les blocs de la charte qui s'ouvrent par `entete`, chacun jusqu'à son accolade fermante. */
  const blocs = (entete: string): string =>
    charte
      .split(entete)
      .slice(1)
      .map((x) => fermer(entete + x))
      .join('\n');

  it('REQ-UX-048 — au-delà de 768 px : grille à barre latérale, barre du bas cachée', () => {
    const larges = blocs('@container (min-width: 768px)');
    expect(larges.length).toBeGreaterThan(0);
    expect(larges).toMatch(/\.app\.avec-barre \.c-barre \{\s*display: none;/);
    expect(larges).toMatch(/grid-template-columns: \d+px minmax\(0, 1fr\)/);
  });

  it('REQ-UX-048 — en deçà : barre du bas visible, barre latérale en tiroir hors champ', () => {
    const etroits = blocs('@container (max-width: 767px)');
    expect(etroits).toMatch(/\.app\.avec-barre \.c-barre \{\s*display: flex;/);
    expect(etroits).toMatch(/transform: translateX\(-105%\)/);
    expect(etroits).toMatch(
      /\.app\.avec-barre\.est-ouvert \.c-tete\.s-barre \{\s*transform: none;/
    );
  });
});
