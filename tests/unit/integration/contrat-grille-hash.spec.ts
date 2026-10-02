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
 * CE QUI EST EMPREINTÉ. Le TEXTE du descripteur, fins de ligne normalisées en LF : c'est lui que
 * l'autre dépôt recopie, et le dépôt n'a aucun convertisseur Zod 3 → JSON Schema (aucune dépendance
 * n'est ajoutée pour cela). Une empreinte du texte est plus stricte qu'une empreinte du schéma : elle
 * rougit aussi sur un commentaire changé d'un seul côté — et une copie qui diverge par un
 * commentaire n'est plus « à l'identique ».
 *
 * CHANGER LE CONTRAT. On modifie `grille.ts`, on recopie le fichier dans axion-ia, et on met à jour
 * l'empreinte ci-dessous DES DEUX CÔTÉS dans la même fenêtre ; le test rougit tant que l'un des deux
 * n'est pas à jour. L'empreinte n'est jamais recalculée par le test lui-même.
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

const empreinteDuTexte = (texte: string): string =>
  createHash('sha256').update(texte.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

describe('REQ-INT-017 — le contrat de la grille, épinglé par son empreinte', () => {
  it('REQ-INT-017 : l’empreinte du descripteur est celle épinglée — un changement d’un seul côté rougit', () => {
    expect(empreinteDuTexte(readFileSync(CHEMIN, 'utf8'))).toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-INT-017 : TÉMOIN — un seul caractère changé dans le descripteur change l’empreinte', () => {
    const texte = readFileSync(CHEMIN, 'utf8');
    expect(empreinteDuTexte(texte.replace('SCHEMA_GRILLE = 2', 'SCHEMA_GRILLE = 3'))).not.toBe(
      EMPREINTE_EPINGLEE
    );
    expect(empreinteDuTexte(`${texte} `)).not.toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-INT-017 : les fins de ligne ne comptent pas — une copie en CRLF garde la même empreinte', () => {
    const texte = readFileSync(CHEMIN, 'utf8').replace(/\r\n/g, '\n');
    expect(empreinteDuTexte(texte.replace(/\n/g, '\r\n'))).toBe(EMPREINTE_EPINGLEE);
  });

  it('REQ-DM-014 : la version publiée est 2, et Partners lit 1 et 2, rien d’autre', () => {
    expect(SCHEMA_GRILLE).toBe(2);
    expect([...SCHEMAS_LISIBLES]).toEqual([1, 2]);
    const forme = SCHEMA_PUBLICATION_GRILLE.shape.contenu;
    expect([...forme.optionsMap.keys()].sort()).toEqual([1, 2]);
  });
});
