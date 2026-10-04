// @req REQ-INT-003
// @req REQ-QA-007
/**
 * INT-T48-P — chaque ligne du devis signé porte `prixReferenceHtCents`, le prix PUBLIC en vigueur à la
 * date du devis signé, en centimes entiers ; le prix vendu de la ligne reste `montantHtCents`, et
 * aucun `prixVenduHt` n'existe au niveau du devis (décision de Williams du 2026-10-01, C-07).
 *
 * UNE LIGNE SANS PRIX PUBLIC (la conférence, palier au forfait sur devis, rattrapage 36) porte
 * `prixReferenceHtCents: null` : l'absence de prix de référence n'est jamais lue comme un prix nul. Le
 * champ reste EXIGÉ : le producteur écrit chaque champ, nuls compris (`payloads.ts`, `ferme`).
 *
 * AMENDEMENT DE LA VERSION 3, PAS UNE MONTÉE. Le contrat v3 n'est pas encore adopté par axion-ia :
 * le champ l'amende, `contracts.v3.json` et son empreinte sont régénérés par `pnpm contracts:export`.
 *
 * D'OÙ VIENNENT LES CHARGES (RM-03). La ligne est PRISE dans la fixture du producteur réel ; le seul
 * champ ajouté est `prixReferenceHtCents`, que le producteur n'émet pas encore (tâche jumelle côté
 * axion-ia), nommé ici et nulle part ailleurs. Rien d'autre n'est inventé.
 *
 * Aucune base : la réception juge le payload contre les `$defs` PUBLIÉS, le même valideur que la
 * porte réelle (`payloadConforme`, `chargeConforme`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCHEMA_VERSION, contratJsonSchema, nomDefPayload } from '../../packages/contracts/events';
import {
  CHAMPS_NON_CONSERVES,
  chargeConforme,
  chargeConservee,
  payloadConforme,
} from '../../src/server/integrations/axionia/reception';

type Produit = { event_type: string; payload: Record<string, unknown> };
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: Produit[] };

/** Le `devis.signe` du producteur réel, chaque ligne complétée du SEUL champ nouveau. */
function devisSigne(prixDeReference: (ligne: Record<string, unknown>) => unknown) {
  const e = PRODUCTEUR.evenements.find((x) => x.event_type === 'devis.signe');
  if (e === undefined) throw new Error('fixture du producteur : aucun devis.signe');
  const payload = structuredClone(e.payload);
  const lignes = payload.lignes as Record<string, unknown>[];
  expect(lignes.length).toBeGreaterThan(0);
  payload.lignes = lignes.map((l) => ({ ...l, prixReferenceHtCents: prixDeReference(l) }));
  return payload;
}

const sansLeChamp = () => {
  const p = devisSigne(() => 0);
  p.lignes = (p.lignes as Record<string, unknown>[]).map((l) => {
    const reste = { ...l };
    delete reste.prixReferenceHtCents;
    return reste;
  });
  return p;
};

const defs = () => contratJsonSchema()['$defs'] as Record<string, Record<string, unknown>>;
const ligneDuContrat = () => {
  const devis = defs()[nomDefPayload('devis.signe')]!;
  const lignes = (devis.properties as Record<string, Record<string, unknown>>).lignes!;
  return lignes.items as Record<string, unknown>;
};

describe('REQ-INT-003 — le contrat publié : prixReferenceHtCents sur chaque ligne du devis signé', () => {
  it('REQ-INT-003 : la ligne du devis signé déclare et EXIGE prixReferenceHtCents, en centimes entiers jamais négatifs, ou nul', () => {
    const ligne = ligneDuContrat();
    expect(ligne.additionalProperties).toBe(false);
    expect(ligne.required).toContain('prixReferenceHtCents');
    expect((ligne.properties as Record<string, unknown>).prixReferenceHtCents).toEqual({
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    });
  });

  it('REQ-INT-003 : le prix vendu de la ligne reste montantHtCents ; aucun prixVenduHt, ni sur la ligne ni sur le devis', () => {
    const ligne = ligneDuContrat();
    expect(ligne.required).toContain('montantHtCents');
    const devis = defs()[nomDefPayload('devis.signe')]!;
    for (const proprietes of [ligne.properties, devis.properties]) {
      expect(Object.keys(proprietes as object).filter((c) => /prixVendu/i.test(c))).toEqual([]);
    }
  });

  it('REQ-QA-007 : un amendement de la version 3, pas une montée — l’artefact publié porte le champ, sous son empreinte', () => {
    expect(SCHEMA_VERSION).toBe(3);
    const publie = JSON.parse(readFileSync('packages/contracts/contracts.v3.json', 'utf8')) as {
      $defs: Record<string, unknown>;
    };
    expect(JSON.stringify(publie.$defs[nomDefPayload('devis.signe')])).toContain(
      '"prixReferenceHtCents"'
    );
  });
});

describe('REQ-INT-003 — la réception juge le devis signé contre le contrat publié', () => {
  it('REQ-INT-003 : TÉMOIN — une charge dont une ligne n’a pas prixReferenceHtCents est refusée hors schéma', () => {
    expect(payloadConforme('devis.signe', sansLeChamp())).toBe(false);
  });

  it('REQ-INT-003 : une charge complète, un prix de référence par ligne, est acceptée', () => {
    expect(
      payloadConforme(
        'devis.signe',
        devisSigne((l) => l.montantHtCents)
      )
    ).toBe(true);
  });

  it('REQ-INT-003 : une ligne sans prix public (conférence) porte null, et la charge est acceptée', () => {
    expect(
      payloadConforme(
        'devis.signe',
        devisSigne(() => null)
      )
    ).toBe(true);
  });

  it.each([
    ['négatif', -1],
    ['décimal', 1.5],
    ['en chaîne', '500000'],
  ])('REQ-INT-003 : TÉMOIN — un prix de référence %s est refusé', (_cas, valeur) => {
    expect(
      payloadConforme(
        'devis.signe',
        devisSigne(() => valeur)
      )
    ).toBe(false);
  });

  it('REQ-INT-003 : Partners le CONSERVE — la charge gardée porte prixReferenceHtCents et reste conforme à sa version', () => {
    expect(CHAMPS_NON_CONSERVES as readonly string[]).not.toContain('prixReferenceHtCents');
    const gardee = chargeConservee(devisSigne((l) => l.montantHtCents));
    const lignes = gardee.lignes as Record<string, unknown>[];
    for (const l of lignes) expect(Object.hasOwn(l, 'prixReferenceHtCents')).toBe(true);
    expect(chargeConforme('devis.signe', gardee, SCHEMA_VERSION)).toBe(true);
  });
});
