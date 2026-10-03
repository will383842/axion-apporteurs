// @req REQ-UX-016
/**
 * DM-61 — une notification de l'espace reste visible douze mois après son envoi, puis elle est
 * supprimée, en base RÉELLE (forme d'A02, décision de Williams du 2026-10-03).
 *
 * CE QU'IL PROUVE :
 *   1. sous l'échéance, la notification est gardée ; au-delà, elle est supprimée — à la milliseconde ;
 *   2. les préférences (`preferences_notification`) et les courriels (`courriels_envoyes`), preuve
 *      d'un délai, ne sont pas touchés ;
 *   3. un second passage est sans effet ;
 *   4. la suppression avance par lots bornés, et vide tout ce qui est échu ;
 *   5. l'index `notifications_espace_cree_at_idx` existe sur `cree_at`.
 * La purge passe sous `partners_app`, provisionné comme en production ; les fixtures et les lectures
 * restent sous le propriétaire.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  LOT_DE_PURGE_DES_NOTIFICATIONS,
  limiteDeConservationDesNotifications,
  purgerLesNotificationsDeLEspace,
} from '../../src/server/taches/purger-notifications-espace';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');
const LIMITE = limiteDeConservationDesNotifications(MAINTENANT);
const MS = 1;
const hex = (octets: number) => randomBytes(octets).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
  ).id;
}

async function uneNotification(apporteurId: string, creeAt: Date): Promise<string> {
  return (
    await base.prisma.notificationEspace.create({
      data: { apporteurId, cle: 'refus_declaration', creeAt },
    })
  ).id;
}

const existe = async (id: string) =>
  (await base.prisma.notificationEspace.count({ where: { id } })) === 1;

describe('REQ-UX-016 — DM-61 : douze mois dans l’espace, puis la suppression', () => {
  it('REQ-UX-016 : TÉMOIN — à l’échéance, gardée ; une milliseconde au-delà, supprimée ; un second passage est sans effet', async () => {
    const a = await unApporteur();
    const recente = await uneNotification(a, new Date(MAINTENANT.getTime() - 60 * 1000));
    const pile = await uneNotification(a, LIMITE);
    const echue = await uneNotification(a, new Date(LIMITE.getTime() - MS));
    const premier = await purgerLesNotificationsDeLEspace(app, MAINTENANT);
    expect(premier.supprimees).toBeGreaterThanOrEqual(1);
    expect([await existe(recente), await existe(pile), await existe(echue)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(await purgerLesNotificationsDeLEspace(app, MAINTENANT)).toEqual({ supprimees: 0 });
    expect([await existe(recente), await existe(pile)]).toEqual([true, true]);
  });

  it('REQ-UX-016 : les préférences et les courriels envoyés ne sont pas touchés', async () => {
    const a = await unApporteur();
    await uneNotification(a, new Date(LIMITE.getTime() - MS));
    // Bien plus ancienne que l'échéance : la purge des notifications ne doit pas l'atteindre.
    const ancienne = new Date('2025-01-01T00:00:00.000Z');
    await base.prisma.preferenceNotification.create({
      data: { apporteurId: a, cle: 'rappel_rc_pro', active: false, modifieeAt: ancienne },
    });
    await base.prisma.courrielEnvoye.create({
      data: {
        gabarit: 'refus_declaration',
        emailHash: hex(32),
        apporteurId: a,
        statut: 'retenu_dmarc_non_verifie',
        demandeAt: ancienne,
      },
    });
    await purgerLesNotificationsDeLEspace(app, MAINTENANT);
    expect(await base.prisma.notificationEspace.count({ where: { apporteurId: a } })).toBe(0);
    expect(await base.prisma.preferenceNotification.count({ where: { apporteurId: a } })).toBe(1);
    expect(await base.prisma.courrielEnvoye.count({ where: { apporteurId: a } })).toBe(1);
  });

  it('REQ-UX-016 : TÉMOIN — par lots bornés, la purge vide TOUT ce qui est échu', async () => {
    const a = await unApporteur();
    const n = LOT_DE_PURGE_DES_NOTIFICATIONS + 1;
    await base.prisma.notificationEspace.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        apporteurId: a,
        cle: 'refus_declaration',
        creeAt: new Date(LIMITE.getTime() - MS - i),
      })),
    });
    const { supprimees } = await purgerLesNotificationsDeLEspace(app, MAINTENANT);
    expect(supprimees).toBeGreaterThanOrEqual(n);
    expect(await base.prisma.notificationEspace.count({ where: { apporteurId: a } })).toBe(0);
  });

  it('REQ-UX-016 : l’index notifications_espace_cree_at_idx porte sur cree_at', async () => {
    const lignes = await base.prisma.$queryRaw<{ def: string }[]>`
      SELECT indexdef AS def FROM pg_indexes
      WHERE tablename = 'notifications_espace' AND indexname = 'notifications_espace_cree_at_idx'`;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.def).toMatch(/\(cree_at\)/);
  });
});
