// @req REQ-QA-016
/**
 * QA-T59 et QA-T74 — le cœur PUR de `scripts/ci/navigateurs-bornes.ts`, en deux temps : les dépendances
 * système (apt, jamais tuées), puis le téléchargement des navigateurs (trois tentatives bornées).
 */
import { describe, it, expect } from 'vitest';
import {
  DELAI_PAR_TENTATIVE_MS,
  DUREE_ETAPE_MS,
  OPTIONS_DEPENDANCES,
  PAUSES_MS,
  TENTATIVES,
  TENTATIVES_DEPENDANCES,
  installerBorne,
  installerEnDeuxTemps,
  installerLesDependances,
} from '../../../scripts/ci/navigateurs-bornes';

const suite = (...issues: boolean[]) => {
  const appels: number[] = [];
  let i = 0;
  return { tenter: (delai: number) => (appels.push(delai), issues[i++] ?? false), appels };
};
const libre = (...issues: boolean[]) => {
  let n = 0;
  return { tenter: () => issues[n++] ?? false, appels: () => n };
};

describe('REQ-QA-016 — les navigateurs téléchargés en trois tentatives bornées (QA-T59)', () => {
  it('REQ-QA-016 — les bornes : trois tentatives de deux minutes (QA-T74 : 180 s puis 120 s)', () => {
    expect(TENTATIVES).toBe(3);
    expect(DELAI_PAR_TENTATIVE_MS).toBe(120_000);
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

  it('REQ-QA-016 — une PAUSE sépare deux téléchargements échoués, aucune après le dernier', () => {
    const pauses: number[] = [];
    installerBorne(suite(false, false, false).tenter, TENTATIVES, DELAI_PAR_TENTATIVE_MS, {
      attendre: (ms) => pauses.push(ms),
    });
    expect(pauses).toEqual([...PAUSES_MS]);
  });
});

describe('REQ-QA-016 — QA-T74 : apt n’est jamais tué, donc jamais orphelin d’un verrou', () => {
  it('REQ-QA-016 — TÉMOIN : le lancement des dépendances ne porte AUCUN délai (run 37687549026 : l’apt tué gardait le verrou)', () => {
    expect('timeout' in OPTIONS_DEPENDANCES).toBe(false);
    expect('killSignal' in OPTIONS_DEPENDANCES).toBe(false);
  });

  it('REQ-QA-016 — les dépendances : le verrou attendu avant chaque tentative, deux tentatives au plus, échec fermé', () => {
    const d = libre(false, false, true);
    let verrous = 0;
    const r = installerLesDependances(d.tenter, TENTATIVES_DEPENDANCES, {
      attendre: () => undefined,
      attendreLeVerrou: () => (verrous++, true),
    });
    expect(r.code).toBe(1);
    expect(d.appels()).toBe(2);
    expect(verrous).toBe(2);
    expect(r.lignes.at(-1)).toContain('dépendances système, 2 tentatives échouées');
  });

  it('REQ-QA-016 — un verrou encore tenu ne saute pas la tentative des dépendances : il est NOMMÉ', () => {
    const r = installerLesDependances(libre(true).tenter, TENTATIVES_DEPENDANCES, {
      attendreLeVerrou: () => false,
    });
    expect(r.code).toBe(0);
    expect(r.lignes.join('\n')).toContain('verrou d');
  });

  it('REQ-QA-016 — les navigateurs ne sont téléchargés qu’après des dépendances réussies', () => {
    const n = suite(true);
    const echec = installerEnDeuxTemps(libre(false, false).tenter, n.tenter, {});
    expect(echec.code).toBe(1);
    expect(n.appels).toHaveLength(0);
    const ok = installerEnDeuxTemps(libre(true).tenter, n.tenter, {});
    expect(ok.code).toBe(0);
    expect(n.appels).toHaveLength(1);
  });

  it('REQ-QA-016 — le temps borné (téléchargements et pauses) laisse au moins la moitié de l’étape aux dépendances', () => {
    const borne = TENTATIVES * DELAI_PAR_TENTATIVE_MS + PAUSES_MS.reduce((a, b) => a + b, 0);
    expect(borne).toBeLessThanOrEqual(DUREE_ETAPE_MS / 2);
  });
});
