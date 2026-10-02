/**
 * SEC-21 — la FORME du code public de parrainage (REQ-SEC-037, HYP-DM06-CODE-PARRAINAGE).
 *
 * `AX` puis 6 caractères de l'alphabet Crockford base32 — sans I, L, O ni U, qu'on confond à la
 * lecture —, soit 30 bits aléatoires, au-dessus des 25 qu'exige REQ-SEC-037 : non énumérable. Le
 * code ne dépend QUE de la source d'aléa : jamais de l'identité de l'apporteur. Il se lit, se dicte
 * et s'imprime ; il ne donne AUCUN droit.
 *
 * Déplacé de `src/domain/apporteur/identifiants.ts` (qui le ré-exporte pour DM-06), et EXPORTÉ pour
 * axion-ia, qui capture le `?p=` d'une visite : une seule définition de la forme (RM-01).
 */
import type { SourceAleatoire } from '../apporteur/identifiants';

/** Crockford base32 : chiffres, puis lettres sans I, L, O ni U. L'indice est la valeur. */
export const ALPHABET_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const PREFIXE_CODE_PARRAINAGE = 'AX';

/** Six caractères de 5 bits : 30 bits, tirés de 4 octets dont les 2 bits de poids fort sont jetés. */
const CARACTERES_CODE = 6;
const BITS_PAR_CARACTERE = 5;
export const OCTETS_CODE_PARRAINAGE = 4;

/** L'aléa d'un code, en bits : ce que REQ-SEC-037 borne par en dessous (25). */
export const BITS_D_ALEA_DU_CODE = CARACTERES_CODE * BITS_PAR_CARACTERE;

const FORME_CODE = new RegExp(
  `^${PREFIXE_CODE_PARRAINAGE}[${ALPHABET_CROCKFORD}]{${CARACTERES_CODE}}$`
);

/** Un code de parrainage neuf. L'unicité est celle de la base (index unique) : on retire en cas de collision. */
export function genererCodeParrainage(source: SourceAleatoire): string {
  const o = source(OCTETS_CODE_PARRAINAGE);
  if (o.length !== OCTETS_CODE_PARRAINAGE) {
    throw new RangeError(
      `source d'aléa : ${OCTETS_CODE_PARRAINAGE} octets attendus, ${o.length} reçus`
    );
  }
  const masque = 2 ** BITS_D_ALEA_DU_CODE - 1;
  let valeur = (o[0]! * 2 ** 24 + o[1]! * 2 ** 16 + o[2]! * 2 ** 8 + o[3]!) % (masque + 1);
  let code = '';
  for (let i = 0; i < CARACTERES_CODE; i += 1) {
    code = ALPHABET_CROCKFORD[valeur % ALPHABET_CROCKFORD.length]! + code;
    valeur = Math.floor(valeur / ALPHABET_CROCKFORD.length);
  }
  return PREFIXE_CODE_PARRAINAGE + code;
}

/** Vrai si la chaîne a EXACTEMENT la forme d'un code : aucune normalisation (casse, espaces). */
export function estCodeParrainage(valeur: string): boolean {
  return FORME_CODE.test(valeur);
}

/**
 * Un code CAPTURÉ (le `?p=` d'une visite, transmis par axion-ia), sous sa forme canonique : blancs
 * autour retirés, capitales. Tout ce qui n'a pas alors la forme d'un code rend `null` — jamais une
 * erreur : un code mal formé est ignoré en silence, comme une visite sans code.
 */
export function normaliserCodeParrainage(capture: unknown): string | null {
  if (typeof capture !== 'string') return null;
  const canonique = capture.trim().toUpperCase();
  return estCodeParrainage(canonique) ? canonique : null;
}
