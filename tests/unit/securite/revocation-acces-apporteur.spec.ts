// @req REQ-SEC-073
/**
 * `revocation-acces-apporteur.spec.ts` — SEC-71, la révocation de l'accès d'un apporteur par la console
 * (contrat v2, art. 3.8), EN PROCESSUS, sur un faux client : le motif fermé jugé avant toute écriture,
 * le droit relu en base, le statut verrouillé, et dans UNE transaction la version de session
 * incrémentée, les appareils oubliés, les jetons de dépôt et les liens non consommés révoqués,
 * l'événement journalisé et le renouvellement mis en file. Un résilié est refusé sans rien écrire
 * (juriste, #474, 6034493150). Aucune écriture ne touche une attribution ni une commission. La base
 * réelle est jugée par `tests/integration/revocation-acces-apporteur.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ErreurRevocationAcces,
  revoquerLAccesDUnApporteur,
  type ActeurDeLaRevocation,
} from '../../../src/server/console/acces-apporteur';
import { ajouterEvenement } from '../../../src/server/evenement/journal';

vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));

const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const VALIDE = new Date('2026-01-01T00:00:00.000Z');
const ADMIN: ActeurDeLaRevocation = { id: '0190f0f0-0000-7000-8000-00000000000a', role: 'admin' };
const APP = '0190f0f0-0000-7000-8000-0000000000a1';

type Lu = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

/** Un faux client : l'acteur relu, le statut verrouillé de l'apporteur, et chaque écriture, dans l'ordre. */
function univers(o: { acteur?: Lu; statut?: string | null } = {}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const acteurLu: Lu =
    o.acteur === undefined ? { role: 'admin', desactiveAt: null, valideAt: VALIDE } : o.acteur;
  const statut = o.statut === undefined ? 'signe' : o.statut;
  const note =
    (quoi: string, rendu: unknown = { count: 1 }) =>
    async (args: unknown) => {
      appels.push({ quoi, args });
      return rendu;
    };
  const tx = {
    utilisateurConsole: {
      findUnique: note('utilisateurConsole.findUnique', acteurLu),
    },
    $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ quoi: '$queryRaw', args: { sql: gabarit.join('?'), valeurs } });
      return statut === null ? [] : [{ statut }];
    },
    apporteur: { update: note('apporteur.update') },
    appareilConnu: { deleteMany: note('appareilConnu.deleteMany', { count: 2 }) },
    jetonDepot: { updateMany: note('jetonDepot.updateMany') },
    lienMagique: { updateMany: note('lienMagique.updateMany', { count: 3 }) },
    notificationEspace: { create: note('notificationEspace.create', { id: 'n1' }) },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels };
}

const revoquer = (client: PrismaClient, motif: string = 'signalement_apporteur') =>
  revoquerLAccesDUnApporteur(client, {
    acteur: ADMIN,
    apporteurId: APP,
    motif: motif as 'signalement_apporteur',
    maintenant: MAINTENANT,
  });

const refus = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e).toBeInstanceOf(ErreurRevocationAcces);
  return (e as ErreurRevocationAcces).motif;
};

beforeEach(() => {
  vi.mocked(ajouterEvenement).mockReset();
  vi.mocked(ajouterEvenement).mockResolvedValue({ id: '42', selfHash: 'h' });
});

describe('REQ-SEC-073 — la révocation de l’accès d’un apporteur : une transaction, rien d’autre', () => {
  it('REQ-SEC-073 : TÉMOIN — sessions, appareils, jetons et liens révoqués dans UNE transaction, puis le journal et la file', async () => {
    const { client, appels } = univers();
    expect(await revoquer(client)).toEqual({
      appareilsOublies: 2,
      liensAnnules: 3,
      jetonsRevoques: 1,
    });
    expect(appels.map((a) => a.quoi)).toEqual([
      '$transaction',
      'utilisateurConsole.findUnique',
      '$queryRaw',
      'apporteur.update',
      'appareilConnu.deleteMany',
      'jetonDepot.updateMany',
      'lienMagique.updateMany',
      'notificationEspace.create',
    ]);
    const args = (quoi: string) => appels.find((a) => a.quoi === quoi)!.args;
    expect(args('$queryRaw')).toMatchObject({ valeurs: [APP] });
    expect((args('$queryRaw') as { sql: string }).sql).toContain('FOR UPDATE');
    expect(args('apporteur.update')).toEqual({
      where: { id: APP },
      data: { sessionVersion: { increment: 1 } },
    });
    expect(args('appareilConnu.deleteMany')).toEqual({ where: { apporteurId: APP } });
    expect(args('jetonDepot.updateMany')).toEqual({
      where: { apporteurId: APP, revoqueAt: null },
      data: { revoqueAt: MAINTENANT },
    });
    expect(args('lienMagique.updateMany')).toEqual({
      where: { apporteurId: APP, consommeAt: null, annuleAt: null },
      data: { annuleAt: MAINTENANT },
    });
    expect(args('notificationEspace.create')).toEqual({
      data: { apporteurId: APP, cle: 'acces_renouvele', evenementId: 42n },
    });
  });

  it('REQ-SEC-073 : TÉMOIN — l’événement porte le motif fermé et l’acteur de la console, l’instant du GESTE, et rien d’autre', async () => {
    const { client } = univers();
    await revoquer(client, 'securite');
    expect(ajouterEvenement).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ajouterEvenement).mock.calls[0]![1]).toEqual({
      type: 'apporteur_acces_revoque',
      agregat: 'apporteur',
      agregatId: APP,
      survenuAt: MAINTENANT,
      charge: { motif: 'securite', acteur: { par: 'utilisateur_console', id: ADMIN.id } },
    });
  });

  it('REQ-SEC-073 : TÉMOIN — un motif hors des deux est refusé AVANT toute transaction', async () => {
    for (const motif of ['', 'sanction', 'suspension', 'SECURITE']) {
      const { client, appels } = univers();
      expect(await refus(revoquer(client, motif))).toBe('motif_invalide');
      expect(appels).toEqual([]);
    }
  });

  it('REQ-SEC-073 : TÉMOIN — un résilié est refusé (contrat_termine) : rien n’est écrit, ni journal ni file', async () => {
    const { client, appels } = univers({ statut: 'resilie' });
    expect(await refus(revoquer(client))).toBe('contrat_termine');
    expect(appels.map((a) => a.quoi)).toEqual([
      '$transaction',
      'utilisateurConsole.findUnique',
      '$queryRaw',
    ]);
    expect(ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-SEC-073 : un apporteur en préavis, suspendu ou en cours de KYC est encore sous contrat ou en parcours : le geste s’applique', async () => {
    for (const statut of ['signe', 'suspendu', 'kyc_en_cours', 'pret_a_signer']) {
      const { client, appels } = univers({ statut });
      await revoquer(client);
      expect(appels.at(-1)!.quoi).toBe('notificationEspace.create');
    }
  });

  it('REQ-SEC-073 : TÉMOIN — un apporteur inconnu est refusé sans rien écrire', async () => {
    const { client, appels } = univers({ statut: null });
    expect(await refus(revoquer(client))).toBe('apporteur_inconnu');
    expect(appels.map((a) => a.quoi)).not.toContain('apporteur.update');
  });

  it('REQ-SEC-073 : TÉMOIN — le droit est RELU en base : un admin désactivé, non validé, d’un autre rôle, ou inconnu est refusé', async () => {
    for (const acteur of [
      null,
      { role: 'admin', desactiveAt: VALIDE, valideAt: VALIDE },
      { role: 'admin', desactiveAt: null, valideAt: null },
      { role: 'conseiller', desactiveAt: null, valideAt: VALIDE },
    ]) {
      const { client, appels } = univers({ acteur });
      expect(await refus(revoquer(client))).toBe('droit_absent');
      expect(appels.map((a) => a.quoi)).toEqual(['$transaction', 'utilisateurConsole.findUnique']);
    }
  });

  it('REQ-SEC-073 : TÉMOIN — un acteur jugé hors de la matrice est refusé avant toute lecture', async () => {
    const { client, appels } = univers();
    const e = await revoquerLAccesDUnApporteur(client, {
      acteur: { id: ADMIN.id, role: 'conseiller' },
      apporteurId: APP,
      motif: 'securite',
      maintenant: MAINTENANT,
    }).then(
      () => null,
      (x: unknown) => x
    );
    expect((e as ErreurRevocationAcces).motif).toBe('droit_absent');
    expect(appels.map((a) => a.quoi)).toEqual(['$transaction']);
  });

  it('REQ-SEC-073 : TÉMOIN — aucune écriture ne touche une attribution, une commission, une autofacture ni le statut', async () => {
    const { client, appels } = univers();
    await revoquer(client);
    const ecrites = appels.map((a) => a.quoi.split('.')[0]);
    for (const interdit of ['attribution', 'commission', 'autofacture', 'anomalie', 'depot'])
      expect(ecrites).not.toContain(interdit);
    const maj = appels.find((a) => a.quoi === 'apporteur.update')!.args as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(maj.data)).toEqual(['sessionVersion']);
  });
});
