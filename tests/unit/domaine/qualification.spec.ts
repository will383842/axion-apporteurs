// @req REQ-DM-008
// @req REQ-CPL-024
/**
 * DM-09 — la Qualification, côté domaine pur (`src/domain/qualification/`).
 *
 * CE QUE CE FICHIER GARDE :
 *   1. REQ-DM-008 : seul `non_confirme` éteint l'attribution ; `injoignable` et `ne_se_souvient_pas`
 *      la maintiennent `provisoire`, sans rien imputer à personne ; `confirme` la confirme ;
 *   2. aucun taux ni palier n'est calculé PAR APPORTEUR : REQ-DM-009 et REQ-DM-010 sont en question
 *      auprès de Williams (avis contraire de la juriste, 2026-10-03) ;
 *   3. le nombre d'« injoignable » d'UNE attribution est DÉRIVÉ, jamais stocké ;
 *   4. REQ-CPL-024 : un second enregistrement concurrent est rejeté avec l'état courant.
 */
import { describe, it, expect } from 'vitest';
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
