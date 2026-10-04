// @req REQ-SEC-058
/**
 * SEC-61 — le gel des traces du journal des accès à la console, en base RÉELLE. Décision de Williams
 * du 2026-10-03 sur la conservation, avec l'exception de la juriste : une trace liée à un incident ou
 * à un litige est gardée jusqu'à sa clôture.
 *
 * TÉMOIN DE LA SÉCURITÉ, MOT POUR MOT : « la purge du journal des accès épargne une ligne gelée, et la
 * purge à la levée du gel ». Un gel OUVERT couvre les traces de l'utilisateur visé dans sa période ; la
 * purge les épargne, et la purge suivante, après la levée, les vide comme les autres.
 * Sous `partners_app`, le rôle du serveur.
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
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../src/server/taches/purger-journal-acces-console';
import { leverUnGel, poserUnGel } from '../../src/server/console/gels-journal-acces';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const PLUS_TARD = new Date('2028-06-02T12:00:00.000Z');
const IP_HASH = '0123456789abcdef';

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

async function unUtilisateur(role: 'admin' | 'lecteur'): Promise<string> {
  return (
    await base.prisma.utilisateurConsole.create({
      data: { role, creeAt: new Date('2026-01-01T00:00:00.000Z') },
    })
  ).id;
}

/** Une connexion de l'utilisateur, ÉCHUE à `MAINTENANT` : sans gel, la purge la vide. */
async function uneTraceEchue(utilisateurConsoleId: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.journalAccesConsole.create({
    data: {
      id,
      utilisateurConsoleId,
      nature: 'connexion',
      ipHash: IP_HASH,
      survenuAt: new Date(limiteDuJournalDesAcces(MAINTENANT).getTime() - 1),
    },
  });
  return id;
}

const ligne = (id: string) => base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id } });

describe('REQ-SEC-058 — les traces liées à un incident ou à un litige sont gelées jusqu’à leur clôture', () => {
  it('REQ-SEC-058 : TÉMOIN — la purge du journal des accès épargne une ligne gelée, et la purge à la levée du gel', async () => {
    const poseur = await unUtilisateur('admin');
    const leveur = await unUtilisateur('admin');
    const vise = await unUtilisateur('lecteur');
    const gelee = await uneTraceEchue(vise);
    const libre = await uneTraceEchue(poseur);

    const gel = await poserUnGel(
      app,
      {
        poseParId: poseur,
        utilisateurConsoleId: vise,
        depuis: new Date('2026-01-01T00:00:00.000Z'),
        jusqua: MAINTENANT,
        motif: 'incident',
        reference: 'INC-0001',
      },
      MAINTENANT
    );

    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect(await ligne(gelee)).toMatchObject({ utilisateurConsoleId: vise, purgeAt: null });
    expect(await ligne(libre)).toMatchObject({ utilisateurConsoleId: null, purgeAt: MAINTENANT });

    await leverUnGel(app, { gelId: gel.id, leveParId: leveur }, PLUS_TARD);
    await purgerLeJournalDesAccesConsole(app, PLUS_TARD);
    expect(await ligne(gelee)).toMatchObject({
      utilisateurConsoleId: null,
      cibleId: null,
      ipHash: null,
      purgeAt: PLUS_TARD,
    });
  });

  it('REQ-SEC-058 : TÉMOIN — un gel ne couvre que l’utilisateur visé, dans sa période', async () => {
    const poseur = await unUtilisateur('admin');
    const vise = await unUtilisateur('lecteur');
    const autre = await unUtilisateur('lecteur');
    const horsPeriode = await uneTraceEchue(vise);
    const dAutrui = await uneTraceEchue(autre);
    await poserUnGel(
      app,
      {
        poseParId: poseur,
        utilisateurConsoleId: vise,
        // La période commence APRÈS la trace : elle ne la couvre pas.
        depuis: MAINTENANT,
        jusqua: PLUS_TARD,
        motif: 'litige',
        reference: 'LIT-0001',
      },
      MAINTENANT
    );
    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect((await ligne(horsPeriode)).purgeAt).toEqual(MAINTENANT);
    expect((await ligne(dAutrui)).purgeAt).toEqual(MAINTENANT);
  });

  it('REQ-SEC-058 : TÉMOIN — un gel levé ne se supprime pas et ne se relève pas : il reste lisible', async () => {
    const poseur = await unUtilisateur('admin');
    const leveur = await unUtilisateur('admin');
    const vise = await unUtilisateur('lecteur');
    const gel = await poserUnGel(
      app,
      {
        poseParId: poseur,
        utilisateurConsoleId: vise,
        depuis: new Date('2026-01-01T00:00:00.000Z'),
        jusqua: MAINTENANT,
        motif: 'incident',
        reference: 'INC-0002',
      },
      MAINTENANT
    );
    await leverUnGel(app, { gelId: gel.id, leveParId: leveur }, PLUS_TARD);
    await expect(
      leverUnGel(app, { gelId: gel.id, leveParId: leveur }, PLUS_TARD)
    ).rejects.toThrow();
    await expect(
      app.$executeRawUnsafe(
        `DELETE FROM "journal_acces_console_gels" WHERE "id" = $1::uuid`,
        gel.id
      )
    ).rejects.toThrow(/refuser_modification_sauf|ajout seul/i);
  });
});
