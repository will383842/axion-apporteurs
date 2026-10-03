// @req REQ-JUR-003
/**
 * `qualite-art-23.spec.ts` — la qualité de l'Apporteur à l'art. 14 (clause attributive de
 * compétence, art. 48 CPC), rendue sans élision fautive.
 *
 * CE QU'IL PROUVE, sur le gabarit réel :
 *   (a) rendu avec CHACUNE des quatre qualités, le texte ne porte aucune élision fautive : jamais
 *       « de » suivi d'une voyelle juste avant le libellé (« de artisan », « de société »…) ;
 *   (b) `{{APPORTEUR_QUALITE}}` reste UNIQUE dans le gabarit ;
 *   (c) la phrase de l'art. 14, mot pour mot.
 *
 * Les libellés sont ceux de la liste fermée d'A07 (acceptance), la source de DM-50 n'étant pas
 * encore sur main : commerçant, société commerciale, artisan, professionnel libéral. Aucun libellé ne
 * porte de préposition : c'est le gabarit qui la porte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, rendre } from '../../../src/domain/contrat/gabarit';
import { SENTINELLE } from '../../../src/config/entite';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const QUALITES = ['commerçant', 'société commerciale', 'artisan', 'professionnel libéral'] as const;

describe('REQ-JUR-003 — la qualité de l’Apporteur à l’art. 14, sans élision fautive', () => {
  it.each(QUALITES)(
    'REQ-JUR-003 : (a) rendu avec « %s », le gabarit ne porte aucune élision fautive avant le libellé',
    (qualite) => {
      const rendu = normaliser(rendre(GABARIT, { APPORTEUR_QUALITE: qualite }, [SENTINELLE]));
      // La phrase de l'art. 14 telle que rendue : le libellé y suit la préposition, s'il y en a une.
      const j = rendu.indexOf("L'Apporteur déclare contracter en");
      expect(j, 'la phrase de l’art. 14 est rendue').toBeGreaterThan(-1);
      const phrase = rendu.slice(j, rendu.indexOf('.', j) + 1);
      expect(phrase).toContain(qualite);
      expect(phrase).not.toMatch(/\bde [aeiouyàâéèêëîïôûh]/i);
      expect(phrase).not.toMatch(/\bde (?:artisan|société)/i);
    }
  );

  it('REQ-JUR-003 : TÉMOIN — le juge de l’élision voit « de artisan » et « de société »', () => {
    expect('qualité de artisan').toMatch(/\bde [aeiouyàâéèêëîïôûh]/i);
    expect('qualité de société commerciale').toMatch(/\bde (?:artisan|société)/i);
    expect('qualité de commerçant').not.toMatch(/\bde [aeiouyàâéèêëîïôûh]/i);
  });

  it('REQ-JUR-003 : (b) la variable de la qualité est UNIQUE dans le gabarit', () => {
    expect(GABARIT.match(/\{\{APPORTEUR_QUALITE\}\}/g)).toHaveLength(1);
  });

  it('REQ-JUR-003 : (c) la phrase de l’art. 14, mot pour mot', () => {
    expect(normaliser(GABARIT)).toContain(
      "L'Apporteur déclare contracter en la qualité suivante : {{APPORTEUR_QUALITE}}."
    );
  });
});
