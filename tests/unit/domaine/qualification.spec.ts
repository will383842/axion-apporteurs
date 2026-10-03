// @req REQ-DM-008
// @req REQ-CPL-024
// @req REQ-DM-009
/**
 * DM-09 — la Qualification, côté domaine pur (`src/domain/qualification/`).
 *
 * CE QUE CE FICHIER GARDE :
 *   1. REQ-DM-008 : seul `non_confirme` éteint l'attribution ; `injoignable` et `ne_se_souvient_pas`
 *      la maintiennent `provisoire`, sans rien imputer à personne ; `confirme` la confirme ;
 *   2. REQ-DM-009, une INTERDICTION depuis le rattrapage 84 : aucun taux ni palier n'est calculé PAR
 *      APPORTEUR. La juriste les juge contraires au contrat, et Williams a retiré le palier le
 *      2026-10-03, « non pas pour le moment » ;
 *   3. le nombre d'« injoignable » d'UNE attribution est DÉRIVÉ, jamais stocké ;
 *   4. REQ-CPL-024 : un second enregistrement concurrent est rejeté avec l'état courant.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as domaine from '../../../src/domain/qualification/qualification';
import {
  effetDuResultat,
  injoignablesDe,
  jugerLaVersion,
} from '../../../src/domain/qualification/qualification';

const issue = (resultat: 'confirme' | 'non_confirme' | 'injoignable' | 'ne_se_souvient_pas') => ({
  resultat,
});

describe('REQ-DM-008 — l’effet de chaque résultat de contact', () => {
  it('REQ-DM-008 : TÉMOIN — seul non_confirme éteint l’attribution ; les autres la maintiennent sans rien imputer', () => {
    expect(effetDuResultat('non_confirme')).toEqual({ attribution: 'eteinte', article37: true });
    expect(effetDuResultat('confirme')).toEqual({ attribution: 'confirmee', article37: false });
    for (const r of ['injoignable', 'ne_se_souvient_pas'] as const)
      expect(effetDuResultat(r)).toEqual({ attribution: 'maintenue', article37: false });
  });
});

describe('REQ-DM-008 — le nombre d’injoignable, dérivé', () => {
  it('REQ-DM-008 : TÉMOIN — compté sur les seules qualifications « injoignable », jamais stocké', () => {
    expect(
      injoignablesDe([
        issue('injoignable'),
        issue('ne_se_souvient_pas'),
        issue('injoignable'),
        issue('confirme'),
      ])
    ).toBe(2);
    expect(injoignablesDe([])).toBe(0);
  });
});

describe('REQ-DM-009 — aucun taux ni palier par apporteur', () => {
  it('REQ-DM-009 : TÉMOIN — aucune fonction du domaine de la qualification ne calcule un taux ni un palier par apporteur', () => {
    const DOSSIER = 'src/domain/qualification';
    const fichiers = readdirSync(DOSSIER).filter((f) => /\.tsx?$/.test(f));
    expect(fichiers.length).toBeGreaterThan(0);
    // Aucun export qui porterait la notion, sous quelque nom que ce soit.
    expect(
      Object.keys(domaine).filter((k) => /taux|palier|score|seuil|confiance/i.test(k))
    ).toEqual([]);
    for (const f of fichiers) {
      // Le CODE, commentaires retirés : les commentaires disent justement que rien n'est calculé.
      const code = readFileSync(`${DOSSIER}/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/taux|palier|score|seuil|confiance/i);
      // Rien n'est regroupé PAR APPORTEUR : le domaine ne connaît pas l'apporteur.
      expect(code, f).not.toMatch(/apporteur/i);
    }
  });
});

describe('REQ-CPL-024 — le verrou optimiste', () => {
  it('REQ-CPL-024 : TÉMOIN — une version périmée est rejetée AVEC l’état courant', () => {
    expect(jugerLaVersion({ attendue: 3, courante: 3 })).toEqual({ ok: true });
    expect(jugerLaVersion({ attendue: 2, courante: 3 })).toEqual({
      ok: false,
      motif: 'version_perimee',
      courante: 3,
    });
  });
});
