// @req REQ-SEC-003
// @req REQ-UX-048
/**
 * `connexion-console.spec.ts` — la connexion de la console (SEC-29) contre une VRAIE base, sous le
 * rôle d'exécution. Ce que les faux ne prouvent pas : que la population est jugée DANS l'écriture
 * (un lien de l'autre population n'est même pas consommé), que la session de la console porte son
 * utilisateur, sa durée et sa dernière vue, et que `requireRole` la lit et touche sa vue.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { kidDe } from '../../src/lib/env';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  consommerLien,
  consommerLienConsole,
  empreinteDeSessionConsole,
  empreinteDuCode,
  empreinteDuJeton,
  tirerJeton,
  verifierLeCodeConsole,
  type ConfigurationDuLien,
} from '../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import {
  ecrituresDeLien,
  ecrituresDeLienConsole,
  transactionDeConsommation,
  transactionDeConsommationConsole,
  transactionDuCodeConsole,
} from '../../src/server/auth/lien-magique-depot';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';

let base: Base;
let app: PrismaClient;

const hex = (octets: number) => randomBytes(octets).toString('hex');
const secretLien = hex(32);
const secretSession = hex(32);
const configuration: ConfigurationDuLien = {
  secret: secretLien,
  kid: kidDe(secretLien),
  urlPublique: 'https://partners.example.org',
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const MAINTENANT = new Date(Date.now());

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

/** Un utilisateur actif de la console : un bloc d'adresse factice et son empreinte. */
async function utilisateurConsole(): Promise<{ id: string; emailHash: string }> {
  const emailHash = hex(32);
  const u = await base.prisma.utilisateurConsole.create({
    data: { role: 'admin', creeAt: MAINTENANT, emailChiffre: Buffer.from([1]), emailHash },
  });
  return { id: u.id, emailHash };
}

/** Un apporteur signé, pour le lien de l'autre population. */
async function apporteur(): Promise<string> {
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'signe',
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/connexion',
      parrainCodeCapture: null,
      creeAt: MAINTENANT,
      emailHash: hex(32),
      emailChiffre: Buffer.from([1]),
    },
  });
  return a.id;
}

/** Un lien neuf, avec son code, pour l'une ou l'autre population ; rend le jeton. */
async function lien(
  titulaire: { utilisateurConsoleId: string } | { apporteurId: string },
  code = '042137'
): Promise<string> {
  const jeton = tirerJeton();
  const ligne = {
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    codeHash: empreinteDuCode(code, configuration.secret),
    kid: configuration.kid,
    creeAt: MAINTENANT,
    expireAt: new Date(MAINTENANT.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
  };
  if ('utilisateurConsoleId' in titulaire)
    await ecrituresDeLienConsole(app).insererLien({ ...titulaire, ...ligne });
  else await ecrituresDeLien(app).insererLien({ ...titulaire, ...ligne });
  return jeton;
}

const consommeAt = async (jeton: string) =>
  (
    await base.prisma.lienMagique.findUniqueOrThrow({
      where: { tokenHash: empreinteDuJeton(jeton, configuration.secret) },
      select: { consommeAt: true },
    })
  ).consommeAt;

/** Les ports de la consommation de la console, sur le client du rôle d'exécution. */
const portsConsole = () => ({
  maintenant: () => MAINTENANT,
  transaction: transactionDeConsommationConsole(app),
  configuration,
});

describe('REQ-SEC-003 — la session de la console, en base', () => {
  it('REQ-SEC-003 : TÉMOIN — le lien de la console ouvre UNE session de console : son utilisateur, sa durée, sa dernière vue, son empreinte', async () => {
    const u = await utilisateurConsole();
    const jeton = await lien({ utilisateurConsoleId: u.id });
    const r = await consommerLienConsole({ jeton, ipHash: null }, portsConsole());
    expect(r.etat).toBe('ouverte');
    if (r.etat !== 'ouverte') return;
    const s = await base.prisma.sessionEspace.findUniqueOrThrow({
      where: { tokenHash: empreinteDeSessionConsole(r.jetonSession, configuration.session.secret) },
    });
    expect(s.utilisateurConsoleId).toBe(u.id);
    expect(s.apporteurId).toBeNull();
    expect(s.derniereVueAt).toEqual(MAINTENANT);
    expect(s.expireAt.getTime() - MAINTENANT.getTime()).toBe(DUREES_AUTH.sessionConsoleMs.valeur);
    // Et `requireRole` la lit : la page d'accueil de la console lui est ouverte.
    const verdict = await requireRole('ecran:accueil', r.jetonSession, {
      maintenant: () => MAINTENANT,
      depot: depotDeSessionsConsole(app),
      configuration: configuration.session,
    });
    expect(verdict).toEqual({ ok: true, utilisateur: { id: u.id, role: 'admin' } });
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — un lien de l’ESPACE à la console, et un lien de la console à l’espace : aucun n’ouvre rien, AUCUN n’est consommé', async () => {
    const espace = await lien({ apporteurId: await apporteur() });
    expect(await consommerLienConsole({ jeton: espace, ipHash: null }, portsConsole())).toEqual({
      etat: 'lien_invalide',
    });
    expect(await consommeAt(espace)).toBeNull();

    const console = await lien({ utilisateurConsoleId: (await utilisateurConsole()).id });
    expect(
      await consommerLien(
        { jeton: console, ipHash: null },
        { maintenant: () => MAINTENANT, transaction: transactionDeConsommation(app), configuration }
      )
    ).toEqual({ etat: 'lien_invalide' });
    expect(await consommeAt(console)).toBeNull();
  });

  it('REQ-SEC-003 : TÉMOIN — désactivé entre l’envoi et le clic, l’utilisateur n’ouvre rien', async () => {
    const u = await utilisateurConsole();
    const jeton = await lien({ utilisateurConsoleId: u.id });
    await base.prisma.utilisateurConsole.update({
      where: { id: u.id },
      data: { desactiveAt: MAINTENANT, emailChiffre: null, emailHash: null },
    });
    expect(await consommerLienConsole({ jeton, ipHash: null }, portsConsole())).toEqual({
      etat: 'lien_invalide',
    });
    expect(await base.prisma.sessionEspace.count({ where: { utilisateurConsoleId: u.id } })).toBe(
      0
    );
  });

  it('REQ-SEC-003 : TÉMOIN — le code de la console ouvre sa session ; un lien de l’espace n’est jamais le lien actif de la console', async () => {
    const u = await utilisateurConsole();
    await lien({ utilisateurConsoleId: u.id }, '314159');
    const ports = {
      maintenant: () => MAINTENANT,
      adresseDuClient: () => '203.0.113.7',
      empreinteAdresseReseau: () => '0123456789abcdef',
      compterAdresseCode: async () => ({ autorise: true, panne: false }),
      compterCourrielCode: async () => ({ autorise: true, panne: false }),
      transaction: transactionDuCodeConsole(app),
      signaler: () => undefined,
      configuration,
    };
    const r = await verifierLeCodeConsole(
      { emailHash: u.emailHash, code: '314159', entetes: new Headers() },
      ports
    );
    expect(r.etat).toBe('ouverte');
    // L'empreinte d'un APPORTEUR ne trouve aucun lien actif de la console : refus, sans session.
    const autre = await verifierLeCodeConsole(
      { emailHash: hex(32), code: '314159', entetes: new Headers() },
      ports
    );
    expect(autre).toEqual({ etat: 'code_refuse' });
  });

  it('REQ-SEC-003 : la dernière vue n’est réécrite qu’une fois par période', async () => {
    const u = await utilisateurConsole();
    const jeton = await lien({ utilisateurConsoleId: u.id });
    const r = await consommerLienConsole({ jeton, ipHash: null }, portsConsole());
    if (r.etat !== 'ouverte') throw new Error('session attendue');
    const tokenHash = empreinteDeSessionConsole(r.jetonSession, configuration.session.secret);
    const depot = depotDeSessionsConsole(app);
    const plus = (ms: number) => new Date(MAINTENANT.getTime() + ms);
    const periode = DUREES_AUTH.toucheVueConsoleMs.valeur;
    await depot.toucher!(tokenHash, plus(periode - 1));
    expect((await depot.lire(tokenHash))?.derniereVueAt).toEqual(MAINTENANT);
    await depot.toucher!(tokenHash, plus(periode));
    expect((await depot.lire(tokenHash))?.derniereVueAt).toEqual(plus(periode));
  });
});
