// @req REQ-DM-027
/**
 * Les pièces exigibles pour signer (CPL-T07, selon la juriste) et le juge pur de ce qui manque :
 * SIREN, identité et RC pro VALIDÉES, la TVA aussi si l'identité de facturation est assujettie ; le
 * RIB seulement DÉPOSÉ (sa vérification conditionne le versement, pas la signature) ; la vigilance
 * jamais exigée à l'entrée. Une pièce échue ou écartée du service ne compte pas.
 */
import { describe, it, expect } from 'vitest';
import {
  MOTIFS_REFUS_PIECE,
  PIECES_DEPOSEES_AU_KYC,
  PIECES_VALIDEES_AU_KYC,
  manquesPourSigner,
  piecesAValiderPourSigner,
  type PieceLue,
} from '../../../src/domain/kyc/pieces';

const MAINTENANT = new Date('2027-03-01T10:00:00.000Z');
const piece = (
  type: PieceLue['type'],
  statut: PieceLue['statut'],
  o: { expireAt?: Date | null; remplaceeAt?: Date | null } = {}
): PieceLue => ({ type, statut, expireAt: o.expireAt ?? null, remplaceeAt: o.remplaceeAt ?? null });
const COMPLET: PieceLue[] = [
  piece('siret', 'valide'),
  piece('identite', 'valide'),
  piece('rc_pro', 'valide', { expireAt: new Date('2028-01-01T00:00:00.000Z') }),
  piece('rib', 'a_verifier'),
];

describe('REQ-DM-027 — les pièces exigibles pour signer, selon la juriste', () => {
  it('REQ-DM-027 : les listes fermées, exactement', () => {
    expect(PIECES_VALIDEES_AU_KYC).toEqual(['siret', 'identite', 'rc_pro']);
    expect(PIECES_DEPOSEES_AU_KYC).toEqual(['rib']);
    expect(MOTIFS_REFUS_PIECE).toEqual([
      'illisible',
      'au_nom_d_un_tiers',
      'perimee',
      'incomplete',
      'non_conforme',
    ]);
    expect(piecesAValiderPourSigner('assujetti')).toEqual(['siret', 'identite', 'rc_pro', 'tva']);
    expect(piecesAValiderPourSigner('franchise_293b')).toEqual(['siret', 'identite', 'rc_pro']);
    expect(piecesAValiderPourSigner(null)).toEqual(['siret', 'identite', 'rc_pro']);
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — le dossier complet ne manque de rien ; chaque pièce retirée est nommée, dans l’ordre des types', () => {
    expect(manquesPourSigner(COMPLET, 'franchise_293b', MAINTENANT)).toEqual([]);
    expect(manquesPourSigner([], 'franchise_293b', MAINTENANT)).toEqual([
      'siret',
      'rib',
      'identite',
      'rc_pro',
    ]);
    expect(manquesPourSigner([], 'assujetti', MAINTENANT)).toEqual([
      'siret',
      'tva',
      'rib',
      'identite',
      'rc_pro',
    ]);
    for (const p of COMPLET)
      expect(
        manquesPourSigner(
          COMPLET.filter((x) => x !== p),
          'franchise_293b',
          MAINTENANT
        ),
        p.type
      ).toEqual([p.type]);
  });

  it('REQ-DM-027 : TÉMOIN — une pièce à valider ne compte que VALIDE ; le RIB compte déposé ou validé, jamais refusé', () => {
    for (const statut of ['manquante', 'a_verifier', 'perimee', 'refusee'] as const)
      expect(
        manquesPourSigner(
          [...COMPLET.filter((p) => p.type !== 'siret'), piece('siret', statut)],
          'franchise_293b',
          MAINTENANT
        ),
        statut
      ).toEqual(['siret']);
    for (const statut of ['a_verifier', 'valide'] as const)
      expect(
        manquesPourSigner(
          [...COMPLET.filter((p) => p.type !== 'rib'), piece('rib', statut)],
          'franchise_293b',
          MAINTENANT
        ),
        statut
      ).toEqual([]);
    for (const statut of ['manquante', 'perimee', 'refusee'] as const)
      expect(
        manquesPourSigner(
          [...COMPLET.filter((p) => p.type !== 'rib'), piece('rib', statut)],
          'franchise_293b',
          MAINTENANT
        ),
        statut
      ).toEqual(['rib']);
  });

  it('REQ-DM-027 : TÉMOIN — une échéance passée, ou atteinte à l’instant, ne compte pas ; une pièce écartée du service non plus', () => {
    const avec = (rc: PieceLue) =>
      manquesPourSigner(
        [...COMPLET.filter((p) => p.type !== 'rc_pro'), rc],
        'franchise_293b',
        MAINTENANT
      );
    expect(
      avec(piece('rc_pro', 'valide', { expireAt: new Date(MAINTENANT.getTime() + 1) }))
    ).toEqual([]);
    expect(avec(piece('rc_pro', 'valide', { expireAt: MAINTENANT }))).toEqual(['rc_pro']);
    expect(
      avec(piece('rc_pro', 'valide', { expireAt: new Date(MAINTENANT.getTime() - 1) }))
    ).toEqual(['rc_pro']);
    expect(avec(piece('rc_pro', 'valide', { remplaceeAt: MAINTENANT }))).toEqual(['rc_pro']);
    expect(
      manquesPourSigner(
        [
          ...COMPLET.filter((p) => p.type !== 'rib'),
          piece('rib', 'a_verifier', { remplaceeAt: MAINTENANT }),
        ],
        'franchise_293b',
        MAINTENANT
      )
    ).toEqual(['rib']);
  });

  it('REQ-DM-027 : TÉMOIN — assujetti, la TVA validée est exigée ; la vigilance ne l’est jamais', () => {
    expect(manquesPourSigner(COMPLET, 'assujetti', MAINTENANT)).toEqual(['tva']);
    expect(
      manquesPourSigner([...COMPLET, piece('tva', 'valide')], 'assujetti', MAINTENANT)
    ).toEqual([]);
    expect(
      manquesPourSigner([...COMPLET, piece('tva', 'a_verifier')], 'assujetti', MAINTENANT)
    ).toEqual(['tva']);
    expect(
      manquesPourSigner([...COMPLET, piece('vigilance', 'manquante')], 'franchise_293b', MAINTENANT)
    ).toEqual([]);
  });
});
