// @req REQ-DM-006
// @req REQ-DM-007
// @req REQ-QA-027
/**
 * DM-13 — le passage des échéances, en process (faux client) : ce qu'il présélectionne, ce qu'il
 * rejuge sous le verrou, ce qu'il retient en ÉCHEC FERMÉ, et ce qu'il demande aux écrivains.
 *
 * Ce que le fichier tient :
 *   — la présélection ne porte que sur ce qui peut s'exécuter : la fin faute d'adresse valide, la file
 *     d'attente, la péremption d'une prise en charge ; jamais une expiration à 6 mois ni la péremption
 *     d'un apporteur (échecs fermés, juriste 6037008645 ; coordination) ;
 *   — chaque attribution dans SA transaction, ligne verrouillée, faits relus, règle rejugée ;
 *   — la transition passe par l'écrivain unique, acteur système ; la fin faute d'adresse valide
 *     expire aussi la demande, dans la même transaction.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ECHEANCES_PAR_PASSAGE,
  appliquerLesEcheances,
} from '../../../src/server/jobs/attribution-echeances';
import { ajouterJoursCivilsParis } from '../../../src/domain/temps/sla';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const DEPOT = new Date(Date.UTC(2027, 1, 1, 9, 0));
const FIN_45 = new Date(
  ajouterJoursCivilsParis(DEPOT.getTime(), SEUILS.LIBERATION_SIGNALEE_JOURS.valeur)
);
const JOUR = 86_400_000;

type Ligne = {
  id: string;
  statut: string;
  apporteur_id: string | null;
  deposee_at: Date;
  peremption_at: Date | null;
  fenetre_fin_at: Date | null;
  fenetre_redeclaration_fin_at: Date | null;
  etat: string | null;
};

const ligne = (o: Partial<Ligne> = {}): Ligne => ({
  id: 'a-1',
  statut: 'provisoire',
  apporteur_id: 'ap-1',
  deposee_at: DEPOT,
  peremption_at: null,
  fenetre_fin_at: null,
  fenetre_redeclaration_fin_at: null,
  etat: 'rebond',
  ...o,
});

function unClient(lues: Ligne[], sousLeVerrou: Record<string, Ligne> = {}) {
  const appels: string[] = [];
  const lire = (id: string) => sousLeVerrou[id] ?? lues.find((l) => l.id === id)!;
  const tx = {
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, id: string) => {
      appels.push(`verrou:${id}`);
      return [lire(id)];
    }),
    demandeConfirmation: {
      findUnique: vi.fn(async (a: { where: { attributionId: string } }) => {
        const l = lire(a.where.attributionId);
        return l.etat === null ? null : { etat: l.etat };
      }),
    },
  };
  const findMany = vi.fn(async (_a: unknown) => lues.map((l) => ({ id: l.id })));
  const prisma = {
    attribution: { findMany },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      appels.push('transaction');
      return fn(tx);
    }),
  } as unknown as PrismaClient;
  const transitionner = vi.fn(
    async (_tx: unknown, d: { attributionId: string; transition: string }) => {
      appels.push(`${d.transition}:${d.attributionId}`);
      return { de: 'provisoire' as const, vers: 'perimee' as const };
    }
  );
  const expirerLaDemande = vi.fn(async (_tx: unknown, attributionId: string) => {
    appels.push(`demande_expiree:${attributionId}`);
  });
  return { prisma, findMany, transitionner, expirerLaDemande, appels };
}

const options = (c: ReturnType<typeof unClient>) => ({
  transitionner: c.transitionner,
  expirerLaDemande: c.expirerLaDemande,
});

describe('REQ-DM-006 — le passage des échéances', () => {
  it('REQ-DM-006 : TÉMOIN — fin faute d’adresse valide : la transition par le système, puis la demande expirée, dans la MÊME transaction', async () => {
    const c = unClient([ligne()]);
    expect(await appliquerLesEcheances(c.prisma, FIN_45, options(c))).toEqual({
      appliquees: 1,
      echecs: 0,
    });
    expect(c.appels).toEqual([
      'transaction',
      'verrou:a-1',
      'fin_sans_adresse_valide:a-1',
      'demande_expiree:a-1',
    ]);
    expect(c.transitionner.mock.calls[0]![1]).toEqual({
      attributionId: 'a-1',
      transition: 'fin_sans_adresse_valide',
      acteur: { par: 'systeme' },
      maintenant: FIN_45,
    });
    expect(c.expirerLaDemande.mock.calls[0]!.slice(1)).toEqual(['a-1', FIN_45]);
  });

  it('REQ-DM-006 : TÉMOIN — rejugée SOUS LE VERROU : une adresse corrigée entre-temps, ou une ligne qui n’est plus provisoire, ne prend pas fin', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' }), ligne({ id: 'a-3' })], {
      'a-1': ligne({ id: 'a-1', etat: 'envoyee' }),
      'a-2': ligne({ id: 'a-2', statut: 'active' }),
    });
    expect(await appliquerLesEcheances(c.prisma, FIN_45, options(c))).toEqual({
      appliquees: 1,
      echecs: 0,
    });
    expect(c.transitionner.mock.calls.map((x) => x[1].attributionId)).toEqual(['a-3']);
  });

  it('REQ-DM-004 : la file : le délai de redéclaration écoulé expire la déclaration en attente, sans toucher à aucune demande', async () => {
    const c = unClient([
      ligne({
        statut: 'en_attente',
        etat: null,
        fenetre_redeclaration_fin_at: new Date(FIN_45.getTime() - JOUR),
      }),
    ]);
    await appliquerLesEcheances(c.prisma, FIN_45, options(c));
    expect(c.appels).toEqual(['transaction', 'verrou:a-1', 'file_expiree:a-1']);
  });

  it('REQ-DM-007 : la péremption d’une PRISE EN CHARGE s’exécute', async () => {
    const PRISE = DEPOT;
    const c = unClient([
      ligne({ statut: 'active', apporteur_id: null, etat: null, deposee_at: PRISE }),
    ]);
    const echeance = new Date(PRISE.getTime() + SEUILS.PEREMPTION_JOURS.valeur * JOUR);
    await appliquerLesEcheances(c.prisma, echeance, options(c));
    expect(c.appels).toContain('perimee:a-1');
  });

  it('REQ-DM-007 : TÉMOIN — échecs fermés : la péremption d’un APPORTEUR et l’expiration à 6 mois, DUES, ne s’exécutent pas', async () => {
    const c = unClient([
      ligne({ id: 'p', statut: 'active', etat: 'envoyee', peremption_at: DEPOT }),
      ligne({ id: 'x', statut: 'signee', etat: 'envoyee', fenetre_fin_at: DEPOT }),
    ]);
    expect(await appliquerLesEcheances(c.prisma, FIN_45, options(c))).toEqual({
      appliquees: 0,
      echecs: 0,
    });
    expect(c.transitionner).not.toHaveBeenCalled();
  });

  it('REQ-DM-007 : la présélection ne demande ni l’expiration ni la péremption d’un apporteur', async () => {
    const c = unClient([]);
    await appliquerLesEcheances(c.prisma, FIN_45, options(c));
    const where = (c.findMany.mock.calls[0]![0] as { where: { OR: Record<string, unknown>[] } })
      .where;
    expect(where.OR.map((o) => o.statut)).toEqual(['provisoire', 'en_attente', 'active']);
    expect(where.OR[2]).toMatchObject({ statut: 'active', apporteurId: null });
    expect(where.OR[0]).toMatchObject({
      statut: 'provisoire',
      apporteurId: { not: null },
      demandeConfirmation: { is: { etat: 'rebond' } },
    });
  });
});

describe('REQ-DM-006 — une échéance n’en bloque jamais une autre', () => {
  it('REQ-DM-006 : TÉMOIN — un échec sur la première ligne est COMPTÉ, et la seconde est quand même appliquée', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' })]);
    c.transitionner.mockRejectedValueOnce(new Error('transition_refusee'));
    expect(await appliquerLesEcheances(c.prisma, FIN_45, options(c))).toEqual({
      appliquees: 1,
      echecs: 1,
    });
    expect(c.transitionner.mock.calls.map((x) => x[1].attributionId)).toEqual(['a-1', 'a-2']);
  });

  it('REQ-DM-006 : la lecture des candidates est BORNÉE', async () => {
    const c = unClient([]);
    await appliquerLesEcheances(c.prisma, FIN_45, options(c));
    expect((c.findMany.mock.calls[0]![0] as { take: number }).take).toBe(ECHEANCES_PAR_PASSAGE);
  });
});

describe('REQ-DM-006 — une alerte d’exploitation quand le passage compte des échecs (sécurité, note sur #802)', () => {
  it('REQ-DM-006 : TÉMOIN — un échec : un warn NOMMÉ « attribution_echeances_echecs », avec le nombre SEUL', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' })]);
    c.transitionner.mockRejectedValueOnce(new Error('transition_refusee'));
    const journal = { warn: vi.fn() };
    await appliquerLesEcheances(c.prisma, FIN_45, { ...options(c), journal });
    expect(journal.warn).toHaveBeenCalledTimes(1);
    expect(journal.warn).toHaveBeenCalledWith('attribution_echeances_echecs', { echecs: 1 });
    // Aucun identifiant ne sort : ni d'attribution, ni d'apporteur.
    expect(JSON.stringify(journal.warn.mock.calls)).not.toMatch(/a-1|a-2|ap-1/);
  });

  it('REQ-DM-006 : sans échec, aucune alerte', async () => {
    const c = unClient([ligne({ id: 'a-1' }), ligne({ id: 'a-2' })]);
    const journal = { warn: vi.fn() };
    await appliquerLesEcheances(c.prisma, FIN_45, { ...options(c), journal });
    expect(journal.warn).not.toHaveBeenCalled();
  });
});
