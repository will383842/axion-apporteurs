// @req REQ-QA-030
/**
 * INT-T42 — l'en-tête du `kid` d'axionia, déclaré au contrat publié (partners/ADR-0013 d.8).
 *
 * FACULTATIF ET ADDITIF : un envoi sans `x-axionia-kid` reste conforme, et le kid n'a fait monter
 * AUCUNE version (aucun type d'événement ajouté) : il est déclaré dans le contrat COURANT, et l'était
 * déjà en v2 ; la v3 est venue d'INT-T46-P. Quand l'en-tête est là, il a la forme que `kidDe` produit :
 * huit caractères hexadécimaux. Le vecteur fixe est le MÊME que celui du témoin d'axionia
 * (`kid-emis.spec.ts`) : une dérivation qui divergerait d'un côté ferait rougir l'un des deux.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { SCHEMA_VERSION } from '../../../packages/contracts/enveloppe';
import { kidDe } from '../../../src/lib/env';

type Schema = Record<string, unknown>;
const contrat = JSON.parse(
  readFileSync(`packages/contracts/contracts.v${SCHEMA_VERSION}.json`, 'utf8')
) as {
  $defs: Record<string, Schema>;
};
const ajv = new Ajv({ strict: false });

const ENTETES = ['webhook_entetes', 'api_coordonnees_candidature_reponse_entetes'] as const;
const SIGNATURE = 'a'.repeat(64);

describe('REQ-QA-030 — le kid d’axionia, déclaré au contrat', () => {
  it('REQ-QA-030 : l’en-tête s’appelle x-axionia-kid, et il est déclaré dans le contrat publié de la version courante', () => {
    expect(ENTETE_KID_AXIONIA).toBe('x-axionia-kid');
    expect((contrat as { $id?: string }).$id).toMatch(new RegExp(`/v${SCHEMA_VERSION}$`));
  });

  it.each(ENTETES)('REQ-QA-030 : %s déclare le kid, FACULTATIF, en huit hexadécimaux', (nom) => {
    const def = contrat.$defs[nom]!;
    const proprietes = def['properties'] as Record<string, { pattern?: string }>;
    expect(proprietes[ENTETE_KID_AXIONIA]?.pattern).toBe('^[0-9a-f]{8}$');
    expect(def['required']).not.toContain(ENTETE_KID_AXIONIA);
  });

  it.each(ENTETES)(
    'REQ-QA-030 — TÉMOIN : %s accepte l’envoi sans kid, refuse un kid mal formé',
    (nom) => {
      const valider = ajv.compile(contrat.$defs[nom]!);
      const base = { 'x-axionia-timestamp': '1790000000', 'x-axionia-signature': SIGNATURE };
      expect(valider(base)).toBe(true);
      expect(valider({ ...base, [ENTETE_KID_AXIONIA]: kidDe('secret-témoin') })).toBe(true);
      expect(valider({ ...base, [ENTETE_KID_AXIONIA]: 'KID-TROP-LONG' })).toBe(false);
    }
  );

  it('REQ-QA-030 : kidDe de Partners rend le vecteur que le témoin d’axionia attend', () => {
    expect(kidDe('abc')).toBe('2e5419d4');
  });

  it('REQ-QA-030 — TÉMOIN : le kid change quand la clé tourne', () => {
    expect(kidDe('clé-A')).not.toBe(kidDe('clé-B'));
  });
});
