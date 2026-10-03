// @req REQ-DM-008
// @req REQ-DM-009
// @req REQ-CPL-024
/**
 * DM-09 — la Qualification, côté domaine pur (`src/domain/qualification/`).
 *
 * CE QUE CE FICHIER GARDE :
 *   1. REQ-DM-008 : seul `non_confirme` éteint l'attribution ; `injoignable` et `ne_se_souvient_pas`
 *      la maintiennent `provisoire`, sans rien imputer à personne ; `confirme` la confirme ;
 *   2. REQ-DM-009 : le taux de confirmation se dérive des 10 DERNIÈRES qualifications d'APPORTEURS
 *      (fenêtre glissante) ; une confirmation par clic compte comme `confirme`, un « Non » confirmé
 *      comme `non_confirme` ; les qualifications d'une prise en charge par la Société n'y entrent pas ;
 *   3. le nombre d'« injoignable » d'une attribution est DÉRIVÉ, jamais stocké ;
 *   4. REQ-CPL-024 : un second enregistrement concurrent est rejeté avec l'état courant.
 */
import { describe, it, expect } from 'vitest';
import {
  FENETRE_DU_TAUX,
  effetDuResultat,
  injoignablesDe,
  jugerLaVersion,
  tauxDeConfirmation,
  type IssueRetenue,
} from '../../../src/domain/qualification/qualification';

const t = (n: number) => Date.UTC(2026, 9, 1) + n * 60_000;
const issue = (
  resultat: IssueRetenue['resultat'],
  n: number,
  porteur: IssueRetenue['porteur'] = 'apporteur'
): IssueRetenue => ({ resultat, a: t(n), porteur });

describe('REQ-DM-008 — l’effet de chaque résultat de contact', () => {
  it('REQ-DM-008 : TÉMOIN — seul non_confirme éteint l’attribution ; les autres la maintiennent sans rien imputer', () => {
    expect(effetDuResultat('non_confirme')).toEqual({ attribution: 'eteinte', article37: true });
    expect(effetDuResultat('confirme')).toEqual({ attribution: 'confirmee', article37: false });
    for (const r of ['injoignable', 'ne_se_souvient_pas'] as const)
      expect(effetDuResultat(r)).toEqual({ attribution: 'maintenue', article37: false });
  });
});

describe('REQ-DM-009 — le taux de confirmation, dérivé', () => {
  it('REQ-DM-009 : TÉMOIN — fenêtre glissante des 10 dernières, la plus ancienne sort', () => {
    expect(FENETRE_DU_TAUX).toBe(10);
    // 11 issues : la plus ancienne (non_confirme) sort de la fenêtre ; les 10 suivantes sont 7 confirme
    // et 3 non_confirme → 0,7.
    const issues = [
      issue('non_confirme', 0),
      ...Array.from({ length: 7 }, (_, i) => issue('confirme', i + 1)),
      ...Array.from({ length: 3 }, (_, i) => issue('non_confirme', i + 8)),
    ];
    expect(tauxDeConfirmation(issues)).toBe(0.7);
    // L'ordre d'arrivée ne compte pas : la fenêtre se lit sur l'horodatage.
    expect(tauxDeConfirmation([...issues].reverse())).toBe(0.7);
  });

  it('REQ-DM-009 : seules les issues DÉCISIVES comptent (confirme, non_confirme) ; aucune → pas de taux', () => {
    expect(
      tauxDeConfirmation([issue('injoignable', 1), issue('ne_se_souvient_pas', 2)])
    ).toBeNull();
    expect(tauxDeConfirmation([])).toBeNull();
    expect(
      tauxDeConfirmation([issue('confirme', 1), issue('injoignable', 2), issue('non_confirme', 3)])
    ).toBe(0.5);
  });

  it('REQ-DM-009 : TÉMOIN W19 — les qualifications d’une prise en charge par la Société n’entrent pas au taux', () => {
    expect(
      tauxDeConfirmation([
        issue('confirme', 1),
        issue('non_confirme', 2, 'societe'),
        issue('non_confirme', 3, 'societe'),
      ])
    ).toBe(1);
  });
});

describe('REQ-DM-008 — le nombre d’injoignable, dérivé', () => {
  it('REQ-DM-008 : TÉMOIN — compté sur les seules qualifications « injoignable », jamais stocké', () => {
    expect(
      injoignablesDe([
        issue('injoignable', 1),
        issue('ne_se_souvient_pas', 2),
        issue('injoignable', 3),
        issue('confirme', 4),
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
