// @req REQ-INT-012
/**
 * INT-T70-P — la route de relecture par `after_sequence` entre au contrat, dans
 * `packages/contracts/api.ts`, en AMENDEMENT de la version 3 tant qu'axion-ia ne l'a pas adoptée.
 *
 * Ce que le fichier tient :
 *   — la route est déclarée, au chemin que le client de relecture appelle, sous des `$defs` fermés
 *     préfixés `api_relecture` : paramètres (`after_sequence`, `limit` borné), en-têtes signés de la
 *     requête et de la réponse, réponse en liste d'enveloppes déjà au contrat ;
 *   — le `$comment` de la réponse écrit l'ordre CANONIQUE de ce que la signature couvre : le corps,
 *     la dernière séquence, la suite, et ce qui lie la réponse à sa requête (rattrapage 81) ;
 *   — `contratJsonSchema` les inclut, l'artefact publié aussi, et l'EMPREINTE change quand un champ
 *     de la route change ;
 *   — la version reste 3 : un amendement, pas une montée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { API_DU_CONTRAT, API_RELECTURE, defsApi } from '../../../packages/contracts/api';
import { SCHEMA_VERSION, contratJsonSchema } from '../../../packages/contracts/events';
import { canoniser, empreinte } from '../../../scripts/contracts/export';
import {
  CHEMIN_RELECTURE,
  LIMITE_PAR_PAGE,
} from '../../../src/server/integrations/axionia/relecture';

type Schema = Record<string, unknown>;
const NOMS = [
  'api_relecture_parametres',
  'api_relecture_requete_entetes',
  'api_relecture_reponse_entetes',
  'api_relecture_reponse',
] as const;

const defs = () => contratJsonSchema()['$defs'] as Record<string, Schema>;

describe('REQ-INT-012 — la route de relecture est déclarée au contrat', () => {
  it('REQ-INT-012 : la route est une API du contrat, GET, au chemin que le client de relecture appelle', () => {
    expect(API_DU_CONTRAT).toContain(API_RELECTURE);
    expect(API_RELECTURE.methode).toBe('GET');
    expect(API_RELECTURE.chemin).toBe(CHEMIN_RELECTURE);
    expect(API_RELECTURE.prefixeDefs).toBe('api_relecture');
  });

  it('REQ-INT-012 : ses quatre $defs sont dans contratJsonSchema, donc sous l’empreinte', () => {
    for (const nom of NOMS) {
      expect(Object.keys(defsApi()), nom).toContain(nom);
      expect(Object.keys(defs()), nom).toContain(nom);
    }
  });

  it('REQ-INT-012 : les paramètres sont FERMÉS — after_sequence entier non négatif, limit borné et nommé', () => {
    const p = defs().api_relecture_parametres!;
    expect(p.additionalProperties).toBe(false);
    expect(p.required).toEqual(['after_sequence', 'limit']);
    const props = p.properties as Record<string, Schema>;
    expect(props.after_sequence).toMatchObject({ type: 'integer', minimum: 0 });
    expect(props.limit).toMatchObject({ type: 'integer', minimum: 1 });
    // La borne est NOMMÉE et le client reste dessous.
    expect(typeof props.limit!.maximum).toBe('number');
    expect(LIMITE_PAR_PAGE).toBeLessThanOrEqual(props.limit!.maximum as number);
  });

  it('REQ-INT-012 : la réponse est une liste d’enveloppes DÉJÀ au contrat, bornée par la limite', () => {
    const r = defs().api_relecture_reponse!;
    expect(r.type).toBe('array');
    expect(r.items).toEqual({ $ref: '#' });
    const props = defs().api_relecture_parametres!.properties as Record<string, Schema>;
    expect(r.maxItems).toBe(props.limit!.maximum);
  });

  it('REQ-INT-012 : les en-têtes de la réponse portent la signature, la dernière séquence et la suite, exigés', () => {
    const e = defs().api_relecture_reponse_entetes!;
    expect(e.required).toEqual(
      expect.arrayContaining([
        'x-axionia-timestamp',
        'x-axionia-signature',
        'x-axionia-derniere-sequence',
        'x-axionia-suite',
      ])
    );
    const props = e.properties as Record<string, Schema>;
    expect(props['x-axionia-suite']).toEqual({ type: 'string', enum: ['0', '1'] });
    expect(defs().api_relecture_requete_entetes!.required).toEqual([
      'x-partners-timestamp',
      'x-partners-signature',
    ]);
  });

  it('REQ-INT-012 : le $comment écrit l’ordre canonique de ce que la signature de la réponse couvre', () => {
    const commentaire = String(defs().api_relecture_reponse_entetes!.$comment);
    const ordre = [
      '<horodatage>',
      '<after_sequence>',
      '<limit>',
      '<x-axionia-derniere-sequence>',
      '<x-axionia-suite>',
      '<corps exact>',
    ];
    expect(commentaire).toContain(ordre.join('.'));
  });

  it('REQ-INT-012 : le $comment porte ce que le schéma ne dit pas — absence de cache, journal sans donnée de personne', () => {
    const commentaire = String(defs().api_relecture_reponse!.$comment);
    expect(commentaire).toMatch(/cache/);
    expect(commentaire).toMatch(/journalis/);
  });
});

describe('REQ-INT-012 — la route de relecture, dans chaque contrat publié depuis la version 3', () => {
  it('REQ-INT-012 : l’artefact publié de la version courante porte la route, et la v3 la garde', () => {
    // La route est entrée en v3, amendée sous la même empreinte ; la v4 (INT-T76-P) la reprend.
    const courant = `packages/contracts/contracts.v${SCHEMA_VERSION}.json`;
    for (const chemin of ['packages/contracts/contracts.v3.json', courant]) {
      const publie = JSON.parse(readFileSync(chemin, 'utf8')) as { $defs: Record<string, unknown> };
      for (const nom of NOMS)
        expect(Object.keys(publie.$defs), `${chemin} : ${nom}`).toContain(nom);
    }
    expect(canoniser(contratJsonSchema())).toBe(readFileSync(courant, 'utf8'));
  });

  it('REQ-INT-012 : TÉMOIN — l’empreinte change quand un champ de la route change', () => {
    const contrat = contratJsonSchema();
    const avant = empreinte(canoniser(contrat));
    const modifie = structuredClone(contrat);
    const p = (modifie['$defs'] as Record<string, Schema>).api_relecture_parametres!;
    (p.properties as Record<string, Schema>).limit!.maximum = 9999;
    expect(empreinte(canoniser(modifie))).not.toBe(avant);
  });
});
