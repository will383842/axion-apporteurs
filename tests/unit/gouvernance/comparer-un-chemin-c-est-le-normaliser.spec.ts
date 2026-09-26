// @req REQ-GOV-029
/**
 * GOV-051 — une garde qui compare des chemins comparait des chaînes brutes, et cinq familles la
 * défont.
 *
 * LE FAIT MESURÉ (2026-09-12) : `scripts/gates/gov-conventions.ts` décidait qu'un chemin appartient
 * au dépôt voisin par `p.startsWith('axionia/')` — brut, par préfixe, sensible à la casse, non
 * normalisé. Cinq familles l'amenaient de exit 1 à exit 0 sur une tâche `repo: partners` qui
 * revendique un fichier d'axionia : (1) un caractère de la classe C en tête ; (2) un caractère SANS
 * GLYPHE hors de cette classe (remplisseur hangul, braille vide, marque non espaçante) ; (3) un
 * HOMOGLYPHE ; (4) la CASSE ; (5) une forme NON CANONIQUE.
 *
 * « La propriété protégée n'est pas une propriété du CHEMIN, c'est une propriété de la
 * COMPARAISON. » Aucune clause de forme ne ferme (2) et (3) — GOV-050 ferme (1) et (5) au schéma,
 * pour ses écrivains. Le remède est à la LECTURE : toute comparaison de chemin passe par une
 * primitive UNIQUE qui normalise d'abord (forme canonique, Unicode, casse tranchée), et échoue
 * FERMÉE sur ce qu'elle ne sait pas comparer — seul endroit où un homoglyphe peut être vu.
 *
 * Chaque famille est vue rougir ; le contre-témoin garde que les chemins légitimes du dépôt restent
 * verts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as conventions from '../../../scripts/gates/gov-conventions';
import { controler, VUE_CONFORME, type Vue } from '../../../scripts/gates/gov-conventions';

const GARDE = 'scripts/gates/gov-conventions.ts';
const TARIFS = 'src/content/tarifs.ts';

/** La vue conforme, plus UNE tâche `repo: partners` qui revendique le chemin donné. */
function avec(chemin: string): Vue {
  return {
    ...VUE_CONFORME,
    taches: [...VUE_CONFORME.taches, { id: 'UX-P9-99', repo: 'partners', paths: [chemin] }],
  };
}

const isole = (chemin: string): boolean =>
  controler(avec(chemin)).some((f) => f.famille === 'isolation_depot');

const FAMILLES: readonly { famille: string; formes: readonly string[] }[] = [
  {
    famille: '(1) un caractère de la classe C en tête',
    formes: [`​axionia/${TARIFS}`, `﻿axionia/${TARIFS}`, `\u0000axionia/${TARIFS}`],
  },
  {
    famille: '(2) un caractère sans glyphe hors de la classe C',
    formes: [
      `ㅤaxionia/${TARIFS}`, // remplisseur hangul
      `⠀axionia/${TARIFS}`, // braille vide
      `́axionia/${TARIFS}`, // marque non espaçante en tête
      `axíonia/${TARIFS}`, // marque non espaçante au milieu du segment
    ],
  },
  {
    famille: '(3) un homoglyphe, lettre ordinaire',
    formes: [`аxionia/${TARIFS}`, `axiоnia/${TARIFS}`, `ａxionia/${TARIFS}`],
  },
  {
    famille: '(4) la casse',
    formes: [`AXIONIA/${TARIFS}`, `Axionia/${TARIFS}`],
  },
  {
    famille: '(5) une forme non canonique',
    formes: [
      `./axionia/${TARIFS}`,
      `axionia//${TARIFS}`,
      `axionia/./${TARIFS}`,
      `docs/../axionia/${TARIFS}`,
      `axionia\\${TARIFS.replaceAll('/', '\\')}`,
    ],
  },
];

describe('REQ-GOV-029 — comparer un chemin, c’est le normaliser', () => {
  it('REQ-GOV-029 · TÉMOIN — la forme brute `axionia/` est refusée (la garde n’a pas perdu sa cible)', () => {
    expect(isole(`axionia/${TARIFS}`)).toBe(true);
  });

  for (const { famille, formes } of FAMILLES) {
    it(`REQ-GOV-029 · TÉMOIN ${famille} — la tâche partners qui revendique axionia est refusée`, () => {
      const passees = formes.filter((f) => !isole(f));
      expect(
        passees,
        `forme(s) qui traversent isolation_depot : ${passees.map((f) => JSON.stringify(f)).join(', ')}`
      ).toEqual([]);
    });
  }

  it('REQ-GOV-029 · CONTRE-TÉMOIN — la vue conforme et les chemins légitimes restent verts', () => {
    expect(controler(VUE_CONFORME).filter((f) => f.famille === 'isolation_depot')).toEqual([]);
    const legitimes = [
      'tests/fixtures/axionia/', // une fixture DE axionia dans CE dépôt : le préfixe seul décide
      'docs/axionia.md',
      'src/lib/axionia-client.ts',
      'axionia-notes/x.md', // un voisin de nom, pas le voisin
      'src/app/(espace)/entreprise/page.tsx',
      'docs/spec/Présentation générale.md',
    ];
    expect(legitimes.filter((c) => isole(c))).toEqual([]);
  });

  it('REQ-GOV-029 · CONTRE-TÉMOIN — aucun chemin d’une tâche partners du registre n’est refusé', () => {
    const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
      taches: { id: string; repo: string; paths: string[] }[];
    };
    const partners = doc.taches.filter((t) => t.repo === 'partners');
    expect(partners.length).toBeGreaterThan(0);
    const fautes = controler({
      ...VUE_CONFORME,
      taches: partners.map((t) => ({ id: t.id, repo: t.repo, paths: t.paths })),
    }).filter((f) => f.famille === 'isolation_depot');
    expect(fautes.map((f) => f.message.slice(0, 120))).toEqual([]);
  });

  it('REQ-GOV-029 · la comparaison passe par une primitive UNIQUE, jamais par un `startsWith` recopié', () => {
    expect(typeof (conventions as Record<string, unknown>).estSousLeDossier).toBe('function');
    const code = readFileSync(GARDE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    expect(code, 'un préfixe de dépôt comparé en chaîne brute').not.toMatch(
      /startsWith\(\s*['"`]axionia\//
    );
  });
});
