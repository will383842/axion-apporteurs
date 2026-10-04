// @req REQ-SEC-022
// @req REQ-UX-002
// @req REQ-SEC-020
/**
 * SEC-12 — la DÉCISION d'un dépôt d'apporteur, pure : des faits lus sous verrou, une issue.
 *
 * CE QU'IL PROUVE :
 *   1. L'ORDRE des contrôles suit le contrat : gel, puis art. 3.3 bis a (établissement cessé), b (hors
 *      périmètre), art. 3.3 (antériorité), 3.3 bis d (opposition), puis l'occupation et la file (c) ;
 *   2. LE MÊME REFUS QUEL QUE SOIT L'OCCUPANT : un apporteur ou la Société (prise en charge) — la
 *      décision ne reçoit pas le porteur de l'occupant, elle ne peut donc pas les distinguer ;
 *   3. LA FILE : rang 1 puis 2 derrière un occupant, `file_complete` au-delà ; jamais de file sans
 *      occupant ;
 *   4. LES TROIS CRITÈRES DE L'ART. 3.3 (cliente, devis émis, devis signé) rendent à l'apporteur des
 *      octets IDENTIQUES : le motif stocké les distingue, l'écran jamais.
 */
import { describe, it, expect } from 'vitest';
import {
  ISSUES_DE_REFUS,
  PLACES_EN_ATTENTE,
  deciderDuDepot,
  type FaitsDuDepot,
} from '../../../src/domain/depot/issue-depot';
import { issueRendue } from '../../../src/content/micro-copy/espace/issues-depot';

/** Un dépôt LIBRE : chaque champ écrit, aucun défaut (RM-11). Chaque test en change un. */
const LIBRE: FaitsDuDepot = {
  apporteurGele: false,
  etablissementCesse: false,
  anteriorite: 'aucune',
  oppositionDemarchage: false,
  occupee: false,
  enAttente: 0,
  verificationPrioritaire: false,
};

describe('REQ-UX-002 — un dépôt libre est enregistré, prioritaire s’il le faut', () => {
  it('REQ-UX-002 : libre → enregistree, provisoire, sans rang', () => {
    expect(deciderDuDepot(LIBRE)).toEqual({
      issue: 'enregistree',
      statut: 'provisoire',
      rangAttente: null,
    });
  });

  it('REQ-UX-002 : libre et en vérification prioritaire → prioritaire, provisoire', () => {
    expect(deciderDuDepot({ ...LIBRE, verificationPrioritaire: true })).toEqual({
      issue: 'prioritaire',
      statut: 'provisoire',
      rangAttente: null,
    });
  });
});

describe('REQ-SEC-022 — les refus de catégorie, dans l’ordre du contrat', () => {
  it.each([
    ['etablissementCesse', { etablissementCesse: true }, 'etablissement_cesse'],
    ['financeur', { anteriorite: 'financeur' }, 'entreprise_hors_perimetre'],
    ['client', { anteriorite: 'client' }, 'anteriorite_client'],
    ['devis', { anteriorite: 'devis' }, 'anteriorite_devis'],
    ['opposition', { oppositionDemarchage: true }, 'opposition_demarchage'],
  ] as const)('REQ-SEC-022 : %s → refus %s, rien n’est enregistré', (_quoi, faits, issue) => {
    expect(deciderDuDepot({ ...LIBRE, ...faits })).toEqual({
      issue,
      statut: null,
      rangAttente: null,
    });
  });

  it('REQ-SEC-022 : un apporteur gelé : `gele`, avant tout autre contrôle — rien n’est enregistré', () => {
    expect(
      deciderDuDepot({
        ...LIBRE,
        apporteurGele: true,
        etablissementCesse: true,
        anteriorite: 'client',
      })
    ).toEqual({ issue: 'gele', statut: null, rangAttente: null });
  });

  it('REQ-SEC-022 : l’ordre — cessé avant hors périmètre, hors périmètre avant antériorité, antériorité avant opposition, tout avant la file', () => {
    const tout: FaitsDuDepot = {
      ...LIBRE,
      etablissementCesse: true,
      anteriorite: 'financeur',
      oppositionDemarchage: true,
      occupee: true,
      enAttente: PLACES_EN_ATTENTE,
    };
    expect(deciderDuDepot(tout).issue).toBe('etablissement_cesse');
    expect(deciderDuDepot({ ...tout, etablissementCesse: false }).issue).toBe(
      'entreprise_hors_perimetre'
    );
    expect(deciderDuDepot({ ...tout, etablissementCesse: false, anteriorite: 'devis' }).issue).toBe(
      'anteriorite_devis'
    );
    expect(
      deciderDuDepot({ ...tout, etablissementCesse: false, anteriorite: 'aucune' }).issue
    ).toBe('opposition_demarchage');
    expect(
      deciderDuDepot({
        ...tout,
        etablissementCesse: false,
        anteriorite: 'aucune',
        oppositionDemarchage: false,
      }).issue
    ).toBe('file_complete');
  });

  it('REQ-SEC-022 : chaque issue de refus que la décision rend est un refus de catégorie', () => {
    for (const faits of [
      { etablissementCesse: true },
      { anteriorite: 'financeur' as const },
      { anteriorite: 'client' as const },
      { anteriorite: 'devis' as const },
      { oppositionDemarchage: true },
      { occupee: true, enAttente: PLACES_EN_ATTENTE },
    ]) {
      expect(ISSUES_DE_REFUS).toContain(deciderDuDepot({ ...LIBRE, ...faits }).issue);
    }
  });
});

describe('REQ-SEC-022 — l’occupation et la file (art. 3.3 bis c)', () => {
  it('REQ-SEC-022 : la file compte deux places', () => {
    expect(PLACES_EN_ATTENTE).toBe(2);
  });

  it('REQ-SEC-022 : occupée, file vide → en_attente rang 1 ; une en attente → rang 2 ; deux → file_complete', () => {
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 0 })).toEqual({
      issue: 'en_attente',
      statut: 'en_attente',
      rangAttente: 1,
    });
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 1 })).toEqual({
      issue: 'en_attente',
      statut: 'en_attente',
      rangAttente: 2,
    });
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 2 })).toEqual({
      issue: 'file_complete',
      statut: null,
      rangAttente: null,
    });
  });

  it('REQ-SEC-022 : en vérification prioritaire, la file reste la file : en_attente', () => {
    expect(
      deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 0, verificationPrioritaire: true }).issue
    ).toBe('en_attente');
  });

  it('REQ-SEC-022 : une file sans occupant ne retient personne : libre → enregistree', () => {
    expect(deciderDuDepot({ ...LIBRE, occupee: false, enAttente: 1 }).issue).toBe('enregistree');
  });

  it('REQ-SEC-022 : face ROUGE — un compte en attente hors des bornes est refusé, jamais deviné', () => {
    for (const enAttente of [-1, 3, 1.5, Number.NaN]) {
      expect(() => deciderDuDepot({ ...LIBRE, occupee: true, enAttente })).toThrow(RangeError);
    }
  });

  it('REQ-SEC-022 : LE MÊME REFUS QUEL QUE SOIT L’OCCUPANT — la décision ne connaît pas le porteur de l’occupant', () => {
    // Les faits ne portent qu'un booléen d'occupation : un apporteur et une prise en charge par la
    // Société ou ses préposés donnent les MÊMES faits, donc la même issue, octet pour octet.
    expect(Object.keys(LIBRE).sort()).toEqual([
      'anteriorite',
      'apporteurGele',
      'enAttente',
      'etablissementCesse',
      'occupee',
      'oppositionDemarchage',
      'verificationPrioritaire',
    ]);
  });
});

describe('REQ-UX-002 — l’art. 3.3 ne dit jamais lequel de ses critères joue', () => {
  it('REQ-UX-002 : cliente et devis (émis ou signé) rendent à l’apporteur des octets IDENTIQUES', () => {
    const client = issueRendue(deciderDuDepot({ ...LIBRE, anteriorite: 'client' }).issue);
    const devis = issueRendue(deciderDuDepot({ ...LIBRE, anteriorite: 'devis' }).issue);
    expect(JSON.stringify(client)).toBe(JSON.stringify(devis));
    expect(JSON.stringify(client)).not.toMatch(/client|devis|factur|sign/i);
  });
});

describe('REQ-SEC-020 — ni la zone ni le secteur ne refusent un dépôt', () => {
  it('REQ-SEC-020 : la décision ne reçoit ni zone ni secteur ; un dépôt libre est enregistré quels qu’ils soient', () => {
    expect(Object.keys(LIBRE).filter((k) => /zone|secteur/i.test(k))).toEqual([]);
    const horsZone: FaitsDuDepot & { zone: string; secteur: string } = {
      ...LIBRE,
      zone: 'hors zone',
      secteur: 'hors secteur',
    };
    expect(deciderDuDepot(horsZone)).toEqual(deciderDuDepot(LIBRE));
  });
});
