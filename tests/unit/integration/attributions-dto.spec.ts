// @req REQ-INT-014
/**
 * INT-T07-P — l'API 1, `GET /api/integrations/axionia/attributions?siren=`, côté Partners.
 *
 * Ce que le fichier tient :
 *   — la route est DÉCLARÉE au contrat (`packages/contracts/api.ts`), sous des `$defs` fermés
 *     préfixés `api_attributions` : le paramètre `siren`, les en-têtes de la requête dont
 *     `x-axionia-kid` EXIGÉ (avenant A01 du 2026-09-30), et la réponse à quatre champs ;
 *   — la forme que la frontière admet (`api-entrante.ts`) est DÉRIVÉE de ce `$defs` : un champ
 *     ajouté au contrat sans la frontière, ou l'inverse, fait rougir ;
 *   — `nomAffichable` (décision de Williams du 2026-10-01, option B) : null pour `libre`, et aucun
 *     autre champ n'est admis.
 */
import { describe, it, expect } from 'vitest';
import {
  API_ATTRIBUTIONS,
  API_DU_CONTRAT,
  ENTETE_KID_AXIONIA,
  defsApi,
} from '../../../packages/contracts/api';
import { contratJsonSchema } from '../../../packages/contracts/events';
import {
  CHAMPS_DE_LA_REPONSE,
  STATUTS_D_ATTRIBUTION,
  schemaReponseAttribution,
} from '../../../src/server/integrations/axionia/api-entrante';

type Schema = Record<string, unknown>;
const NOMS = [
  'api_attributions_parametres',
  'api_attributions_requete_entetes',
  'api_attributions_reponse',
] as const;
const defs = () => contratJsonSchema()['$defs'] as Record<string, Schema>;
const REF = '6f1c2a3e-9b8d-4c7e-a1f2-3b4c5d6e7f80';

describe('REQ-INT-014 — l’API 1 est déclarée au contrat', () => {
  it('REQ-INT-014 : la route est une API du contrat, GET, au chemin que la frontière sert', () => {
    expect(API_DU_CONTRAT).toContain(API_ATTRIBUTIONS);
    expect(API_ATTRIBUTIONS.methode).toBe('GET');
    expect(API_ATTRIBUTIONS.chemin).toBe('/api/integrations/axionia/attributions');
    expect(API_ATTRIBUTIONS.prefixeDefs).toBe('api_attributions');
  });

  it('REQ-INT-014 : ses trois $defs sont dans contratJsonSchema, donc sous l’empreinte', () => {
    for (const nom of NOMS) {
      expect(Object.keys(defsApi()), nom).toContain(nom);
      expect(Object.keys(defs()), nom).toContain(nom);
    }
  });

  it('REQ-INT-014 : le paramètre est FERMÉ — le seul `siren`, neuf chiffres', () => {
    const p = defs().api_attributions_parametres!;
    expect(p.additionalProperties).toBe(false);
    expect(p.required).toEqual(['siren']);
    expect((p.properties as Record<string, Schema>).siren).toEqual({
      type: 'string',
      pattern: '^[0-9]{9}$',
    });
  });

  it('REQ-INT-014 : les en-têtes EXIGENT le jeton porteur et `x-axionia-kid` (avenant A01, QA-T52)', () => {
    const e = defs().api_attributions_requete_entetes!;
    expect(e.required).toEqual(['authorization', ENTETE_KID_AXIONIA]);
    const props = e.properties as Record<string, Schema>;
    expect(props.authorization).toEqual({ type: 'string', pattern: '^Bearer \\S+$' });
    expect(props[ENTETE_KID_AXIONIA]).toEqual({ type: 'string', pattern: '^[0-9a-f]{8}$' });
    expect(String(e.$comment)).toMatch(/kidDe\(AXIONIA_API_TOKEN\)/);
  });

  it('REQ-INT-014 : la réponse est FERMÉE à quatre champs, tous exigés, nuls compris', () => {
    const r = defs().api_attributions_reponse!;
    expect(r.additionalProperties).toBe(false);
    expect(r.required).toEqual(['statut', 'until', 'apporteurRef', 'nomAffichable']);
    const props = r.properties as Record<string, Schema>;
    expect(props.statut).toEqual({ type: 'string', enum: ['libre', 'attribuee', 'cliente'] });
    expect(String(r.$comment)).toMatch(/jamais e-mail, téléphone, identifiant ni adresse/);
  });
});

describe('REQ-INT-014 — la forme admise par la frontière est dérivée du contrat', () => {
  it('REQ-INT-014 : les champs et les statuts de la frontière SONT ceux du $defs', () => {
    const r = defs().api_attributions_reponse!;
    expect([...CHAMPS_DE_LA_REPONSE]).toEqual(r.required);
    const props = r.properties as Record<string, Schema>;
    expect([...STATUTS_D_ATTRIBUTION]).toEqual(props.statut!.enum);
  });

  it('REQ-INT-014 : une entreprise attribuée rend son nom affichable', () => {
    const lu = {
      statut: 'attribuee',
      until: '2027-03',
      apporteurRef: REF,
      nomAffichable: 'Paul D.',
    };
    expect(schemaReponseAttribution.safeParse(lu)).toEqual({ success: true, data: lu });
  });

  it('REQ-INT-014 : une entreprise libre rend null — un nom porté par « libre » est refusé', () => {
    const libre = { statut: 'libre', until: null, apporteurRef: null, nomAffichable: null };
    expect(schemaReponseAttribution.safeParse(libre).success).toBe(true);
    expect(schemaReponseAttribution.safeParse({ ...libre, nomAffichable: 'Paul D.' }).success).toBe(
      false
    );
  });

  it('REQ-INT-014 : aucun champ de plus n’est admis, ni un nom absent', () => {
    const juste = {
      statut: 'attribuee',
      until: '2027-03',
      apporteurRef: REF,
      nomAffichable: 'Paul D.',
    };
    expect(schemaReponseAttribution.safeParse({ ...juste, email: 'p@x.test' }).success).toBe(false);
    const sansNom: Partial<typeof juste> = { ...juste };
    delete sansNom.nomAffichable;
    expect(schemaReponseAttribution.safeParse(sansNom).success).toBe(false);
  });

  it('REQ-INT-014 : le nom affichable n’est jamais une adresse de courriel ni un numéro', () => {
    const base = { statut: 'attribuee', until: '2027-03', apporteurRef: REF };
    for (const nomAffichable of [
      'paul.dupont@example.test',
      '06 12 34 56 78',
      '',
      'x'.repeat(65),
    ]) {
      expect(
        schemaReponseAttribution.safeParse({ ...base, nomAffichable }).success,
        nomAffichable
      ).toBe(false);
    }
  });
});
