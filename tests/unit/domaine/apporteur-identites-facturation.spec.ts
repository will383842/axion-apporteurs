// @req REQ-CPL-005
// @req REQ-CPL-020
/**
 * `apporteur-identites-facturation.spec.ts` — DM-06 : les identités de facturation sont DATÉES.
 *
 *   — Un relevé qui chevauche deux identités produit DEUX autofactures, chacune bornée à sa
 *     période et portant son SIREN et son régime de TVA.
 *   — Deux identités qui se chevauchent sont refusées ; une période qu'aucune identité ne couvre
 *     aussi : une autofacture sans identité n'existe pas.
 *   — Un apporteur `isTest` ne produit AUCUNE autofacture (REQ-CPL-020).
 *   — Aucune colonne de RIB ni d'IBAN (HYP-DM06-IBAN) : la pièce RIB vient avec le KYC.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma } from '../../../scripts/lot/lecteur-prisma';
import {
  ErreurIdentitesFacturation,
  autofacturesDuReleve,
  type IdentiteFacturation,
} from '../../../src/domain/apporteur/identites-facturation';

const jour = (m: number, j: number) => Date.UTC(2026, m - 1, j);

// SIREN de fiction : neuf chiffres, aucun n'appartient à une entreprise connue de ce dépôt.
const franchise: IdentiteFacturation = {
  siren: '000000001',
  regimeTva: 'franchise_293b',
  debutAt: jour(1, 1),
  finAt: jour(3, 15),
};
const societe: IdentiteFacturation = {
  siren: '000000002',
  regimeTva: 'assujetti',
  debutAt: jour(3, 15),
  finAt: null,
};

function levee(f: () => unknown): ErreurIdentitesFacturation {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurIdentitesFacturation) return e;
    throw e;
  }
  throw new Error('aucune levée');
}

describe('REQ-CPL-005 — un relevé qui chevauche deux identités produit deux autofactures', () => {
  const apporteur = { isTest: false, identites: [societe, franchise] };

  it('REQ-CPL-005 : relevé de mars, changement d’identité le 15 → DEUX autofactures bornées', () => {
    const r = autofacturesDuReleve(apporteur, { debutAt: jour(3, 1), finAt: jour(4, 1) });
    expect(r).toEqual([
      { siren: '000000001', regimeTva: 'franchise_293b', debutAt: jour(3, 1), finAt: jour(3, 15) },
      { siren: '000000002', regimeTva: 'assujetti', debutAt: jour(3, 15), finAt: jour(4, 1) },
    ]);
  });

  it('REQ-CPL-005 : contre-témoin — un relevé couvert par une seule identité → UNE autofacture', () => {
    const r = autofacturesDuReleve(apporteur, { debutAt: jour(4, 1), finAt: jour(5, 1) });
    expect(r).toEqual([
      { siren: '000000002', regimeTva: 'assujetti', debutAt: jour(4, 1), finAt: jour(5, 1) },
    ]);
  });

  it('REQ-CPL-005 : deux identités qui se chevauchent sont refusées, jamais départagées', () => {
    const chevauche = { ...societe, debutAt: jour(3, 1) };
    const e = levee(() =>
      autofacturesDuReleve(
        { isTest: false, identites: [franchise, chevauche] },
        { debutAt: jour(3, 1), finAt: jour(4, 1) }
      )
    );
    expect(e.code).toBe('identites_chevauchantes');
  });

  it('REQ-CPL-005 : une période sans identité est refusée — pas d’autofacture sans identité', () => {
    const e = levee(() =>
      autofacturesDuReleve(
        { isTest: false, identites: [societe] },
        { debutAt: jour(3, 1), finAt: jour(4, 1) }
      )
    );
    expect(e.code).toBe('periode_non_couverte');
  });

  it('REQ-CPL-005 : une période vide ou inversée est refusée', () => {
    expect(
      levee(() => autofacturesDuReleve(apporteur, { debutAt: jour(4, 1), finAt: jour(4, 1) })).code
    ).toBe('periode_invalide');
  });
});

describe('REQ-CPL-020 — un apporteur de test ne produit aucune autofacture', () => {
  it('REQ-CPL-020 : `isTest` → zéro autofacture, même sur une période couverte', () => {
    expect(
      autofacturesDuReleve(
        { isTest: true, identites: [franchise, societe] },
        { debutAt: jour(3, 1), finAt: jour(4, 1) }
      )
    ).toEqual([]);
  });

  it('REQ-CPL-020 : contre-témoin — la même période, apporteur réel → deux autofactures', () => {
    expect(
      autofacturesDuReleve(
        { isTest: false, identites: [franchise, societe] },
        { debutAt: jour(3, 1), finAt: jour(4, 1) }
      )
    ).toHaveLength(2);
  });
});

describe('REQ-CPL-005 — le modèle IdentiteFacturation : daté, régime en enum, sans RIB ni IBAN', () => {
  const schema = lireSchemaPrisma(readFileSync('prisma/schema.prisma', 'utf8'));
  const modele = schema.modeles.find((m) => m.nom === 'IdentiteFacturation');

  it('REQ-CPL-005 : la table existe et porte SIREN, régime `RegimeTva`, début et fin', () => {
    expect(modele?.table).toBe('identites_facturation');
    const champs = new Map(modele!.champs.map((c) => [c.nom, c]));
    expect(champs.get('siren')).toMatchObject({ type: 'String', optionnel: false });
    expect(champs.get('regimeTva')).toMatchObject({ type: 'RegimeTva', optionnel: false });
    expect(champs.get('debutAt')).toMatchObject({ type: 'DateTime', optionnel: false });
    expect(champs.get('finAt')).toMatchObject({ type: 'DateTime', optionnel: true });
    expect(schema.enums.find((e) => e.nom === 'RegimeTva')?.valeurs).toEqual([
      'assujetti',
      'franchise_293b',
    ]);
  });

  it('REQ-CPL-005 : AUCUNE colonne de RIB, d’IBAN ni de BIC, dans aucun modèle de DM-06 (HYP-DM06-IBAN)', () => {
    for (const nom of ['IdentiteFacturation', 'Apporteur', 'JetonDepot']) {
      const m = schema.modeles.find((x) => x.nom === nom);
      expect(m, nom).toBeDefined();
      for (const c of m!.champs) expect(`${nom}.${c.nom} ${c.colonne}`).not.toMatch(/rib|iban|bic/i);
    }
  });
});
