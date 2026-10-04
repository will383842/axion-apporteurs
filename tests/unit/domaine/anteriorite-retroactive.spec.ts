// @req REQ-JUR-007
// @req REQ-DM-043
/**
 * L'antériorité établie APRÈS l'enregistrement (DM-25) — la règle pure. Une attribution qui occupe
 * un SIREN est annulée si, et seulement si, l'entreprise était connue de la Société AVANT le dépôt :
 * `connueDepuisAt < deposeeAt` (W19 : un devis postérieur n'annule rien). L'apporteur est informé avec
 * le motif ; un conseiller, en console seulement.
 */
import { describe, it, expect } from 'vitest';
import { ETATS_ATTRIBUTION } from '../../../src/domain/attribution/machine';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import {
  canalDInformation,
  doitEtreAnnulee,
} from '../../../src/domain/entreprise-connue/anteriorite-retroactive';

const DEPOT = new Date('2027-03-10T09:00:00.000Z');
const avant = new Date(DEPOT.getTime() - 1);
const apres = new Date(DEPOT.getTime() + 1);

describe('REQ-JUR-007 — l’antériorité établie après coup annule, si elle précède le dépôt', () => {
  it.each(ETATS_OCCUPANTS)(
    'REQ-JUR-007 : TÉMOIN — %s, connue une milliseconde AVANT le dépôt : annulée',
    (statut) => {
      expect(doitEtreAnnulee({ statut, deposeeAt: DEPOT }, avant)).toBe(true);
    }
  );

  it('REQ-JUR-007 : TÉMOIN — connue pile au dépôt, ou après (un devis postérieur) : rien n’est annulé', () => {
    expect(doitEtreAnnulee({ statut: 'active', deposeeAt: DEPOT }, DEPOT)).toBe(false);
    expect(doitEtreAnnulee({ statut: 'active', deposeeAt: DEPOT }, apres)).toBe(false);
  });

  it.each(ETATS_ATTRIBUTION.filter((e) => !(ETATS_OCCUPANTS as readonly string[]).includes(e)))(
    'REQ-JUR-007 : une attribution qui n’occupe plus (%s) n’est pas annulée',
    (statut) => {
      expect(doitEtreAnnulee({ statut, deposeeAt: DEPOT }, avant)).toBe(false);
    }
  );
});

describe('REQ-DM-043 — l’information de l’annulation, selon le porteur', () => {
  it('REQ-DM-043 : l’apporteur est informé dans son espace, avec le motif ; un conseiller, en console seulement', () => {
    expect(canalDInformation('apporteur')).toBe('espace');
    expect(canalDInformation('conseiller')).toBe('console');
  });
});
