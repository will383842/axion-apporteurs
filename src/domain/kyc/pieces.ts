/**
 * Les pièces du KYC — le vocabulaire du domaine (DM-11, REQ-DM-027).
 *
 * Les listes sont celles des enums Prisma `TypePieceKyc` et `StatutPieceKyc`, que la garde
 * `partners:schema:enums` confronte au glossaire ; le témoin `kyc-reference-piece-rib.spec.ts` les
 * confronte au schéma. Le domaine n'importe pas le client de base de données : il les écrit une fois, et les deux
 * confrontations en tiennent l'égalité.
 *
 * CE QUI N'EST PAS ICI. La règle de vigilance et le blocage du versement appartiennent à JUR-T16
 * (`controlesVersement()`) : aucune pièce de cette liste ne diffère un versement de son propre chef.
 */

/** Les types de pièce (REQ-DM-027), dans l'ordre du glossaire. */
export const TYPES_PIECE_KYC = ['siret', 'tva', 'rib', 'identite', 'vigilance', 'rc_pro'] as const;
export type TypePieceKyc = (typeof TYPES_PIECE_KYC)[number];

/** Les statuts d'une pièce (REQ-DM-027), dans l'ordre du glossaire. */
export const STATUTS_PIECE_KYC = [
  'manquante',
  'a_verifier',
  'valide',
  'perimee',
  'refusee',
] as const;
export type StatutPieceKyc = (typeof STATUTS_PIECE_KYC)[number];

/** Les types qui portent une échéance obligatoire (CHECK `pieces_kyc_echeance_requise`). */
export const TYPES_A_ECHEANCE = ['vigilance', 'rc_pro'] as const satisfies readonly TypePieceKyc[];
