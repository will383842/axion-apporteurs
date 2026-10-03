// @req REQ-SEC-023
// @req REQ-SEC-058
/**
 * SEC-58 — le journal des accès à la console, en base RÉELLE (forme commune d'A02 et de la sécurité).
 * Ajout seul par le gabarit commun `refuser_modification_sauf` : la purge vide l'utilisateur, la cible
 * et l'empreinte réseau, et pose `purge_at`, une fois ; la ligne nue reste. UPDATE hors purge, DELETE
 * et TRUNCATE refusés. Une connexion n'a pas de cible, une lecture en a toujours une, avant la purge.
 * Seule une connexion réussie s'inscrit. Le lecteur unique trace AVANT de déchiffrer.
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
} from '../../src/server/console/journal-des-acces';
import {
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../src/server/taches/purger-journal-acces-console';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { clesPii, colonnesPii, empreinteAdresseReseau } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');
const ADRESSE = '203.0.113.7';
const hex = (octets: number) => randomBytes(octets).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const cles = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});
/** L'empreinte tronquée de l'adresse, par la primitive, jamais l'adresse. */
const IP_HASH = empreinteAdresseReseau(ADRESSE, cles);

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
      data: {
        role: 'admin',
        creeAt: new Date('2026-01-01T00:00:00.000Z'),
        desactiveAt: new Date('2026-01-02T00:00:00.000Z'),
      },
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

/** Une trace de lecture, posée à la date donnée. */
async function uneTrace(utilisateurConsoleId: string, survenuAt: Date): Promise<string> {
  const id = randomUUID();
  await base.prisma.journalAccesConsole.create({
    data: {
      id,
      utilisateurConsoleId,
      nature: 'lecture_coordonnees_apporteur',
      cibleId: randomUUID(),
      ipHash: IP_HASH,
      survenuAt,
    },
  });
  return id;
}

const ligne = (id: string) => base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id } });

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const GABARIT = /refuser_modification_sauf|ajout seul/i;

describe('REQ-SEC-023 — une ligne par accès, par identifiants seuls', () => {
  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — une lecture de coordonnées écrit UNE ligne, et rend le clair', async () => {
    const u = await unUtilisateur();
    const a = await unApporteur();
    const lu = await lireCoordonneesDeLApporteur(
      app,
      { utilisateurConsoleId: u, apporteurId: a, adresse: ADRESSE },
      cles
    );
    expect(lu.nom).toBe('Témoin');
    const lignes = await base.prisma.journalAccesConsole.findMany({
      where: { utilisateurConsoleId: u },
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      nature: 'lecture_coordonnees_apporteur',
      cibleId: a,
      ipHash: IP_HASH,
    });
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — une connexion réussie écrit une ligne sans cible ; une connexion échouée n’en écrit aucune', async () => {
    const u = await unUtilisateur();
    await journaliserConnexionConsole(app, { utilisateurConsoleId: u, adresse: ADRESSE }, cles);
    const lignes = await base.prisma.journalAccesConsole.findMany({
      where: { utilisateurConsoleId: u },
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ nature: 'connexion', cibleId: null });
    // Une connexion échouée n'a pas d'utilisateur : la base refuse une ligne sans lui, avant la purge.
    expect(
      await refus(
        app.journalAccesConsole.create({
          data: { id: randomUUID(), nature: 'connexion', ipHash: IP_HASH },
        })
      )
    ).toContain('journal_acces_console_purge_liee');
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — aucune colonne ne peut porter une donnée de personne', async () => {
    const colonnes = (
      await base.prisma.$queryRawUnsafe<{ c: string; t: string }[]>(
        `SELECT column_name AS c, data_type AS t FROM information_schema.columns
         WHERE table_name = 'journal_acces_console' ORDER BY column_name`
      )
    ).map((r) => `${r.c}:${r.t}`);
    expect(colonnes).toEqual([
      'cible_id:uuid',
      'id:uuid',
      'ip_hash:character',
      'nature:USER-DEFINED',
      'purge_at:timestamp with time zone',
      'survenu_at:timestamp with time zone',
      'utilisateur_console_id:uuid',
    ]);
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — une empreinte hors forme est refusée sur le nom du CHECK', async () => {
    const u = await unUtilisateur();
    expect(
      await refus(
        app.journalAccesConsole.create({
          data: {
            id: randomUUID(),
            utilisateurConsoleId: u,
            nature: 'connexion',
            ipHash: 'ADRESSE-EN-CLAIR',
          },
        })
      )
    ).toContain('journal_acces_console_ip_hash_hex');
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — une connexion avec cible, ou une lecture sans cible, est refusée (journal_acces_console_cible)', async () => {
    const u = await unUtilisateur();
    const ecrire = (nature: 'connexion' | 'lecture_coordonnees_contact', cibleId: string | null) =>
      app.journalAccesConsole.create({
        data: { id: randomUUID(), utilisateurConsoleId: u, nature, cibleId },
      });
    expect(await refus(ecrire('connexion', randomUUID()))).toContain('journal_acces_console_cible');
    expect(await refus(ecrire('lecture_coordonnees_contact', null))).toContain(
      'journal_acces_console_cible'
    );
  });
});

describe('REQ-SEC-023 — ajout seul, sauf la purge', () => {
  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — un UPDATE hors purge, un DELETE et un TRUNCATE sont refusés', async () => {
    const id = await uneTrace(await unUtilisateur(), MAINTENANT);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE "journal_acces_console" SET "survenu_at" = now() WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toMatch(GABARIT);
    expect(
      await refus(
        app.$executeRawUnsafe(`DELETE FROM "journal_acces_console" WHERE "id" = $1::uuid`, id)
      )
    ).toMatch(GABARIT);
    expect(await refus(base.prisma.$executeRawUnsafe(`TRUNCATE "journal_acces_console"`))).toMatch(
      GABARIT
    );
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — une purge PARTIELLE est refusée (journal_acces_console_purge_liee)', async () => {
    const id = await uneTrace(await unUtilisateur(), MAINTENANT);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE "journal_acces_console" SET "utilisateur_console_id" = NULL, "purge_at" = now() WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toContain('journal_acces_console_purge_liee');
  });

  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — après la purge, un purge_at réécrit ou une valeur qui revient est refusé', async () => {
    const u = await unUtilisateur();
    const id = await uneTrace(u, new Date('2020-01-01T00:00:00.000Z'));
    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE "journal_acces_console" SET "purge_at" = now() WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toMatch(GABARIT);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE "journal_acces_console" SET "utilisateur_console_id" = $2::uuid, "purge_at" = NULL WHERE "id" = $1::uuid`,
          id,
          u
        )
      )
    ).toMatch(GABARIT);
  });
});

describe('REQ-SEC-023 — la purge à l’échéance', () => {
  it('REQ-SEC-023, REQ-SEC-058 : TÉMOIN — la purge vide l’échu, à la milliseconde, garde le reste, et garde la ligne nue', async () => {
    const u = await unUtilisateur();
    const limite = limiteDuJournalDesAcces(MAINTENANT);
    const echue = await uneTrace(u, new Date(limite.getTime() - 1));
    const aLaBorne = await uneTrace(u, limite);
    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect(await ligne(echue)).toMatchObject({
      utilisateurConsoleId: null,
      cibleId: null,
      ipHash: null,
      purgeAt: MAINTENANT,
      nature: 'lecture_coordonnees_apporteur',
    });
    expect(await ligne(aLaBorne)).toMatchObject({ utilisateurConsoleId: u, purgeAt: null });
  });
});
