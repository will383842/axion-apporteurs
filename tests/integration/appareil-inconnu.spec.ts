// @req REQ-SEC-003
/**
 * SEC-55 — l'appareil inconnu est un signal de sécurité du COMPTE, jamais une anomalie, en base
 * RÉELLE. Les sessions se jugent, les appareils s'écrivent et se purgent sous `partners_app`, le rôle
 * d'exécution PROVISIONNÉ, comme en production.
 *
 * CE QU'IL PROUVE (cadrage de la lentille sécurité, point 5) :
 *   1. nouvel appareil → refusé tant que la session n'est pas fraîchement authentifiée sur lui ; la
 *      confirmation renforcée (lien ou code consommé il y a moins de dix minutes) part en avis, puis
 *      l'appareil est connu, et passe ensuite sans avis ;
 *   2. aucune trace ailleurs : ni anomalie, ni statut, ni version de session, ni dépôt, ni événement ;
 *   3. un appareil est connu pour UN compte ;
 *   4. au-delà d'une durée de session sans être vu, il redevient inconnu ;
 *   5. en échec fermé, un identifiant illisible n'écrit rien ;
 *   6. la base refuse une ligne hors forme ;
 *   7. la purge efface à l'échéance, pas avant.
 * Secrets et jetons sont tirés à l'exécution ; les instants sont écrits en clair.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessions } from '../../src/server/auth/session';
import {
  cleDesAppareils,
  depotDAppareils,
  empreinteDAppareil,
  exigerAppareilConfirme,
  tirerIdentifiantDAppareil,
  type PortsDAppareil,
} from '../../src/server/auth/appareil';
import { purgerLesAppareils } from '../../src/server/taches/purger-appareils';
import { semerSession } from '../../prisma/seed/05-sessions';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

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

const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const CLE = cleDesAppareils(secretSession);
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec55-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const d = (iso: string) => new Date(iso);
const MS = 1;
const avant = (t: Date) => new Date(t.getTime() - MS);

let sequence = 0;
/** Un code de parrainage neuf à chaque appel, dans la forme du CHECK (`AX` + 6 Crockford). */
function code(): string {
  sequence += 1;
  return `AX6${String(sequence).padStart(5, '0')}`;
}

/** Un apporteur `signe` au courriel posé par la couche des données personnelles. */
async function apporteur(): Promise<string> {
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: `appareil-${sequence}@example.org` },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut: 'signe',
      codeParrainage: code(),
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/connexion',
      parrainCodeCapture: null,
      creeAt: d('2026-10-01T08:00:00.000Z'),
    },
  });
  return id;
}

/** Ouvre une session dont le lien a été consommé à `consommeAt` ; rend le jeton de session. */
async function session(apporteurId: string, consommeAt: Date): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt,
    ipHash: null,
    configuration: CONFIGURATION,
  });
  return jetonSession;
}

/** Les ports de la garde, à l'instant donné, en base réelle ; l'avis est un double. */
function ports(maintenant: Date) {
  const aviser = vi.fn(async (_avis: { apporteurId: string; confirmeAt: Date }) => undefined);
  const p: PortsDAppareil = {
    session: {
      maintenant: () => maintenant,
      depot: depotDeSessions(app),
      configuration: CONFIGURATION.session,
    },
    depot: depotDAppareils(app),
    cle: CLE,
    aviser,
  };
  return { p, aviser };
}

/** Les appareils connus d'un apporteur, tels que la base les rend. */
function appareilsDe(apporteurId: string) {
  return base.prisma.appareilConnu.findMany({
    where: { apporteurId },
    select: { empreinte: true, kid: true, confirmeAt: true, derniereVueAt: true },
    orderBy: { confirmeAt: 'asc' },
  });
}

describe('REQ-SEC-003 — SEC-55 : un nouvel appareil, une confirmation renforcée, puis un appareil connu', () => {
  it('REQ-SEC-003 : refusé sur une session ancienne ; confirmé par une authentification fraîche sur CET appareil, avec son avis ; puis connu, sans avis', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const ancienne = await session(a, d('2026-10-03T08:00:00.000Z'));

    const refus = ports(d('2026-10-03T09:00:00.000Z'));
    expect(await exigerAppareilConfirme(ancienne, identifiant, refus.p)).toEqual({
      ok: false,
      motif: 'appareil_inconnu',
    });
    expect(refus.aviser).not.toHaveBeenCalled();
    expect(await appareilsDe(a)).toEqual([]);

    // Un nouveau lien, ou son code, consommé sur cet appareil : la session neuve est fraîche.
    const fraiche = await session(a, d('2026-10-03T09:05:00.000Z'));
    const confirmation = ports(d('2026-10-03T09:14:59.999Z'));
    const v = await exigerAppareilConfirme(fraiche, identifiant, confirmation.p);
    expect(v.ok && v.session.apporteurId).toBe(a);
    expect(confirmation.aviser).toHaveBeenCalledTimes(1);
    expect(confirmation.aviser).toHaveBeenCalledWith({
      apporteurId: a,
      confirmeAt: d('2026-10-03T09:14:59.999Z'),
    });
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte: empreinteDAppareil(identifiant, CLE.secret),
        kid: CLE.kid,
        confirmeAt: d('2026-10-03T09:14:59.999Z'),
        derniereVueAt: d('2026-10-03T09:14:59.999Z'),
      },
    ]);

    // Connu : il passe, même sur l'ancienne session, sans avis ; sa dernière vue avance.
    const ensuite = ports(d('2026-10-04T10:00:00.000Z'));
    expect((await exigerAppareilConfirme(ancienne, identifiant, ensuite.p)).ok).toBe(true);
    expect(ensuite.aviser).not.toHaveBeenCalled();
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte: empreinteDAppareil(identifiant, CLE.secret),
        kid: CLE.kid,
        confirmeAt: d('2026-10-03T09:14:59.999Z'),
        derniereVueAt: d('2026-10-04T10:00:00.000Z'),
      },
    ]);
  });

  it('REQ-SEC-003 : dix minutes pile après la consommation du lien, la session n’est plus fraîche : l’appareil reste inconnu', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const jeton = await session(a, d('2026-10-03T11:00:00.000Z'));
    const { p, aviser } = ports(d('2026-10-03T11:10:00.000Z'));
    expect(await exigerAppareilConfirme(jeton, identifiant, p)).toEqual({
      ok: false,
      motif: 'appareil_inconnu',
    });
    expect(aviser).not.toHaveBeenCalled();
    expect(await appareilsDe(a)).toEqual([]);
  });

  it('REQ-SEC-003 : aucune trace ailleurs — ni anomalie, ni statut, ni version de session, ni dépôt, ni événement', async () => {
    const compter = async () => ({
      anomalies: await base.prisma.anomalie.count(),
      attributions: await base.prisma.attribution.count(),
      depotsRefuses: await base.prisma.depotRefuse.count(),
      evenements: await base.prisma.evenement.count(),
      contestations: await base.prisma.contestation.count(),
    });
    const a = await apporteur();
    const comptesAvant = await compter();
    const fiche = () =>
      base.prisma.apporteur.findUniqueOrThrow({
        where: { id: a },
        select: { statut: true, sessionVersion: true },
      });
    const ficheAvant = await fiche();
    const identifiant = tirerIdentifiantDAppareil();
    const ancienne = await session(a, d('2026-10-02T08:00:00.000Z'));
    await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T08:00:00.000Z')).p);
    const fraiche = await session(a, d('2026-10-03T08:01:00.000Z'));
    await exigerAppareilConfirme(fraiche, identifiant, ports(d('2026-10-03T08:02:00.000Z')).p);
    await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T09:00:00.000Z')).p);
    expect(await compter()).toEqual(comptesAvant);
    expect(await fiche()).toEqual(ficheAvant);
  });

  it('REQ-SEC-003 : un appareil est connu pour UN compte — le même identifiant, sur un autre compte, est inconnu', async () => {
    const a = await apporteur();
    const b = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const fraicheA = await session(a, d('2026-10-03T13:00:00.000Z'));
    expect(
      (await exigerAppareilConfirme(fraicheA, identifiant, ports(d('2026-10-03T13:01:00.000Z')).p))
        .ok
    ).toBe(true);
    const ancienneB = await session(b, d('2026-10-02T13:00:00.000Z'));
    const { p, aviser } = ports(d('2026-10-03T13:02:00.000Z'));
    expect(await exigerAppareilConfirme(ancienneB, identifiant, p)).toEqual({
      ok: false,
      motif: 'appareil_inconnu',
    });
    expect(aviser).not.toHaveBeenCalled();
    expect(await appareilsDe(b)).toEqual([]);
  });

  it('REQ-SEC-003 : vu pour la dernière fois il y a trente jours ou plus, l’appareil redevient inconnu ; une confirmation fraîche le rétablit', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const empreinte = empreinteDAppareil(identifiant, CLE.secret)!;
    await base.prisma.appareilConnu.create({
      data: {
        apporteurId: a,
        empreinte,
        kid: CLE.kid,
        confirmeAt: d('2026-08-01T10:00:00.000Z'),
        derniereVueAt: d('2026-09-03T10:00:00.000Z'),
      },
    });
    const ancienne = await session(a, d('2026-10-01T10:00:00.000Z'));
    // Une milliseconde avant ses trente jours, il est encore connu.
    expect(
      (
        await exigerAppareilConfirme(
          ancienne,
          identifiant,
          ports(avant(d('2026-10-03T10:00:00.000Z'))).p
        )
      ).ok
    ).toBe(true);
    await base.prisma.appareilConnu.updateMany({
      where: { apporteurId: a },
      data: { derniereVueAt: d('2026-09-03T10:00:00.000Z') },
    });
    // Trente jours pile : inconnu.
    expect(
      await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T10:00:00.000Z')).p)
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    const fraiche = await session(a, d('2026-10-03T10:00:00.000Z'));
    const { p, aviser } = ports(d('2026-10-03T10:05:00.000Z'));
    expect((await exigerAppareilConfirme(fraiche, identifiant, p)).ok).toBe(true);
    expect(aviser).toHaveBeenCalledTimes(1);
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte,
        kid: CLE.kid,
        confirmeAt: d('2026-10-03T10:05:00.000Z'),
        derniereVueAt: d('2026-10-03T10:05:00.000Z'),
      },
    ]);
  });

  it('REQ-SEC-003 : échec fermé — un identifiant absent ou hors forme, même sur une session fraîche, est refusé ; rien n’est écrit, aucun avis', async () => {
    const a = await apporteur();
    const fraiche = await session(a, d('2026-10-03T15:00:00.000Z'));
    for (const illisible of [
      undefined,
      '',
      'pas-un-identifiant',
      `${tirerIdentifiantDAppareil()}=`,
    ]) {
      const { p, aviser } = ports(d('2026-10-03T15:01:00.000Z'));
      expect(await exigerAppareilConfirme(fraiche, illisible, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(aviser).not.toHaveBeenCalled();
    }
    expect(await appareilsDe(a)).toEqual([]);
  });
});

describe('REQ-SEC-003 — SEC-55 (1) : la base ne garde que la forme minimale', () => {
  it('REQ-SEC-003 : la base refuse une empreinte hors forme, un kid hors forme, une vue avant la confirmation, un doublon et un apporteur inconnu', async () => {
    const a = await apporteur();
    const empreinte = empreinteDAppareil(tirerIdentifiantDAppareil(), CLE.secret)!;
    const inserer = (v: {
      apporteurId?: string;
      empreinte?: string;
      kid?: string;
      confirmeAt?: string;
      vueAt?: string;
    }) =>
      app.$executeRaw`INSERT INTO appareils_connus (id, apporteur_id, empreinte, kid, confirme_at, derniere_vue_at)
        VALUES (${randomUUID()}::uuid, ${v.apporteurId ?? a}::uuid, ${v.empreinte ?? empreinte},
          ${v.kid ?? CLE.kid}, ${v.confirmeAt ?? '2026-10-03T10:00:00.000Z'}::timestamptz,
          ${v.vueAt ?? '2026-10-03T10:00:00.000Z'}::timestamptz)`;
    // Une adresse réseau, une empreinte entière, des majuscules : refusées.
    for (const horsForme of ['192.168.10.24'.padEnd(32, '0'), 'A'.repeat(32), `${empreinte}00`]) {
      await expect(inserer({ empreinte: horsForme })).rejects.toThrow(
        /appareils_connus_empreinte_forme|value too long/
      );
    }
    await expect(inserer({ kid: 'ZZZZZZZZ' })).rejects.toThrow(/appareils_connus_kid_forme/);
    await expect(
      inserer({ confirmeAt: '2026-10-03T10:00:00.001Z', vueAt: '2026-10-03T10:00:00.000Z' })
    ).rejects.toThrow(/appareils_connus_vue_apres_confirmation/);
    await expect(inserer({ apporteurId: randomUUID() })).rejects.toThrow(
      /appareils_connus_apporteur_id_fkey/
    );
    expect(await inserer({})).toBe(1);
    await expect(inserer({})).rejects.toThrow(/appareils_connus_apporteur_id_empreinte_kid_key/);
  });
});

describe('REQ-SEC-003 — SEC-55 (1) et (5) : la purge, au plus la durée d’une session après la dernière vue', () => {
  it('REQ-SEC-003 : sous `partners_app`, la purge efface l’appareil vu pour la dernière fois il y a trente jours ou plus, garde celui vu une milliseconde plus tard, et ne réécrit rien au passage suivant', async () => {
    await base.prisma.appareilConnu.deleteMany({});
    const a = await apporteur();
    const ligne = (vueAt: Date) => ({
      apporteurId: a,
      empreinte: empreinteDAppareil(tirerIdentifiantDAppareil(), CLE.secret)!,
      kid: CLE.kid,
      confirmeAt: d('2026-08-01T00:00:00.000Z'),
      derniereVueAt: vueAt,
    });
    const echue = ligne(d('2026-09-03T12:00:00.000Z'));
    const plusAncienne = ligne(d('2026-08-15T12:00:00.000Z'));
    const fraiche = ligne(new Date(d('2026-09-03T12:00:00.000Z').getTime() + MS));
    await base.prisma.appareilConnu.createMany({ data: [echue, plusAncienne, fraiche] });

    expect(await purgerLesAppareils(app, d('2026-10-03T12:00:00.000Z'))).toEqual({ purges: 2 });
    const restants = await appareilsDe(a);
    expect(restants.map((r) => r.empreinte)).toEqual([fraiche.empreinte]);
    expect(await purgerLesAppareils(app, d('2026-10-03T12:00:00.000Z'))).toEqual({ purges: 0 });
  });
});
