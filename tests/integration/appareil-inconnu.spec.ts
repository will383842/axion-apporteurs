// @req REQ-SEC-003
/**
 * SEC-55 — l'appareil inconnu est un signal de sécurité du COMPTE, jamais une anomalie, en base
 * RÉELLE. Les sessions se jugent, les appareils s'écrivent et se purgent sous `partners_app`, le rôle
 * d'exécution PROVISIONNÉ, comme en production.
 *
 * CE QU'IL PROUVE (cadrage de la lentille sécurité, point 5, et sa note sur 4913c6a3) :
 *   1. nouvel appareil → refusé, même sur une session fraîche ; il se confirme à la CONSOMMATION
 *      d'un lien sur lui : la consommation se valide, l'avis part hors de toute transaction, puis
 *      une transaction courte rejuge la session et le confirme ; il passe ensuite sans avis ; un
 *      cookie de session volé, présenté depuis un autre appareil, ne fait connaître aucun appareil ;
 *      en production (SEC-62), l'avis part par `notifier()`, et seul un courriel envoyé confirme ;
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
import { PrismaClient, type StatutCourriel } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import {
  MODELE_APPORTEUR,
  ecrituresDeLien,
  transactionDeConfirmation,
  transactionDeConsommation,
} from '../../src/server/auth/lien-magique-depot';
import {
  consommerLien,
  empreinteDuCode,
  empreinteDuJeton,
  tirerJeton,
} from '../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import {
  configurationDuLien,
  portsDeConsommation,
} from '../../src/server/auth/lien-magique-production';
import { horlogeFigee } from '../../src/domain/temps/horloge';
import type { DemandeDEnvoi } from '../../src/server/integrations/zeptomail/emetteur';
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
import { semerAttribution } from '../../prisma/seed/10-attributions';
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
/** L'environnement du processus : ses secrets factices, tirés pour ce fichier. */
const ENV_DU_PROCESSUS: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec55-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV_DU_PROCESSUS);

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

/**
 * Un RÉSILIÉ AUX DROITS EN COURS : une attribution `figee_resiliation`, qui le gardait en LECTURE sous
 * SEC-19. SEC-70 (contrat v2, art. 12.3) : il n'ouvre plus rien. Sa grille est une version d'essai,
 * propre au témoin.
 */
async function resilieAuxDroitsEnCours(): Promise<string> {
  const a = await apporteur();
  const grille = await base.prisma.grilleCommission.create({
    data: {
      version: 900 + sequence,
      hash: randomBytes(32).toString('hex'),
      contenuJson: { essai: true },
      publieeAt: d('2026-10-01T08:00:00.000Z'),
      importeeAt: d('2026-10-01T08:00:00.000Z'),
    },
  });
  await semerAttribution(base.prisma, {
    id: randomUUID(),
    apporteurId: a,
    grilleCommissionId: grille.id,
    siren: `9${String(sequence).padStart(8, '0')}`,
    statut: 'figee_resiliation',
    dateContact: d('2026-10-01T00:00:00.000Z'),
  });
  // La base exige le motif d'une résiliation (`apporteurs_motif_si_resilie`).
  await base.prisma.apporteur.update({
    where: { id: a },
    data: { statut: 'resilie', resiliationMotif: 'ordinaire_apporteur' },
  });
  return a;
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

/** Les ports de la garde, à l'instant donné, en base réelle. */
function ports(maintenant: Date): PortsDAppareil {
  return {
    session: {
      maintenant: () => maintenant,
      depot: depotDeSessions(app),
      configuration: CONFIGURATION.session,
    },
    depot: depotDAppareils(app),
    cle: CLE,
  };
}

const CONFIGURATION_DU_LIEN = {
  secret: CONFIGURATION.lien.secret,
  kid: CONFIGURATION.lien.kid,
  urlPublique: 'https://partners.example.org',
  session: CONFIGURATION.session,
};

/**
 * La connexion RÉELLE : un lien émis, puis consommé sur l'appareil donné, à l'instant donné, par
 * `consommerLien` dans sa transaction en base ; l'appareil se confirme ENSUITE, dans la transaction
 * courte de confirmation, en base aussi (voie (b) de la lentille sécurité). L'avis est un double,
 * que le témoin peut remplacer pour agir pendant qu'il est en vol.
 */
async function connecter(
  apporteurId: string,
  identifiantAppareil: unknown,
  maintenant: Date,
  pendantLAvis?: (avis: { apporteurId: string; confirmeAt: Date }) => Promise<void>
) {
  const jeton = tirerJeton();
  await ecrituresDeLien(app).insererLien({
    apporteurId,
    tokenHash: empreinteDuJeton(jeton, CONFIGURATION_DU_LIEN.secret),
    codeHash: empreinteDuCode('042137', CONFIGURATION_DU_LIEN.secret),
    kid: CONFIGURATION_DU_LIEN.kid,
    creeAt: maintenant,
    expireAt: new Date(maintenant.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
  });
  const aviser = vi.fn(async (avis: { apporteurId: string; confirmeAt: Date }) => {
    if (pendantLAvis) await pendantLAvis(avis);
  });
  const resultat = await consommerLien(
    { jeton, ipHash: null, identifiantAppareil },
    {
      maintenant: () => maintenant,
      transaction: transactionDeConsommation(app),
      configuration: CONFIGURATION_DU_LIEN,
      appareils: {
        aviser,
        maintenant: () => maintenant,
        transaction: transactionDeConfirmation(app),
      },
    }
  );
  return { resultat, aviser };
}

/** Les sessions de l'espace d'un apporteur, telles que la base les rend, vues d'une AUTRE connexion. */
function sessionsDe(apporteurId: string) {
  return base.prisma.sessionEspace.findMany({
    where: { apporteurId },
    select: { lienMagiqueId: true, revoqueAt: true },
  });
}

/** Les appareils connus d'un apporteur, tels que la base les rend. */
function appareilsDe(apporteurId: string) {
  return base.prisma.appareilConnu.findMany({
    where: { apporteurId },
    select: { empreinte: true, kid: true, confirmeAt: true, derniereVueAt: true },
    orderBy: { confirmeAt: 'asc' },
  });
}

describe('REQ-SEC-003 — SEC-55 : un nouvel appareil se confirme à la CONSOMMATION du lien, sur lui ; la garde ne confirme jamais', () => {
  it('REQ-SEC-003 : refusé sur une session ancienne ET sur une session fraîche ; confirmé par la consommation d’un lien sur CET appareil, avec son avis ; puis connu, sans avis', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const ancienne = await session(a, d('2026-10-03T08:00:00.000Z'));
    expect(
      await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T09:00:00.000Z')))
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });

    // Une session ouverte il y a une minute ne confirme RIEN : la fraîcheur est celle de la session.
    const fraiche = await session(a, d('2026-10-03T09:05:00.000Z'));
    expect(
      await exigerAppareilConfirme(fraiche, identifiant, ports(d('2026-10-03T09:06:00.000Z')))
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    expect(await appareilsDe(a)).toEqual([]);

    // Un lien consommé sur CET appareil : l'avis part, puis l'appareil est connu, dans la transaction.
    const connexion = await connecter(a, identifiant, d('2026-10-03T09:14:59.999Z'));
    expect(connexion.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant, issue: 'confirme' },
    });
    expect(connexion.aviser).toHaveBeenCalledTimes(1);
    expect(connexion.aviser).toHaveBeenCalledWith({
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

    // Connu : il passe, même sur l'ancienne session ; sa dernière vue avance.
    expect(
      (await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-04T10:00:00.000Z')))).ok
    ).toBe(true);
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte: empreinteDAppareil(identifiant, CLE.secret),
        kid: CLE.kid,
        confirmeAt: d('2026-10-03T09:14:59.999Z'),
        derniereVueAt: d('2026-10-04T10:00:00.000Z'),
      },
    ]);

    // Un nouveau lien consommé sur le même appareil : reconnu, sans second avis.
    const seconde = await connecter(a, identifiant, d('2026-10-04T11:00:00.000Z'));
    expect(seconde.resultat).toMatchObject({ etat: 'ouverte', appareil: { issue: 'connu' } });
    expect(seconde.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : TÉMOIN DE LA LENTILLE SÉCURITÉ — un cookie de session volé : la session ouverte il y a une minute par la vraie connexion, présentée depuis un AUTRE appareil, est refusée ; rien n’est écrit', async () => {
    const a = await apporteur();
    const sonAppareil = tirerIdentifiantDAppareil();
    const connexion = await connecter(a, sonAppareil, d('2026-10-03T11:00:00.000Z'));
    if (connexion.resultat.etat !== 'ouverte') throw new Error('connexion attendue');
    const volee = connexion.resultat.jetonSession;
    const avantLeVol = await appareilsDe(a);
    expect(avantLeVol).toHaveLength(1);

    const appareilDuTiers = tirerIdentifiantDAppareil();
    expect(
      await exigerAppareilConfirme(volee, appareilDuTiers, ports(d('2026-10-03T11:01:00.000Z')))
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    expect(await appareilsDe(a)).toEqual(avantLeVol);
    // L'appareil de l'apporteur, lui, passe sur la même session.
    expect(
      (await exigerAppareilConfirme(volee, sonAppareil, ports(d('2026-10-03T11:01:00.000Z')))).ok
    ).toBe(true);
  });

  it('REQ-SEC-003 : à la consommation, un identifiant absent ou hors forme est remplacé par un identifiant NEUF, confirmé et rendu à poser ; le hors-forme n’est jamais écrit', async () => {
    for (const illisible of [undefined, '', 'pas-un-identifiant']) {
      const a = await apporteur();
      const connexion = await connecter(a, illisible, d('2026-10-03T12:00:00.000Z'));
      const appareil = connexion.resultat.etat === 'ouverte' ? connexion.resultat.appareil : null;
      expect(appareil?.issue).toBe('confirme');
      expect(appareil?.identifiant).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await appareilsDe(a)).map((r) => r.empreinte)).toEqual([
        empreinteDAppareil(appareil?.identifiant, CLE.secret),
      ]);
    }
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
    await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T08:00:00.000Z')));
    await connecter(a, identifiant, d('2026-10-03T08:01:00.000Z'));
    await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T09:00:00.000Z')));
    expect(await compter()).toEqual(comptesAvant);
    expect(await fiche()).toEqual(ficheAvant);
  });

  it('REQ-SEC-003 : un appareil est connu pour UN compte — le même identifiant, sur un autre compte, est inconnu', async () => {
    const a = await apporteur();
    const b = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    await connecter(a, identifiant, d('2026-10-03T13:00:00.000Z'));
    const ancienneB = await session(b, d('2026-10-02T13:00:00.000Z'));
    expect(
      await exigerAppareilConfirme(ancienneB, identifiant, ports(d('2026-10-03T13:02:00.000Z')))
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    expect(await appareilsDe(b)).toEqual([]);
  });

  it('REQ-SEC-003 : vu pour la dernière fois il y a trente jours ou plus, l’appareil redevient inconnu ; un lien consommé sur lui le rétablit, avec son avis', async () => {
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
          ports(avant(d('2026-10-03T10:00:00.000Z')))
        )
      ).ok
    ).toBe(true);
    await base.prisma.appareilConnu.updateMany({
      where: { apporteurId: a },
      data: { derniereVueAt: d('2026-09-03T10:00:00.000Z') },
    });
    // Trente jours pile : inconnu.
    expect(
      await exigerAppareilConfirme(ancienne, identifiant, ports(d('2026-10-03T10:00:00.000Z')))
    ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    const connexion = await connecter(a, identifiant, d('2026-10-03T10:05:00.000Z'));
    expect(connexion.resultat).toMatchObject({ etat: 'ouverte', appareil: { issue: 'confirme' } });
    expect(connexion.aviser).toHaveBeenCalledTimes(1);
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte,
        kid: CLE.kid,
        confirmeAt: d('2026-10-03T10:05:00.000Z'),
        derniereVueAt: d('2026-10-03T10:05:00.000Z'),
      },
    ]);
  });

  it('REQ-SEC-003 : échec fermé — à la garde, un identifiant absent ou hors forme, même sur une session fraîche, est refusé ; rien n’est écrit', async () => {
    const a = await apporteur();
    const fraiche = await session(a, d('2026-10-03T15:00:00.000Z'));
    for (const illisible of [
      undefined,
      '',
      'pas-un-identifiant',
      `${tirerIdentifiantDAppareil()}=`,
    ]) {
      expect(
        await exigerAppareilConfirme(fraiche, illisible, ports(d('2026-10-03T15:01:00.000Z')))
      ).toEqual({ ok: false, motif: 'appareil_inconnu' });
    }
    expect(await appareilsDe(a)).toEqual([]);
  });
});

describe('REQ-SEC-003 — voie (b) de la lentille sécurité, en base réelle : la consommation se VALIDE, l’avis part hors de toute transaction, puis une transaction courte rejuge et confirme', () => {
  it('REQ-SEC-003 : (1) pendant l’avis, la consommation est DÉJÀ validée — vue d’une autre connexion, la session existe — et l’appareil n’est PAS confirmé', async () => {
    const a = await apporteur();
    const vu: { sessions: number; appareils: number }[] = [];
    const connexion = await connecter(
      a,
      tirerIdentifiantDAppareil(),
      d('2026-10-03T13:00:00.000Z'),
      async () => {
        vu.push({
          sessions: (await sessionsDe(a)).length,
          appareils: (await appareilsDe(a)).length,
        });
      }
    );
    expect(vu).toEqual([{ sessions: 1, appareils: 0 }]);
    expect(connexion.resultat).toMatchObject({ etat: 'ouverte', appareil: { issue: 'confirme' } });
    expect(await appareilsDe(a)).toHaveLength(1);
  });

  it('REQ-SEC-003 : (3) TÉMOIN — un arrêt du processus entre la consommation et la confirmation (avis jamais rendu) laisse l’appareil NON confirmé ; la session est ouverte', async () => {
    const a = await apporteur();
    void connecter(
      a,
      tirerIdentifiantDAppareil(),
      d('2026-10-03T13:10:00.000Z'),
      () => new Promise<void>(() => undefined)
    );
    await vi.waitFor(async () => expect(await sessionsDe(a)).toHaveLength(1));
    expect(await appareilsDe(a)).toEqual([]);
  });

  it('REQ-SEC-003 : (3) un avis refusé ou en échec ne confirme RIEN — `avis_echoue`, la session ouverte, aucune ligne d’appareil', async () => {
    const a = await apporteur();
    const connexion = await connecter(
      a,
      tirerIdentifiantDAppareil(),
      d('2026-10-03T13:20:00.000Z'),
      async () => {
        throw new Error('avis_en_echec');
      }
    );
    expect(connexion.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { issue: 'avis_echoue' },
    });
    expect(await sessionsDe(a)).toHaveLength(1);
    expect(await appareilsDe(a)).toEqual([]);
  });

  it('REQ-SEC-003 : (2) la session révoquée pendant l’avis — la transaction de confirmation la rejuge : RIEN n’est confirmé', async () => {
    const a = await apporteur();
    const connexion = await connecter(
      a,
      tirerIdentifiantDAppareil(),
      d('2026-10-03T13:30:00.000Z'),
      async () => {
        await base.prisma.sessionEspace.updateMany({
          where: { apporteurId: a },
          data: { revoqueAt: d('2026-10-03T13:30:00.000Z') },
        });
      }
    );
    expect(connexion.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { issue: 'non_confirme' },
    });
    expect(await appareilsDe(a)).toEqual([]);
  });

  it('REQ-SEC-003 : (2) l’apporteur qui n’est plus actif pendant l’avis — RIEN n’est confirmé', async () => {
    const a = await apporteur();
    const connexion = await connecter(
      a,
      tirerIdentifiantDAppareil(),
      d('2026-10-03T13:40:00.000Z'),
      async () => {
        // La base exige le motif d'une résiliation (`apporteurs_motif_si_resilie`).
        await base.prisma.apporteur.update({
          where: { id: a },
          data: { statut: 'resilie', resiliationMotif: 'ordinaire_apporteur' },
        });
      }
    );
    expect(connexion.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { issue: 'non_confirme' },
    });
    expect(await appareilsDe(a)).toEqual([]);
  });

  it('REQ-SEC-003 : (2) idempotente — un appareil devenu connu pendant l’avis n’est pas confirmé deux fois : RIEN n’est réécrit, l’issue dit `connu`', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const avant = d('2026-10-03T13:49:00.000Z');
    const connexion = await connecter(a, identifiant, d('2026-10-03T13:50:00.000Z'), async () => {
      await base.prisma.appareilConnu.create({
        data: {
          apporteurId: a,
          empreinte: empreinteDAppareil(identifiant, CLE.secret) as string,
          kid: CLE.kid,
          confirmeAt: avant,
          derniereVueAt: avant,
        },
      });
    });
    expect(connexion.resultat).toMatchObject({ etat: 'ouverte', appareil: { issue: 'connu' } });
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte: empreinteDAppareil(identifiant, CLE.secret),
        kid: CLE.kid,
        confirmeAt: avant,
        derniereVueAt: avant,
      },
    ]);
  });
});

describe('REQ-SEC-003 — SEC-62 sur SEC-70 : un résilié n’ouvre aucune session et ne fait connaître aucun appareil', () => {
  it('REQ-SEC-032 : TÉMOIN à deux faces — un résilié aux droits en cours consomme un lien déjà émis : INVALIDE comme un lien inconnu, aucun avis, aucune session, aucune ligne d’appareil ; le même parcours pour un apporteur `signe` confirme l’appareil', async () => {
    const maintenant = d('2026-10-03T14:00:00.000Z');

    const resilie = await resilieAuxDroitsEnCours();
    const ferme = await connecter(resilie, tirerIdentifiantDAppareil(), maintenant);
    expect(ferme.resultat).toEqual({ etat: 'lien_invalide' });
    expect(ferme.aviser).not.toHaveBeenCalled();
    expect(await appareilsDe(resilie)).toEqual([]);
    expect(await base.prisma.sessionEspace.count({ where: { apporteurId: resilie } })).toBe(0);

    const signe = await apporteur();
    const pleine = await connecter(signe, tirerIdentifiantDAppareil(), maintenant);
    expect(pleine.resultat).toMatchObject({ etat: 'ouverte', appareil: { issue: 'confirme' } });
    expect(pleine.aviser).toHaveBeenCalledTimes(1);
    expect(await appareilsDe(signe)).toHaveLength(1);
  });
});

// ── le BRANCHEMENT en production (SEC-62), en base réelle ───────────────────────────────────────

/**
 * La connexion RÉELLE par les ports de la PRODUCTION (`portsDeConsommation`) : le lien est émis sous
 * la configuration du processus, consommé dans sa transaction en base, puis l'avis part par
 * `notifier()` à un émetteur simulé, qui rend le statut donné.
 */
async function connecterEnProduction(
  apporteurId: string,
  identifiantAppareil: unknown,
  maintenant: Date,
  statut: StatutCourriel
) {
  const configuration = configurationDuLien(ENV_DU_PROCESSUS);
  const jeton = tirerJeton();
  await ecrituresDeLien(app).insererLien({
    apporteurId,
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    codeHash: empreinteDuCode('042137', configuration.secret),
    kid: configuration.kid,
    creeAt: maintenant,
    expireAt: new Date(maintenant.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
  });
  const envoyerCourriel = vi.fn(async (_demande: DemandeDEnvoi) => statut);
  const resultat = await consommerLien(
    { jeton, ipHash: null, identifiantAppareil },
    portsDeConsommation({
      env: ENV_DU_PROCESSUS,
      prisma: app,
      horloge: horlogeFigee(maintenant.getTime()),
      envoyerCourriel,
    })
  );
  return { resultat, envoyerCourriel, cle: cleDesAppareils(configuration.session.secret) };
}

describe('REQ-SEC-003 — le BRANCHEMENT en production (SEC-62), en base réelle : le clic avise par `notifier()`, et l’appareil n’est connu que si le courriel est envoyé', () => {
  it('REQ-SEC-003 : courriel envoyé — l’avis part UNE fois, à l’adresse stockée, sous `nouvel_appareil` ; l’appareil est confirmé ; la connexion suivante le reconnaît, sans avis', async () => {
    const a = await apporteur();
    const identifiant = tirerIdentifiantDAppareil();
    const t = d('2026-10-04T12:20:00.000Z');
    const premiere = await connecterEnProduction(a, identifiant, t, 'envoye');
    expect(premiere.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant, issue: 'confirme' },
    });
    expect(premiere.envoyerCourriel).toHaveBeenCalledTimes(1);
    const demande = premiere.envoyerCourriel.mock.calls[0]?.[0];
    expect(demande).toMatchObject({
      gabarit: 'nouvel_appareil',
      sujet: 'Connexion à votre espace depuis un nouvel appareil',
      apporteurId: a,
    });
    expect(demande?.a).toMatch(/^appareil-\d+@example\.org$/);
    expect(demande?.corps).toContain('le 4 octobre 2026 à 14 h 20 (heure de Paris)');
    expect(JSON.stringify(demande)).not.toContain(identifiant);
    expect(await appareilsDe(a)).toEqual([
      {
        empreinte: empreinteDAppareil(identifiant, premiere.cle.secret),
        kid: premiere.cle.kid,
        confirmeAt: t,
        derniereVueAt: t,
      },
    ]);

    const seconde = await connecterEnProduction(
      a,
      identifiant,
      d('2026-10-04T12:30:00.000Z'),
      'envoye'
    );
    expect(seconde.resultat).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant, issue: 'connu' },
    });
    expect(seconde.envoyerCourriel).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : (3) échec fermé — un courriel en échec ou retenu : `avis_echoue`, la session ouverte, AUCUN appareil écrit', async () => {
    for (const statut of [
      'echec',
      'retenu_dmarc_non_verifie',
      'retenu_adresse_supprimee',
    ] as const) {
      const a = await apporteur();
      const r = await connecterEnProduction(
        a,
        tirerIdentifiantDAppareil(),
        d('2026-10-04T13:00:00.000Z'),
        statut
      );
      expect(r.resultat, statut).toMatchObject({
        etat: 'ouverte',
        appareil: { issue: 'avis_echoue' },
      });
      expect(await appareilsDe(a)).toEqual([]);
      expect(await sessionsDe(a)).toHaveLength(1);
    }
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
    // Le doublon : Prisma ne rend que le code et le détail de l'index unique, pas son nom.
    await expect(inserer({})).rejects.toThrow(
      /Code: `23505`\. Message: `Key \(apporteur_id, empreinte, kid\)=/
    );
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
