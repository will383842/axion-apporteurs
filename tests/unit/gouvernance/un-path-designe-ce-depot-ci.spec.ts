// @req REQ-GOV-021
/**
 * GOV-050 — le champ `paths` n'avait AUCUNE forme : un chemin hors du dépôt traversait toute la
 * chaîne (écrivain, `gov:tasks`, `gov:check`), mesuré par mutation le 2026-09-12.
 *
 * LA FORME EST POSÉE AU SCHÉMA (`scripts/lot/tasks.schema.json`), là où tous les écrivains la
 * rencontrent. Un chemin NORMAL :
 *   (a) ne porte aucun caractère de la classe Unicode C (`\p{C}` : Cc, Cf, Cs, Co, Cn — et non
 *       `\p{Cf}` seul, sans quoi Cn et Co passent) ;
 *   (b) ne porte aucun blanc Unicode (`White_Space`, et non `\s`) en bordure d'AUCUN SEGMENT ;
 *   (c) ne porte aucune séquence percent-encodée ;
 *   (d) est égal à sa forme canonique et ne sort pas du dépôt : ni remontant, ni racine, ni lettre
 *       de lecteur, ni antislash, ni segment vide ou `.`.
 * Chaque clause est une CLASSE FERMÉE ou une PROPRIÉTÉ, jamais une liste de membres : les témoins
 * ci-dessous en jouent des représentants, ils ne l'énumèrent pas.
 *
 * LE CONTRE-TÉMOIN EST LE VRAI LIVRABLE : l'UNION des chemins de `docs/tasks.json` et de
 * `docs/paths-proposes.json` passe sans UN refus, et son compte est RENDU, jamais attendu.
 *
 * LIMITES, DITES : ce contrôle est syntaxique. Il ne décode rien, ne voit aucun lien symbolique,
 * et ne fermera jamais un homoglyphe — une lettre ordinaire. La propriété qui compte est celle de
 * la COMPARAISON, et c'est GOV-051 qui la porte ; le dernier témoin garde que ces formes-là
 * passent encore ici.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { controler } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre } from '../../../scripts/lot/registre-decisions';

const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
  version: number;
  taches: Record<string, unknown>[];
};
const proposes = JSON.parse(readFileSync('docs/paths-proposes.json', 'utf8')) as {
  paths: Record<string, string[]>;
};

type Validateur = {
  validate: (s: object, d: unknown) => boolean;
  errors?: { instancePath?: string; message?: string }[] | null;
};
const ajv = new (Ajv2020 as unknown as { new (o: object): Validateur })({
  allErrors: true,
  strict: false,
});

/** Le verdict du SCHÉMA sur un chemin, porté par une vraie tâche du registre — rien d'autre ne change. */
function accepte(chemin: string): boolean {
  const tache = { ...doc.taches[0]!, paths: [chemin] };
  return ajv.validate(schema, { version: doc.version, taches: [tache] });
}

const refuses = (formes: readonly string[]) => formes.filter((f) => accepte(f));
const montrer = (formes: readonly string[]) => formes.map((f) => JSON.stringify(f)).join(', ');

/** Un chemin légitime, dans lequel les témoins insèrent le caractère qu'ils jouent. */
const BASE = 'docs/spec/plan.md';

/** Les 25 points de code `White_Space` d'Unicode — la propriété, et non `\s`. */
const WHITE_SPACE = [
  ...Array.from({ length: 5 }, (_, i) => 0x09 + i),
  0x20,
  0x85,
  0xa0,
  0x1680,
  ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
].map((c) => String.fromCodePoint(c));

describe('REQ-GOV-021 — un chemin de `paths` désigne CE dépôt, sous sa forme canonique', () => {
  it('REQ-GOV-021 · (a) un caractère de la classe C est refusé où qu’il soit — Cc, Cf, Cs, Co, Cn', () => {
    const classeC = [
      '\u0000', // Cc
      '\u001f', // Cc
      '\u007f', // Cc
      '\u0085', // Cc
      '\u00ad', // Cf, trait d'union conditionnel
      '\u200b', // Cf, espace sans chasse
      '\u202e', // Cf, forçage droite-à-gauche
      '\ufeff', // Cf
      '\ud800', // Cs, demi-codet isolé
      '\ue000', // Co, usage privé
      '\u0378', // Cn, non attribué
    ];
    expect(WHITE_SPACE).toHaveLength(25);
    const formes = classeC.flatMap((c) => [`${c}${BASE}`, `docs/${c}spec/plan.md`, `${BASE}${c}`]);
    expect(refuses(formes), `formes acceptées : ${montrer(refuses(formes))}`).toEqual([]);
  });

  it('REQ-GOV-021 · (b) un blanc Unicode en bordure de n’importe quel segment est refusé', () => {
    const formes = WHITE_SPACE.flatMap((b) => [
      `${b}docs/spec/plan.md`,
      `docs${b}/spec/plan.md`,
      `docs/${b}spec/plan.md`,
      `docs/spec/plan.md${b}`,
    ]);
    expect(refuses(formes), `formes acceptées : ${montrer(refuses(formes))}`).toEqual([]);
  });

  it('REQ-GOV-021 · (c) une séquence percent-encodée est refusée, sans jamais la décoder', () => {
    const formes = [
      '%2e%2e/axionia/src/x.ts',
      'docs/%41.md',
      'docs/spec%2Fplan.md',
      'docs/a%0a.md',
    ];
    expect(refuses(formes), `formes acceptées : ${montrer(refuses(formes))}`).toEqual([]);
  });

  it('REQ-GOV-021 · (d) un chemin non canonique, ou qui sort du dépôt, est refusé', () => {
    const formes = [
      '../axionia/src/content/pricing.ts',
      '..',
      '/etc/passwd',
      // Le dossier personnel s'écrit par son marqueur, seule forme que `gov:publication` permet (SEC-48).
      'C:/Users/<nom>/x.ts',
      'c:docs',
      'docs\\spec\\plan.md',
      'docs//spec/plan.md',
      './docs/spec/plan.md',
      'docs/./spec/plan.md',
      'docs/../axionia/x.ts',
      'docs/spec/..',
      '.',
      '',
    ];
    expect(refuses(formes), `formes acceptées : ${montrer(refuses(formes))}`).toEqual([]);
  });

  it('REQ-GOV-021 · (e) un segment qui ne devient point, remontant ou vide QU’APRÈS normalisation est refusé', () => {
    // (d) ne refuse que l'écriture littérale ; le comparateur (GOV-051), lui, normalise. Un segment
    // fait seulement de points de compatibilité et de caractères sans glyphe est refusé à l'écrit.
    const formes = [
      'axionia/‥/src/x.ts',
      'axionia/．．/src/x.ts',
      'axionia/․․/x.ts',
      'axionia/.ㅤ./src/x.ts',
      'axionia/.́./x.ts',
      'axionia/x/‥/‥/y.ts',
      'docs/﹒/plan.md',
      'docs/ㅤ/plan.md',
    ];
    expect(refuses(formes), `formes acceptées : ${montrer(refuses(formes))}`).toEqual([]);
    // L'ensemble des points de compatibilité est RE-MESURÉ sur tout Unicode, pas recopié : chaque
    // point de code dont la forme nettoyée n'est qu'un ou deux points est refusé, seul et doublé.
    const points: string[] = [];
    for (let c = 0x80; c < 0x110000; c++) {
      if (c >= 0xd800 && c < 0xe000) continue;
      const ch = String.fromCodePoint(c);
      const n = ch.normalize('NFKD').replace(/[\p{C}\p{M}\p{Default_Ignorable_Code_Point}]/gu, '');
      if (n === '.' || n === '..') points.push(ch);
    }
    expect(points.length, 'une mesure vide dirait toujours oui').toBeGreaterThan(0);
    const mesurees = points.flatMap((p) => [`docs/${p}/plan.md`, `docs/${p}${p}/plan.md`]);
    expect(refuses(mesurees), `formes acceptées : ${montrer(refuses(mesurees))}`).toEqual([]);
    // Contre-face : des points ÉCRITS dans un nom, ou trois points, ne sont pas un remontant.
    const legitimes = ['docs/..notes.md', 'docs/.../x.md', 'src/app/[...slug]/page.tsx'];
    expect(legitimes.filter((f) => !accepte(f))).toEqual([]);
  });

  it('REQ-GOV-021 · la forme est tenue de bout en bout : `gov:tasks` refuse un chemin qui remonte hors du dépôt', () => {
    const fautif = {
      version: doc.version,
      taches: doc.taches.map((t, i) =>
        i === 0 ? { ...t, paths: ['../axionia/src/content/pricing.ts'] } : t
      ),
    };
    const fautes = controler(fautif, schema, chargerRegistre());
    expect(
      fautes.some((f) => f.famille === 'schema' && f.message.includes('/paths/0')),
      `gov:tasks n'a pas refusé le chemin : ${JSON.stringify(fautes.slice(0, 3))}`
    ).toBe(true);
  });

  it('REQ-GOV-021 · CONTRE-TÉMOIN — l’union des chemins que le dépôt déclare passe sans un refus, et son compte est rendu', () => {
    const union = [
      ...new Set([
        ...doc.taches.flatMap((t) => t.paths as string[]),
        ...Object.values(proposes.paths).flat(),
      ]),
    ];
    const refusesDuDepot = union.filter((c) => !accepte(c));
    expect(union.length, 'une union vide dirait toujours oui').toBeGreaterThan(0);
    expect(
      refusesDuDepot,
      `${refusesDuDepot.length} chemin(s) refusé(s) sur ${union.length} déclarés : ${montrer(refusesDuDepot)}`
    ).toEqual([]);
    // Le registre entier, tel qu'il est, reste valide au schéma.
    expect(ajv.validate(schema, doc), JSON.stringify(ajv.errors?.slice(0, 3))).toBe(true);
  });

  it('REQ-GOV-021 · CONTRE-TÉMOIN — les formes légitimes, et celles qu’aucune forme ne ferme, passent', () => {
    const formes = [
      'docs/',
      '.claude/agents/',
      'src/app/(espace)/entreprise/page.tsx',
      'axionia/src/app/api/partners/candidatures/[candidatureId]/coordonnees/route.ts',
      'docs/spec/Présentation générale.md', // un blanc DANS un segment, et une lettre accentuée
      'docs/taux-100%-net.md', // un `%` qui n'encode rien
      'docs/..notes.md', // un nom qui commence par deux points n'est pas un remontant
      '\u0430xionia/src/x.ts', // homoglyphe cyrillique : une lettre, que GOV-051 juge à la comparaison
    ];
    expect(
      formes.filter((f) => !accepte(f)),
      'une forme légitime est refusée : la clause interdit du légitime en silence'
    ).toEqual([]);
  });
});
