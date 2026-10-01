// @req REQ-SEC-037
/**
 * SEC-21 — le code public de parrainage, côté Partners (répartition du rattrapage 44).
 *
 * CE QU'IL PROUVE :
 *   1. LA FORME (`src/domain/parrainage/code.ts`, exportée pour axion-ia) : au moins 25 bits d'aléa,
 *      alphabet de Crockford sans ambiguïté, jamais dérivée de l'identité — le code ne dépend QUE de
 *      la source d'aléa ;
 *   2. LA RÉSOLUTION SILENCIEUSE (`src/server/parrainage/code-public.ts`) : un code inconnu, mal
 *      formé, ou d'un parrain qui n'est pas actif ne rattache RIEN — la candidature est traitée
 *      exactement comme sans code ; un code mal formé n'est même pas cherché en base ;
 *   3. L'ÉCHEC FERMÉ (condition de la lentille sécurité) : une lecture du parrain qui échoue ne
 *      rattache rien — l'erreur remonte, l'événement est rejoué, jamais rattaché à un code non vérifié.
 *
 * La limite par IP, la réponse indistincte et l'absence de cookie persistant sont côté axion-ia
 * (INT-T52-A) : Partners ne voit ni la requête ni l'IP du visiteur.
 */
import { describe, it, expect } from 'vitest';
import {
  ALPHABET_CROCKFORD,
  BITS_D_ALEA_DU_CODE,
  estCodeParrainage,
  genererCodeParrainage,
  normaliserCodeParrainage,
} from '../../../src/domain/parrainage/code';
import {
  STATUTS_DE_PARRAIN_ACTIF,
  codeDeParrainResolu,
} from '../../../src/server/parrainage/code-public';
import * as identifiants from '../../../src/domain/apporteur/identifiants';

const octets =
  (...o: number[]) =>
  (n: number) =>
    Uint8Array.from(o.slice(0, n));

describe('REQ-SEC-037 — la forme du code public de parrainage', () => {
  it('REQ-SEC-037 : au moins 25 bits d’aléa, sur l’alphabet de Crockford sans I, L, O ni U', () => {
    expect(BITS_D_ALEA_DU_CODE).toBeGreaterThanOrEqual(25);
    expect(ALPHABET_CROCKFORD).not.toMatch(/[ILOU]/);
    const code = genererCodeParrainage(octets(0x12, 0x34, 0x56, 0x78));
    expect(estCodeParrainage(code)).toBe(true);
    expect(code.slice(2)).toMatch(new RegExp(`^[${ALPHABET_CROCKFORD}]+$`));
  });

  it('REQ-SEC-037 : jamais dérivé de l’identité — la génération ne reçoit QUE la source d’aléa', () => {
    expect(genererCodeParrainage).toHaveLength(1);
    const a = genererCodeParrainage(octets(1, 2, 3, 4));
    expect(genererCodeParrainage(octets(1, 2, 3, 4))).toBe(a);
    expect(genererCodeParrainage(octets(1, 2, 3, 5))).not.toBe(a);
  });

  it('REQ-SEC-037 : la forme vit dans src/domain/parrainage/code.ts — l’ancien module la ré-exporte, il ne la redéfinit pas', () => {
    expect(identifiants.genererCodeParrainage).toBe(genererCodeParrainage);
    expect(identifiants.estCodeParrainage).toBe(estCodeParrainage);
  });

  it.each([
    ['nul', null],
    ['indéfini', undefined],
    ['un nombre', 42],
    ['vide', ''],
    ['blanc', '   '],
    ['trop court', 'AX12345'],
    ['trop long', 'AX1234567'],
    ['sans préfixe', 'ZZ123456'],
    ['une lettre ambiguë', 'AX12345O'],
    ['un caractère hors alphabet', 'AX1234-6'],
  ])('REQ-SEC-037 : %s n’est pas un code (normalisé à null)', (_q, capture) => {
    expect(normaliserCodeParrainage(capture)).toBeNull();
  });

  it('REQ-SEC-037 : la casse et les blancs autour ne comptent pas', () => {
    const code = genererCodeParrainage(octets(9, 8, 7, 6));
    expect(normaliserCodeParrainage(`  ${code.toLowerCase()} `)).toBe(code);
  });
});

describe('REQ-SEC-037 — la résolution silencieuse d’un code capturé', () => {
  const CODE = genererCodeParrainage(octets(0x0a, 0x0b, 0x0c, 0x0d));

  /** Un lecteur de parrains : la base simulée, et le compte des lectures. */
  function lecteur(parrains: Record<string, string>) {
    const lus: string[] = [];
    return {
      lus,
      lire: async (code: string) => {
        lus.push(code);
        const statut = parrains[code];
        return statut === undefined ? null : { statut };
      },
    };
  }

  it('REQ-SEC-037 : un code d’un parrain ACTIF est conservé, sous sa forme normalisée', async () => {
    const l = lecteur({ [CODE]: 'signe' });
    expect(await codeDeParrainResolu(l.lire, CODE.toLowerCase())).toBe(CODE);
  });

  it('REQ-SEC-037 : un code INCONNU ne rattache rien — comme sans code', async () => {
    const l = lecteur({});
    expect(await codeDeParrainResolu(l.lire, CODE)).toBeNull();
    expect(await codeDeParrainResolu(l.lire, null)).toBeNull();
  });

  it.each([
    'candidat',
    'retenu',
    'vivier',
    'refuse',
    'kyc_en_cours',
    'pret_a_signer',
    'suspendu',
    'resilie',
  ])(
    'REQ-SEC-037 : le code d’un apporteur « %s » (révoqué ou pas encore actif) ne rattache rien',
    async (statut) => {
      expect(await codeDeParrainResolu(lecteur({ [CODE]: statut }).lire, CODE)).toBeNull();
    }
  );

  it('REQ-SEC-037 : un parrain actif est un apporteur SIGNÉ, et lui seul', () => {
    expect([...STATUTS_DE_PARRAIN_ACTIF]).toEqual(['signe']);
  });

  it('REQ-SEC-037 : un code MAL FORMÉ n’est même pas cherché en base', async () => {
    const l = lecteur({ [CODE]: 'signe' });
    expect(await codeDeParrainResolu(l.lire, 'AX12345O')).toBeNull();
    expect(await codeDeParrainResolu(l.lire, `${CODE}' OR 1=1`)).toBeNull();
    expect(l.lus).toEqual([]);
  });

  it('REQ-SEC-037 : ÉCHEC FERMÉ — une lecture qui échoue ne rattache rien : l’erreur remonte, l’événement sera rejoué', async () => {
    const enPanne = async () => {
      throw new Error('base_indisponible');
    };
    await expect(codeDeParrainResolu(enPanne, CODE)).rejects.toThrow('base_indisponible');
  });
});
