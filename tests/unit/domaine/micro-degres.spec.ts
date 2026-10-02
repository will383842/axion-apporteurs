// @req REQ-EXT-015
/**
 * EXT-T08 — les coordonnées du siège en MICRO-DEGRÉS entiers, par une fonction pure (REQ-EXT-015).
 *
 * CE QU'IL PROUVE :
 *   — une chaîne décimale WGS84 du tiers devient un entier de micro-degrés, arrondi au plus proche
 *     (une demie s'éloigne de zéro), par arithmétique de CHAÎNE : aucune erreur de virgule flottante ;
 *   — une forme douteuse (exposant, virgule, espace, signe plus, vide) est REFUSÉE : nul, jamais
 *     devinée ; une valeur hors bornes (±90 en latitude, ±180 en longitude) aussi ;
 *   — la paire va ensemble, comme le CHECK `attributions_coordonnees` : une seule coordonnée lisible
 *     ne donne aucune coordonnée.
 */
import { describe, it, expect } from 'vitest';
import {
  BORNE_LATITUDE,
  BORNE_LONGITUDE,
  coordonneesDuSiege,
  versMicroDegres,
} from '../../../src/domain/geo/micro-degres';

describe('REQ-EXT-015 — une coordonnée en micro-degrés entiers', () => {
  it.each([
    ['48.8763540066087', 48876354],
    ['2.34353640229216', 2343536],
    ['48.5330900313909', 48533090],
    ['-0.5', -500000],
    ['45', 45000000],
    ['0.0000005', 1],
    ['-0.0000005', -1],
    ['0.0000004999', 0],
    ['89.9999995', 90000000],
    ['-179.9999994', -179999999],
    ['1.1', 1100000],
  ] as const)('REQ-EXT-015 : %s → %i, arrondi au plus proche', (texte, attendu) => {
    expect(versMicroDegres(texte, BORNE_LONGITUDE)).toBe(attendu);
  });

  it('REQ-EXT-015 : TÉMOIN — l’arithmétique est celle de la chaîne, pas d’un flottant', () => {
    // 1.005 × 10⁶ en flottant vaut 1004999.9999999999 : un arrondi naïf du produit le rend juste ici,
    // mais pas toujours ; la chaîne, elle, ne se trompe jamais.
    expect(versMicroDegres('1.0000005', BORNE_LATITUDE)).toBe(1000001);
    expect(versMicroDegres('4.35000050', BORNE_LATITUDE)).toBe(4350001);
  });

  it.each([
    '',
    ' 48.1',
    '48,1',
    '+48.1',
    '4.8e1',
    '1e-3',
    'NaN',
    'Infinity',
    '48.',
    '.5',
    '--1',
    'abc',
  ])('REQ-EXT-015 : TÉMOIN — la forme « %s » est refusée, jamais devinée', (texte) => {
    expect(versMicroDegres(texte, BORNE_LONGITUDE)).toBeNull();
  });

  it('REQ-EXT-015 : nul et absent restent nuls', () => {
    expect(versMicroDegres(null, BORNE_LATITUDE)).toBeNull();
    expect(versMicroDegres(undefined, BORNE_LATITUDE)).toBeNull();
  });

  it('REQ-EXT-015 : TÉMOIN — hors bornes, nul : ±90 en latitude, ±180 en longitude, bornes comprises', () => {
    expect(versMicroDegres('90', BORNE_LATITUDE)).toBe(90000000);
    expect(versMicroDegres('-90', BORNE_LATITUDE)).toBe(-90000000);
    expect(versMicroDegres('90.0000001', BORNE_LATITUDE)).toBeNull();
    expect(versMicroDegres('91', BORNE_LATITUDE)).toBeNull();
    expect(versMicroDegres('180', BORNE_LONGITUDE)).toBe(180000000);
    expect(versMicroDegres('-180.000001', BORNE_LONGITUDE)).toBeNull();
    expect(versMicroDegres('1000', BORNE_LONGITUDE)).toBeNull();
  });
});

describe('REQ-EXT-015 — la paire va ensemble (CHECK attributions_coordonnees)', () => {
  it('REQ-EXT-015 : deux coordonnées lisibles donnent la paire', () => {
    expect(coordonneesDuSiege('48.8763540066087', '2.34353640229216')).toEqual({
      latitudeMicrodeg: 48876354,
      longitudeMicrodeg: 2343536,
    });
  });

  it('REQ-EXT-015 : TÉMOIN — une seule coordonnée lisible ne donne aucune coordonnée', () => {
    const rien = { latitudeMicrodeg: null, longitudeMicrodeg: null };
    expect(coordonneesDuSiege('48.1', null)).toEqual(rien);
    expect(coordonneesDuSiege(null, '2.1')).toEqual(rien);
    expect(coordonneesDuSiege('48.1', '4.8e1')).toEqual(rien);
    expect(coordonneesDuSiege('91', '2.1')).toEqual(rien);
    expect(coordonneesDuSiege(null, null)).toEqual(rien);
  });
});
