// @req REQ-UX-047
// @req REQ-UX-010
/**
 * L'état vide de « Mes commissions » : « …signe, puis à chaque paiement. » (remarque de la juriste
 * sur la PR 518, relevée par Williams). Une commission naît des paiements, et un OPCO peut payer à
 * la place de l'entreprise (contrat, art. 4.4) : « quand elle paie » serait inexact. La chaîne exacte
 * vit dans la micro-copie ET dans sa maquette validée ; l'ancienne n'est plus nulle part.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';

const NOUVELLE = 'signe, puis à chaque paiement.';
const ANCIENNE = 'puis quand elle paie';
/** La maquette replie le texte sur plusieurs lignes : on la lit espaces réduits. */
const maquette = () =>
  readFileSync('docs/maquettes/mes-commissions.html', 'utf8').replace(/\s+/g, ' ');

describe('l’état vide de « Mes commissions » dit « …signe, puis à chaque paiement. »', () => {
  it('REQ-UX-010 : TÉMOIN — la micro-copie porte la chaîne exacte, et plus l’ancienne', () => {
    const phrase = ETATS_VIDES_ESPACE['/mes-commissions']?.phrase ?? '';
    expect(phrase).toContain(
      `Elles apparaissent ici quand une entreprise que vous avez déposée ${NOUVELLE}`
    );
    expect(phrase).not.toContain(ANCIENNE);
  });

  it('REQ-UX-047 : TÉMOIN — la maquette validée dit la même phrase, et plus l’ancienne', () => {
    const m = maquette();
    expect(m).toContain(
      `Elles apparaissent ici quand une entreprise que vous avez déposée ${NOUVELLE}`
    );
    expect(m).not.toContain(ANCIENNE);
  });
});
