/**
 * DM-06 — les deux identifiants d'un apporteur (REQ-DM-012).
 *
 * LE CODE DE PARRAINAGE, PUBLIC. Sa forme vit dans `src/domain/parrainage/code.ts` (SEC-21), qui la
 * définit seul ; elle est ré-exportée ici pour DM-06. Le quota, les déclarations non confirmées et
 * l'horodatage se comptent sur l'apporteur, jamais sur ce code.
 *
 * LE JETON DE DÉPÔT, PRIVÉ. Un secret de `OCTETS_JETON_DEPOT` octets aléatoires, remis UNE fois en
 * clair ; seule son EMPREINTE SHA-256 se stocke (`tokenHash`, unique). Un apporteur peut en avoir
 * plusieurs. Un jeton révoqué ne se réactive pas : ce module n'offre aucun chemin de retour, et la
 * base refuse le sien (déclencheur `jetons_depot_revocation_definitive`).
 *
 * L'ALÉA EST INJECTÉ. Le domaine est pur (`docs/CONVENTIONS.md` §3) : il reçoit une source
 * `(n) => n octets`. En production, c'est `sourceAleatoireSysteme` ; en test, des octets écrits.
 */
import { createHash } from 'node:crypto';
import type { Instant } from '../temps/horloge';

export {
  ALPHABET_CROCKFORD,
  OCTETS_CODE_PARRAINAGE,
  PREFIXE_CODE_PARRAINAGE,
  estCodeParrainage,
  genererCodeParrainage,
} from '../parrainage/code';

/** 256 bits : le jeton se devine moins qu'il ne se vole. */
export const OCTETS_JETON_DEPOT = 32;

export type SourceAleatoire = (octets: number) => Uint8Array;

/**
 * LA source de production : `crypto.getRandomValues`, générateur cryptographique du moteur. Les
 * appelants de production la passent ; les tests injectent des octets écrits. Tirer l'aléa n'est
 * pas une I/O : le domaine reste rejouable dès qu'on lui passe une autre source.
 */
export const sourceAleatoireSysteme: SourceAleatoire = (octets) =>
  globalThis.crypto.getRandomValues(new Uint8Array(octets));

function tirer(source: SourceAleatoire, n: number): Uint8Array {
  const o = source(n);
  if (o.length !== n) {
    throw new RangeError(`source d'aléa : ${n} octets attendus, ${o.length} reçus`);
  }
  return o;
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
