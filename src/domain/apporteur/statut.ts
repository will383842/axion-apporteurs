/**
 * DM-06 — le vocabulaire du statut d'apporteur (REQ-DM-011, `docs/GLOSSAIRE.md` §2 et §4).
 *
 * Neuf statuts STOCKÉS, et c'est tout : `actif` et `dormant` sont DÉRIVÉS par
 * `activite.ts` (REQ-CPL-027), jamais stockés, et ne figurent donc pas ici.
 *
 * DEUX COPIES TENUES, PAS DEUX SOURCES. Le domaine est pur (`docs/CONVENTIONS.md` §3) : il ne lit
 * ni le registre des exigences ni le client Prisma à l'exécution. La liste est donc écrite une
 * fois ici, et `tests/unit/domaine/apporteur-matrice-et-statuts.spec.ts` la tient égale au texte
 * de REQ-DM-011 ET à l'enum `StatutApporteur` du schéma ; `pnpm partners:schema:enums` tient
 * l'enum du schéma égal au glossaire. Modifier une copie sans les autres rougit.
 */

/** Les neuf statuts stockés de REQ-DM-011, dans l'ordre du cycle de vie. */
export const STATUTS_APPORTEUR = [
  'candidat',
  'retenu',
  'vivier',
  'refuse',
  'kyc_en_cours',
  'pret_a_signer',
  'signe',
  'suspendu',
  'resilie',
] as const;

export type StatutApporteur = (typeof STATUTS_APPORTEUR)[number];

/**
 * Les motifs de résiliation de REQ-DM-011. Le vocabulaire de la faute en est retiré (décision du
 * 2026-09-03) : le glossaire en fait des synonymes interdits.
 */
export const MOTIFS_RESILIATION = [
  'ordinaire_apporteur',
  'ordinaire_axion',
  'manquement_grave',
] as const;

export type MotifResiliation = (typeof MOTIFS_RESILIATION)[number];

/** Vrai si la valeur est l'un des neuf statuts stockés — `actif` et `dormant` n'en sont pas. */
export function estStatutApporteur(valeur: string): valeur is StatutApporteur {
  return (STATUTS_APPORTEUR as readonly string[]).includes(valeur);
}

/** Vrai si la valeur est l'un des trois motifs de résiliation. */
export function estMotifResiliation(valeur: string): valeur is MotifResiliation {
  return (MOTIFS_RESILIATION as readonly string[]).includes(valeur);
}
