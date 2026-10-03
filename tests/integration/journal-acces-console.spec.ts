// @req REQ-SEC-058
/**
 * SEC-58 — le journal des accès à la console, en base RÉELLE (forme d'A02). Ajout seul, tenu par la
 * base : UPDATE et TRUNCATE refusés ; DELETE refusé hors du marqueur de la purge, posé par elle seule,
 * en local à sa transaction. Une connexion n'a pas de cible, une lecture en a toujours une. La purge
 * supprime l'échu et garde le reste, à la milliseconde. Le lecteur unique trace AVANT de déchiffrer.
 * Sous `partners_app`, le rôle du serveur, sauf TRUNCATE, refusé même au propriétaire.
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
  journaliserConnexionConsole,
  lireCoordonneesDeLApporteur,
} from '../../src/server/console/journal-acces';
import {
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../src/server/taches/purger-journal-acces-console';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const cles = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

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

async function unUtilisateur(): Promise<string> {
  return (
    await base.prisma.utilisateurConsole.create({
      data: { role: 'admin', creeAt: new Date('2026-01-01T00:00:00.000Z') },
    })
  ).id;
}

async function unApporteur(): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      ...(colonnesPii(
        { modele: MODELE_APPORTEUR, id },
        { nom: 'Témoin', prenom: 'Sec', email: `t-${hex(4)}@exemple.test` },
        cles
      ) as object),
      id,
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
  });
  return id;
}

async function uneTrace(utilisateurConsoleId: string, survenuAt: Date): Promise<string> {
  return (
    await base.prisma.journalAccesConsole.create({
      data: {
        id: randomUUID(),
        utilisateurConsoleId,
        nature: 'connexion',
        cibleId: null,
        survenuAt,
      },
    })
  ).id;
}

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const existe = async (id: string) =>
  (await base.prisma.journalAccesConsole.count({ where: { id } })) === 1;

describe('REQ-SEC-058 — le journal des accès à la console est en ajout seul', () => {
  it('REQ-SEC-058 : TÉMOIN — un UPDATE est refusé, sous le rôle du serveur', async () => {
    const id = await uneTrace(await unUtilisateur(), MAINTENANT);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE "journal_acces_console" SET "survenu_at" = now() WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toContain('journal_acces_console_refuser');
  });

  it('REQ-SEC-058 : TÉMOIN — un DELETE sans marqueur est refusé', async () => {
    const id = await uneTrace(await unUtilisateur(), new Date('2020-01-01T00:00:00.000Z'));
    expect(
      await refus(
        app.$executeRawUnsafe(`DELETE FROM "journal_acces_console" WHERE "id" = $1::uuid`, id)
      )
    ).toContain('journal_acces_console_refuser');
    expect(await existe(id)).toBe(true);
  });

  it('REQ-SEC-058 : TÉMOIN — TRUNCATE est refusé, même au propriétaire', async () => {
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE "journal_acces_console"`))
    ).toContain('journal_acces_console_refuser');
  });

  it('REQ-SEC-058 : TÉMOIN — le marqueur ne fuit pas hors de sa transaction', async () => {
    const id = await uneTrace(await unUtilisateur(), new Date('2020-01-01T00:00:00.000Z'));
    await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('partners.purge_journal_acces', 'on', true)`);
    });
    expect(
      await refus(
        app.$executeRawUnsafe(`DELETE FROM "journal_acces_console" WHERE "id" = $1::uuid`, id)
      )
    ).toContain('journal_acces_console_refuser');
  });

  it('REQ-SEC-058 : TÉMOIN — une connexion avec cible, ou une lecture sans cible, est refusée sur le nom du CHECK', async () => {
    const u = await unUtilisateur();
    const ecrire = (
      nature: 'connexion' | 'lecture_coordonnees_apporteur',
      cibleId: string | null
    ) =>
      app.journalAccesConsole.create({
        data: { id: randomUUID(), utilisateurConsoleId: u, nature, cibleId },
      });
    expect(await refus(ecrire('connexion', randomUUID()))).toContain('journal_acces_console_cible');
    expect(await refus(ecrire('lecture_coordonnees_apporteur', null))).toContain(
      'journal_acces_console_cible'
    );
  });

  it('REQ-SEC-058 : la table est protégée par ses déclencheurs (ligne et troncature)', async () => {
    const noms = (
      await base.prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT tgname AS n FROM pg_trigger WHERE tgrelid = 'journal_acces_console'::regclass AND NOT tgisinternal ORDER BY 1`
      )
    ).map((r) => r.n);
    expect(noms).toEqual(['journal_acces_console_ajout_seul', 'journal_acces_console_troncature']);
  });
});

describe('REQ-SEC-058 — la purge à l’échéance', () => {
  it('REQ-SEC-058 : TÉMOIN — la purge supprime l’échu et garde le reste, à la milliseconde', async () => {
    const u = await unUtilisateur();
    const limite = limiteDuJournalDesAcces(MAINTENANT);
    const echue = await uneTrace(u, new Date(limite.getTime() - 1));
    const aLaBorne = await uneTrace(u, limite);
    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect(await existe(echue)).toBe(false);
    expect(await existe(aLaBorne)).toBe(true);
  });
});

describe('REQ-SEC-058 — le lecteur unique trace, puis déchiffre', () => {
  it('REQ-SEC-058 : TÉMOIN — une lecture de coordonnées laisse UNE trace, par identifiants, et rend le clair', async () => {
    const u = await unUtilisateur();
    const a = await unApporteur();
    const lu = await lireCoordonneesDeLApporteur(
      app,
      { utilisateurConsoleId: u, apporteurId: a },
      cles
    );
    expect(lu.nom).toBe('Témoin');
    const traces = await base.prisma.journalAccesConsole.findMany({
      where: { utilisateurConsoleId: u },
    });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ nature: 'lecture_coordonnees_apporteur', cibleId: a });
  });

  it('REQ-SEC-058 : une connexion laisse une trace sans cible', async () => {
    const u = await unUtilisateur();
    await journaliserConnexionConsole(app, u);
    const traces = await base.prisma.journalAccesConsole.findMany({
      where: { utilisateurConsoleId: u },
    });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ nature: 'connexion', cibleId: null });
  });
});
