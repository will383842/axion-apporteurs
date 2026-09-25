// @req REQ-CPL-020
/**
 * `apporteur-population-is-test.spec.ts` — DM-06 : `isTest` est exclu de TOUT agrégat d'argent,
 * du lot de paiement, de la déclaration annuelle et de l'entonnoir.
 *
 * Ces agrégats naissent plus tard ; ce qui naît ici est leur SOURCE UNIQUE de population : un
 * agrégat ne filtre pas `isTest` lui-même, il reçoit la population de `populationReelle()`.
 *
 * TÉMOIN À DEUX FACES (acceptance, point 7) : le même agrégat d'argent, calculé sur la population
 * brute puis sur la population réelle, DIVERGE — et le test nomme l'écart en centimes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma } from '../../../scripts/lot/lecteur-prisma';
import {
  ErreurPopulation,
  populationReelle,
  totalCentsHorsTest,
  type LigneDArgent,
} from '../../../src/domain/apporteur/population';

const reel = { id: 'a-reel', isTest: false };
const autreReel = { id: 'a-reel-2', isTest: false };
const essai = { id: 'a-essai', isTest: true };

const lignes: LigneDArgent[] = [
  { apporteurId: reel.id, montantCents: 7 },
  { apporteurId: autreReel.id, montantCents: 3 },
  { apporteurId: essai.id, montantCents: 5 },
];

describe('REQ-CPL-020 — la population réelle exclut `isTest`, et tout agrégat part d’elle', () => {
  it('REQ-CPL-020 : `populationReelle` retire les apporteurs de test, et eux seuls', () => {
    expect(populationReelle([reel, essai, autreReel])).toEqual([reel, autreReel]);
    expect(populationReelle([essai])).toEqual([]);
  });

  it('REQ-CPL-020 : TÉMOIN — l’agrégat brut et l’agrégat réel divergent de 5 centimes', () => {
    const brut = lignes.reduce((s, l) => s + l.montantCents, 0);
    const horsTest = totalCentsHorsTest(lignes, [reel, autreReel, essai]);
    expect(brut).toBe(15);
    expect(horsTest).toBe(10);
    expect(brut - horsTest).toBe(5);
  });

  it('REQ-CPL-020 : contre-témoin — sans apporteur de test, les deux agrégats sont égaux', () => {
    const sansEssai = lignes.filter((l) => l.apporteurId !== essai.id);
    expect(totalCentsHorsTest(sansEssai, [reel, autreReel])).toBe(10);
  });

  it('REQ-CPL-020 : une ligne dont l’apporteur est INCONNU est refusée — jamais comptée par défaut', () => {
    let e: unknown;
    try {
      totalCentsHorsTest([{ apporteurId: 'inconnu', montantCents: 1 }], [reel]);
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(ErreurPopulation);
    expect((e as ErreurPopulation).message).toContain('inconnu');
  });

  it('REQ-CPL-020 : un montant non entier est refusé (des centimes entiers)', () => {
    expect(() => totalCentsHorsTest([{ apporteurId: reel.id, montantCents: 1.5 }], [reel])).toThrow(
      ErreurPopulation
    );
  });

  it('REQ-CPL-020 : `isTest` est une colonne booléenne OBLIGATOIRE, sans défaut en base', () => {
    const schema = lireSchemaPrisma(readFileSync('prisma/schema.prisma', 'utf8'));
    const champ = schema.modeles
      .find((m) => m.nom === 'Apporteur')
      ?.champs.find((c) => c.nom === 'isTest');
    expect(champ).toMatchObject({ type: 'Boolean', optionnel: false, colonne: 'is_test' });
    // Un défaut ferait d'un oubli une valeur : l'écrivain DIT si l'apporteur est de test.
    expect(champ!.attributs.join(' ')).not.toContain('@default');
  });
});
