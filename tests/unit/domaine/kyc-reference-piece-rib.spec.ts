// @req REQ-CPL-005
// @req REQ-DM-027
/**
 * `kyc-reference-piece-rib.spec.ts` — DM-11 lu dans le SCHÉMA, sans base (HYP-DM06-IBAN, REQ-DM-027).
 *
 *   — L'IBAN n'existe NULLE PART ailleurs que dans la pièce `rib` : aucun autre modèle ne porte une
 *     colonne dont un segment de nom est `iban` ou `bic` (TÉMOIN : une colonne `iban` ajoutée à un
 *     autre modèle fait rougir) ;
 *   — l'identité de facturation référence sa pièce `rib` par une clé étrangère COMPOSITE
 *     (id, type), et la pièce porte l'unicité (id, type) ;
 *   — les vocabulaires du KYC sont des enums, aux valeurs du domaine et du glossaire ;
 *   — le journal d'une pièce porte une charge fermée, sans donnée personnelle.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma } from '../../../scripts/lot/lecteur-prisma';
import { segmentsDuNom } from '../../../src/domain/donnees-personnelles/champs';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';
import {
  STATUTS_PIECE_KYC,
  TYPES_A_ECHEANCE,
  TYPES_PIECE_KYC,
} from '../../../src/domain/kyc/pieces';

const TEXTE = readFileSync('prisma/schema.prisma', 'utf8');
const schema = lireSchemaPrisma(TEXTE);
const modele = (nom: string) => schema.modeles.find((m) => m.nom === nom);

/** Un nom porte un IBAN ou un BIC si l'un de ses SEGMENTS l'est. */
const bancaire = (nom: string | null | undefined): boolean =>
  segmentsDuNom(nom ?? '').some((s) => s === 'iban' || s === 'bic');

/** Les modèles qui portent une colonne bancaire, hors de la pièce du KYC. */
const horsDeLaPiece = (s: ReturnType<typeof lireSchemaPrisma>): string[] =>
  s.modeles
    .filter((m) => m.nom !== 'PieceKyc')
    .flatMap((m) =>
      m.champs.filter((c) => bancaire(c.nom) || bancaire(c.colonne)).map((c) => `${m.nom}.${c.nom}`)
    );

describe('REQ-CPL-005 — l’IBAN n’existe que dans la pièce rib (HYP-DM06-IBAN)', () => {
  it('REQ-CPL-005 : aucune colonne IBAN ni BIC hors de PieceKyc, dans aucun modèle du schéma', () => {
    expect(horsDeLaPiece(schema)).toEqual([]);
    const piece = new Map(modele('PieceKyc')!.champs.map((c) => [c.nom, c]));
    expect(piece.get('ibanChiffre')).toMatchObject({ type: 'Bytes', optionnel: true });
    expect(piece.get('ibanHash')).toMatchObject({ type: 'String', optionnel: true });
  });

  it('REQ-CPL-005 : TÉMOIN — une colonne iban ajoutée à un autre modèle fait rougir le juge', () => {
    const fautif = TEXTE.replace(
      /(model IdentiteFacturation \{\n)/,
      '$1  iban String? @map("iban")\n'
    );
    expect(fautif).not.toBe(TEXTE);
    expect(horsDeLaPiece(lireSchemaPrisma(fautif))).toEqual(['IdentiteFacturation.iban']);
  });

  it('REQ-CPL-005 : l’identité de facturation référence sa pièce rib par une clé COMPOSITE (id, type)', () => {
    const champs = new Map(modele('IdentiteFacturation')!.champs.map((c) => [c.nom, c]));
    expect(champs.get('pieceRibId')).toMatchObject({ type: 'String', optionnel: true });
    expect(champs.get('pieceRibType')).toMatchObject({ type: 'TypePieceKyc', optionnel: false });
    expect(TEXTE).toMatch(
      /pieceRib\s+PieceKyc\?\s+@relation\(fields: \[pieceRibId, pieceRibType\], references: \[id, type\]/
    );
    expect(TEXTE).toMatch(/model PieceKyc \{[\s\S]*?@@unique\(\[id, type\]\)/);
  });
});

describe('REQ-DM-027 — les vocabulaires du KYC', () => {
  const valeurs = (nom: string) => schema.enums.find((e) => e.nom === nom)?.valeurs;

  it('REQ-DM-027 : les types et les statuts d’une pièce sont des enums, aux valeurs du domaine', () => {
    expect(valeurs('TypePieceKyc')).toEqual([...TYPES_PIECE_KYC]);
    expect(valeurs('StatutPieceKyc')).toEqual([...STATUTS_PIECE_KYC]);
    expect([...TYPES_A_ECHEANCE]).toEqual(['vigilance', 'rc_pro']);
  });
});

describe('REQ-DM-027 — le journal d’une pièce', () => {
  const charge = CHARGES_PAR_TYPE.piece_kyc_statut_modifie;

  it('REQ-DM-027 : la charge porte de, vers, le type et l’acteur — et rien d’autre', () => {
    const ok = { de: 'a_verifier', vers: 'valide', type: 'rib', acteur: { par: 'systeme' } };
    expect(charge.safeParse(ok).success).toBe(true);
    expect(charge.safeParse({ ...ok, de: null }).success).toBe(true);
    expect(charge.safeParse({ ...ok, vers: 'inconnu' }).success).toBe(false);
    expect(charge.safeParse({ ...ok, type: 'passeport' }).success).toBe(false);
    expect(charge.safeParse({ ...ok, iban: 'FR00' }).success).toBe(false);
    const sansActeur = Object.fromEntries(Object.entries(ok).filter(([k]) => k !== 'acteur'));
    expect(charge.safeParse(sansActeur).success).toBe(false);
  });
});
