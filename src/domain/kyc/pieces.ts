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

/**
 * Les motifs FERMÉS d'un refus de pièce (CPL-T07, forme d'A02, valeurs de la juriste) : un refus en
 * porte toujours UN, jamais un texte libre ni « autre ». Il entre dans la charge de
 * `piece_kyc_statut_modifie`, exigé si et seulement si la pièce passe à `refusee`.
 */
export const MOTIFS_REFUS_PIECE = [
  'illisible',
  'au_nom_d_un_tiers',
  'perimee',
  'incomplete',
  'non_conforme',
] as const;
export type MotifRefusPiece = (typeof MOTIFS_REFUS_PIECE)[number];

/** Les types qui portent une échéance obligatoire (CHECK `pieces_kyc_echeance_requise`). */
export const TYPES_A_ECHEANCE = ['vigilance', 'rc_pro'] as const satisfies readonly TypePieceKyc[];

/**
 * Les pièces EXIGIBLES pour valider le KYC (`valider_kyc` → `pret_a_signer`, CPL-T07), selon la
 * juriste (2026-10-04) :
 *  — VALIDÉES : le SIREN (art. 6.1 et 5.4), l'identité (REQ-DM-027, art. 6.3 : le signataire est la
 *    personne qui contracte) et la RC pro, remise à la signature (art. 6.4) ; la TVA aussi, si
 *    l'identité de facturation est `assujetti` (art. 6.3, mention obligatoire de l'autofacture) ;
 *  — DÉPOSÉE seulement : le RIB. Sa vérification hors bande conditionne le VERSEMENT (art. 5.4,
 *    REQ-UX-027), jamais la signature : un RIB `a_verifier` suffit.
 * La vigilance n'est pas exigible à l'entrée : elle se réclame au seuil légal (JUR-T16).
 */
export const PIECES_VALIDEES_AU_KYC = [
  'siret',
  'identite',
  'rc_pro',
] as const satisfies readonly TypePieceKyc[];
export const PIECES_DEPOSEES_AU_KYC = ['rib'] as const satisfies readonly TypePieceKyc[];

/** Les pièces à VALIDER pour signer, selon le régime de TVA (`null` : aucune identité saisie). */
export function piecesAValiderPourSigner(
  regimeTva: 'assujetti' | 'franchise_293b' | null
): TypePieceKyc[] {
  return regimeTva === 'assujetti'
    ? [...PIECES_VALIDEES_AU_KYC, 'tva']
    : [...PIECES_VALIDEES_AU_KYC];
}

/** Une pièce telle que le juge du KYC la lit : son type, son statut, son échéance, son remplacement. */
export interface PieceLue {
  readonly type: TypePieceKyc;
  readonly statut: StatutPieceKyc;
  readonly expireAt: Date | null;
  readonly remplaceeAt: Date | null;
}

/**
 * Ce qui MANQUE pour signer, pièce par pièce, dans l'ordre des types ; vide si le KYC peut être
 * validé. Le refus nomme la pièce manquante, et jamais un autre motif (juriste). Une pièce validée
 * dont l'échéance est passée ne compte pas ; une pièce remplacée non plus.
 */
export function manquesPourSigner(
  pieces: readonly PieceLue[],
  regimeTva: 'assujetti' | 'franchise_293b' | null,
  maintenant: Date
): TypePieceKyc[] {
  const vivantes = pieces.filter((p) => p.remplaceeAt === null);
  const valide = (t: TypePieceKyc) =>
    vivantes.some(
      (p) =>
        p.type === t &&
        p.statut === 'valide' &&
        (p.expireAt === null || p.expireAt.getTime() > maintenant.getTime())
    );
  const deposee = (t: TypePieceKyc) =>
    vivantes.some((p) => p.type === t && (p.statut === 'a_verifier' || p.statut === 'valide'));
  const aValider = piecesAValiderPourSigner(regimeTva);
  return TYPES_PIECE_KYC.filter(
    (t) =>
      (aValider.includes(t) && !valide(t)) ||
      ((PIECES_DEPOSEES_AU_KYC as readonly TypePieceKyc[]).includes(t) && !deposee(t))
  );
}
