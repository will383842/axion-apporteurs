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
  PAGES_MAX_DES_SOMMES,
  comparerLesSommes,
  evenementDeSomme,
  fenetreDe,
  passageDesSommes,
  portsDesSommesEnBase,
  sommerSurLaFenetre,
  type EvenementDeSomme,
  type PortsDesSommes,
} from '../../src/server/integrations/axionia/reconciliation-sommes';
import { RECOUVREMENT_SEQUENCES } from '../../src/server/integrations/axionia/reconciliation';
import type { PrismaClient } from '@prisma/client';
import {
  GENRES_RECONCILIATION,
  messageDAlerte,
} from '../../src/server/integrations/telegram/alertes';

const MAINTENANT = new Date('2026-10-03T06:00:00.000Z');
const JOUR = 24 * 60 * 60 * 1000;
const SIREN_A = '123456782';
const SIREN_B = '987654321';

/** Une charge de paiement conforme au schéma du contrat, payée la veille de MAINTENANT. */
const CHARGE_CONFORME = {
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

describe('REQ-INT-013 — le passage des sommes : relecture, comparaison, alerte au nombre', () => {
  const corps = (id: string, siren: string, montantHtCents: number) =>
    JSON.stringify({
      event_id: id,
      event_type: 'paiement.recu',
      payload: { ...CHARGE_CONFORME, siren, montantHtCents, factureMontantHtCents: montantHtCents },
    });
  const ligneRelue = (id: string, sequence: bigint, siren: string, montant: number) => ({
    eventId: id,
    sequence,
    corps: corps(id, siren, montant),
  });
  const recu = (id: string, siren: string, montant: number) => ({
    eventId: id,
    eventType: 'paiement.recu',
    charge: { ...CHARGE_CONFORME, siren, montantHtCents: montant, factureMontantHtCents: montant },
  });

  function ports(
    relues: ReturnType<typeof ligneRelue>[],
    recus: ReturnType<typeof recu>[],
    lire?: PortsDesSommes['lire']
  ) {
    const signaux: unknown[] = [];
    const lectures: bigint[] = [];
    const p: PortsDesSommes = {
      maintenant: () => MAINTENANT,
      sequenceAvant: async () => 40n,
      lire:
        lire ??
        (async (apres) => {
          lectures.push(apres);
          return { ok: true, lignes: relues, derniereSequence: 99n, suite: false };
        }),
      evenementsRecus: async () => recus,
      sirensAttribues: async () => attribues,
      signaler: async (s) => {
        signaux.push(s);
      },
    };
    return { p, signaux, lectures };
  }

  it('REQ-INT-013 : TÉMOIN — sommes égales : aucune alerte, et les compteurs sont rendus quand même', async () => {
    const { p, signaux } = ports(
      [ligneRelue('e1', 41n, SIREN_A, 120_00)],
      [recu('e1', SIREN_A, 120_00)]
    );
    const c = await passageDesSommes(p);
    expect(signaux).toEqual([]);
    expect(c.nombreDEcarts).toBe(0);
    expect(c.relus).toBe(1);
  });

  it('REQ-INT-013 : TÉMOIN — un écart : UNE alerte au nombre, sans SIREN ; le SIREN n’est nommé que dans le retour interne', async () => {
    const { p, signaux } = ports(
      [ligneRelue('e1', 41n, SIREN_A, 120_00), ligneRelue('e2', 42n, SIREN_B, 50_00)],
      [recu('e1', SIREN_A, 120_00)]
    );
    const c = await passageDesSommes(p);
    expect(signaux).toHaveLength(1);
    expect(signaux[0]).toEqual({ genre: 'ecart_de_sommes', nombre: c.nombreDEcarts });
    expect(JSON.stringify(signaux)).not.toContain(SIREN_B);
    expect(c.ecartsParSiren.map((e) => e.siren)).toEqual([SIREN_B]);
  });

  it('REQ-INT-013 : la relecture part de la plus haute séquence reçue AVANT la fenêtre, moins le recouvrement', async () => {
    const { p, lectures } = ports([], []);
    await passageDesSommes(p);
    expect(lectures[0]).toBe(40n > RECOUVREMENT_SEQUENCES ? 40n - RECOUVREMENT_SEQUENCES : 0n);
  });

  it('REQ-INT-013 : TÉMOIN — une relecture refusée ou bornée ne compare RIEN : jamais un faux écart', async () => {
    const refusee = ports([], [], async () => ({ ok: false, motif: 'appel_echoue' }));
    await expect(passageDesSommes(refusee.p)).rejects.toThrow(/relecture_echouee/);
    expect(refusee.signaux).toEqual([{ genre: 'relecture_echouee', motif: 'appel_echoue' }]);

    const bornee = ports([], [], async () => ({
      ok: true,
      lignes: [],
      derniereSequence: 99n,
      suite: true,
    }));
    await expect(passageDesSommes(bornee.p)).rejects.toThrow(/relecture_bornee/);
    expect(bornee.signaux).toEqual([{ genre: 'relecture_bornee', nombre: PAGES_MAX_DES_SOMMES }]);
  });
});

describe('REQ-INT-013 — une ligne relue est jugée par le schéma de sa charge au contrat', () => {
  it('REQ-INT-013 : TÉMOIN — un paiement conforme devient un événement de somme ; une charge hors schéma, ou d’un autre type, est écartée', () => {
    const charge = CHARGE_CONFORME;
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

describe('REQ-INT-013 — les ports en base lisent la source axion-ia seule', () => {
  it('REQ-INT-013 : la séquence d’avant la fenêtre se lit à l’heure de RÉCEPTION, la source axion-ia seule ; le type reçu revient au nom du contrat', async () => {
    const appels: Record<string, unknown> = {};
    const prisma = {
      evenementRecu: {
        aggregate: async (args: unknown) => {
          appels['aggregate'] = args;
          return { _max: { sequence: 7n } };
        },
        findMany: async (args: unknown) => {
          appels['findMany'] = args;
          return [{ eventId: 'e1', eventType: 'paiement_recu', charge: {} }];
        },
      },
      attribution: {
        findMany: async (args: unknown) => {
          appels['attribution'] = args;
          return [{ siren: SIREN_A }, { siren: SIREN_B }];
        },
      },
    } as unknown as PrismaClient;
    const p = portsDesSommesEnBase(prisma, {
      maintenant: () => MAINTENANT,
      lire: async () => ({ ok: false, motif: 'canal_non_configure' }),
      signaler: async () => {},
    });
    expect(await p.sequenceAvant(MAINTENANT)).toBe(7n);
    expect(appels['aggregate']).toEqual({
      where: { source: 'axionia', receivedAt: { lt: MAINTENANT } },
      _max: { sequence: true },
    });
    const recus = await p.evenementsRecus(['paiement.recu', 'paiement.rembourse']);
    expect(recus).toEqual([{ eventId: 'e1', eventType: 'paiement.recu', charge: {} }]);
    expect(await p.sirensAttribues()).toEqual(new Set([SIREN_A, SIREN_B]));
  });
});

describe('REQ-INT-013 — l’alerte d’un écart de sommes ne montre que son nombre', () => {
  it('REQ-INT-013 : TÉMOIN — ecart_de_sommes est un genre d’alerte de la réconciliation, rendu avec son seul nombre', () => {
    expect(GENRES_RECONCILIATION).toContain('ecart_de_sommes');
    const id = '00000000-0000-4000-8000-000000000073';
    const message = messageDAlerte('alerte', {
      categorie: 'reconciliation',
      id,
      reconciliation: { genre: 'ecart_de_sommes', nombre: 2 },
    });
    expect(message).toBe(`[reconciliation] objet ${id} · réconciliation ecart_de_sommes · 2`);
    expect(message).not.toContain(SIREN_A);
  });
});
