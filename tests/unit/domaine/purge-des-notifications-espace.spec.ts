// @req REQ-UX-016
/**
 * La purge des notifications de l'espace (DM-61, REQ-UX-016), jugée sans base : un faux client
 * enregistre chaque lecture et chaque suppression. La base réelle est jouée par le témoin
 * d'intégration (`tests/integration/notifications-espace-purge.spec.ts`) ; ce fichier tient la
 * boucle, les lots, l'ordre, la limite et l'arrêt sur une suppression vide.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  LOT_DE_PURGE_DES_NOTIFICATIONS,
  limiteDeConservationDesNotifications,
  purgerLesNotificationsDeLEspace,
} from '../../../src/server/taches/purger-notifications-espace';

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');

type Lecture = { where: unknown; select: unknown; orderBy: unknown; take: unknown };

/** Un faux client : rend les lots donnés dans l'ordre, puis vide ; chaque suppression rend `compte`. */
function fauxClient(lots: number[], compte: (n: number) => number = (n) => n) {
  const lectures: Lecture[] = [];
  const suppressions: string[][] = [];
  let rang = 0;
  const client = {
    notificationEspace: {
      findMany: async (a: Lecture) => {
        lectures.push(a);
        const n = lots[rang] ?? 0;
        rang += 1;
        return Array.from({ length: n }, (_, i) => ({ id: `n-${rang}-${i}` }));
      },
      deleteMany: async (a: { where: { id: { in: string[] } } }) => {
        suppressions.push(a.where.id.in);
        return { count: compte(a.where.id.in.length) };
      },
    },
  } as unknown as PrismaClient;
  return { client, lectures, suppressions };
}

describe('REQ-UX-016 — la purge des notifications de l’espace, par lots bornés', () => {
  it('REQ-UX-016 : la limite est douze mois civils avant maintenant, lue dans la SSOT', () => {
    expect(SEUILS.NOTIFICATIONS_ESPACE_CONSERVATION_MOIS.valeur).toBe(12);
    expect(limiteDeConservationDesNotifications(MAINTENANT)).toEqual(
      new Date('2026-10-03T12:00:00.000Z')
    );
    // Le calcul ne modifie pas la date reçue.
    expect(MAINTENANT.toISOString()).toBe('2027-10-03T12:00:00.000Z');
  });

  it('REQ-UX-016 : TÉMOIN — chaque lecture vise l’échu (cree_at strictement avant la limite), dans l’ordre, bornée au lot', async () => {
    const f = fauxClient([2]);
    await purgerLesNotificationsDeLEspace(f.client, MAINTENANT);
    expect(LOT_DE_PURGE_DES_NOTIFICATIONS).toBe(500);
    expect(f.lectures[0]).toEqual({
      where: { creeAt: { lt: limiteDeConservationDesNotifications(MAINTENANT) } },
      select: { id: true },
      orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_NOTIFICATIONS,
    });
  });

  it('REQ-UX-016 : TÉMOIN — la suppression porte sur les identifiants du lot lu, et sur eux seuls', async () => {
    const f = fauxClient([3]);
    await purgerLesNotificationsDeLEspace(f.client, MAINTENANT);
    expect(f.suppressions).toEqual([['n-1-0', 'n-1-1', 'n-1-2']]);
  });

  it('REQ-UX-016 : TÉMOIN — la boucle relance jusqu’à épuisement, et additionne ce qui est supprimé', async () => {
    const f = fauxClient([500, 500, 3]);
    expect(await purgerLesNotificationsDeLEspace(f.client, MAINTENANT)).toEqual({
      supprimees: 1003,
    });
    expect(f.lectures).toHaveLength(4);
    expect(f.suppressions.map((s) => s.length)).toEqual([500, 500, 3]);
  });

  it('REQ-UX-016 : le compte rendu est celui de la base, pas la taille du lot lu', async () => {
    const f = fauxClient([5, 4], (n) => n - 1);
    expect(await purgerLesNotificationsDeLEspace(f.client, MAINTENANT)).toEqual({
      supprimees: 4 + 3,
    });
  });

  it('REQ-UX-016 : rien d’échu, rien de supprimé, aucune suppression tentée', async () => {
    const f = fauxClient([]);
    expect(await purgerLesNotificationsDeLEspace(f.client, MAINTENANT)).toEqual({ supprimees: 0 });
    expect(f.lectures).toHaveLength(1);
    expect(f.suppressions).toEqual([]);
  });

  it('REQ-UX-016 : TÉMOIN — une suppression qui n’enlève rien arrête la boucle (le même lot ne se relit pas sans fin)', async () => {
    const f = fauxClient([2, 2, 2], () => 0);
    expect(await purgerLesNotificationsDeLEspace(f.client, MAINTENANT)).toEqual({ supprimees: 0 });
    expect(f.suppressions).toHaveLength(1);
    expect(f.lectures).toHaveLength(1);
  });
});
