// @req REQ-DM-034
/**
 * L'écrivain du rattachement manuel : il juge AVANT d'écrire (justification, lien antérieur, aucun
 * lien dans les paramètres de la notification), écrit la décision et son événement dans UNE
 * transaction, puis notifie `rattachement_decide` une fois, au bon apporteur, après la transaction.
 * Le client et les ports sont simulés : c'est l'ordre et le refus qu'on juge ici ; la base les juge
 * en intégration.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  LienDansUnParametre,
  deciderLeRattachement,
  type DecisionDeRattachement,
} from '../../../src/server/rattachement/decider';

const ATTRIBUTION = randomUUID();
const APPORTEUR = randomUUID();
const QUALIFIEUR = randomUUID();
const DEPOT = new Date('2026-10-01T10:00:00.000Z');

function decision(p: Partial<DecisionDeRattachement> = {}): DecisionDeRattachement {
  return {
    attributionId: ATTRIBUTION,
    sirenCommande: '123456789',
    justification: 'le Kbis montre une filiale à 100 % depuis 2019',
    lienControleEtabliAt: new Date('2019-04-01T00:00:00.000Z'),
    lienControleSource: 'Kbis du 2019-04-01',
    decideParId: QUALIFIEUR,
    maintenant: new Date('2026-10-03T09:00:00.000Z'),
    notification: {
      a: 'apporteur@exemple.invalid',
      entreprise: 'Entreprise Essai',
      decision: 'La commande est rattachée à votre attribution',
      motif: 'la société commandeuse est une filiale de celle que vous avez déclarée',
    },
    ...p,
  };
}

/** Des ports simulés qui enregistrent, dans l'ordre, chaque geste. */
function ports(apporteurId: string | null = APPORTEUR) {
  const gestes: string[] = [];
  const evenements: unknown[] = [];
  const notifications: { apporteurId: string; demande: unknown }[] = [];
  const tx = {
    attribution: {
      findUniqueOrThrow: async () => {
        gestes.push('lire_attribution');
        return { apporteurId, deposeeAt: DEPOT };
      },
    },
    rattachementManuel: {
      create: async (a: { data: Record<string, unknown> }) => {
        gestes.push('creer_rattachement');
        return { id: 'r-1', ...a.data };
      },
    },
  };
  return {
    gestes,
    evenements,
    notifications,
    ports: {
      prisma: {
        $transaction: async <T>(f: (t: never) => Promise<T>): Promise<T> => {
          gestes.push('ouvrir');
          const r = await f(tx as never);
          gestes.push('valider');
          return r;
        },
      },
      journaliser: async (_t: unknown, e: unknown) => {
        gestes.push('journaliser');
        evenements.push(e);
      },
      notifier: async (id: string, demande: unknown) => {
        gestes.push('notifier');
        notifications.push({ apporteurId: id, demande });
      },
    },
  };
}

async function refus(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-034 — le rattachement décidé : écrit, journalisé, puis notifié une fois', () => {
  it('REQ-DM-034 : TÉMOIN — la décision et son événement dans la transaction, la notification APRÈS, une seule fois, au bon apporteur', async () => {
    const p = ports();
    const r = await deciderLeRattachement(decision(), p.ports);
    expect(r).toEqual({ rattachementId: 'r-1', notifie: true });
    expect(p.gestes).toEqual([
      'ouvrir',
      'lire_attribution',
      'creer_rattachement',
      'journaliser',
      'valider',
      'notifier',
    ]);
    expect(p.evenements).toEqual([
      {
        type: 'rattachement_manuel_modifie',
        agregat: 'attribution',
        agregatId: ATTRIBUTION,
        survenuAt: new Date('2026-10-03T09:00:00.000Z'),
        charge: {
          rattachementId: 'r-1',
          vers: 'decide',
          acteur: { par: 'utilisateur_console', id: QUALIFIEUR },
        },
      },
    ]);
    expect(p.notifications).toEqual([
      {
        apporteurId: APPORTEUR,
        demande: {
          cle: 'rattachement_decide',
          a: 'apporteur@exemple.invalid',
          parametres: {
            entreprise: 'Entreprise Essai',
            decision: 'La commande est rattachée à votre attribution',
            motif: 'la société commandeuse est une filiale de celle que vous avez déclarée',
          },
          attributionId: ATTRIBUTION,
        },
      },
    ]);
  });

  it('REQ-DM-034 : une attribution portée par un conseiller n’a pas d’apporteur à notifier : la décision s’écrit, rien ne part', async () => {
    const p = ports(null);
    expect(await deciderLeRattachement(decision(), p.ports)).toEqual({
      rattachementId: 'r-1',
      notifie: false,
    });
    expect(p.notifications).toEqual([]);
  });
});

describe('REQ-DM-034 — les refus, AVANT toute écriture', () => {
  it.each([
    ['motif', 'voir https://exemple.invalid/preuve'],
    ['motif', 'voir www.exemple.invalid'],
    ['decision', 'rattachée, détails sur exemple.fr'],
  ] as const)(
    'REQ-DM-034 : TÉMOIN — un lien dans {%s} est refusé à la saisie, sans transaction ni notification',
    async (parametre, texte) => {
      const p = ports();
      const base = decision();
      const e = await refus(
        deciderLeRattachement(
          decision({ notification: { ...base.notification, [parametre]: texte } }),
          p.ports
        )
      );
      expect(e).toBeInstanceOf(LienDansUnParametre);
      expect(e.message).toBe(`lien_dans_un_parametre : ${parametre}`);
      expect(p.gestes).toEqual([]);
    }
  );

  it('REQ-DM-034 : TÉMOIN — une justification de 19 caractères utiles est refusée, sans transaction', async () => {
    const p = ports();
    const e = await refus(
      deciderLeRattachement(decision({ justification: 'x'.repeat(19) }), p.ports)
    );
    expect(e.message).toBe('justification_trop_courte : 19 caractères utiles sur 20');
    expect(p.gestes).toEqual([]);
  });

  it('REQ-DM-034 : TÉMOIN — un lien de contrôle postérieur au dépôt est refusé dans la transaction, avant toute écriture', async () => {
    const p = ports();
    const e = await refus(
      deciderLeRattachement(
        decision({ lienControleEtabliAt: new Date(DEPOT.getTime() + 1) }),
        p.ports
      )
    );
    expect(e.message).toBe('lien_posterieur_au_depot');
    expect(p.gestes).toEqual(['ouvrir', 'lire_attribution']);
    expect(p.notifications).toEqual([]);
  });
});
