// @req REQ-DM-014
/**
 * JUR-T43 — l'art. 4.1 bis du contrat : le forfait d'un palier est réduit au prorata d'une remise,
 * sans jamais augmenter (HYP-PRORATA-REMISE, décisions de Williams du 2026-10-01).
 *
 * Le texte est lu tel que le contrat le rend ; la concordance avec le registre est jouée par
 * `controlerConcordances` : un gabarit sans l'art. 4.1 bis est refusé. Le contrat est un dépôt
 * public : l'article ne chiffre rien. L'annexe 1 nomme sa colonne de prix « Prix public HT à la date
 * du contrat (indicatif) », et le texte ne compte plus les paliers. Le palier de la conférence est
 * hors de cette tâche : le test W6, qui lit le REGISTRE, n'est pas touché.
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
const art41bis = (texte: string = GABARIT): string =>
  normaliser((unitesDuGabarit(texte).get('4.1 bis')?.alineas ?? []).join(' '));

/** Les fautes de concordance de HYP-PRORATA-REMISE sur un gabarit donné. */
const fautesProrata = (texte: string) =>
  controlerConcordances({
    registre: REGISTRE,
    gabarit: texte,
    concordances: CONCORDANCES,
    divergences: DIVERGENCES_DECLAREES,
    questions: QUESTIONS_POUR_WILL,
  }).fautes.filter((f) => f.message.includes('HYP-PRORATA-REMISE'));

describe('REQ-DM-014 — art. 4.1 bis : le forfait réduit au prorata d’une remise, jamais augmenté', () => {
  it('REQ-DM-014 : l’article dit la règle entière — prix comparés, arrondi, plafond, cas sans prix public, pourcentage hors champ', () => {
    const a = art41bis();
    for (const fragment of [
      'prix unitaire hors taxes',
      'remises déduites',
      'prix public hors taxes du même palier en vigueur à la date de signature de la commande',
      'arrondi au centime inférieur',
      "n'est jamais augmenté",
      'le forfait est dû en entier',
      "La commission au pourcentage n'est pas concernée",
    ])
      expect(a).toContain(fragment);
  });

  it('REQ-DM-014 : le dépôt est public — l’article ne chiffre ni montant ni pourcentage', () => {
    // Le numéro de l'article, seul chiffre admis, est retiré avant le contrôle.
    const a = art41bis().replace(/^(?:\*\*)?4\.1 bis\b/, '');
    expect(a).not.toBe(art41bis());
    expect(a).not.toMatch(/\d/);
    expect(a).not.toMatch(/€|%|\beuros?\b|\bpour ?cent\b/i);
  });

  it('REQ-DM-014 : les quatre tableaux de l’annexe 1 nomment le prix public à la date du contrat, plus aucun « prix de référence »', () => {
    const entetes = GABARIT.split(/\r?\n/).filter((l) => /^\| Palier \| Identifiant \|/.test(l));
    expect(entetes).toHaveLength(4);
    for (const e of entetes)
      expect(e).toContain('| Prix public HT à la date du contrat (indicatif) |');
    expect(GABARIT).not.toContain('Prix de référence HT');
  });

  it('REQ-DM-014 : le texte ne compte plus les paliers — ni le gabarit, ni la ligne CL-GRILLE', () => {
    expect(GABARIT).not.toMatch(/30\s+paliers/);
    const ligne = GABARIT.split(/\r?\n/).find((l) => l.startsWith('| `CL-GRILLE` |'));
    expect(ligne).toBeDefined();
    expect(ligne).not.toMatch(/\d+\s+paliers/);
  });

  it('REQ-DM-014 : la concordance HYP-PRORATA-REMISE tient sur le gabarit réel', () => {
    expect(fautesProrata(GABARIT)).toEqual([]);
  });

  it('REQ-DM-014 : TÉMOIN — un gabarit sans le prorata de la remise est refusé par la concordance', () => {
    // La phrase peut être coupée par un retour à la ligne du gabarit.
    const sans = GABARIT.replace(
      /le forfait est multiplié par le rapport\s+entre ces deux prix/,
      'le forfait est dû'
    );
    expect(sans).not.toBe(GABARIT);
    expect(fautesProrata(sans).length).toBeGreaterThan(0);
  });
});
