// @req REQ-JUR-007
// @req REQ-DM-043
/**
 * L'antériorité établie APRÈS l'enregistrement — la règle pure, rectifiée par la juriste.
 *
 * L'art. 3.3 juge l'antériorité AU DÉPÔT : une attribution qui occupe un SIREN est annulée si, à
 * `deposeeAt`, l'un des trois critères était rempli par des faits datés AVANT le dépôt —
 *   — une prestation facturée dans les vingt-quatre mois qui précèdent (`cliente`) ;
 *   — un devis émis moins de six mois avant (`devis`) ;
 *   — un devis signé avant, ni entièrement facturé ni annulé au jour du dépôt (`devis_signe`).
 * RÈGLE IMPÉRATIVE : un fait daté après le dépôt n'annule JAMAIS. Les fenêtres sont celles de la
 * règle de l'antériorité (SSOT), jamais recopiées. La liste de la Société n'est pas un de ces
 * critères. Tous les états occupants sont annulables ; l'apporteur est informé dans son espace, un
 * conseiller en console seulement.
 */
import { describe, it, expect } from 'vitest';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { ETATS_ATTRIBUTION, ajouterMoisParis } from '../../../src/domain/attribution/machine';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import {
  CRITERES_D_ANTERIORITE,
  canalDInformation,
  critereAuDepot,
  doitEtreAnnulee,
  type FaitsDatesDeLEntreprise,
} from '../../../src/domain/entreprise-connue/anteriorite-retroactive';

const DEPOT = new Date('2027-03-10T09:00:00.000Z');
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);
const moisAvantLeDepot = (mois: number) => new Date(ajouterMoisParis(DEPOT.getTime(), -mois));
const LIMITE_CLIENT = moisAvantLeDepot(SEUILS.ANTERIORITE_CLIENT_MOIS.valeur);
const LIMITE_DEVIS = moisAvantLeDepot(SEUILS.ANTERIORITE_DEVIS_MOIS.valeur);
const RIEN: FaitsDatesDeLEntreprise = { facturesAt: [], devis: [] };
const devis = (
  emisAt: Date,
  o: { signeAt?: Date; montant?: number; factureAvantLeDepot?: number } = {}
) => ({
  emisAt,
  signeAt: o.signeAt ?? null,
  montantTotalHtCents: o.montant ?? 0,
  factureHtCents: o.factureAvantLeDepot ?? 0,
});

describe('REQ-JUR-007 — les trois critères, jugés au dépôt', () => {
  it('REQ-JUR-007 : les critères internes, exactement, dans cet ordre', () => {
    expect([...CRITERES_D_ANTERIORITE]).toEqual(['cliente', 'devis', 'devis_signe']);
  });

  it('REQ-JUR-007 : aucun fait — aucun critère', () => {
    expect(critereAuDepot(RIEN, DEPOT)).toBeNull();
  });

  it('REQ-JUR-007 : TÉMOIN — cliente : une facture dans les vingt-quatre mois avant le dépôt, bornes comprises ; une milliseconde de trop, non', () => {
    expect(critereAuDepot({ ...RIEN, facturesAt: [LIMITE_CLIENT] }, DEPOT)).toBe('cliente');
    expect(critereAuDepot({ ...RIEN, facturesAt: [ms(DEPOT, -1)] }, DEPOT)).toBe('cliente');
    expect(critereAuDepot({ ...RIEN, facturesAt: [ms(LIMITE_CLIENT, -1)] }, DEPOT)).toBeNull();
  });

  it('REQ-JUR-007 : TÉMOIN — devis : émis moins de six mois avant le dépôt, bornes comprises ; une milliseconde de trop, non', () => {
    expect(critereAuDepot({ ...RIEN, devis: [devis(LIMITE_DEVIS)] }, DEPOT)).toBe('devis');
    expect(critereAuDepot({ ...RIEN, devis: [devis(ms(LIMITE_DEVIS, -1))] }, DEPOT)).toBeNull();
  });

  it('REQ-JUR-007 : TÉMOIN — devis signé : avant le dépôt, pas entièrement facturé au jour du dépôt, quelle que soit sa date', () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const ouvert = devis(vieux, { signeAt: vieux, montant: 1000, factureAvantLeDepot: 999 });
    const solde = devis(vieux, { signeAt: vieux, montant: 1000, factureAvantLeDepot: 1000 });
    expect(critereAuDepot({ ...RIEN, devis: [ouvert] }, DEPOT)).toBe('devis_signe');
    expect(critereAuDepot({ ...RIEN, devis: [solde] }, DEPOT)).toBeNull();
  });

  it('REQ-JUR-007 : la facture la plus RÉCENTE avant le dépôt fait foi, quel que soit l’ordre reçu', () => {
    const vieille = ms(LIMITE_CLIENT, -1);
    const recente = ms(DEPOT, -1);
    expect(critereAuDepot({ ...RIEN, facturesAt: [recente, vieille] }, DEPOT)).toBe('cliente');
    expect(critereAuDepot({ ...RIEN, facturesAt: [vieille, recente] }, DEPOT)).toBe('cliente');
  });

  it('REQ-JUR-007 : un devis signé SOLDÉ à côté d’un devis émis récent — le critère est le devis émis', () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const solde = devis(vieux, { signeAt: vieux, montant: 10, factureAvantLeDepot: 10 });
    expect(critereAuDepot({ ...RIEN, devis: [solde, devis(ms(DEPOT, -1))] }, DEPOT)).toBe('devis');
  });

  it('REQ-JUR-007 : la préséance de la règle — cliente, puis devis signé, puis devis émis', () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const ouvert = devis(vieux, { signeAt: vieux, montant: 10 });
    expect(
      critereAuDepot({ facturesAt: [ms(DEPOT, -1)], devis: [ouvert, devis(ms(DEPOT, -1))] }, DEPOT)
    ).toBe('cliente');
    expect(critereAuDepot({ facturesAt: [], devis: [devis(ms(DEPOT, -1)), ouvert] }, DEPOT)).toBe(
      'devis_signe'
    );
  });
});

describe('REQ-JUR-007 — RÈGLE IMPÉRATIVE : un fait daté après le dépôt n’annule jamais', () => {
  it('REQ-JUR-007 : TÉMOIN — une facture, un devis émis, pile au dépôt ou après : aucun critère', () => {
    expect(critereAuDepot({ ...RIEN, facturesAt: [DEPOT, ms(DEPOT, 1)] }, DEPOT)).toBeNull();
    expect(
      critereAuDepot({ ...RIEN, devis: [devis(DEPOT), devis(ms(DEPOT, 1))] }, DEPOT)
    ).toBeNull();
  });

  it('REQ-JUR-007 : TÉMOIN — un devis émis il y a longtemps mais SIGNÉ après le dépôt n’est pas un devis signé au dépôt', () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    expect(
      critereAuDepot(
        { ...RIEN, devis: [devis(vieux, { signeAt: ms(DEPOT, 1), montant: 10 })] },
        DEPOT
      )
    ).toBeNull();
    expect(
      critereAuDepot({ ...RIEN, devis: [devis(vieux, { signeAt: DEPOT, montant: 10 })] }, DEPOT)
    ).toBeNull();
  });

  it('REQ-JUR-007 : un devis émis récemment, signé après le dépôt, reste un devis ÉMIS avant lui', () => {
    expect(
      critereAuDepot(
        { ...RIEN, devis: [devis(ms(DEPOT, -1), { signeAt: ms(DEPOT, 1), montant: 10 })] },
        DEPOT
      )
    ).toBe('devis');
  });
});

describe('REQ-JUR-007 — qui est annulé : tout état occupant, seulement s’il occupe', () => {
  const PREUVE: FaitsDatesDeLEntreprise = { facturesAt: [ms(DEPOT, -1)], devis: [] };

  it.each(ETATS_OCCUPANTS)(
    'REQ-JUR-007 : TÉMOIN — %s, un fait antérieur au dépôt : annulée',
    (statut) => {
      expect(doitEtreAnnulee({ statut, deposeeAt: DEPOT }, PREUVE)).toBe('cliente');
    }
  );

  it.each(ETATS_ATTRIBUTION.filter((e) => !(ETATS_OCCUPANTS as readonly string[]).includes(e)))(
    'REQ-JUR-007 : une attribution qui n’occupe plus (%s) n’est pas annulée',
    (statut) => {
      expect(doitEtreAnnulee({ statut, deposeeAt: DEPOT }, PREUVE)).toBeNull();
    }
  );

  it('REQ-JUR-007 : un état occupant sans fait antérieur : rien', () => {
    expect(doitEtreAnnulee({ statut: 'active', deposeeAt: DEPOT }, RIEN)).toBeNull();
  });
});

describe('REQ-DM-043 — l’information de l’annulation, selon le porteur', () => {
  it('REQ-DM-043 : l’apporteur est informé dans son espace ; un conseiller, en console seulement', () => {
    expect(canalDInformation('apporteur')).toBe('espace');
    expect(canalDInformation('conseiller')).toBe('console');
  });
});
