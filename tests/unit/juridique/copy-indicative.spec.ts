// @req REQ-JUR-001
// @req REQ-JUR-002
/**
 * QA-T69 — la garde `jur:copy-indicative-partners`, transposée d'axion-ia : la rémunération d'un
 * apporteur ne se promet pas, ni dans la micro-copy ni dans les maquettes.
 *
 * CE QUE CE FICHIER GARDE :
 *   1. l'ancienne phrase de l'état vide de l'accueil (une promesse de gain dès la signature, contraire
 *      à l'art. 4.2), reposée dans une copie de test, fait rougir la garde ;
 *   2. chaque famille rougit sur son témoin, et seulement elle ; les contre-témoins restent verts ;
 *   3. la copy RÉELLE (src/content/ et docs/maquettes/, lues sur le disque) la laisse verte.
 * Le dépôt est lu par le système de fichiers, et non par git : le témoin tient aussi dans le bac à
 * sable de la mutation, qui n'est pas un dépôt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRE_TEMOINS,
  PHRASE_DE_L_ACCUEIL,
  TEMOINS,
  fautesDeRemuneration,
  telleQueLue,
  type Fichier,
} from '../../../scripts/gates/jur-copy-indicative';

function lireSous(dossier: string, extensions: RegExp): Fichier[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom).replace(/\\/g, '/');
    if (statSync(chemin).isDirectory()) return lireSous(chemin, extensions);
    return extensions.test(nom) ? [{ chemin, texte: readFileSync(chemin, 'utf8') }] : [];
  });
}

describe('REQ-JUR-001 REQ-JUR-002 — aucune rémunération présentée comme ferme', () => {
  it('REQ-JUR-001 : TÉMOIN — l’ancienne phrase de l’accueil fait rougir la garde, nommée', () => {
    const f = fautesDeRemuneration([
      { chemin: 'src/content/micro-copy/espace/etats-vides.ts', texte: PHRASE_DE_L_ACCUEIL },
    ]);
    expect(f.map((x) => [x.famille, x.extrait])).toEqual([['remuneration_ferme', 'vous touchez']]);
  });

  it('REQ-JUR-002 : TÉMOINS — chaque famille rougit sur son témoin, et seulement elle', () => {
    for (const t of TEMOINS) {
      const familles = [...new Set(fautesDeRemuneration(t.fichiers).map((x) => x.famille))];
      expect([t.quoi, familles]).toEqual([t.quoi, [t.famille]]);
    }
  });

  it('REQ-JUR-002 : CONTRE-TÉMOINS — la tournure d’A07 pour l’accueil, un taux indicatif, la limite d’âge, un commentaire : verts', () => {
    for (const c of CONTRE_TEMOINS)
      expect([c.quoi, fautesDeRemuneration(c.fichiers)]).toEqual([c.quoi, []]);
  });

  it('REQ-JUR-002 : la ligne est jugée telle qu’on la lit — balises retirées, entités décodées', () => {
    expect(telleQueLue('<p>Vous&nbsp;touchez&apos;</p>')).toBe(" Vous touchez' ");
    const f = fautesDeRemuneration([
      { chemin: 'docs/maquettes/x.html', texte: '<li>Vous <b>touchez</b> une commission.</li>' },
    ]);
    expect(f.map((x) => x.famille)).toEqual(['remuneration_ferme']);
  });

  it('REQ-JUR-001 REQ-JUR-002 : la copy réelle, micro-copy et maquettes, laisse la garde verte', () => {
    const fichiers = [
      ...lireSous('src/content', /\.(ts|json|md)$/),
      ...lireSous('docs/maquettes', /\.(html|md)$/),
    ];
    expect(fichiers.length).toBeGreaterThan(20);
    expect(fautesDeRemuneration(fichiers)).toEqual([]);
  });
});
