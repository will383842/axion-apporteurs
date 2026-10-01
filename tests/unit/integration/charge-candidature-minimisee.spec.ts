// @req REQ-DM-036
// @req REQ-JUR-029
/**
 * INT-T56 — la charge conservée d'une candidature reçue perd `reponsesJson` UNE fois, sans rien d'autre.
 * `evenements_recus.charge` est conservée dix ans et ne doit porter aucune donnée personnelle ; le
 * déclencheur d'immutabilité n'admet que cette réécriture (témoins d'intégration sur un vrai Postgres,
 * `tests/integration/charge-candidature-minimisee.spec.ts`).
 *
 * CE QUE CE FICHIER GARDE (dans la portée de `mutation:pr`) :
 *   1. `chargeMinimisee()` rend la charge SANS `reponsesJson`, toutes les autres clés à l'identique — ni
 *      ajoutée, ni changée —, sans toucher l'original ; elle REFUSE une charge qui n'est pas un objet
 *      ou qui n'a pas (ou plus) `reponsesJson` : une seconde réécriture n'est pas un cas normal ;
 *   2. le traitant écrit la charge minimisée dans la MÊME mise à jour que le passage à `traite`
 *      (`data` unique : statut, processedAt, dependanceRef, charge — exigence d'A02).
 */
import { describe, it, expect } from 'vitest';
import {
  chargeMinimisee,
  traiterCandidatureRecue,
  type ClientCandidature,
} from '../../../src/server/integrations/axionia/candidature-recue';
import { clesPii } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import fixture from '../../fixtures/axionia/candidature-recue.json';

const CHARGE = fixture.evenement.payload as Record<string, unknown>;

describe('REQ-DM-036 — la forme minimisée de la charge, pure', () => {
  it('REQ-DM-036 REQ-JUR-029 : la charge réelle perd reponsesJson, et seulement lui', () => {
    expect(CHARGE).toHaveProperty('reponsesJson');
    const m = chargeMinimisee(CHARGE);
    expect(m).not.toHaveProperty('reponsesJson');
    const { reponsesJson: _retire, ...reste } = CHARGE;
    expect(m).toEqual(reste);
    expect(Object.keys(m)).toEqual(Object.keys(CHARGE).filter((k) => k !== 'reponsesJson'));
  });

  it('REQ-DM-036 : l’original n’est pas touché, et le résultat est un autre objet', () => {
    const avant = JSON.stringify(CHARGE);
    const m = chargeMinimisee(CHARGE);
    expect(JSON.stringify(CHARGE)).toBe(avant);
    expect(m).not.toBe(CHARGE);
  });

  it('REQ-DM-036 : TÉMOINS — une charge sans reponsesJson, un tableau, null ou un texte sont refusés', () => {
    const { reponsesJson: _r, ...sans } = CHARGE;
    expect(() => chargeMinimisee(sans)).toThrow(/reponsesJson/);
    expect(() => chargeMinimisee([CHARGE])).toThrow(/objet/);
    expect(() => chargeMinimisee(null)).toThrow(/objet/);
    expect(() => chargeMinimisee('{"reponsesJson":1}')).toThrow(/objet/);
  });
});

describe('REQ-DM-036 — le traitant minimise dans la MÊME mise à jour que le passage à traite', () => {
  // Les clés de test du dépôt, construites comme `candidature-recue.spec.ts` les construit.
  const CLES = clesPii({
    NODE_ENV: 'test',
    ...Object.fromEntries(
      NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t56-${n.toLowerCase()}-`.padEnd(48, '0')])
    ),
    PII_ENCRYPTION_KEY: 'a'.repeat(64),
  });

  it('REQ-DM-036 REQ-JUR-029 : une seule écriture de l’événement, statut traite ET charge minimisée', async () => {
    const mises: { where: unknown; data: Record<string, unknown> }[] = [];
    const tx = {
      apporteur: {
        findFirst: async () => ({ id: 'existant' }),
        create: async () => ({}),
      },
      evenementRecu: {
        update: async (args: { where: unknown; data: Record<string, unknown> }) => {
          mises.push(args);
          return args;
        },
      },
    };
    const prisma = {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as ClientCandidature;
    await traiterCandidatureRecue(
      prisma,
      { id: 'evt-1', charge: CHARGE },
      {
        tirer: async () => ({
          nom: 'Fictif',
          prenom: 'Jeanne',
          email: 'jeanne@exemple.invalid',
          telephone: null,
        }),
        cles: CLES,
        maintenant: () => new Date('2026-10-01T12:00:00Z'),
        aleatoire: (n: number) => new Uint8Array(n).fill(7),
      }
    );
    expect(mises).toHaveLength(1);
    expect(mises[0]!.data).toMatchObject({ statut: 'traite', dependanceRef: null });
    expect(mises[0]!.data.charge).toEqual(chargeMinimisee(CHARGE));
    expect(mises[0]!.data).not.toHaveProperty('payloadHash');
  });
});
