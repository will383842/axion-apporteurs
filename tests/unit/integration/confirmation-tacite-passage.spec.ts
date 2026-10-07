// @req REQ-DM-006
// @req REQ-DM-042
/**
 * DM-24 — le passage de la confirmation tacite, en process (faux client) : ce qu'il sélectionne, ce
 * qu'il rejuge sous le verrou, et ce qu'il demande à l'écrivain des transitions.
 *
 * Ce que le fichier tient :
 *   — la présélection : provisoires, portées par un APPORTEUR, jamais par un conseiller (W19) ;
 *   — chaque attribution est rejugée dans SA transaction, sous le verrou de sa ligne : une ligne qui
 *     n'est plus provisoire, ou une demande passée en erreur, n'est pas confirmée ;
 *   — la confirmation passe par l'écrivain unique (`confirmerUneAttribution`), avec
 *     `confirmee_tacitement` et l'acteur système : l'événement est écrit DANS la même transaction.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { confirmerTacitementLesEchues } from '../../../src/server/jobs/confirmation-tacite';
import { ajouterJoursCivilsParis } from '../../../src/domain/temps/sla';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const DEPOT = new Date(Date.UTC(2027, 1, 1, 9, 0));
const ENVOI = new Date(Date.UTC(2027, 1, 2, 9, 0));
const ECHEANCE = new Date(
  ajouterJoursCivilsParis(ENVOI.getTime(), SEUILS.CONFIRMATION_TACITE_JOURS.valeur)
);
const MINUTE = 60_000;

type Ligne = {
  id: string;
  statut: string;
  deposeeAt: Date;
  etat: string | null;
  emissions: { emiseAt: Date; revoqueeAt: Date | null }[];
};

const ligne = (o: Partial<Ligne> = {}): Ligne => ({
  id: 'a-1',
  statut: 'provisoire',
  deposeeAt: DEPOT,
  etat: 'envoyee',
  emissions: [{ emiseAt: ENVOI, revoqueeAt: null }],
  ...o,
});

/** Un faux client : `lues` à la présélection, `sousLeVerrou` relue dans la transaction. */
function unClient(lues: Ligne[], sousLeVerrou: Record<string, Ligne> = {}) {
  const appels: string[] = [];
  const lire = (id: string) => sousLeVerrou[id] ?? lues.find((l) => l.id === id)!;
  const tx = {
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, id: string) => {
      appels.push(`verrou:${id}`);
      const l = lire(id);
      return [{ statut: l.statut, deposee_at: l.deposeeAt }];
    }),
    demandeConfirmation: {
      findUnique: vi.fn(async (args: { where: { attributionId: string } }) => {
        const l = lire(args.where.attributionId);
        return l.etat === null ? null : { etat: l.etat, emissions: l.emissions };
      }),
    },
  };
  const findMany = vi.fn(async () => lues.map((l) => ({ id: l.id })));
  const prisma = {
    attribution: { findMany },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      appels.push('transaction');
      return fn(tx);
    }),
  } as unknown as PrismaClient;
  const confirmer = vi.fn(async (_tx: unknown, d: { attributionId: string }) => {
    appels.push(`confirmer:${d.attributionId}`);
    return { vers: 'active' as const };
  });
  return { prisma, findMany, confirmer, appels };
}

describe('REQ-DM-006 — le passage de la confirmation tacite', () => {
  it('REQ-DM-042 : TÉMOIN — à l’échéance, l’écrivain confirme tacitement, par le système, sans commande rattachée', async () => {
    const c = unClient([ligne()]);
    expect(
      await confirmerTacitementLesEchues(c.prisma, ECHEANCE, { confirmer: c.confirmer })
    ).toEqual({ confirmees: 1 });
    expect(c.confirmer).toHaveBeenCalledTimes(1);
    expect(c.confirmer.mock.calls[0]![1]).toEqual({
      attributionId: 'a-1',
      transition: 'confirmee_tacitement',
      acteur: { par: 'systeme' },
      maintenant: ECHEANCE,
      commandeValableRattachee: false,
    });
    expect(c.appels).toEqual(['transaction', 'verrou:a-1', 'confirmer:a-1']);
  });

  it('REQ-DM-006 : TÉMOIN — à l’échéance moins une minute, rien', async () => {
    const c = unClient([ligne()]);
    const r = await confirmerTacitementLesEchues(c.prisma, new Date(ECHEANCE.getTime() - MINUTE), {
      confirmer: c.confirmer,
    });
    expect(r).toEqual({ confirmees: 0 });
    expect(c.confirmer).not.toHaveBeenCalled();
  });

  it('REQ-DM-006 : la présélection : provisoires, portées par un apporteur, jamais par un conseiller', async () => {
    const c = unClient([]);
    await confirmerTacitementLesEchues(c.prisma, ECHEANCE, { confirmer: c.confirmer });
    const args = c.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(args.where).toMatchObject({
      statut: 'provisoire',
      apporteurId: { not: null },
      utilisateurConsoleId: null,
    });
    // La borne : aucune attribution déposée depuis moins de CONFIRMATION_TACITE_JOURS - 1 jours ne
    // peut être échue ; la marge d'un jour couvre le changement d'heure.
    const borne = (args.where.deposeeAt as { lte: Date }).lte;
    expect(borne.getTime()).toBeGreaterThan(
      ECHEANCE.getTime() - SEUILS.CONFIRMATION_TACITE_JOURS.valeur * 86_400_000
    );
    expect(borne.getTime()).toBeLessThanOrEqual(ECHEANCE.getTime());
  });

  it('REQ-DM-006 : TÉMOIN — rejugée SOUS LE VERROU : une ligne qui n’est plus provisoire, ou une demande passée en erreur, n’est pas confirmée', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' }), ligne({ id: 'a-3' })], {
      'a-1': ligne({ id: 'a-1', statut: 'active' }),
      'a-2': ligne({ id: 'a-2', etat: 'rebond' }),
    });
    const r = await confirmerTacitementLesEchues(c.prisma, ECHEANCE, { confirmer: c.confirmer });
    expect(r).toEqual({ confirmees: 1 });
    expect(c.confirmer.mock.calls.map((x) => x[1].attributionId)).toEqual(['a-3']);
  });

  it('REQ-DM-006 : chaque attribution dans SA transaction', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' })]);
    await confirmerTacitementLesEchues(c.prisma, ECHEANCE, { confirmer: c.confirmer });
    expect(c.appels).toEqual([
      'transaction',
      'verrou:a-1',
      'confirmer:a-1',
      'transaction',
      'verrou:a-2',
      'confirmer:a-2',
    ]);
  });

  it('REQ-DM-006 : sans aucune demande, le défaut de prise de contact fait courir le délai', async () => {
    const tard = new Date(
      ajouterJoursCivilsParis(
        ajouterJoursCivilsParis(DEPOT.getTime(), SEUILS.PRISE_DE_CONTACT_SOCIETE_JOURS.valeur),
        SEUILS.CONFIRMATION_TACITE_JOURS.valeur
      )
    );
    const c = unClient([ligne({ etat: null, emissions: [] })]);
    expect(
      await confirmerTacitementLesEchues(c.prisma, new Date(tard.getTime() - MINUTE), {
        confirmer: c.confirmer,
      })
    ).toEqual({ confirmees: 0 });
    expect(await confirmerTacitementLesEchues(c.prisma, tard, { confirmer: c.confirmer })).toEqual({
      confirmees: 1,
    });
  });
});
