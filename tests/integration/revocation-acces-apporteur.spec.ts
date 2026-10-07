// @req REQ-SEC-003
// @req REQ-JUR-069
/**
 * SEC-71 — la révocation de l'accès d'un apporteur par la console, puis le RENOUVELLEMENT par le
 * passage d'envoi, en base RÉELLE (contrat v2, art. 3.8).
 *
 * Le geste et le passage tournent sous `partners_app`, le rôle d'exécution PROVISIONNÉ, comme en
 * production ; les fixtures et les lectures restent sous le propriétaire. Le passage garde ses ports
 * réels (`lireLot`, `preparer`) ; seul l'envoi passe par l'émetteur unique RÉEL (`emettre`, dépôt des
 * courriels réel), devant un relais SIMULÉ qui note chaque appel — aucun réseau.
 *
 * CE QUE LES TÉMOINS TIENNENT :
 *   1. le geste coupe TOUT : version de session +1, appareils oubliés, jeton de dépôt révoqué, lien
 *      non consommé annulé (le consommé intact), UN fait `apporteur_acces_revoque` à la charge fermée,
 *      UNE notification `acces_renouvele` liée à ce fait ;
 *   2. il ne touche ni aux attributions (identiques à l'octet) ni au statut ;
 *   3. un résilié est refusé (`contrat_termine`), un candidat aussi (`sans_acces`) : rien n'est écrit ;
 *   4. le passage envoie le LIEN puis l'AVIS (seul l'avis porte la notification), tire un lien neuf,
 *      et ne renvoie rien au passage suivant ;
 *   5. un lien qui ne part pas : aucun avis, la notification reste à faire ; le passage suivant tire
 *      un lien NEUF, annule celui du passage manqué, et envoie lien puis avis ;
 *   6. deux révocations : seule la plus récente est portée, l'autre est supplantée ;
 *   7. un apporteur résilié entre le geste et le passage : rien ne part ;
 *   8. ni le jeton ni l'URL du lien ne sont écrits : ni notification, ni journal, ni courriel, ni
 *      sortie du processus.
 * Secrets et jetons sont tirés à l'exécution ; les instants viennent d'une horloge de test monotone.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { PrismaClient, type StatutApporteur, type StatutCourriel } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { domaines } from '../../src/config/entite';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { semerSession } from '../../prisma/seed/05-sessions';
import {
  ErreurRevocationAcces,
  revoquerLAccesDUnApporteur,
  type MotifDeRevocation,
} from '../../src/server/console/acces-apporteur';
import {
  portsDuRenouvellement,
  renouvelerLesAcces,
  type PortsDuRenouvellement,
} from '../../src/server/taches/renouveler-acces';
import {
  depotDesCourriels,
  emettre,
  type DemandeDEnvoi,
} from '../../src/server/integrations/zeptomail/emetteur';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;
let adminId: string;
let grilleId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
/** L'environnement du processus : des secrets factices, tirés pour ce fichier (jamais un secret réel). */
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec71-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);

/** Les fixtures sont posées la veille ; tout le reste suit une horloge monotone, une seconde par tic. */
const VEILLE = new Date('2026-10-06T08:00:00.000Z');
let tic = new Date('2026-10-07T08:00:00.000Z').getTime();
const horloge = () => new Date((tic += 1000));

/** Les secrets des sessions semées : propres aux fixtures, distincts de ceux du processus. */
const secretLien = hex(32);
const secretSession = hex(32);
const CONFIGURATION_DES_SESSIONS = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: VEILLE,
        importeeAt: VEILLE,
      },
    })
  ).id;
  // Le premier administrateur, VALIDÉ sans validateur (le fondateur) : le geste relit sa validation.
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    VEILLE
  );
  adminId = admin!.id;
  await app.$executeRawUnsafe(
    'UPDATE utilisateurs_console SET valide_at = clock_timestamp() WHERE id = $1::uuid',
    adminId
  );
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

// ── les fixtures ──────────────────────────────────────────────────────────────────────────────────

let sequence = 0;

/** Un apporteur au courriel chiffré par la couche des données personnelles, sous les clés du test. */
async function unApporteur(statut: StatutApporteur = 'signe'): Promise<string> {
  sequence += 1;
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: `revocation-${sequence}@example.org` },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut,
      // La base exige le motif d'une résiliation (`apporteurs_motif_si_resilie`).
      ...(statut === 'resilie' ? { resiliationMotif: 'ordinaire_apporteur' as const } : {}),
      codeParrainage: `AX7${String(sequence).padStart(5, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: VEILLE,
    },
  });
  return id;
}

/** Tout ce que l'accès d'un apporteur porte : deux sessions, un appareil, un jeton, un lien en attente. */
async function unAccesComplet(apporteurId: string): Promise<{ lienConsomme: string }> {
  const s1 = await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession: tirerJeton(),
    consommeAt: VEILLE,
    ipHash: null,
    configuration: CONFIGURATION_DES_SESSIONS,
  });
  await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession: tirerJeton(),
    consommeAt: new Date(VEILLE.getTime() + 60_000),
    ipHash: null,
    configuration: CONFIGURATION_DES_SESSIONS,
  });
  await base.prisma.appareilConnu.create({
    data: {
      apporteurId,
      empreinte: hex(16),
      kid: hex(4),
      confirmeAt: VEILLE,
      derniereVueAt: VEILLE,
    },
  });
  await base.prisma.jetonDepot.create({
    data: { apporteurId, tokenHash: hex(32), creeAt: VEILLE },
  });
  await base.prisma.lienMagique.create({
    data: {
      apporteurId,
      tokenHash: hex(32),
      kid: CONFIGURATION_DES_SESSIONS.lien.kid,
      creeAt: VEILLE,
      expireAt: new Date(VEILLE.getTime() + 15 * 60_000),
    },
  });
  return { lienConsomme: s1.lienMagiqueId };
}

/** Une attribution active de l'apporteur, par SQL brut. */
async function uneAttribution(apporteurId: string): Promise<void> {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'active'::etat_attribution, $3, 'espace'::canal_depot, $4::uuid,
       '2026-10-01', false, false, false)`,
    randomUUID(),
    apporteurId,
    `79${String(sequence).padStart(7, '0')}`,
    grilleId
  );
}

/** Le geste, sous `partners_app`, par l'administrateur validé. */
function revoquer(apporteurId: string, motif: MotifDeRevocation = 'securite') {
  return revoquerLAccesDUnApporteur(app, {
    acteur: { id: adminId, role: 'admin' },
    apporteurId,
    motif,
    maintenant: horloge(),
  });
}

// ── le passage, son relais simulé ──────────────────────────────────────────────────────────────────

type AppelDuRelais = {
  gabarit: string;
  notificationEspaceId: string | null;
  corps: string;
};

/**
 * Les ports RÉELS du passage, sous `partners_app`, restreints à UN apporteur (la base est partagée
 * par les témoins) ; l'envoi passe par l'émetteur unique réel, devant un relais simulé qui note chaque
 * appel et réussit ou échoue selon le gabarit.
 */
function passage(
  apporteurId: string,
  appels: AppelDuRelais[],
  reussit: (gabarit: string) => boolean = () => true
): PortsDuRenouvellement {
  const reels = portsDuRenouvellement(app, ENV, horloge);
  return {
    lireLot: async (take) =>
      (await reels.lireLot(take)).filter((n) => n.apporteurId === apporteurId),
    preparer: (n) => reels.preparer(n),
    envoyer: async (demande: DemandeDEnvoi): Promise<StatutCourriel> =>
      (
        await emettre(demande, {
          configuration: { expediteur: `contact@${domaines().envoi}`, dmarcVerifie: true },
          relais: {
            async envoyer(m) {
              appels.push({
                gabarit: demande.gabarit,
                notificationEspaceId: demande.notificationEspaceId ?? null,
                corps: m.corps,
              });
              if (!reussit(demande.gabarit)) throw new Error('relais indisponible');
              return { messageId: `m-${appels.length}` };
            },
          },
          cles: CLES,
          nouvelId: randomUUID,
          maintenant: horloge,
          depot: depotDesCourriels(base.prisma),
        })
      ).statut,
  };
}

const notifications = (apporteurId: string) =>
  base.prisma.notificationEspace.findMany({
    where: { apporteurId, cle: 'acces_renouvele' },
    orderBy: { evenementId: 'asc' },
  });

const faits = (apporteurId: string) =>
  base.prisma.evenement.findMany({
    where: { type: 'apporteur_acces_revoque', agregatId: apporteurId },
  });

const courriels = (apporteurId: string) =>
  base.prisma.courrielEnvoye.findMany({ where: { apporteurId }, orderBy: { demandeAt: 'asc' } });

/** Les liens toujours actifs : ni consommés, ni annulés. */
const liensActifs = (apporteurId: string) =>
  base.prisma.lienMagique.findMany({ where: { apporteurId, consommeAt: null, annuleAt: null } });

/** Les lignes d'une table qui parlent de l'apporteur, en JSON de la base (aucun BigInt à sérialiser). */
async function lignesEnJson(table: string, colonne: string, apporteurId: string): Promise<string> {
  const lignes = await base.prisma.$queryRawUnsafe<{ t: string }[]>(
    `SELECT to_jsonb(x)::text AS t FROM ${table} x WHERE x.${colonne} = $1::uuid`,
    apporteurId
  );
  return lignes.map((l) => l.t).join('\n');
}

// ── les témoins ────────────────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-003 REQ-JUR-069 — la révocation de l’accès d’un apporteur, en base réelle', () => {
  it('REQ-SEC-003 : le geste fait tomber les sessions, oublie l’appareil, révoque le jeton de dépôt et le lien en attente, journalise UN fait et met UNE notification en file', async () => {
    const apporteurId = await unApporteur('signe');
    const { lienConsomme } = await unAccesComplet(apporteurId);
    const avant = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });

    const bilan = await revoquer(apporteurId, 'signalement_apporteur');

    expect(bilan).toEqual({ appareilsOublies: 1, liensAnnules: 1, jetonsRevoques: 1 });
    const apres = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });
    expect(apres.sessionVersion).toBe(avant.sessionVersion + 1);
    // Les deux sessions portent l'ANCIENNE version : elles ne passent plus.
    const sessions = await base.prisma.sessionEspace.findMany({ where: { apporteurId } });
    expect(sessions).toHaveLength(2);
    for (const s of sessions) expect(s.sessionVersion).toBeLessThan(apres.sessionVersion);
    expect(await base.prisma.appareilConnu.count({ where: { apporteurId } })).toBe(0);
    const jetons = await base.prisma.jetonDepot.findMany({ where: { apporteurId } });
    expect(jetons).toHaveLength(1);
    expect(jetons[0]!.revoqueAt).not.toBeNull();
    expect(await liensActifs(apporteurId)).toHaveLength(0);
    const consomme = await base.prisma.lienMagique.findUniqueOrThrow({
      where: { id: lienConsomme },
    });
    expect(consomme.consommeAt).not.toBeNull();
    expect(consomme.annuleAt).toBeNull();
    expect(
      await base.prisma.lienMagique.count({ where: { apporteurId, annuleAt: { not: null } } })
    ).toBe(1);

    const [fait, ...autresFaits] = await faits(apporteurId);
    expect(autresFaits).toHaveLength(0);
    expect(fait!.charge).toEqual({
      motif: 'signalement_apporteur',
      acteur: { par: 'utilisateur_console', id: adminId },
    });
    const [notification, ...autresNotifications] = await notifications(apporteurId);
    expect(autresNotifications).toHaveLength(0);
    expect(notification!.evenementId).toBe(fait!.id);
  });

  it('REQ-JUR-069 : le geste ne touche ni aux attributions, identiques à l’octet, ni au statut', async () => {
    const apporteurId = await unApporteur('signe');
    await unAccesComplet(apporteurId);
    await uneAttribution(apporteurId);
    await uneAttribution(apporteurId);
    const attributions = () => lignesEnJson('attributions', 'apporteur_id', apporteurId);
    const avant = await attributions();
    expect(avant.split('\n')).toHaveLength(2);

    await revoquer(apporteurId);

    expect(await attributions()).toBe(avant);
    const apres = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });
    expect(apres.statut).toBe('signe');
  });

  it('REQ-JUR-069 : un résilié est refusé (contrat_termine), un candidat aussi (sans_acces) — et rien n’est écrit', async () => {
    for (const [statut, motif] of [
      ['resilie', 'contrat_termine'],
      ['candidat', 'sans_acces'],
    ] as const) {
      const apporteurId = await unApporteur(statut);
      const avant = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });

      const refus = await revoquer(apporteurId).catch((e: unknown) => e);

      expect(refus).toBeInstanceOf(ErreurRevocationAcces);
      expect((refus as ErreurRevocationAcces).motif).toBe(motif);
      const apres = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });
      expect(apres.sessionVersion).toBe(avant.sessionVersion);
      expect(apres.statut).toBe(statut);
      expect(await faits(apporteurId)).toHaveLength(0);
      expect(await notifications(apporteurId)).toHaveLength(0);
    }
  });

  it('REQ-JUR-069 : le passage envoie le lien PUIS l’avis, seul l’avis porte la notification, un lien neuf est tiré — et le passage suivant n’envoie rien', async () => {
    const apporteurId = await unApporteur('signe');
    await unAccesComplet(apporteurId);
    await revoquer(apporteurId);
    const [notification] = await notifications(apporteurId);
    const appels: AppelDuRelais[] = [];

    const bilan = await renouvelerLesAcces(passage(apporteurId, appels));

    expect(bilan).toMatchObject({ lus: 1, renouveles: 1, liensNonPartis: 0, avisNonPartis: 0 });
    expect(appels.map((a) => [a.gabarit, a.notificationEspaceId])).toEqual([
      ['lien_magique', null],
      ['acces_renouvele', notification!.id],
    ]);
    const lignes = await courriels(apporteurId);
    expect(lignes.map((l) => [l.gabarit, l.statut, l.notificationEspaceId])).toEqual([
      ['lien_magique', 'envoye', null],
      ['acces_renouvele', 'envoye', notification!.id],
    ]);
    const actifs = await liensActifs(apporteurId);
    expect(actifs).toHaveLength(1);
    expect(actifs[0]!.codeHash).not.toBeNull();

    const encore = await renouvelerLesAcces(passage(apporteurId, appels));

    expect(encore.lus).toBe(0);
    expect(appels).toHaveLength(2);
    expect(await courriels(apporteurId)).toHaveLength(2);
  });

  it('REQ-JUR-069 : un lien qui ne part pas — aucun avis, la notification reste à faire ; le passage suivant tire un lien NEUF et envoie lien puis avis', async () => {
    const apporteurId = await unApporteur('signe');
    await unAccesComplet(apporteurId);
    await revoquer(apporteurId);
    const [notification] = await notifications(apporteurId);
    const appels: AppelDuRelais[] = [];

    const manque = await renouvelerLesAcces(
      passage(apporteurId, appels, (gabarit) => gabarit !== 'lien_magique')
    );

    expect(manque).toMatchObject({ lus: 1, renouveles: 0, liensNonPartis: 1 });
    expect(appels.map((a) => a.gabarit)).toEqual(['lien_magique']);
    expect(
      (await courriels(apporteurId)).map((l) => [l.gabarit, l.statut, l.notificationEspaceId])
    ).toEqual([['lien_magique', 'echec', null]]);
    const [lienDuPassageManque, ...autres] = await liensActifs(apporteurId);
    expect(autres).toHaveLength(0);

    const reprise = await renouvelerLesAcces(passage(apporteurId, appels));

    expect(reprise).toMatchObject({ lus: 1, renouveles: 1 });
    expect(appels.map((a) => [a.gabarit, a.notificationEspaceId])).toEqual([
      ['lien_magique', null],
      ['lien_magique', null],
      ['acces_renouvele', notification!.id],
    ]);
    const manqueRelu = await base.prisma.lienMagique.findUniqueOrThrow({
      where: { id: lienDuPassageManque!.id },
    });
    expect(manqueRelu.annuleAt).not.toBeNull();
    const actifs = await liensActifs(apporteurId);
    expect(actifs).toHaveLength(1);
    expect(actifs[0]!.id).not.toBe(lienDuPassageManque!.id);
  });

  it('REQ-JUR-069 : deux révocations, deux notifications — le passage ne porte que la plus récente, l’autre est supplantée', async () => {
    const apporteurId = await unApporteur('suspendu');
    await unAccesComplet(apporteurId);
    await revoquer(apporteurId, 'securite');
    await revoquer(apporteurId, 'signalement_apporteur');
    const lues = await notifications(apporteurId);
    expect(lues).toHaveLength(2);
    const recente = lues[1]!;
    const appels: AppelDuRelais[] = [];

    await renouvelerLesAcces(passage(apporteurId, appels));
    await renouvelerLesAcces(passage(apporteurId, appels));

    expect(appels.map((a) => [a.gabarit, a.notificationEspaceId])).toEqual([
      ['lien_magique', null],
      ['acces_renouvele', recente.id],
    ]);
  });

  it('REQ-JUR-069 : un apporteur résilié entre le geste et le passage — rien ne part', async () => {
    const apporteurId = await unApporteur('signe');
    await revoquer(apporteurId);
    await base.prisma.apporteur.update({
      where: { id: apporteurId },
      data: { statut: 'resilie', resiliationMotif: 'ordinaire_apporteur' },
    });
    const appels: AppelDuRelais[] = [];

    await renouvelerLesAcces(passage(apporteurId, appels));

    expect(appels).toHaveLength(0);
    expect(await courriels(apporteurId)).toHaveLength(0);
    expect(await liensActifs(apporteurId)).toHaveLength(0);
  });

  it('REQ-SEC-003 : ni le jeton ni l’URL du lien ne sont écrits — ni notification, ni journal, ni courriel, ni sortie du processus', async () => {
    const apporteurId = await unApporteur('kyc_en_cours');
    await unAccesComplet(apporteurId);
    await revoquer(apporteurId);
    const appels: AppelDuRelais[] = [];
    const espions = [
      ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m)),
      vi.spyOn(process.stdout, 'write'),
      vi.spyOn(process.stderr, 'write'),
    ];
    try {
      await renouvelerLesAcces(passage(apporteurId, appels));
    } finally {
      for (const e of espions) e.mockRestore();
    }
    const sorties = espions
      .flatMap((e) => e.mock.calls.flat())
      .map((x: unknown) =>
        typeof x === 'string'
          ? x
          : x instanceof Uint8Array
            ? Buffer.from(x).toString('utf8')
            : inspect(x)
      )
      .join('\n');

    const lien = appels.find((a) => a.gabarit === 'lien_magique');
    const jeton = /\/connexion\/([A-Za-z0-9_-]{43})/.exec(lien?.corps ?? '')?.[1];
    expect(jeton).toBeDefined();
    // L'avis ne porte pas le lien : seul le courriel du lien le porte.
    expect(appels.find((a) => a.gabarit === 'acces_renouvele')?.corps).not.toContain(jeton);

    const stockees = [
      await lignesEnJson('notifications_espace', 'apporteur_id', apporteurId),
      await lignesEnJson('evenements', 'agregat_id', apporteurId),
      await lignesEnJson('courriels_envoyes', 'apporteur_id', apporteurId),
      await lignesEnJson('liens_magiques', 'apporteur_id', apporteurId),
    ];
    for (const t of stockees) {
      expect(t.length).toBeGreaterThan(0);
      expect(t).not.toContain(jeton);
      expect(t).not.toContain('/connexion/');
    }
    expect(sorties).not.toContain(jeton);
  });
});
