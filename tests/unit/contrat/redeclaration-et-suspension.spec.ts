// @req REQ-JUR-003
// @req REQ-DM-004
/**
 * `redeclaration-et-suspension.spec.ts` — le délai de redéclaration de l'art. 3.5 ne court pas
 * pendant une suspension de l'Apporteur (art. 3.7).
 *
 * CE QU'IL PROUVE, sur le gabarit réel normalisé, quelle que soit la numérotation des alinéas de
 * l'art. 3.5 (elle diffère selon les versions du contrat) :
 *   (a) l'alinéa qui donne le délai de redéclaration existe, et il est UNIQUE ;
 *   (b) cet alinéa garde le délai de quinze jours pour déclarer à nouveau ;
 *   (c) la phrase de la suspension est dans CE MÊME alinéa, mot pour mot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const DELAI = "dispose de quinze jours pour déclarer à nouveau l'entreprise";
const SUSPENSION =
  "Ce délai ne court pas tant que l'enregistrement des déclarations de l'Apporteur est suspendu en application de l'article 3.7 ; il reprend, pour sa durée restante, à la fin de la suspension.";

/** Les alinéas normalisés de l'unité 3.5 qui donnent le délai de redéclaration. */
function alineasDuDelai(): string[] {
  const u = unitesDuGabarit(GABARIT).get('3.5');
  expect(u, 'unité 3.5 absente du gabarit').toBeDefined();
  return u!.alineas.map(normaliser).filter((a) => a.includes(DELAI));
}

describe('REQ-JUR-003 — le délai de redéclaration et la suspension (art. 3.5)', () => {
  it('REQ-JUR-003 : (a) un seul alinéa de l’art. 3.5 donne le délai de redéclaration', () => {
    expect(alineasDuDelai()).toHaveLength(1);
  });

  it('REQ-JUR-003, REQ-DM-004 : (b) cet alinéa garde le délai de quinze jours pour déclarer à nouveau', () => {
    expect(alineasDuDelai()[0]).toContain(DELAI);
  });

  it('REQ-JUR-003 : (c) la phrase de la suspension est dans le même alinéa, mot pour mot', () => {
    expect(alineasDuDelai()[0]).toContain(SUSPENSION);
  });
});
