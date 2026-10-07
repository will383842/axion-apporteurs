// @req REQ-ARG-004
// @req REQ-DM-017
/**
 * T-ARG-044 — contrat v2, art. 4.0, 4.2 et 4.3 : la commission est acquise lorsque la Société a
 * encaissé l'INTÉGRALITÉ du prix facturé, net des avoirs, tous payeurs confondus ; aucune part n'est
 * due au titre d'un paiement partiel (fiche de la juriste, rattrapage 119 ; conditions de la sécurité :
 * centimes entiers, comparaison exacte, à un centime près).
 */
import { describe, it, expect } from 'vitest';
import { acquisitionAuPaiementIntegral } from '../../../src/domain/commission/calcul';

const J = (jour: number) => ({ annee: 2027, mois: 3, jour });
const client = (montantCents: number, jour: number) => ({
  montantCents,
  payeur: 'client' as const,
  creditLe: J(jour),
});
const opco = (montantCents: number, jour: number) => ({
  montantCents,
  payeur: 'opco' as const,
  creditLe: J(jour),
});

describe('REQ-ARG-004 — acquise au paiement INTÉGRAL, jamais au prorata', () => {
  it('REQ-ARG-004 : TÉMOIN — un paiement de 99 % ne rend RIEN acquis', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [] }, [
        client(99_000, 5),
      ])
    ).toEqual({ acquise: false });
  });

  it('REQ-ARG-004 : TÉMOIN — le paiement qui SOLDE rend la commission entière acquise, ce jour-là', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [] }, [
        client(60_000, 5),
        client(40_000, 12),
      ])
    ).toEqual({ acquise: true, le: J(12) });
  });

  it('REQ-ARG-004 : TÉMOIN — un centime manquant ne rend rien acquis ; le centime qui solde, si', () => {
    const prix = { prixFactureCents: 100_000, avoirsCents: [] };
    expect(acquisitionAuPaiementIntegral(prix, [client(99_999, 5)])).toEqual({ acquise: false });
    expect(acquisitionAuPaiementIntegral(prix, [client(99_999, 5), client(1, 6)])).toEqual({
      acquise: true,
      le: J(6),
    });
  });

  it('REQ-ARG-004 : TÉMOIN — un paiement MIXTE, client et OPCO, solde la commande (art. 4.2, tous payeurs confondus)', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [] }, [
        opco(70_000, 3),
        client(30_000, 9),
      ])
    ).toEqual({ acquise: true, le: J(9) });
  });

  it('REQ-ARG-004 : TÉMOIN — un AVOIR réduit le prix facturé : le solde se juge sur le prix NET', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [10_000] }, [
        client(90_000, 4),
      ])
    ).toEqual({ acquise: true, le: J(4) });
  });

  it('REQ-ARG-004 : les crédits se comptent dans l’ORDRE de leur date, quel que soit l’ordre reçu', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [] }, [
        client(50_000, 20),
        opco(50_000, 2),
      ])
    ).toEqual({ acquise: true, le: J(20) });
  });

  it('REQ-DM-017 : TÉMOIN — aucune part : le résultat est TOUT ou RIEN, jamais un montant partiel', () => {
    const r = acquisitionAuPaiementIntegral({ prixFactureCents: 100_000, avoirsCents: [] }, [
      client(50_000, 2),
    ]);
    expect(Object.keys(r)).toEqual(['acquise']);
  });

  it('REQ-ARG-004 : un prix net nul ou négatif, un montant négatif ou non entier sont REFUSÉS, nommés', () => {
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureCents: 100, avoirsCents: [100] }, [])
    ).toThrow(/prix net/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureCents: 100, avoirsCents: [] }, [client(-1, 1)])
    ).toThrow(/encaissement 0/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureCents: 100, avoirsCents: [] }, [client(1.5, 1)])
    ).toThrow(/encaissement 0/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureCents: 100, avoirsCents: [-1] }, [])
    ).toThrow(/avoir 0/);
  });

  it('REQ-ARG-004 : la formule du prorata est RETIRÉE du domaine', async () => {
    const m = (await import('../../../src/domain/commission/calcul')) as Record<string, unknown>;
    expect(m.prorataDesEncaissements).toBeUndefined();
    expect(m.partsDuProrata).toBeUndefined();
  });
});
