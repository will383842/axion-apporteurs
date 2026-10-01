// @req REQ-DM-028
/**
 * JUR-T42 — l'antériorité de la Société sur un DEVIS SIGNÉ, à l'art. 3.3 du contrat
 * (HYP-ANTERIORITE-DEVIS, décision de Williams du 2026-10-01).
 *
 * Un devis signé qui n'est pas encore entièrement facturé rend l'entreprise indisponible, quelle que
 * soit sa date ; les deux autres cas de l'art. 3.3 (devis de moins de six mois, cliente facturée sur
 * vingt-quatre mois) restent. La concordance avec le registre est jouée par `controlerConcordances` :
 * un gabarit sans ce cas est refusé.
 *
 * « ni annulé » attend la décision de Williams : il a son test À PART, pour que son retrait éventuel
 * ne casse que lui, et la concordance ne l'ancre pas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';
import {
  CONCORDANCES,
  DIVERGENCES_DECLAREES,
  QUESTIONS_POUR_WILL,
  controlerConcordances,
  lignesDuRegistre,
} from '../../../src/domain/contrat/decisions';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const REGISTRE = lignesDuRegistre(readFileSync('docs/DECISIONS.md', 'utf8'));
const art33 = (texte: string = GABARIT): string =>
  normaliser((unitesDuGabarit(texte).get('3.3')?.alineas ?? []).join(' '));

/** Les fautes de concordance de HYP-ANTERIORITE-DEVIS sur un gabarit donné. */
const fautesAnteriorite = (texte: string) =>
  controlerConcordances({
    registre: REGISTRE,
    gabarit: texte,
    concordances: CONCORDANCES,
    divergences: DIVERGENCES_DECLAREES,
    questions: QUESTIONS_POUR_WILL,
  }).fautes.filter((f) => f.message.includes('HYP-ANTERIORITE-DEVIS'));

describe('REQ-DM-028 — art. 3.3 : un devis signé et pas encore entièrement facturé rend l’entreprise indisponible', () => {
  it('REQ-DM-028 : le devis signé, quelle que soit sa date', () => {
    expect(art33()).toContain("ayant signé un devis qui n'a été ni entièrement facturé");
    expect(art33()).toContain('quelle que soit sa date');
  });

  it('REQ-DM-028 : la décision de Williams en attente — « ni annulé » (test à part, retirable seul)', () => {
    expect(art33()).toContain("ayant signé un devis qui n'a été ni entièrement facturé, ni annulé");
  });

  it('REQ-DM-028 : les deux autres cas de l’art. 3.3 demeurent', () => {
    expect(art33()).toContain("destinataire d'un devis de moins de six mois");
    expect(art33()).toContain(
      "cliente au titre d'une prestation facturée au cours des vingt-quatre derniers mois"
    );
  });

  it('REQ-DM-028 : la concordance HYP-ANTERIORITE-DEVIS tient sur le gabarit réel', () => {
    expect(fautesAnteriorite(GABARIT)).toEqual([]);
  });

  it('REQ-DM-028 : TÉMOIN — un gabarit sans le devis signé est refusé par la concordance', () => {
    const sans = GABARIT.replace(
      // La phrase peut être coupée par un retour à la ligne du gabarit.
      /ayant signé un devis\s+qui n.a été ni entièrement facturé/,
      'ayant reçu un devis'
    );
    expect(sans).not.toBe(GABARIT);
    expect(fautesAnteriorite(sans).length).toBeGreaterThan(0);
  });
});
