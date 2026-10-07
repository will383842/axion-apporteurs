// @req REQ-SEC-042
/**
 * SEC-51 (REQ-SEC-042) — la garde de la réserve en base RÉELLE, sous le rôle du serveur
 * (`partners_app`) : elle est rejugée DANS la transaction de l'action, sur des faits lus en base, et
 * un état illisible (une transaction avortée par la base) refuse sous le même code. Le port de ce
 * spec lit les vérifications d'apporteur ; les appelants de la garde lient le leur à leur propre
 * transaction (avis de la sécurité, point 2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  CODE_ENTREPRISE_RESERVEE,
  exigerHorsReserve,
  type PortsDeLaGarde,
} from '../../src/server/demarchage/garde-reserve';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';

let base: Base;
let app: PrismaClient;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-03T12:00:00.000Z');
const JOURS = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;
const unSiren = () => String(randomInt(100_000_000, 999_999_999));

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  apporteurId = (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${randomBytes(3).toString('hex').toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: MAINTENANT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une vérification d'apporteur sur un SIREN, `joursAvant` jours avant MAINTENANT. */
async function verifier(siren: string, joursAvant: number, resultat: 'libre' | 'cliente') {
  await base.prisma.verification.create({
    data: {
      apporteurId,
      siren,
      resultat,
      verifieeAt: new Date(MAINTENANT.getTime() - joursAvant * MS_PAR_JOUR),
    },
  });
}

/** Le port lié à la transaction de l'appelant : les vérifications d'apporteur du SIREN. */
function portDe(tx: Prisma.TransactionClient): PortsDeLaGarde {
  return {
    async lireLesFaits(siren) {
      const lignes = await tx.$queryRaw<{ verifiee_at: Date; resultat: string }[]>`
        SELECT verifiee_at, resultat::text AS resultat FROM verifications
        WHERE siren = ${siren} AND apporteur_id IS NOT NULL`;
      return {
        actes: lignes.map((l) => ({ at: l.verifiee_at, exempte: l.resultat !== 'libre' })),
        confirmationEnCours: false,
      };
    },
  };
}

const demarcher = (siren: string) =>
  app.$transaction((tx) =>
    exigerHorsReserve(portDe(tx), { siren, nature: 'demarchage' }, MAINTENANT)
  );

describe('REQ-SEC-042 — la garde jugée en base réelle', () => {
  it('REQ-SEC-042 : TÉMOIN — une entreprise vérifiée par un apporteur hier : refus NOMMÉ, dans la transaction', async () => {
    const siren = unSiren();
    await verifier(siren, 1, 'libre');
    await expect(demarcher(siren)).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : TÉMOIN — la réserve échue : l’action passe ; un acte exempté (cliente) ne réserve rien', async () => {
    const echue = unSiren();
    await verifier(echue, JOURS, 'libre');
    await expect(demarcher(echue)).resolves.toBeUndefined();
    const exemptee = unSiren();
    await verifier(exemptee, 1, 'cliente');
    await expect(demarcher(exemptee)).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : un appel de VÉRIFICATION pendant la réserve passe', async () => {
    const siren = unSiren();
    await verifier(siren, 1, 'libre');
    await expect(
      app.$transaction((tx) =>
        exigerHorsReserve(portDe(tx), { siren, nature: 'verification' }, MAINTENANT)
      )
    ).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : TÉMOIN — ÉCHEC FERMÉ : la base refuse une lecture (transaction avortée), le démarchage est refusé sous le même code', async () => {
    const siren = unSiren();
    await expect(
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1/0`.catch(() => undefined);
        await exigerHorsReserve(portDe(tx), { siren, nature: 'demarchage' }, MAINTENANT);
      })
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });
});
