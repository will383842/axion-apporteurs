// @req REQ-QA-016
/**
 * QA-T59 — le cœur PUR de `scripts/ci/navigateurs-bornes.ts` : au plus trois tentatives, arrêt au
 * premier succès, échec en 1 quand toutes échouent, le délai de chaque tentative transmis.
 */
import { describe, it, expect } from 'vitest';
import {
  DELAI_PAR_TENTATIVE_MS,
  TENTATIVES,
  installerBorne,
  PAUSES_MS,
  ATTENTE_VERROU_MS,
} from '../../../scripts/ci/navigateurs-bornes';

const suite = (...issues: boolean[]) => {
  const appels: number[] = [];
  let i = 0;
  return { tenter: (delai: number) => (appels.push(delai), issues[i++] ?? false), appels };
};

describe('REQ-QA-016 — les navigateurs installés en trois tentatives bornées (QA-T59)', () => {
  it('REQ-QA-016 — les bornes : trois tentatives, quatre minutes chacune', () => {
    expect(TENTATIVES).toBe(3);
    expect(DELAI_PAR_TENTATIVE_MS).toBe(240_000);
  });

  it('REQ-QA-016 — un succès à la deuxième tentative s’arrête là, en 0, chaque tentative sous le délai', () => {
    const s = suite(false, true);
    expect(installerBorne(s.tenter).code).toBe(0);
    expect(s.appels).toEqual([DELAI_PAR_TENTATIVE_MS, DELAI_PAR_TENTATIVE_MS]);
  });

  it('REQ-QA-016 — TÉMOIN : trois échecs sortent en 1, sans quatrième tentative, en le nommant', () => {
    const s = suite(false, false, false, true);
    const r = installerBorne(s.tenter);
    expect(r.code).toBe(1);
    expect(s.appels).toHaveLength(3);
    expect(r.lignes.at(-1)).toContain('3 tentatives échouées');
  });
});

describe('REQ-QA-016 — QA-T74 : le verrou d’apt du runner ne brûle plus les trois tentatives', () => {
  it('REQ-QA-016 — une PAUSE sépare deux tentatives échouées, aucune après la dernière ; le verrou est attendu avant chacune', () => {
    const s = suite(false, false, false);
    const pauses: number[] = [];
    let verrous = 0;
    const r = installerBorne(s.tenter, TENTATIVES, DELAI_PAR_TENTATIVE_MS, {
      attendre: (ms) => pauses.push(ms),
      attendreLeVerrou: () => (verrous++, true),
    });
    expect(r.code).toBe(1);
    expect(pauses).toEqual([...PAUSES_MS]);
    expect(verrous).toBe(3);
  });

  it('REQ-QA-016 — le pire cas tient sous les quinze minutes de l’étape', () => {
    // Un verrou tenu fait échouer vite la tentative qui suit son attente ; une tentative qui télécharge
    // n'attend aucun verrou. Le pire cas est donc, par tentative, le plus long des deux.
    const pire =
      TENTATIVES * Math.max(DELAI_PAR_TENTATIVE_MS, ATTENTE_VERROU_MS) +
      PAUSES_MS.reduce((a, b) => a + b, 0);
    expect(pire).toBeLessThanOrEqual(15 * 60_000);
  });

  it('REQ-QA-016 — un verrou encore tenu ne saute pas la tentative : il est NOMMÉ, et l’échec reste fermé', () => {
    const s = suite(false, false, false);
    const r = installerBorne(s.tenter, TENTATIVES, DELAI_PAR_TENTATIVE_MS, {
      attendre: () => undefined,
      attendreLeVerrou: () => false,
    });
    expect(s.appels).toHaveLength(3);
    expect(r.code).toBe(1);
    expect(r.lignes.join('\n')).toContain('verrou d');
  });
});
