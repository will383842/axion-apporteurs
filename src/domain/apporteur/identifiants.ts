/**
 * DM-06 — les deux identifiants d'un apporteur (REQ-DM-012).
 *
 * LE CODE DE PARRAINAGE, PUBLIC. `AX` puis 6 caractères de l'alphabet Crockford base32 — sans I,
 * L, O ni U, qu'on confond à la lecture —, soit 30 bits aléatoires (HYP-DM06-CODE-PARRAINAGE),
 * au-dessus des 25 qu'exige REQ-SEC-037 : non énumérable. Il se lit, se dicte et s'imprime ; il ne
 * donne AUCUN droit. Le quota, les déclarations non confirmées et l'horodatage se comptent sur
 * l'apporteur, jamais sur ce code.
 *
 * LE JETON DE DÉPÔT, PRIVÉ. Un secret de `OCTETS_JETON_DEPOT` octets aléatoires, remis UNE fois en
 * clair ; seule son EMPREINTE SHA-256 se stocke (`tokenHash`, unique). Un apporteur peut en avoir
 * plusieurs. Un jeton révoqué ne se réactive pas : ce module n'offre aucun chemin de retour, et la
 * base refuse le sien (déclencheur `jetons_depot_revocation_definitive`).
 *
 * L'ALÉA EST INJECTÉ. Le domaine est pur (`docs/CONVENTIONS.md` §3) : il reçoit une source
 * `(n) => n octets`. En production, c'est `crypto.getRandomValues` ; en test, des octets écrits.
 */
import { createHash } from 'node:crypto';
import type { Instant } from '../temps/horloge';

/** Crockford base32 : chiffres, puis lettres sans I, L, O ni U. L'indice est la valeur. */
export const ALPHABET_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const PREFIXE_CODE_PARRAINAGE = 'AX';

/** Six caractères de 5 bits : 30 bits, tirés de 4 octets dont les 2 bits de poids fort sont jetés. */
const CARACTERES_CODE = 6;
const BITS_PAR_CARACTERE = 5;
export const OCTETS_CODE_PARRAINAGE = 4;

/** 256 bits : le jeton se devine moins qu'il ne se vole. */
export const OCTETS_JETON_DEPOT = 32;

export type SourceAleatoire = (octets: number) => Uint8Array;

const FORME_CODE = new RegExp(
  `^${PREFIXE_CODE_PARRAINAGE}[${ALPHABET_CROCKFORD}]{${CARACTERES_CODE}}$`
);

function tirer(source: SourceAleatoire, n: number): Uint8Array {
  const o = source(n);
  if (o.length !== n) {
    throw new RangeError(`source d'aléa : ${n} octets attendus, ${o.length} reçus`);
  }
  return o;
}

/** Un code de parrainage neuf. L'unicité est celle de la base (index unique) : on retire en cas de collision. */
export function genererCodeParrainage(source: SourceAleatoire): string {
  const o = tirer(source, OCTETS_CODE_PARRAINAGE);
  const masque = 2 ** (CARACTERES_CODE * BITS_PAR_CARACTERE) - 1;
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

// ── le jeton de dépôt ────────────────────────────────────────────────────────

export interface JetonDepotEnregistre {
  readonly tokenHash: string;
  readonly creeAt: Instant;
  readonly revoqueAt: Instant | null;
  readonly dernierUsageAt: Instant | null;
}

export class ErreurJetonDepot extends Error {
  readonly code: 'jeton_deja_revoque';

  constructor(code: 'jeton_deja_revoque') {
    super(`${code} : un jeton révoqué ne se réactive pas et ne se révoque pas deux fois`);
    this.name = 'ErreurJetonDepot';
    this.code = code;
  }
}

/** L'empreinte stockée d'un jeton : SHA-256 hexadécimal, 64 caractères. */
export function empreinteJetonDepot(clair: string): string {
  return createHash('sha256').update(clair, 'utf8').digest('hex');
}

/** Un jeton neuf : le CLAIR, à remettre une fois, et l'enregistrement, qui ne porte que l'empreinte. */
export function nouveauJetonDepot(
  source: SourceAleatoire,
  creeAt: Instant
): { clair: string; enregistrement: JetonDepotEnregistre } {
  const clair = Buffer.from(tirer(source, OCTETS_JETON_DEPOT)).toString('base64url');
  return {
    clair,
    enregistrement: {
      tokenHash: empreinteJetonDepot(clair),
      creeAt,
      revoqueAt: null,
      dernierUsageAt: null,
    },
  };
}

export function jetonDepotActif(jeton: JetonDepotEnregistre): boolean {
  return jeton.revoqueAt === null;
}

/** Révoque un jeton actif. Un jeton déjà révoqué lève : sa date de révocation ne bouge jamais. */
export function revoquerJetonDepot(jeton: JetonDepotEnregistre, at: Instant): JetonDepotEnregistre {
  if (!jetonDepotActif(jeton)) throw new ErreurJetonDepot('jeton_deja_revoque');
  return { ...jeton, revoqueAt: at };
}
