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
const client = (montantTtcCents: number, jour: number) => ({
  montantTtcCents,
  payeur: 'client' as const,
  creditLe: J(jour),
});
/** Un avoir, DATÉ (A15, #815) : il réduit le prix net à compter de son jour, jamais avant. */
const avoir = (montantTtcCents: number, jour: number) => ({ montantTtcCents, le: J(jour) });
const opco = (montantTtcCents: number, jour: number) => ({
  montantTtcCents,
  payeur: 'opco' as const,
  creditLe: J(jour),
});

describe('REQ-ARG-004 — acquise au paiement INTÉGRAL, jamais au prorata', () => {
  it('REQ-ARG-004 : TÉMOIN — un paiement de 99 % ne rend RIEN acquis', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [] }, [
        client(99_000, 5),
      ])
    ).toEqual({ acquise: false });
  });

  it('REQ-ARG-004 : TÉMOIN — le paiement qui SOLDE rend la commission entière acquise, ce jour-là', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [] }, [
        client(60_000, 5),
        client(40_000, 12),
      ])
    ).toEqual({ acquise: true, le: J(12) });
  });

  it('REQ-ARG-004 : TÉMOIN — un centime manquant ne rend rien acquis ; le centime qui solde, si', () => {
    const prix = { prixFactureTtcCents: 100_000, avoirs: [] };
    expect(acquisitionAuPaiementIntegral(prix, [client(99_999, 5)])).toEqual({ acquise: false });
    expect(acquisitionAuPaiementIntegral(prix, [client(99_999, 5), client(1, 6)])).toEqual({
      acquise: true,
      le: J(6),
    });
  });

  it('REQ-ARG-004 : TÉMOIN — un paiement MIXTE, client et OPCO, solde la commande (art. 4.2, tous payeurs confondus)', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [] }, [
        opco(70_000, 3),
        client(30_000, 9),
      ])
    ).toEqual({ acquise: true, le: J(9) });
  });

  it('REQ-ARG-004 : TÉMOIN — un AVOIR réduit le prix facturé : le solde se juge sur le prix NET', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [avoir(10_000, 1)] }, [
        client(90_000, 4),
      ])
    ).toEqual({ acquise: true, le: J(4) });
  });

  it('REQ-ARG-004 : TÉMOIN — un AVOIR POSTÉRIEUR au dernier crédit : la commande n’est soldée qu’au jour de l’avoir, jamais avant (A15, S10)', () => {
    // Prix de 1 000,00 ; 900,00 crédités le 1er ; un avoir de 100,00 le 20 : soldée le 20, pas le 1er.
    // Juriste (#815, 6041629550) : le fait générateur est un ÉTAT, jugé à chaque date sur les avoirs
    // émis à cette date, sans aucune lecture rétroactive.
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [avoir(10_000, 20)] }, [
        client(90_000, 1),
      ])
    ).toEqual({ acquise: true, le: J(20) });
  });

  it('REQ-ARG-004 : TÉMOIN — un avoir ANTÉRIEUR : le crédit qui atteint le prix net de ce jour-là solde, à sa date', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [avoir(10_000, 2)] }, [
        client(50_000, 1),
        client(40_000, 9),
      ])
    ).toEqual({ acquise: true, le: J(9) });
  });

  it('REQ-ARG-004 : un avoir et un crédit du MÊME jour se comptent ensemble, ce jour-là', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [avoir(10_000, 7)] }, [
        client(90_000, 7),
      ])
    ).toEqual({ acquise: true, le: J(7) });
  });

  it('REQ-ARG-004 : un avoir qui arrive APRÈS l’acquisition ne la déplace pas', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [avoir(5_000, 25)] }, [
        client(100_000, 3),
      ])
    ).toEqual({ acquise: true, le: J(3) });
  });

  it('REQ-ARG-004 : les crédits se comptent dans l’ORDRE de leur date, quel que soit l’ordre reçu', () => {
    expect(
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [] }, [
        client(50_000, 20),
        opco(50_000, 2),
      ])
    ).toEqual({ acquise: true, le: J(20) });
  });

  it('REQ-DM-017 : TÉMOIN — aucune part : le résultat est TOUT ou RIEN, jamais un montant partiel', () => {
    const r = acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100_000, avoirs: [] }, [
      client(50_000, 2),
    ]);
    expect(Object.keys(r)).toEqual(['acquise']);
  });

  it('REQ-ARG-004 : un prix net nul ou négatif, un montant négatif ou non entier sont REFUSÉS, nommés', () => {
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100, avoirs: [avoir(100, 1)] }, [])
    ).toThrow(/prix TTC net/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100, avoirs: [] }, [client(-1, 1)])
    ).toThrow(/encaissement 0/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100, avoirs: [] }, [client(1.5, 1)])
    ).toThrow(/encaissement 0/);
    expect(() =>
      acquisitionAuPaiementIntegral({ prixFactureTtcCents: 100, avoirs: [avoir(-1, 1)] }, [])
    ).toThrow(/avoir 0/);
  });

  it('REQ-ARG-004 : la formule du prorata est RETIRÉE du domaine', async () => {
    const m = (await import('../../../src/domain/commission/calcul')) as Record<string, unknown>;
    expect(m.prorataDesEncaissements).toBeUndefined();
    expect(m.partsDuProrata).toBeUndefined();
  });
});
