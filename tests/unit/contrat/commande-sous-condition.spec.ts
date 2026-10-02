// @req REQ-JUR-061
// @req REQ-DM-022
/**
 * `commande-sous-condition.spec.ts` — la commande conclue sous condition suspensive, au contrat
 * (art. 4.4 ; C. civ. art. 1304, 1304-4 et 1304-6 ; avis d'A07).
 *
 * CE QU'IL PROUVE, sur le gabarit réel normalisé (gras, retours de ligne et apostrophes neutralisés) :
 *   (a) l'art. 4.4 porte la phrase, mot pour mot ;
 *   (b) AUCUNE clause ne date une commande à la levée ou à la réalisation de la condition ;
 *   (c) la défaillance vaut annulation au sens de l'art. 3.3 ;
 *   (d) la renonciation avant la défaillance garde la date ; un accord après est une nouvelle commande.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const TOUT = normaliser(GABARIT);

/** Le texte normalisé de l'unité 4.4, tous alinéas joints. */
function article44(): string {
  const u = unitesDuGabarit(GABARIT).get('4.4');
  expect(u, 'unité 4.4 absente du gabarit').toBeDefined();
  return normaliser(u!.alineas.join(' '));
}

describe('REQ-JUR-061 — la commande sous condition suspensive est datée de sa signature', () => {
  it('REQ-JUR-061 : (a) l’art. 4.4 porte la phrase, mot pour mot', () => {
    expect(article44()).toContain(
      "Une commande conclue sous condition suspensive est datée de sa signature ; elle est réputée n'avoir jamais existé si la condition défaille."
    );
  });

  it('REQ-JUR-061 : (b) aucune clause ne date une commande à la levée ou à la réalisation de la condition', () => {
    const fautes = [
      /dat[ée]e?s? (?:de|à|au jour de|à compter de) la (?:levée|réalisation|survenance|satisfaction)/i,
      /(?:date|daté[e]?s?)[^.;]{0,60}(?:accord|décision) (?:de prise en charge|de l'opérateur|de l'OPCO)/i,
      /(?:levée|réalisation) de la condition[^.;]{0,40}(?:fixe|détermine|vaut) la date/i,
    ];
    for (const motif of fautes) expect(TOUT).not.toMatch(motif);
    // Le juge n'est pas vide : chaque phrase fautive rougit, une par motif.
    const fautives = [
      'la commande est datée de la levée de la condition',
      "la commande est datée du jour de l'accord de prise en charge de l'OPCO",
      'la réalisation de la condition fixe la date de la commande',
    ];
    fautes.forEach((motif, i) => expect(fautives[i]).toMatch(motif));
  });

  it('REQ-JUR-061 : (c) la défaillance de la condition vaut annulation au sens de l’art. 3.3', () => {
    expect(article44()).toContain("vaut annulation au sens de l'article 3.3");
  });

  it('REQ-DM-022 : (d) la renonciation avant la défaillance garde la date ; un accord après est une nouvelle commande', () => {
    const a = article44();
    expect(a).toContain('renonce à la condition avant sa défaillance');
    expect(a).toContain('la commande conserve la date de sa signature');
    expect(a).toContain('nouvelle commande, datée de sa propre signature');
    expect(a).toContain(
      "qui n'est commissionnée que si elle est signée pendant la durée de l'attribution"
    );
  });
});
