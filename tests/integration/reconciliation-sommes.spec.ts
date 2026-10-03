// @req REQ-INT-013
/**
 * INT-T73-P — la réconciliation des SOMMES avec axion-ia sur sept jours glissants (REQ-INT-013, la
 * part que la réconciliation des séquences ne livre pas). Méthode de la lentille schema (A02), sans migration :
 *
 *   · la source axion-ia est la RELECTURE de sa file (les corps stockés), chaque ligne jugée par le
 *     schéma de sa charge au contrat (`paiement.recu`, `paiement.rembourse`) ; la source Partners est
 *     la charge des MÊMES événements reçus (`evenements_recus`) ;
 *   · la fenêtre se juge sur la date MÉTIER de la charge (`paidAt`, `rembourseLe`), des deux côtés ;
 *   · par SIREN attribué : Σ HT des paiements et Σ HT des remboursements, comparées SÉPARÉMENT (une
 *     perte de chacun, de même montant, ne s'annule pas) ; le net s'affiche, il ne décide rien ;
 *   · deux contrôles GLOBAUX, sans SIREN : le NOMBRE d'événements de chaque type et la somme HT de
 *     TOUS (attribués ou non, avec ou sans SIREN) ;
 *   · les sommes sont des entiers en centimes, en `number`, sous une garde à MAX_SAFE_INTEGER ;
 *   · vers l'extérieur, seul le NOMBRE d'écarts ; les SIREN en cause ne sont nommés que dans Partners.
 *
 * Ces blocs ne touchent pas de base : ils jugent la comparaison sur des lignes simulées. Le passage
 * en base réelle viendra avec le branchement du travail quotidien.
 */
import { describe, it, expect } from 'vitest';
import {
  FENETRE_JOURS,
  comparerLesSommes,
  evenementDeSomme,
  fenetreDe,
  sommerSurLaFenetre,
  type EvenementDeSomme,
} from '../../src/server/integrations/axionia/reconciliation-sommes';

const MAINTENANT = new Date('2026-10-03T06:00:00.000Z');
const JOUR = 24 * 60 * 60 * 1000;
const SIREN_A = '123456782';
const SIREN_B = '987654321';

const paiement = (
  id: string,
  siren: string | null,
  montantHtCents: number,
  ilYA = JOUR
): EvenementDeSomme => ({
  type: 'paiement.recu',
  eventId: id,
  siren,
  montantHtCents,
  date: new Date(MAINTENANT.getTime() - ilYA),
});
const remboursement = (
  id: string,
  siren: string | null,
  montantHtCents: number
): EvenementDeSomme => ({
  ...paiement(id, siren, montantHtCents),
  type: 'paiement.rembourse',
});

const fenetre = fenetreDe(MAINTENANT);
const attribues = new Set([SIREN_A, SIREN_B]);
const comparer = (axionia: EvenementDeSomme[], partners: EvenementDeSomme[]) =>
  comparerLesSommes(
    sommerSurLaFenetre(axionia, fenetre, attribues),
    sommerSurLaFenetre(partners, fenetre, attribues)
  );

describe('REQ-INT-013 — la comparaison des sommes, sans base', () => {
  it('REQ-INT-013 : TÉMOIN — sommes égales des deux côtés : aucun écart', () => {
    const memes = [paiement('e1', SIREN_A, 120_00), remboursement('e2', SIREN_A, 20_00)];
    const r = comparer(memes, [...memes]);
    expect(r.ecartsParSiren).toEqual([]);
    expect(r.ecartsGlobaux).toEqual([]);
    expect(r.nombreDEcarts).toBe(0);
  });

  it('REQ-INT-013 : TÉMOIN — un paiement absent de Partners : un écart, nommé par SIREN en interne', () => {
    const r = comparer(
      [paiement('e1', SIREN_A, 120_00), paiement('e2', SIREN_B, 50_00)],
      [paiement('e1', SIREN_A, 120_00)]
    );
    expect(r.ecartsParSiren).toEqual([
      { siren: SIREN_B, nature: 'paiements', axionia: 50_00, partners: 0 },
    ]);
    expect(r.nombreDEcarts).toBeGreaterThan(0);
  });

  it('REQ-INT-013 : TÉMOIN — une perte d’un paiement ET d’un remboursement de même montant ne s’annule pas', () => {
    const r = comparer([paiement('e1', SIREN_A, 30_00), remboursement('e2', SIREN_A, 30_00)], []);
    expect(r.ecartsParSiren.map((e) => e.nature).sort()).toEqual(['paiements', 'remboursements']);
  });

  it('REQ-INT-013 : TÉMOIN — un paiement d’un SIREN NON attribué, ou sans SIREN, ne compte pas par SIREN mais déclenche l’écart GLOBAL', () => {
    const r = comparer([paiement('e1', null, 10_00), paiement('e2', '111111111', 5_00)], []);
    expect(r.ecartsParSiren).toEqual([]);
    expect(r.ecartsGlobaux.map((e) => e.controle).sort()).toEqual([
      'nombre:paiement.recu',
      'somme:paiement.recu',
    ]);
  });

  it('REQ-INT-013 : TÉMOIN — la fenêtre suit la date MÉTIER : un paiement de huit jours n’entre pas, un de six jours entre', () => {
    const r = comparer([paiement('vieux', SIREN_A, 99_00, 8 * JOUR)], []);
    expect(r.nombreDEcarts).toBe(0);
    const r2 = comparer([paiement('recent', SIREN_A, 99_00, 6 * JOUR)], []);
    expect(r2.nombreDEcarts).toBeGreaterThan(0);
    expect(FENETRE_JOURS).toBe(7);
  });

  it('REQ-INT-013 : une somme qui dépasserait MAX_SAFE_INTEGER lève, jamais un BigInt silencieux', () => {
    expect(() =>
      sommerSurLaFenetre(
        [paiement('e1', SIREN_A, Number.MAX_SAFE_INTEGER), paiement('e2', SIREN_A, 1)],
        fenetre,
        attribues
      )
    ).toThrow(/somme_hors_borne/);
  });
});

describe('REQ-INT-013 — une ligne relue est jugée par le schéma de sa charge au contrat', () => {
  it('REQ-INT-013 : TÉMOIN — un paiement conforme devient un événement de somme ; une charge hors schéma, ou d’un autre type, est écartée', () => {
    const charge = {
      paymentId: 'pay_1',
      factureId: 'fac_1',
      clientId: null,
      origineClient: 'site',
      siren: SIREN_A,
      montantEncaisseTtcCents: 144_00,
      factureMontantHtCents: 120_00,
      factureMontantTtcCents: 144_00,
      regimeTva: 'normal',
      totalEncaisseTtcCents: 144_00,
      paidAt: '2026-10-02T10:00:00.000Z',
      provider: 'stripe',
      montantHtCents: 120_00,
      soldeLaFacture: true,
    };
    expect(evenementDeSomme('e1', 'paiement.recu', charge)).toEqual({
      type: 'paiement.recu',
      eventId: 'e1',
      siren: SIREN_A,
      montantHtCents: 120_00,
      date: new Date('2026-10-02T10:00:00.000Z'),
    });
    expect(
      evenementDeSomme('e2', 'paiement.recu', { ...charge, montantHtCents: 'cent' })
    ).toBeNull();
    expect(evenementDeSomme('e3', 'facture.emise', charge)).toBeNull();
  });
});
