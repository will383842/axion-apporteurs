// @req REQ-DM-012
/**
 * `apporteur-identifiants.spec.ts` — DM-06 : deux identifiants DISTINCTS par apporteur.
 *
 *   — Le code de parrainage PUBLIC : `AX` puis 6 caractères de l'alphabet Crockford base32 (sans
 *     I, L, O ni U), 30 bits aléatoires (HYP-DM06-CODE-PARRAINAGE). La source d'aléa est INJECTÉE :
 *     le domaine est pur, et le test prouve que les 30 bits — et eux seuls — font le code.
 *   — Le jeton de dépôt PRIVÉ : seule son EMPREINTE se stocke ; un jeton révoqué ne se réactive pas.
 *
 * Aucun défaut sur ce que le test fait varier (RM-11) : chaque octet d'aléa est écrit.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ALPHABET_CROCKFORD,
  ErreurJetonDepot,
  OCTETS_CODE_PARRAINAGE,
  OCTETS_JETON_DEPOT,
  empreinteJetonDepot,
  estCodeParrainage,
  genererCodeParrainage,
  jetonDepotActif,
  nouveauJetonDepot,
  revoquerJetonDepot,
  sourceAleatoireSysteme,
} from '../../../src/domain/apporteur/identifiants';
import * as identifiants from '../../../src/domain/apporteur/identifiants';

const octets = (...o: number[]) => Uint8Array.from(o);
const source = (o: Uint8Array) => (n: number) => {
  expect(n).toBe(o.length);
  return o;
};

describe('REQ-DM-012 — le code de parrainage : lisible, unique, non énumérable', () => {
  it('REQ-DM-012 : l’alphabet est Crockford base32 — 32 caractères, sans I, L, O ni U', () => {
    expect(ALPHABET_CROCKFORD).toHaveLength(32);
    expect(new Set(ALPHABET_CROCKFORD).size).toBe(32);
    expect(ALPHABET_CROCKFORD).not.toMatch(/[ILOU]/);
    expect(ALPHABET_CROCKFORD).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  });

  it('REQ-DM-012 : le code est `AX` + 6 caractères de l’alphabet, tiré de 4 octets d’aléa', () => {
    expect(OCTETS_CODE_PARRAINAGE).toBe(4);
    const code = genererCodeParrainage(source(octets(0x12, 0x34, 0x56, 0x78)));
    expect(code).toMatch(/^AX[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(estCodeParrainage(code)).toBe(true);
  });

  it('REQ-DM-012 : les 30 bits comptent TOUS — chacun, basculé seul, change le code', () => {
    const base = octets(0, 0, 0, 0);
    const codeBase = genererCodeParrainage(source(base));
    const vus = new Set([codeBase]);
    for (let bit = 0; bit < 30; bit += 1) {
      const o = octets(0, 0, 0, 0);
      o[3 - Math.floor(bit / 8)]! |= 1 << (bit % 8);
      vus.add(genererCodeParrainage(source(o)));
    }
    expect(vus.size).toBe(31);
  });

  it('REQ-DM-012 : au-delà des 30 bits, rien ne compte — les deux bits de poids fort sont ignorés', () => {
    const a = genererCodeParrainage(source(octets(0x00, 0xab, 0xcd, 0xef)));
    const b = genererCodeParrainage(source(octets(0xc0, 0xab, 0xcd, 0xef)));
    expect(a).toBe(b);
  });

  it('REQ-DM-012 : extrêmes — tout à zéro et tout à un rendent les deux bornes de l’alphabet', () => {
    expect(genererCodeParrainage(source(octets(0, 0, 0, 0)))).toBe('AX000000');
    expect(genererCodeParrainage(source(octets(0xff, 0xff, 0xff, 0xff)))).toBe('AXZZZZZZ');
  });

  it('REQ-DM-012 : la source de PRODUCTION est cryptographique et n’est pas constante', () => {
    // Deux tirages de 30 bits identiques : une chance sur 2^30. Dix tirages tous égaux : aucune.
    const codes = new Set(
      Array.from({ length: 10 }, () => genererCodeParrainage(sourceAleatoireSysteme))
    );
    expect(codes.size).toBeGreaterThan(1);
    for (const c of codes) expect(estCodeParrainage(c)).toBe(true);
    const a = sourceAleatoireSysteme(OCTETS_JETON_DEPOT);
    const b = sourceAleatoireSysteme(OCTETS_JETON_DEPOT);
    expect(a).toHaveLength(OCTETS_JETON_DEPOT);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('REQ-DM-012 : une source d’aléa qui rend un autre nombre d’octets est refusée', () => {
    expect(() => genererCodeParrainage(() => octets(1, 2, 3))).toThrow(/octets/);
  });

  it('REQ-DM-012 : `estCodeParrainage` refuse I, L, O, U, la minuscule, un autre préfixe ou une autre longueur', () => {
    for (const faux of [
      'AXI00000',
      'AXL00000',
      'AXO00000',
      'AXU00000',
      'ax000000',
      'AB000000',
      'AX00000',
      'AX0000000',
      ' AX000000',
    ]) {
      expect(estCodeParrainage(faux), faux).toBe(false);
    }
  });
});

describe('REQ-DM-012 — le jeton de dépôt : une empreinte stockée, une révocation définitive', () => {
  const clair = new Uint8Array(OCTETS_JETON_DEPOT).fill(7);
  const creeAt = Date.UTC(2026, 8, 25, 10, 0);

  it('REQ-DM-012 : un jeton neuf rend le CLAIR (remis une fois) et l’EMPREINTE (seule stockée)', () => {
    expect(OCTETS_JETON_DEPOT).toBeGreaterThanOrEqual(32);
    const { clair: jeton, enregistrement } = nouveauJetonDepot(source(clair), creeAt);
    expect(enregistrement).toEqual({
      tokenHash: empreinteJetonDepot(jeton),
      creeAt,
      revoqueAt: null,
      dernierUsageAt: null,
    });
    expect(enregistrement.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(enregistrement)).not.toContain(jeton);
  });

  it('REQ-DM-012 : le clair est EXACTEMENT les octets injectés, et l’empreinte leur SHA-256', () => {
    const octetsEcrits = Uint8Array.from({ length: OCTETS_JETON_DEPOT }, (_, i) => i);
    const { clair: jeton, enregistrement } = nouveauJetonDepot(source(octetsEcrits), creeAt);
    expect(jeton).toBe(Buffer.from(octetsEcrits).toString('base64url'));
    expect(enregistrement.tokenHash).toBe(createHash('sha256').update(jeton, 'utf8').digest('hex'));
  });

  it('REQ-DM-012 : le jeton et le code de parrainage sont deux identifiants distincts', () => {
    const { clair: jeton } = nouveauJetonDepot(source(clair), creeAt);
    expect(estCodeParrainage(jeton)).toBe(false);
    expect(jeton.length).toBeGreaterThan(8);
  });

  it('REQ-DM-012 : deux jetons différents ont deux empreintes différentes', () => {
    const autre = new Uint8Array(OCTETS_JETON_DEPOT).fill(8);
    expect(nouveauJetonDepot(source(clair), creeAt).enregistrement.tokenHash).not.toBe(
      nouveauJetonDepot(source(autre), creeAt).enregistrement.tokenHash
    );
  });

  it('REQ-DM-012 : face ROUGE — un jeton révoqué ne se révoque pas deux fois, et sa date ne bouge pas', () => {
    const { enregistrement } = nouveauJetonDepot(source(clair), creeAt);
    const revoque = revoquerJetonDepot(enregistrement, creeAt + 1000);
    expect(revoque.revoqueAt).toBe(creeAt + 1000);
    expect(jetonDepotActif(revoque)).toBe(false);
    let erreur: unknown;
    try {
      revoquerJetonDepot(revoque, creeAt + 2000);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurJetonDepot);
    expect((erreur as ErreurJetonDepot).code).toBe('jeton_deja_revoque');
    expect(revoque.revoqueAt).toBe(creeAt + 1000);
  });

  it('REQ-DM-012 : face VERTE — un jeton neuf est actif', () => {
    expect(jetonDepotActif(nouveauJetonDepot(source(clair), creeAt).enregistrement)).toBe(true);
  });

  it('REQ-DM-012 : le module n’offre AUCUN chemin de réactivation', () => {
    const noms = Object.keys(identifiants);
    expect(noms.filter((n) => /reactiv|restaur|annulerRevocation/i.test(n))).toEqual([]);
  });
});

describe('REQ-DM-012 — la migration arme la base contre la réactivation (lecture statique)', () => {
  // Le comportement se prouve en base réelle (`tests/integration/apporteur-jeton-depot.spec.ts`) ;
  // cette lecture rougit AUSSI sans démon Docker, sur le SQL tel qu'il sera appliqué.
  const sql = readFileSync('prisma/migrations/20260925000000_apporteur/migration.sql', 'utf8');

  it('REQ-DM-012 : un déclencheur de LIGNE couvre UPDATE et DELETE sur jetons_depot', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER jetons_depot_revocation_definitive BEFORE UPDATE OR DELETE ON "jetons_depot"\s+FOR EACH ROW/
    );
  });

  it('REQ-DM-012 : un déclencheur d’INSTRUCTION refuse TRUNCATE sur jetons_depot', () => {
    expect(sql).toMatch(/BEFORE TRUNCATE ON "jetons_depot"\s+FOR EACH STATEMENT/);
  });

  it('REQ-DM-012 : la fonction gèle la ligne révoquée et fige l’empreinte', () => {
    expect(sql).toMatch(/OLD\."revoque_at" IS NOT NULL THEN/);
    expect(sql).toMatch(/NEW\."token_hash" IS DISTINCT FROM OLD\."token_hash"/);
  });
});
