// @req REQ-DM-022
/**
 * `commande-avant-confirmation.spec.ts` — une commande signée entre la déclaration et la
 * confirmation est commissionnée si l'attribution est ensuite confirmée (art. 4.4, JUR-T53).
 *
 * CE QU'IL PROUVE, sur le gabarit réel normalisé, sans compter les alinéas de l'art. 4.4 (d'autres
 * tâches y en ajoutent) :
 *   (a) la phrase est dans l'unité 4.4, mot pour mot ;
 *   (b) l'art. 4.4 garde la commission des commandes signées pendant la durée de l'attribution, et
 *       l'absence de droit pour une commande signée après son expiration ;
 *   (c) l'art. 3.4 n'est pas modifié : la durée court « à compter de sa confirmation » ;
 *   (d) contrat v2 d'axion-ia : à la signature d'une commande, la Société ne demande à
 *       l'entreprise de confirmer aucun échange ; l'attribution suit les seules règles de l'art. 3.2.
 *       La phrase de la vérification du brouillon n'est plus dans le gabarit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const PHRASE =
  "Une commande signée entre la déclaration et la confirmation de l'attribution est commissionnée si l'attribution est ensuite confirmée, y compris tacitement ; elle est réputée signée pendant la durée de l'attribution.";

const SANS_CONFIRMATION =
  "La Société ne demande à l'entreprise de confirmer aucun échange à cette occasion : l'attribution suit les seules règles de l'article 3.2.";

/** La phrase du brouillon, retirée par le v2. */
const VERIFICATION_DU_BROUILLON =
  "Lorsqu'une commande est signée alors que la demande de confirmation fait l'objet d'une vérification";

/** Le texte normalisé d'une unité, tous alinéas joints : indépendant de leur compte. */
function texteDe(numero: string): string {
  const u = unitesDuGabarit(GABARIT).get(numero);
  expect(u, `unité ${numero} absente du gabarit`).toBeDefined();
  return u!.alineas.map(normaliser).join('\n');
}

describe('REQ-DM-022 — la commande signée avant la confirmation (art. 4.4)', () => {
  it('REQ-DM-022 : (a) la phrase est dans l’unité 4.4, mot pour mot', () => {
    expect(texteDe('4.4')).toContain(normaliser(PHRASE));
  });

  it('REQ-DM-022 : (b) l’art. 4.4 garde la durée de l’attribution et l’absence de droit après son expiration', () => {
    const t = texteDe('4.4');
    expect(t).toContain(normaliser("signées pendant la durée de l'attribution"));
    expect(t).toContain(
      normaliser("une commande signée **après** l'expiration de l'attribution n'ouvre aucun droit")
    );
  });

  it('REQ-DM-022 : (c) l’art. 3.4 n’est pas modifié — la durée court à compter de la confirmation', () => {
    expect(texteDe('3.4')).toContain(normaliser('à compter de sa confirmation'));
  });

  it('REQ-DM-022 : (d) à la signature, aucune confirmation d’échange n’est demandée à l’entreprise, mot pour mot', () => {
    expect(texteDe('4.4')).toContain(normaliser(SANS_CONFIRMATION));
    expect(normaliser(GABARIT)).not.toContain(normaliser(VERIFICATION_DU_BROUILLON));
  });
});
