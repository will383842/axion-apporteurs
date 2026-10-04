// @req REQ-INT-012
/**
 * INT-T74-P — la réponse de relecture est signée sur une chaîne CANONIQUE, construite par UNE
 * fonction partagée par le contrat (`packages/contracts/signature-relecture.ts`, condition 3 de la
 * sécurité, forme d'A02) : `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>.
 * <x-axionia-suite>.<corps exact>`, l'ordre déclaré au `$comment` de la route dans
 * `contracts.v3.json`.
 *
 * LES VECTEURS sont figés HORS DU CODE : leur HMAC est calculé par `openssl`, la commande est écrite
 * dans le fichier. Axion-ia reprend le même fichier ; deux implémentations qui rendent la même
 * chaîne et le même HMAC sur ces vecteurs signent et vérifient la même chose.
 *
 * LES NOMBRES s'écrivent en base 10, sans zéro de tête : une seule écriture par valeur, sans quoi
 * deux chaînes distinctes signeraient la même lecture. Tout autre nombre est REFUSÉ, jamais
 * normalisé.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chaineCanoniqueDeRelecture,
  NombreNonCanonique,
} from '../../../packages/contracts/signature-relecture';

type Vecteur = {
  nom: string;
  entrees: {
    horodatage: string;
    afterSequence: string;
    limit: string;
    derniereSequence: string;
    suite: string;
    corps: string;
  };
  chaine: string;
  hmacSha256: string;
};
const FICHIER = JSON.parse(
  readFileSync('packages/contracts/fixtures/signature-relecture.vecteurs.json', 'utf8')
) as { secret: string; commande: string; vecteurs: Vecteur[] };

const hmac = (chaine: string) =>
  createHmac('sha256', FICHIER.secret).update(chaine, 'utf8').digest('hex');

describe('REQ-INT-012 — la chaîne canonique de la réponse de relecture (INT-T74-P)', () => {
  it('REQ-INT-012 : le fichier porte au moins trois vecteurs (page pleine, page vide, dernière page) et la commande openssl qui les a calculés', () => {
    expect(FICHIER.vecteurs.map((v) => v.nom)).toEqual(
      expect.arrayContaining(['page pleine', 'page vide', 'dernière page'])
    );
    expect(FICHIER.commande).toMatch(/^printf '%s' .* \| openssl dgst -sha256 -hmac /);
  });

  it('REQ-INT-012 : chaque vecteur donne la chaîne attendue, et son HMAC est celui calculé par openssl', () => {
    for (const v of FICHIER.vecteurs) {
      const chaine = chaineCanoniqueDeRelecture(v.entrees);
      expect(chaine, v.nom).toBe(v.chaine);
      expect(hmac(chaine), v.nom).toBe(v.hmacSha256);
    }
  });

  it('REQ-INT-012 : les nombres entiers et bigint s’écrivent comme leur forme décimale', () => {
    const v = FICHIER.vecteurs[0]!;
    expect(
      chaineCanoniqueDeRelecture({
        ...v.entrees,
        afterSequence: 3n,
        limit: 100,
        derniereSequence: 5n,
        suite: 1,
      })
    ).toBe(v.chaine);
  });

  it.each([
    ['un zéro de tête', '03'],
    ['un négatif', '-1'],
    ['un décimal', '1.5'],
    ['un signe plus', '+3'],
    ['une chaîne vide', ''],
    ['des espaces', ' 3'],
    ['une notation exponentielle', '3e2'],
  ])(
    'REQ-INT-012 : un nombre non canonique (%s) est REFUSÉ, nommé, jamais normalisé',
    (_cas, valeur) => {
      const v = FICHIER.vecteurs[0]!;
      for (const champ of [
        'horodatage',
        'afterSequence',
        'limit',
        'derniereSequence',
        'suite',
      ] as const) {
        expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, [champ]: valeur }), champ).toThrow(
          NombreNonCanonique
        );
      }
    }
  );

  it('REQ-INT-012 : un nombre JavaScript négatif, non entier ou non sûr est refusé', () => {
    const v = FICHIER.vecteurs[0]!;
    for (const valeur of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, -1n]) {
      expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, afterSequence: valeur })).toThrow(
        NombreNonCanonique
      );
    }
  });

  it('REQ-INT-012 : la suite ne vaut que 0 ou 1', () => {
    const v = FICHIER.vecteurs[0]!;
    expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, suite: '2' })).toThrow(
      NombreNonCanonique
    );
  });

  it('REQ-INT-012 : TÉMOIN — une page authentique, rejouée sur une autre after_sequence ou une autre limit, ne vérifie plus', () => {
    const v = FICHIER.vecteurs[0]!;
    const signee = v.hmacSha256;
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, afterSequence: '10' }))).not.toBe(
      signee
    );
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, limit: '500' }))).not.toBe(signee);
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, suite: '0' }))).not.toBe(signee);
    expect(hmac(chaineCanoniqueDeRelecture(v.entrees))).toBe(signee);
  });
});
