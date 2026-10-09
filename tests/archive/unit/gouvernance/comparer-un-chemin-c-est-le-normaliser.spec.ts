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
 * COMPARAISON. » Aucune clause de forme ne ferme (2) et (3) — le schéma (`tasks.schema.json`) ferme (1) et (5),
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

  /**
   * (6) UN SEGMENT QUI DEVIENT POINT APRÈS NORMALISATION. La primitive nettoyait (NFKD, retrait des
   * caractères sans glyphe) PUIS résolvait les remontants : un segment qui n'est pas `..` à l'écrit
   * le devenait au nettoyage, et mangeait le segment `axionia`. Le verdict tombait à `non` — la
   * seule réponse qui laisse passer — alors que la chaîne brute commence par `axionia/`. Le schéma
   * ne refusait que le remontant littéral. Remède : un segment dont la forme comparée diffère de la
   * forme écrite et qui devient `.`, `..` ou vide rend la comparaison INDÉCIDABLE — jamais résolue.
   */
  const DEVIENT_POINT = [
    'axionia/‥/src/x.ts', // point de conduite double
    'axionia/．．/src/x.ts', // points pleine chasse
    'axionia/․․/x.ts', // points de conduite simples
    'axionia/.ㅤ./src/x.ts', // remplisseur hangul entre deux points
    'axionia/.́./x.ts', // marque combinante entre deux points
    'axionia/x/‥/‥/y.ts', // deux remontants déguisés, plus profond
  ];

  it('REQ-GOV-029 · TÉMOIN (6) un segment qui devient point après normalisation — la tâche partners est refusée', () => {
    const passees = DEVIENT_POINT.filter((f) => !isole(f));
    expect(
      passees,
      `forme(s) qui traversent isolation_depot : ${passees.map((f) => JSON.stringify(f)).join(', ')}`
    ).toEqual([]);
  });

  it('REQ-GOV-029 · TÉMOIN (6) — la primitive ne rend jamais `non` pour un segment qui devient point', () => {
    const non = DEVIENT_POINT.filter((f) => conventions.estSousLeDossier(f, 'axionia') === 'non');
    expect(non.map((f) => JSON.stringify(f))).toEqual([]);
    // Le nettoyage ne RÉSOUT pas un segment qu'il a fabriqué : il le signale.
    expect(conventions.estSousLeDossier('axionia/‥/src/x.ts', 'axionia')).toBe('indecidable');
  });

  it('REQ-GOV-029 · TÉMOIN — un chemin PLUS COURT que le dossier et illisible n’est pas `non` (dossier profond)', () => {
    // Un seul segment, dont les barres sont des lettres : il peut désigner `scripts/gates/x.ts`.
    expect(conventions.estSousLeDossier('scripts∕gates∕x.ts', 'scripts/gates')).toBe('indecidable');
    // Contre-face : plus court et entièrement lisible, rien dessous.
    expect(conventions.estSousLeDossier('scripts', 'scripts/gates')).toBe('non');
  });

  it('REQ-GOV-029 · TÉMOIN — une écriture indécidable ENTRE dans la population des gardes, elle n’en sort pas', () => {
    const suivis = [
      'scripts/gates/gov-x.ts',
      'scripts/gates/‥/gov-y.ts',
      'scripts/gates/‥/‥/gov-z.ts',
      'docs/gov-w.ts',
    ];
    const { surLeDisque } = conventions.confronterDisqueEtRegistre({
      ...VUE_CONFORME,
      fichiersSuivis: suivis,
    });
    expect(surLeDisque).toEqual(suivis.slice(0, 3));
  });

  it('REQ-GOV-029 · la NORMALISATION décide, l’échec fermé ne la remplace pas — ces formes rendent `oui`, pas `indecidable`', () => {
    // Sans ce témoin, retirer la forme de compatibilité et le retrait des caractères sans glyphe
    // laissait la spec verte : chacune de ces formes restait refusée, mais comme « indécidable ».
    const ramenees = [
      `​axionia/${TARIFS}`, // classe C retirée
      `ㅤaxionia/${TARIFS}`, // ignorable par défaut retiré
      `axíonia/${TARIFS}`, // marque retirée
      `ａxionia/${TARIFS}`, // compatibilité : pleine chasse
      `AXIONIA/${TARIFS}`, // casse
    ];
    expect(ramenees.map((c) => conventions.estSousLeDossier(c, 'axionia'))).toEqual(
      ramenees.map(() => 'oui')
    );
    // L'homoglyphe, lui, n'est ramené par rien : il reste indécidable.
    expect(conventions.estSousLeDossier(`аxionia/${TARIFS}`, 'axionia')).toBe('indecidable');
  });

  it('REQ-GOV-029 · CONTRE-TÉMOIN (6) — les points ÉCRITS restent comparés comme avant', () => {
    expect(conventions.estSousLeDossier('docs/../axionia/x.ts', 'axionia')).toBe('oui');
    expect(conventions.estSousLeDossier('axionia/../docs/x.ts', 'axionia')).toBe('non');
    const legitimes = [
      'docs/..notes.md',
      'docs/.../x.md',
      'src/app/[...slug]/page.tsx',
      'docs/spec/Présentation générale.md', // accents décomposés, lettres présentes
    ];
    expect(legitimes.filter((c) => isole(c))).toEqual([]);
    expect(legitimes.map((c) => conventions.estSousLeDossier(c, 'axionia'))).toEqual(
      legitimes.map(() => 'non')
    );
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
