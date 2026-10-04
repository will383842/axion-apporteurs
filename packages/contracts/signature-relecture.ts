/**
 * signature-relecture.ts — la chaîne CANONIQUE que signe la réponse de la route de relecture
 * d'axion-ia (INT-T74-P, condition 3 de la sécurité, forme d'A02 ; route déclarée au contrat par
 * INT-T70-P).
 *
 * L'ORDRE est celui que le `$comment` de la route écrit dans `contracts.v3.json` :
 * `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>.<x-axionia-suite>.<corps exact>`.
 * Il lie la page à SA requête (after_sequence et limit demandés) et couvre les deux en-têtes qui
 * disent où reprendre : une page authentique d'une autre lecture ne se greffe pas sur celle-ci, et
 * ni la dernière séquence ni la suite ne se falsifient.
 *
 * FONCTION PURE, SANS IMPORT, et surtout sans `node:crypto` : elle CONSTRUIT la chaîne, et chaque
 * côté calcule son HMAC avec son propre module. Axion-ia (INT-T72-A) reprend ce fichier et ses
 * vecteurs (`fixtures/signature-relecture.vecteurs.json`) à l'identique.
 *
 * LES NOMBRES sont des entiers non négatifs écrits en base 10 sans zéro de tête : une seule écriture
 * par valeur, sinon deux chaînes distinctes signeraient la même lecture. Tout autre nombre est
 * REFUSÉ par une exception nommée, et jamais normalisé. La suite ne vaut que 0 ou 1.
 */

/** Un nombre tel qu'il arrive : un en-tête (chaîne), un paramètre (nombre ou bigint). */
export type NombreDeRelecture = string | number | bigint;

export type EntreesDeRelecture = {
  readonly horodatage: NombreDeRelecture;
  readonly afterSequence: NombreDeRelecture;
  readonly limit: NombreDeRelecture;
  readonly derniereSequence: NombreDeRelecture;
  readonly suite: NombreDeRelecture;
  /** Le corps EXACT de la réponse, tel qu'il a été reçu. */
  readonly corps: string;
};

/** Un nombre qui n'a pas la forme canonique : le refus est nommé, la valeur jamais corrigée. */
export class NombreNonCanonique extends Error {
  constructor(readonly champ: string) {
    super(`nombre_non_canonique : ${champ} n'est pas un entier non négatif écrit sans zéro de tête`);
    this.name = 'NombreNonCanonique';
  }
}

const DECIMAL_CANONIQUE = /^(0|[1-9][0-9]*)$/;

function canonique(champ: string, valeur: NombreDeRelecture): string {
  if (typeof valeur === 'bigint') {
    if (valeur < 0n) throw new NombreNonCanonique(champ);
    return valeur.toString(10);
  }
  if (typeof valeur === 'number') {
    if (!Number.isSafeInteger(valeur) || valeur < 0) throw new NombreNonCanonique(champ);
    return valeur.toString(10);
  }
  if (typeof valeur !== 'string' || !DECIMAL_CANONIQUE.test(valeur)) {
    throw new NombreNonCanonique(champ);
  }
  return valeur;
}

/** La chaîne que signe la réponse de relecture, dans l'ordre déclaré au contrat. */
export function chaineCanoniqueDeRelecture(e: EntreesDeRelecture): string {
  const suite = canonique('x-axionia-suite', e.suite);
  if (suite !== '0' && suite !== '1') throw new NombreNonCanonique('x-axionia-suite');
  return [
    canonique('x-axionia-timestamp', e.horodatage),
    canonique('after_sequence', e.afterSequence),
    canonique('limit', e.limit),
    canonique('x-axionia-derniere-sequence', e.derniereSequence),
    suite,
    e.corps,
  ].join('.');
}
