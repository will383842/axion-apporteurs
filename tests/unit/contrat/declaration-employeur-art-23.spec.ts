// @req REQ-JUR-064
/**
 * `declaration-employeur-art-23.spec.ts` — la situation de l'Apporteur envers un employeur est
 * couverte par le texte EXISTANT de l'art. 23 du gabarit ; aucune phrase n'y est ajoutée.
 *
 * CE QU'IL PROUVE, sur le gabarit réel : le corps de l'art. 23 porte les deux fragments
 * « clause de non-concurrence ou d'exclusivité » et « auprès de son employeur ». Il rougit si l'un
 * des deux disparaît de l'article, et un témoin montre que le juge voit leur absence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser } from '../../../src/domain/contrat/gabarit';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const FRAGMENTS = [
  "clause de non-concurrence ou d'exclusivité",
  'auprès de son employeur',
] as const;

/** Le corps de l'art. 23, de son titre au titre suivant ou au séparateur, espaces normalisés. */
function article23(texte: string): string {
  const debut = texte.indexOf('### Article 23 ');
  if (debut < 0) return '';
  const reste = texte.slice(debut);
  const fin = reste.search(/\n(?:#{1,3} |---)/);
  return normaliser(fin < 0 ? reste : reste.slice(0, fin)).replace(/\s+/g, ' ');
}

/** Les fragments absents du corps de l'art. 23. */
function manquants(texte: string): string[] {
  const corps = article23(texte);
  return FRAGMENTS.filter((f) => !corps.includes(f));
}

describe('REQ-JUR-064 — l’art. 23 couvre la situation envers un employeur', () => {
  it('REQ-JUR-064 : l’art. 23 du gabarit porte les deux fragments', () => {
    expect(article23(GABARIT), 'l’art. 23 est trouvé').not.toBe('');
    expect(manquants(GABARIT)).toEqual([]);
  });

  it.each(FRAGMENTS)('REQ-JUR-064 : TÉMOIN — le juge voit la disparition de « %s »', (fragment) => {
    const corps = article23(GABARIT);
    const ampute = GABARIT.replace(/### Article 23 [\s\S]*?(?=\n---)/, corps.replace(fragment, ''));
    expect(manquants(ampute)).toEqual([fragment]);
  });
});
