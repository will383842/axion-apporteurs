/**
 * contrat-grille-hash.spec.ts — le contrat de la grille publiée (axion-ia → Axion Partners), et son
 * empreinte ÉPINGLÉE.
 *
 * @req REQ-DM-014
 * @req REQ-INT-017
 *
 * Patron de `contrat-hash.spec.ts` (partners/ADR-0008) : une forme partagée entre deux dépôts n'est
 * tenue que si les deux épinglent la MÊME empreinte. Ici, la forme vit dans
 * `packages/contracts/grille.ts`, qu'axion-ia RECOPIE À L'IDENTIQUE (INT-T47-A).
 *
 * CE QUI EST EMPREINTÉ (décision A02 du 2026-10-02). Le TEXTE du descripteur : c'est lui que l'autre
 * dépôt recopie, et le dépôt n'a aucun convertisseur Zod 3 → JSON Schema (aucune dépendance n'est
 * ajoutée pour cela). Trois conditions le rendent probant :
 *   1. AUTONOMIE : le fichier n'importe RIEN d'autre que `zod` ; sinon le texte haché ne porterait
 *      pas tout le contrat ;
 *   2. NORMALISATION, et rien d'autre : BOM retiré, retours de ligne en LF, UNE seule fin de ligne
 *      finale. Ni tri, ni retrait des commentaires : un commentaire changé d'un seul côté rougit,
 *      et c'est voulu — une copie qui diverge n'est plus « à l'identique » ;
 *   3. ZOD : la sémantique dépend aussi de sa version. Partners épingle `zod` en version exacte ; le
 *      témoin d'axion-ia vérifie le même majeur.
 *
 * CHANGER LE CONTRAT. On modifie `grille.ts`, on recopie le fichier dans axion-ia, et on met à jour
 * l'empreinte ci-dessous DES DEUX CÔTÉS dans la même fenêtre ; le test rougit tant que l'un des deux
 * n'est pas à jour. L'empreinte est un LITTÉRAL, jamais recalculée par le test lui-même.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  SCHEMA_GRILLE,
  SCHEMAS_LISIBLES,
  SCHEMA_PUBLICATION_GRILLE,
} from '../../../packages/contracts/grille';

const CHEMIN = 'packages/contracts/grille.ts';
/** L'empreinte ÉPINGLÉE du descripteur, à recopier telle quelle dans axion-ia. */
const EMPREINTE_EPINGLEE = '07e8a2a68a03ecbb161dc1ad5045cafd46a5bf148826b63f1299340a0c4b2fb6';
/** Le majeur de `zod` sous lequel la forme est jugée, des deux côtés. */
const MAJEUR_ZOD = 3;

/** La normalisation, et elle seule : BOM retiré, LF, une seule fin de ligne finale. */
const normaliser = (texte: string): string =>
  texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');

const empreinteDuTexte = (texte: string): string =>
  createHash('sha256').update(normaliser(texte), 'utf8').digest('hex');

const texte = (): string => readFileSync(CHEMIN, 'utf8');

/** Les spécificateurs importés par un texte TypeScript (statiques, dynamiques, `require`, `export … from`). */
const specificateurs = (t: string): string[] =>
  [
    ...t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"]+)\1/g),
  ].map((m) => m[2]!);

describe('REQ-INT-017 — le contrat de la grille, épinglé par son empreinte', () => {
  it('REQ-INT-017 : l’empreinte du descripteur est celle épinglée — un changement d’un seul côté rougit', () => {
    expect(empreinteDuTexte(texte())).toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-INT-017 : TÉMOIN — un caractère du code ou d’un commentaire changé change l’empreinte', () => {
    const t = texte();
    expect(empreinteDuTexte(t.replace('SCHEMA_GRILLE = 2', 'SCHEMA_GRILLE = 3'))).not.toBe(
      EMPREINTE_EPINGLEE
    );
    expect(empreinteDuTexte(t.replace('UNE SEULE FORME', 'UNE SEULE forme'))).not.toBe(
      EMPREINTE_EPINGLEE
    );
    expect(empreinteDuTexte(t.replace(/\n$/, ' \n'))).not.toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-INT-017 : la normalisation, et elle seule — CRLF, BOM et fins de ligne multiples ne comptent pas', () => {
    const t = normaliser(texte());
    expect(empreinteDuTexte(t.replace(/\n/g, '\r\n'))).toBe(EMPREINTE_EPINGLEE);
    expect(empreinteDuTexte(`﻿${t}`)).toBe(EMPREINTE_EPINGLEE);
    expect(empreinteDuTexte(`${t}\n\n`)).toBe(EMPREINTE_EPINGLEE);
    expect(empreinteDuTexte(t.slice(0, -1))).toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-INT-017 : AUTONOMIE — le descripteur n’importe que zod', () => {
    expect(specificateurs(texte())).toEqual(['zod']);
  });

  it('REQ-INT-017 : TÉMOIN — le juge des imports voit une importation étrangère, sous toutes ses formes', () => {
    for (const ajout of [
      "import { BPS_MAX } from '../../src/domain/commission/grille';",
      "import type { X } from './ailleurs';",
      "export { Y } from './ailleurs';",
      "const m = await import('./ailleurs');",
      "const r = require('./ailleurs');",
      "import './effet';",
    ]) {
      expect(specificateurs(`${ajout}\n${texte()}`)).not.toEqual(['zod']);
    }
  });

  it('REQ-INT-017 : ZOD — Partners épingle une version exacte, de majeur 3', () => {
    const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const version = paquet.dependencies?.['zod'] ?? '';
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number(version.split('.')[0])).toBe(MAJEUR_ZOD);
  });

  it('REQ-DM-014 : la version publiée est 2, et Partners lit 1 et 2, rien d’autre', () => {
    expect(SCHEMA_GRILLE).toBe(2);
    expect([...SCHEMAS_LISIBLES]).toEqual([1, 2]);
    const forme = SCHEMA_PUBLICATION_GRILLE.shape.contenu;
    expect([...forme.optionsMap.keys()].sort()).toEqual([1, 2]);
  });
});
