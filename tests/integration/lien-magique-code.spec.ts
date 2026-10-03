// @req REQ-SEC-001
/**
 * `lien-magique-code.spec.ts` — le code à six chiffres en base RÉELLE (SEC-54), sous le rôle
 * d'exécution `partners_app` : ce que le témoin unitaire ne peut pas prouver, la concurrence, le
 * déclencheur `liens_magiques_code_fige` et l'écriture conditionnelle de l'essai.
 *
 * TÉMOINS (cadrage de la lentille sécurité) : bon code → session, puis le lien et le code sont
 * inutilisables ; code faux, compte inconnu, lien expiré : réponses identiques ; cinq faux → lien
 * annulé, et le sixième est refusé même avec le bon code ; essais concurrents → jamais plus de cinq
 * comptés (le compteur en base fait foi) ; nouveau lien → l'ancien code est refusé ; limiteur
 * indisponible → refus.
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
  ESSAIS_DU_CODE_MAX,
  consommerLien,
  empreinteDuCode,
  empreinteDuJeton,
  tirerJeton,
  verifierLeCode,
  type ConfigurationDuLien,
  type PortsDuCode,
} from '../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import {
  ecrituresDeLien,
  transactionDeConsommation,
  transactionDuCode,
} from '../../src/server/auth/lien-magique-depot';

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
/** Proche de l'horloge du serveur : un déclencheur qui lirait `now()` s'y accorde. */
const t0 = Date.now();
const MAINTENANT = new Date(t0);

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

/** Un apporteur signé, retrouvable par l'empreinte de son courriel ; rend son id et l'empreinte. */
async function apporteur(): Promise<{ id: string; emailHash: string }> {
  const emailHash = hex(32);
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
      emailHash,
    },
  });
  return { id: a.id, emailHash };
}

/** Émet un lien comme l'émission le fait (annuler les actifs, poser le neuf) ; rend jeton et code. */
async function emettre(apporteurId: string, creeAt = MAINTENANT, code = '042137') {
  const jeton = tirerJeton();
  const ecritures = ecrituresDeLien(app);
  await ecritures.annulerLiensActifs(apporteurId, creeAt);
  await ecritures.insererLien({
    apporteurId,
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    codeHash: empreinteDuCode(code, configuration.secret),
    kid: configuration.kid,
    creeAt,
    expireAt: new Date(creeAt.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
  });
  return { jeton, code };
}

function ports(
  emailHash: string | null,
  o: { maintenant?: Date; panne?: boolean } = {}
): PortsDuCode {
  const verdict = async () => ({ autorise: !o.panne, panne: Boolean(o.panne) });
  return {
    maintenant: () => o.maintenant ?? MAINTENANT,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => 'r'.repeat(64),
    empreinteCourriel: () => emailHash,
    compterAdresseCode: verdict,
    compterCourrielCode: verdict,
    transaction: transactionDuCode(app),
    signaler: () => undefined,
    configuration,
  };
}

const verifier = (emailHash: string | null, code: string, o: Parameters<typeof ports>[1] = {}) =>
  verifierLeCode(
    { saisie: 'apporteur@example.org', code, entetes: new Headers() },
    ports(emailHash, o)
  );

async function lien(apporteurId: string) {
  return base.prisma.lienMagique.findFirstOrThrow({
    where: { apporteurId },
    orderBy: { creeAt: 'desc' },
  });
}

describe('REQ-SEC-001 — le bon code, une fois', () => {
  it('REQ-SEC-001 : TÉMOIN — bon code → une session ; puis le code ET le lien sont inutilisables', async () => {
    const a = await apporteur();
    const { jeton, code } = await emettre(a.id);
    const r = await verifier(a.emailHash, code);
    expect(r.etat).toBe('ouverte');
    const l = await lien(a.id);
    expect(l.consommeAt).not.toBeNull();
    expect(await base.prisma.sessionEspace.count({ where: { lienMagiqueId: l.id } })).toBe(1);
    expect(await verifier(a.emailHash, code)).toEqual({ etat: 'code_refuse' });
    const clic = await consommerLien(
      { jeton, ipHash: null },
      { maintenant: () => MAINTENANT, transaction: transactionDeConsommation(app), configuration }
    );
    expect(clic).toEqual({ etat: 'lien_invalide' });
    expect(await base.prisma.sessionEspace.count({ where: { lienMagiqueId: l.id } })).toBe(1);
  });

  it('REQ-SEC-001 : TÉMOIN — le clic d’abord : le code ne sert plus', async () => {
    const a = await apporteur();
    const { jeton, code } = await emettre(a.id);
    const clic = await consommerLien(
      { jeton, ipHash: null },
      { maintenant: () => MAINTENANT, transaction: transactionDeConsommation(app), configuration }
    );
    expect(clic.etat).toBe('ouverte');
    expect(await verifier(a.emailHash, code)).toEqual({ etat: 'code_refuse' });
  });
});

describe('REQ-SEC-001 — la même réponse', () => {
  it('REQ-SEC-001 : TÉMOIN — code faux, compte inconnu, lien expiré : réponses IDENTIQUES', async () => {
    const a = await apporteur();
    const { code } = await emettre(a.id);
    const faux = await verifier(a.emailHash, code === '999999' ? '000000' : '999999');
    const inconnu = await verifier(hex(32), code);
    const plusTard = new Date(t0 + DUREES_AUTH.lienMagiqueMs.valeur + 1_000);
    const expire = await verifier(a.emailHash, code, { maintenant: plusTard });
    expect([faux, inconnu, expire].map((x) => JSON.stringify(x))).toEqual([
      JSON.stringify({ etat: 'code_refuse' }),
      JSON.stringify({ etat: 'code_refuse' }),
      JSON.stringify({ etat: 'code_refuse' }),
    ]);
    // Le lien expiré n'a pas compté d'essai : seul le code faux en a compté un.
    expect((await lien(a.id)).tentativesCode).toBe(1);
  });
});

describe('REQ-SEC-001 — cinq essais, sans course', () => {
  it('REQ-SEC-001 : TÉMOIN — cinq faux → lien annulé ; le sixième est refusé même avec le bon code', async () => {
    const a = await apporteur();
    const { code } = await emettre(a.id);
    for (let i = 0; i < ESSAIS_DU_CODE_MAX; i += 1)
      expect(await verifier(a.emailHash, '999999')).toEqual({ etat: 'code_refuse' });
    const l = await lien(a.id);
    expect(l.tentativesCode).toBe(ESSAIS_DU_CODE_MAX);
    expect(l.annuleAt).not.toBeNull();
    expect(await verifier(a.emailHash, code)).toEqual({ etat: 'code_refuse' });
    expect(await base.prisma.sessionEspace.count({ where: { lienMagiqueId: l.id } })).toBe(0);
  });

  it('REQ-SEC-001 : TÉMOIN — dix essais CONCURRENTS : jamais plus de cinq comptés en base', async () => {
    const a = await apporteur();
    await emettre(a.id);
    await Promise.allSettled(Array.from({ length: 10 }, () => verifier(a.emailHash, '999999')));
    expect((await lien(a.id)).tentativesCode).toBe(ESSAIS_DU_CODE_MAX);
  });

  it('REQ-SEC-001 : TÉMOIN — la base refuse un compte d’essais au-delà de cinq ou qui redescend', async () => {
    const a = await apporteur();
    await emettre(a.id);
    const l = await lien(a.id);
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE liens_magiques SET tentatives_code = 6 WHERE id = $1::uuid`,
        l.id
      )
    ).rejects.toThrow();
    await verifier(a.emailHash, '999999');
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE liens_magiques SET tentatives_code = 0 WHERE id = $1::uuid`,
        l.id
      )
    ).rejects.toThrow(/liens_magiques_code_fige/);
  });
});

describe('REQ-SEC-001 — un nouveau lien, un nouveau code', () => {
  it('REQ-SEC-001 : TÉMOIN — après un nouveau lien, l’ancien code est refusé et le nouveau ouvre', async () => {
    const a = await apporteur();
    const ancien = await emettre(a.id, MAINTENANT, '111111');
    const neuf = await emettre(a.id, new Date(t0 + 1_000), '222222');
    expect(await verifier(a.emailHash, ancien.code)).toEqual({ etat: 'code_refuse' });
    expect((await verifier(a.emailHash, neuf.code)).etat).toBe('ouverte');
  });
});

describe('REQ-SEC-001 — le débit, en échec fermé', () => {
  it('REQ-SEC-001 : TÉMOIN — limiteur indisponible → refus, sans essai compté', async () => {
    const a = await apporteur();
    const { code } = await emettre(a.id);
    expect(await verifier(a.emailHash, code, { panne: true })).toEqual({ etat: 'debit' });
    expect((await lien(a.id)).tentativesCode).toBe(0);
  });
});
