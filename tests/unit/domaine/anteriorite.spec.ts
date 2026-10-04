// @req REQ-DM-029
/**
 * L'antériorité d'une entreprise (DM-10-P, REQ-DM-029, contrat art. 3.3) : évaluée LOCALEMENT, sur
 * les faits reçus d'axionia et projetés, sans appel réseau. Une entreprise est connue de la Société
 * si elle est :
 *   — cliente au titre d'une prestation FACTURÉE au cours des `ANTERIORITE_CLIENT_MOIS` derniers mois ;
 *   — destinataire d'un devis ÉMIS il y a moins de `ANTERIORITE_DEVIS_MOIS` mois ;
 *   — signataire d'un devis qui n'est pas entièrement facturé, quelle que soit sa date (art. 3.3) ;
 *   — inscrite sur la liste tenue par la Société (origine `financeur`, REQ-DM-028).
 * Les deux fenêtres viennent de la SSOT, jamais d'un nombre recopié ici. « Entièrement facturé » se
 * juge devis par devis : la somme HT des factures non annulées, avoirs déduits, au moins égale au
 * montant HT du devis (écart B-11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { chargeConforme } from '../../../src/server/integrations/axionia/reception';
import { SCHEMA_VERSION } from '../../../packages/contracts/events';
import { ChargeIncomplete, montantRequis } from '../../../src/server/entreprise-connue/projection';
import {
  evaluerAnteriorite,
  estPrestationFacturee,
  factureHtDuDevis,
  type DevisConnu,
  type FaitsDUneEntreprise,
} from '../../../src/domain/entreprise-connue/anteriorite';

const MAINTENANT = new Date('2027-06-15T12:00:00.000Z');
const CLIENT = SEUILS.ANTERIORITE_CLIENT_MOIS.valeur;
const DEVIS = SEUILS.ANTERIORITE_DEVIS_MOIS.valeur;

/** La date `mois` mois civils avant MAINTENANT, en UTC. */
function ilYA(mois: number): Date {
  const d = new Date(MAINTENANT.getTime());
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d;
}

const RIEN: FaitsDUneEntreprise = { derniereFactureAt: null, devis: [], financeur: null };

/** Un devis émis il y a `emis` mois, jamais signé. */
const emis = (mois: number): DevisConnu => ({
  emisAt: ilYA(mois),
  signeAt: null,
  montantTotalHtCents: 0,
  factureHtCents: 0,
});

/** Un devis signé il y a `mois` mois, de 10 000 centimes HT, facturé à hauteur de `facture`. */
const signe = (mois: number, facture: number): DevisConnu => ({
  emisAt: ilYA(mois + 1),
  signeAt: ilYA(mois),
  montantTotalHtCents: 10_000,
  factureHtCents: facture,
});

describe('REQ-DM-029 — l’antériorité, évaluée localement (art. 3.3)', () => {
  it('REQ-DM-029 : les deux fenêtres sont celles de la SSOT, 24 et 6 mois', () => {
    expect(CLIENT).toBe(24);
    expect(DEVIS).toBe(6);
  });

  it('REQ-DM-029 : une entreprise sans aucun fait n’est pas connue', () => {
    expect(evaluerAnteriorite(RIEN, MAINTENANT)).toEqual({ connue: false });
  });

  it('REQ-DM-029 : TÉMOIN — une prestation facturée il y a 23 mois rend l’entreprise connue (client) ; à 25 mois, elle est libre', () => {
    expect(
      evaluerAnteriorite({ ...RIEN, derniereFactureAt: ilYA(CLIENT - 1) }, MAINTENANT)
    ).toEqual({ connue: true, origine: 'client', depuis: ilYA(CLIENT - 1) });
    expect(
      evaluerAnteriorite({ ...RIEN, derniereFactureAt: ilYA(CLIENT + 1) }, MAINTENANT)
    ).toEqual({ connue: false });
  });

  it('REQ-DM-029 : la fenêtre cliente est fermée à sa borne — exactement 24 mois, connue ; une milliseconde de plus, libre', () => {
    expect(
      evaluerAnteriorite({ ...RIEN, derniereFactureAt: ilYA(CLIENT) }, MAINTENANT)
    ).toMatchObject({ connue: true });
    expect(
      evaluerAnteriorite(
        { ...RIEN, derniereFactureAt: new Date(ilYA(CLIENT).getTime() - 1) },
        MAINTENANT
      )
    ).toEqual({ connue: false });
  });

  it('REQ-DM-029 : TÉMOIN — un devis émis il y a 5 mois rend l’entreprise connue (devis) ; émis il y a 7 mois, jamais signé ni facturé, elle est libre', () => {
    expect(evaluerAnteriorite({ ...RIEN, devis: [emis(DEVIS - 1)] }, MAINTENANT)).toEqual({
      connue: true,
      origine: 'devis',
      depuis: ilYA(DEVIS - 1),
    });
    expect(evaluerAnteriorite({ ...RIEN, devis: [emis(DEVIS + 1)] }, MAINTENANT)).toEqual({
      connue: false,
    });
  });

  it('REQ-DM-029 : TÉMOIN — un devis signé il y a plus de 6 mois et non facturé rend l’entreprise connue, quelle que soit sa date (art. 3.3)', () => {
    expect(evaluerAnteriorite({ ...RIEN, devis: [signe(39, 0)] }, MAINTENANT)).toEqual({
      connue: true,
      origine: 'devis',
      depuis: ilYA(39),
    });
  });

  it('REQ-DM-029 : TÉMOIN — partiellement facturé, il reste connu ; entièrement facturé, seule la fenêtre cliente juge, à la date de la facture', () => {
    expect(evaluerAnteriorite({ ...RIEN, devis: [signe(39, 9_999)] }, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'devis',
    });
    // Entièrement facturé il y a 30 mois : hors des 24 mois, l'entreprise est libre.
    expect(
      evaluerAnteriorite(
        { ...RIEN, derniereFactureAt: ilYA(30), devis: [signe(39, 10_000)] },
        MAINTENANT
      )
    ).toEqual({ connue: false });
    // Entièrement facturé il y a 3 mois : cliente.
    expect(
      evaluerAnteriorite(
        { ...RIEN, derniereFactureAt: ilYA(3), devis: [signe(39, 10_000)] },
        MAINTENANT
      )
    ).toMatchObject({ connue: true, origine: 'client' });
  });

  it('REQ-DM-029 : TÉMOIN — une entreprise inscrite sur la liste de la Société est connue (financeur), avant toute autre origine, et le refus rend sa CATÉGORIE', () => {
    expect(
      evaluerAnteriorite(
        { ...RIEN, financeur: 'financeur_paritaire', derniereFactureAt: ilYA(1) },
        MAINTENANT
      )
    ).toEqual({
      connue: true,
      origine: 'financeur',
      depuis: null,
      categorie: 'financeur_paritaire',
    });
  });
});

describe('REQ-DM-029 — « entièrement facturé », devis par devis (écart B-11)', () => {
  it('REQ-DM-029 : TÉMOIN — la somme HT des factures non annulées, avoirs déduits quel que soit leur signe', () => {
    expect(
      factureHtDuDevis(
        [
          { montantHtCents: 10_000, annulee: false },
          { montantHtCents: 10_000, annulee: true },
          { montantHtCents: 500, annulee: false },
        ],
        [{ montantHtCents: -2_000 }, { montantHtCents: 300 }]
      )
    ).toBe(10_000 + 500 - 2_000 - 300);
  });

  it('REQ-DM-029 : TÉMOIN — un avoir qui fait repasser le facturé sous le montant rend l’entreprise connue de nouveau', () => {
    const facture = factureHtDuDevis([{ montantHtCents: 10_000, annulee: false }], []);
    const apresAvoir = factureHtDuDevis(
      [{ montantHtCents: 10_000, annulee: false }],
      [{ montantHtCents: -1 }]
    );
    const devis = (factureHtCents: number) => ({ ...signe(39, 0), factureHtCents });
    expect(
      evaluerAnteriorite(
        { ...RIEN, derniereFactureAt: ilYA(30), devis: [devis(facture)] },
        MAINTENANT
      )
    ).toEqual({ connue: false });
    expect(
      evaluerAnteriorite(
        { ...RIEN, derniereFactureAt: ilYA(30), devis: [devis(apresAvoir)] },
        MAINTENANT
      )
    ).toMatchObject({ connue: true, origine: 'devis' });
  });
});

describe('REQ-DM-029 — « prestation facturée » : une facture que rien n’éteint (remarque de la juriste)', () => {
  it('REQ-DM-029 : TÉMOIN — une facture entièrement éteinte par des avoirs ne compte pas comme prestation facturée', () => {
    const facture = { montantHtCents: 10_000, annulee: false };
    expect(estPrestationFacturee(facture, [])).toBe(true);
    expect(estPrestationFacturee(facture, [{ montantHtCents: -10_000 }])).toBe(false);
    expect(
      estPrestationFacturee(facture, [{ montantHtCents: 4_000 }, { montantHtCents: -6_000 }])
    ).toBe(false);
  });

  it('REQ-DM-029 : TÉMOIN — un avoir partiel la laisse facturée ; une facture annulée ne l’est jamais', () => {
    expect(
      estPrestationFacturee({ montantHtCents: 10_000, annulee: false }, [
        { montantHtCents: -9_999 },
      ])
    ).toBe(true);
    expect(estPrestationFacturee({ montantHtCents: 10_000, annulee: true }, [])).toBe(false);
  });
});

describe('REQ-DM-029 — un montant absent ferme la protection, il ne l’ouvre jamais (remarque de la juriste)', () => {
  const PRODUCTEUR = JSON.parse(
    readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
  ) as { evenements: { event_type: string; payload: Record<string, unknown> }[] };
  const charge = (type: string): Record<string, unknown> => {
    const p = { ...PRODUCTEUR.evenements.find((x) => x.event_type === type)!.payload };
    if (type === 'facture.emise') p.devisId = null;
    // INT-T48-P : la v3 exige `prixReferenceHtCents` (nullable) sur chaque ligne du devis signé, que la
    // fixture du producteur ne porte pas encore (exemption nommée de `contrat-hash.spec.ts`) : une
    // ligne SANS prix de référence, forme v3 permise. Le montant total, lui, reste celui qu'on retire.
    if (type === 'devis.signe' && Array.isArray(p.lignes))
      p.lignes = (p.lignes as Record<string, unknown>[]).map((l) => ({
        prixReferenceHtCents: null,
        ...l,
      }));
    return p;
  };
  const sansChamp = (c: Record<string, unknown>, champ: string) =>
    Object.fromEntries(Object.entries(c).filter(([k]) => k !== champ));

  it('REQ-DM-029 : TÉMOIN — à l’ENTRÉE, une charge sans montant est refusée par le contrat ; avec lui, elle passe', () => {
    for (const [type, champ] of [
      ['facture.emise', 'montantHtCents'],
      ['devis.signe', 'montantTotalHtCents'],
      ['avoir.emis', 'montantHtCents'],
    ] as const) {
      expect(chargeConforme(type, charge(type), SCHEMA_VERSION), type).toBe(true);
      expect(chargeConforme(type, sansChamp(charge(type), champ), SCHEMA_VERSION), type).toBe(
        false
      );
    }
  });

  it('REQ-DM-029 : TÉMOIN — dans la PROJECTION, un montant absent n’est jamais lu comme zéro : la lecture lève, nommée', () => {
    expect(montantRequis({ montantHtCents: 1_000 }, 'montantHtCents')).toBe(1_000);
    expect(() => montantRequis({}, 'montantHtCents')).toThrow(ChargeIncomplete);
    expect(() => montantRequis({ montantHtCents: '1000' }, 'montantHtCents')).toThrow(
      ChargeIncomplete
    );
  });
});
