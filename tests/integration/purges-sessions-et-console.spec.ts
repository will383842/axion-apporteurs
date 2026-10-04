// @req REQ-SEC-003
// @req REQ-JUR-068
/**
 * SEC-65 — les deux purges en base RÉELLE, sous `partners_app` provisionné comme en production ; les
 * fixtures et les lectures restent sous le propriétaire.
 *
 * CE QUE CE FICHIER GARDE : une session finie est supprimée, avec son empreinte d'adresse réseau, à six
 * mois de sa fin — gardée à J−1 ms, supprimée à J —, et sa fin est la plus tôt de l'expiration et de
 * la révocation ; un compte désactivé perd son nom, son adresse et l'empreinte à cinq ans — gardés
 * à J−1 ms, vidés à J —, l'identifiant et le rôle restent, le journal des accès et le journal chaîné
 * ne bougent pas, et la même adresse s'invite de nouveau. Deux faces : une session vivante, un compte
 * actif ou désactivé depuis peu ne sont jamais touchés.
 *
 * Les dates sont prises au milieu du mois : le pas d'un mois ou d'un an y est exact, à la milliseconde.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { purgerLesSessions } from '../../src/server/taches/purger-sessions-espace';
import { effacerLesComptesDesactives } from '../../src/server/taches/purger-utilisateurs-console';

let base: Base;
let app: PrismaClient;

const hex = (octets: number) => randomBytes(octets).toString('hex');
const MOINS_UNE_MS = (d: Date) => new Date(d.getTime() - 1);
const CREE = new Date('2015-01-15T08:00:00.000Z');

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = hex(24);
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Un utilisateur de la console, nom et adresse chiffrés posés ; rend son id et l'empreinte. */
async function unUtilisateur(desactiveAt: Date | null): Promise<{ id: string; empreinte: string }> {
  const id = randomUUID();
  const empreinte = hex(32);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO "utilisateurs_console" ("id","role","nom_chiffre","email_chiffre","email_hash","cree_at","desactive_at")
     VALUES ($1::uuid, 'lecteur', $2, $3, $4, $5, $6)`,
    id,
    randomBytes(40),
    randomBytes(40),
    empreinte,
    CREE,
    desactiveAt
  );
  return { id, empreinte };
}

/** Une session de la console, ouverte par son lien ; rend son id. */
async function uneSession(
  utilisateurConsoleId: string,
  s: { creeAt: Date; expireAt: Date; revoqueAt?: Date }
): Promise<string> {
  const lien = await base.prisma.lienMagique.create({
    data: {
      utilisateurConsoleId,
      tokenHash: hex(32),
      kid: hex(4),
      creeAt: s.creeAt,
      expireAt: new Date(s.creeAt.getTime() + 15 * 60_000),
    },
    select: { id: true },
  });
  return (
    await base.prisma.sessionEspace.create({
      data: {
        utilisateurConsoleId,
        lienMagiqueId: lien.id,
        tokenHash: hex(32),
        kid: hex(4),
        ipHash: hex(8),
        creeAt: s.creeAt,
        expireAt: s.expireAt,
        revoqueAt: s.revoqueAt ?? null,
      },
      select: { id: true },
    })
  ).id;
}

const sessionExiste = async (id: string) =>
  (await base.prisma.sessionEspace.count({ where: { id } })) === 1;

/** La même date, six mois plus tard, en UTC. */
function sixMoisApres(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + 6);
  return r;
}

/** La même date, cinq ans plus tard, en UTC. */
function cinqAnsApres(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCFullYear(r.getUTCFullYear() + 5);
  return r;
}

describe('REQ-SEC-003 — une session finie est supprimée six mois après sa fin, en base réelle', () => {
  it('REQ-SEC-003 : TÉMOIN — une session expirée est gardée à J−1 ms et supprimée à J, avec son empreinte d’adresse réseau', async () => {
    const { id: utilisateur } = await unUtilisateur(null);
    const expireAt = new Date('2026-03-10T22:00:00.000Z');
    const id = await uneSession(utilisateur, {
      creeAt: new Date('2026-03-10T10:00:00.000Z'),
      expireAt,
    });
    const J = sixMoisApres(expireAt);

    await purgerLesSessions(app, MOINS_UNE_MS(J));
    expect(await sessionExiste(id)).toBe(true);

    await purgerLesSessions(app, J);
    expect(await sessionExiste(id)).toBe(false);
    // L'empreinte vivait sur la ligne : plus aucune ligne ne la porte.
    expect(await base.prisma.sessionEspace.count({ where: { id, ipHash: { not: null } } })).toBe(0);
  });

  it('REQ-SEC-003 : TÉMOIN — la fin est la plus tôt de l’expiration et de la révocation : révoquée à J et expirant à J+29, la session part à J + 6 mois', async () => {
    const { id: utilisateur } = await unUtilisateur(null);
    // Révoquée à J, avant son échéance : elle prend fin à sa révocation (juriste, #739, 5985633836).
    const J = new Date('2026-03-10T22:00:00.000Z');
    const revoquee = await uneSession(utilisateur, {
      creeAt: new Date('2026-03-10T10:00:00.000Z'),
      expireAt: new Date('2026-04-08T22:00:00.000Z'),
      revoqueAt: J,
    });
    // Expirée à E, révoquée dix jours plus tard : elle avait pris fin à son expiration.
    const E = new Date('2026-03-12T22:00:00.000Z');
    const expiree = await uneSession(utilisateur, {
      creeAt: new Date('2026-03-12T10:00:00.000Z'),
      expireAt: E,
      revoqueAt: new Date('2026-03-22T22:00:00.000Z'),
    });

    await purgerLesSessions(app, MOINS_UNE_MS(sixMoisApres(J)));
    expect(await sessionExiste(revoquee)).toBe(true);
    await purgerLesSessions(app, sixMoisApres(J));
    expect(await sessionExiste(revoquee)).toBe(false);

    await purgerLesSessions(app, MOINS_UNE_MS(sixMoisApres(E)));
    expect(await sessionExiste(expiree)).toBe(true);
    await purgerLesSessions(app, sixMoisApres(E));
    expect(await sessionExiste(expiree)).toBe(false);
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — la session finie part, la session vivante n’est jamais touchée', async () => {
    const { id: utilisateur } = await unUtilisateur(null);
    const maintenant = new Date('2026-10-15T12:00:00.000Z');
    const finie = await uneSession(utilisateur, {
      creeAt: new Date('2026-01-15T10:00:00.000Z'),
      expireAt: new Date('2026-01-15T22:00:00.000Z'),
    });
    const vivante = await uneSession(utilisateur, {
      creeAt: new Date(maintenant.getTime() - 3_600_000),
      expireAt: new Date(maintenant.getTime() + 86_400_000),
    });
    const avant = await base.prisma.sessionEspace.findUniqueOrThrow({ where: { id: vivante } });

    await purgerLesSessions(app, maintenant);

    expect(await sessionExiste(finie)).toBe(false);
    expect(await base.prisma.sessionEspace.findUniqueOrThrow({ where: { id: vivante } })).toEqual(
      avant
    );
  });
});

describe('REQ-JUR-068 — un accès désactivé de la console perd sa donnée de personne cinq ans après, en base réelle', () => {
  it('REQ-JUR-068 : TÉMOIN — gardé à J−1 ms ; à J, le nom, l’adresse ET l’empreinte sont vidés, l’identifiant et le rôle restent, les journaux ne bougent pas', async () => {
    const desactiveAt = new Date('2021-03-10T10:00:00.000Z');
    const { id } = await unUtilisateur(desactiveAt);
    const trace = randomUUID();
    await base.prisma.journalAccesConsole.create({
      data: {
        id: trace,
        utilisateurConsoleId: id,
        nature: 'connexion',
        ipHash: hex(8),
        survenuAt: new Date('2021-03-01T09:00:00.000Z'),
      },
    });
    const traceAvant = await base.prisma.journalAccesConsole.findUniqueOrThrow({
      where: { id: trace },
    });
    const [avant] = await base.prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM evenements`;
    const J = cinqAnsApres(desactiveAt);

    await effacerLesComptesDesactives(app, MOINS_UNE_MS(J));
    expect(
      await base.prisma.utilisateurConsole.count({
        where: {
          id,
          nomChiffre: { not: null },
          emailChiffre: { not: null },
          emailHash: { not: null },
        },
      })
    ).toBe(1);

    await effacerLesComptesDesactives(app, J);
    expect(
      await base.prisma.utilisateurConsole.findUniqueOrThrow({
        where: { id },
        select: { id: true, role: true, nomChiffre: true, emailChiffre: true, emailHash: true },
      })
    ).toEqual({ id, role: 'lecteur', nomChiffre: null, emailChiffre: null, emailHash: null });
    expect(
      await base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id: trace } })
    ).toEqual(traceAvant);
    const [apres] = await base.prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM evenements`;
    expect(apres!.n).toBe(avant!.n);
  });

  it('REQ-JUR-068 : TÉMOIN — l’empreinte vidée, la même adresse s’invite de nouveau, sur un compte neuf', async () => {
    const desactiveAt = new Date('2021-04-12T10:00:00.000Z');
    const { id, empreinte } = await unUtilisateur(desactiveAt);
    await effacerLesComptesDesactives(app, cinqAnsApres(desactiveAt));

    const neuf = randomUUID();
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO "utilisateurs_console" ("id","role","email_chiffre","email_hash","cree_at")
       VALUES ($1::uuid, 'lecteur', $2, $3, $4)`,
      neuf,
      randomBytes(40),
      empreinte,
      new Date('2026-10-15T12:00:00.000Z')
    );
    const porteurs = await base.prisma.utilisateurConsole.findMany({
      where: { emailHash: empreinte },
      select: { id: true },
    });
    expect(porteurs).toEqual([{ id: neuf }]);
    expect(neuf).not.toBe(id);
  });

  it('REQ-JUR-068 : TÉMOIN À DEUX FACES — le compte échu est vidé ; un compte actif, ou désactivé depuis moins de cinq ans, n’est jamais touché', async () => {
    const maintenant = new Date('2026-10-15T12:00:00.000Z');
    const { id: echu } = await unUtilisateur(new Date('2021-05-14T10:00:00.000Z'));
    const { id: actif } = await unUtilisateur(null);
    const { id: recent } = await unUtilisateur(new Date('2025-10-15T12:00:00.000Z'));
    const lire = (id: string) =>
      base.prisma.utilisateurConsole.findUniqueOrThrow({
        where: { id },
        select: { nomChiffre: true, emailChiffre: true, emailHash: true, sessionVersion: true },
      });
    const actifAvant = await lire(actif);
    const recentAvant = await lire(recent);

    await effacerLesComptesDesactives(app, maintenant);

    expect(await lire(echu)).toMatchObject({
      nomChiffre: null,
      emailChiffre: null,
      emailHash: null,
    });
    expect(await lire(actif)).toEqual(actifAvant);
    expect(await lire(recent)).toEqual(recentAvant);
  });
});
