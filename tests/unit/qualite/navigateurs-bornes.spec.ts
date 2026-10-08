// @req REQ-QA-016
/**
 * QA-T59 et QA-T74 — le cœur PUR de `scripts/ci/navigateurs-bornes.ts`, en deux temps : les dépendances
 * système (apt, jamais tuées), puis le téléchargement des navigateurs (trois tentatives bornées).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as module_ from '../../../scripts/ci/navigateurs-bornes';
import {
  DELAI_PAR_TENTATIVE_MS,
  OPTIONS_DEPENDANCES,
  PAUSES_MS,
  TENTATIVES,
  TENTATIVES_DEPENDANCES,
  commandesDerivees,
  installerBorne,
  installerEnDeuxTemps,
  installerLesDependances,
} from '../../../scripts/ci/navigateurs-bornes';

const CI = '.github/workflows/ci.yml';

/**
 * Lecture ciblée (aucun parseur YAML au dépôt) : la `timeout-minutes` de CHAQUE étape « Navigateurs
 * des passes d accessibilite » de ci.yml, en millisecondes ; `NaN` pour une étape qui n'en porte pas.
 */
function dureesDesEtapes(yml: string): number[] {
  const lignes = yml.split('\n');
  const durees: number[] = [];
  lignes.forEach((l, i) => {
    const m = /^(\s*)- name: Navigateurs des passes d accessibilite\s*$/.exec(l);
    if (!m) return;
    const retrait = m[1]!.length;
    let duree = Number.NaN;
    for (let j = i + 1; j < lignes.length; j++) {
      const r = /^(\s*)(?:- |#|\S)/.exec(lignes[j]!);
      if (r && r[1]!.length <= retrait) break;
      const t = /^\s*timeout-minutes:\s*(\d+)\s*$/.exec(lignes[j]!);
      if (t) duree = Number(t[1]) * 60_000;
    }
    durees.push(duree);
  });
  return durees;
}

/** Les durées d'étape qui ne laissent pas la moitié aux dépendances (une durée absente compte). */
function budgetDepasse(durees: number[]): number[] {
  const borne = TENTATIVES * DELAI_PAR_TENTATIVE_MS + PAUSES_MS.reduce((a, b) => a + b, 0);
  return durees.filter((d) => !(borne <= d / 2));
}

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

  it('REQ-QA-016 — le temps borné (téléchargements et pauses) laisse au moins la moitié de CHAQUE étape de ci.yml aux dépendances', () => {
    // RM-01 : la durée de l'étape n'est écrite qu'à ci.yml ; le script n'en garde aucune copie.
    expect('DUREE_ETAPE_MS' in module_).toBe(false);
    const durees = dureesDesEtapes(readFileSync(CI, 'utf8'));
    expect(durees).toHaveLength(2);
    expect(budgetDepasse(durees)).toEqual([]);
  });

  it('REQ-QA-016 — TÉMOIN : une étape de ci.yml baissée sous le double du budget rougit, et une étape sans durée aussi', () => {
    const yml = readFileSync(CI, 'utf8');
    const baisse = yml.replace(
      /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?\s*timeout-minutes:\s*)\d+/,
      '$110'
    );
    expect(budgetDepasse(dureesDesEtapes(baisse))).toEqual([10 * 60_000]);
    const sansDuree = yml.replace(
      /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?)\s*timeout-minutes:\s*\d+\n/,
      '$1\n'
    );
    expect(budgetDepasse(dureesDesEtapes(sansDuree)).some(Number.isNaN)).toBe(true);
  });
});

describe('REQ-QA-016 — QA-T74 : les deux commandes, dérivées de `a11y:navigateurs`', () => {
  it('REQ-QA-016 — TÉMOIN : le téléchargement borné ne porte jamais `--with-deps` (il prendrait le verrou d’apt)', () => {
    const c = commandesDerivees('playwright install --with-deps chromium webkit');
    expect(c.dependances).toEqual(['exec', 'playwright', 'install-deps', 'chromium', 'webkit']);
    expect(c.navigateurs).toEqual(['exec', 'playwright', 'install', 'chromium', 'webkit']);
  });

  it('REQ-QA-016 — un script qui n’est pas `playwright install` est refusé, rien n’est deviné', () => {
    expect(() => commandesDerivees('echo rien')).toThrow(/a11y:navigateurs/);
    expect(() => commandesDerivees('playwright install --with-deps')).toThrow(/a11y:navigateurs/);
  });
});

describe('REQ-QA-016 — QA-T74 : apt garde ses paquets dans le dossier mis en cache', () => {
  it('REQ-QA-016 — la configuration d’apt pointe les archives vers le dossier, et les garde', () => {
    const conf = module_.configurationApt('/home/runner/.cache/apt-navigateurs');
    expect(conf).toContain('Dir::Cache::Archives "/home/runner/.cache/apt-navigateurs/";');
    expect(conf).toContain('APT::Keep-Downloaded-Packages "true";');
    expect(conf).toContain('Binary::apt::APT::Keep-Downloaded-Packages "true";');
  });

  it('REQ-QA-016 — TÉMOIN : un dossier relatif ou porteur d’un guillemet est refusé, rien n’est écrit à apt', () => {
    expect(() => module_.configurationApt('.cache/apt')).toThrow(/absolu/);
    expect(() => module_.configurationApt('/tmp/a"b')).toThrow(/absolu/);
  });
});
