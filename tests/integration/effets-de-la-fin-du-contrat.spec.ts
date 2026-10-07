// @req REQ-DM-011
/**
 * DM-63 — les effets de la fin du contrat en phase 1, en base RÉELLE (art. 11 et 12) : la résiliation,
 * en UNE transaction, mène chaque attribution à son état d'arrivée, avec son événement, et le geste de
 * la console est réservé à un rôle nommé.
 *
 * Ce que ce fichier ne juge pas, faute de table : le droit d'une COMMANDE signée après la date d'effet
 * et l'encaissement d'une commande signée avant la fin, reçu après `fenetreFinAt`. Aucune commande ni
 * ligne de commission n'existe encore en base : ces deux témoins sont ceux de la règle pure
 * (`tests/unit/domaine/fin-du-contrat.spec.ts`), qui ne reçoit ni fenêtre ni date d'encaissement. Dès
 * qu'une ligne de commission existe, le témoin « aucune ligne acquise n'est perdue » s'écrit ICI,
 * contre la règle de paiement (REQ-ARG-026), et n'est pas remplacé par un autre.
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures et
 * les lectures restent sous le propriétaire.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { resilierDepuisLaConsole } from '../../src/server/apporteur/resilier';
import { empreinteDeSessionConsole } from '../../src/server/auth/lien-magique';
import { depotDeSessionsConsole } from '../../src/server/roles/require-role';
import { etatApresFinDuContrat } from '../../src/domain/apporteur/fin-du-contrat';
import type { EtatAttribution } from '../../src/domain/attribution/machine';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let app: PrismaClient;
let grilleId: string;

const MAINTENANT = new Date('2026-10-04T08:00:00.000Z');
const SECRET = 's'.repeat(48);
const KID = 'kid-dm-63';
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 810000000;
const unSiren = () => String((sirens += 1));
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-63-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});

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
        publieeAt: MAINTENANT,
        importeeAt: MAINTENANT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(statut = 'signe'): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: statut as never,
        codeParrainage: `AX${hex(3).toUpperCase()}`,
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
}

/** Un utilisateur de la console, validé, du rôle donné, et sa session ouverte ; rend son jeton. */
async function sessionDeConsole(role: 'admin' | 'comptable' | 'qualifieur' | 'lecteur') {
  const utilisateur = await base.prisma.utilisateurConsole.create({
    data: {
      role,
      creeAt: MAINTENANT,
      valideAt: MAINTENANT,
      emailChiffre: Buffer.from([1]),
      emailHash: hex(32),
    },
  });
  const lien = await base.prisma.lienMagique.create({
    data: {
      utilisateurConsoleId: utilisateur.id,
      tokenHash: hex(32),
      kid: KID,
      creeAt: MAINTENANT,
      expireAt: new Date(MAINTENANT.getTime() + 15 * 60_000),
    },
    select: { id: true },
  });
  const jeton = hex(32);
  await base.prisma.sessionEspace.create({
    data: {
      utilisateurConsoleId: utilisateur.id,
      lienMagiqueId: lien.id,
      tokenHash: empreinteDeSessionConsole(jeton, SECRET),
      kid: KID,
      ipHash: hex(8),
      creeAt: MAINTENANT,
      derniereVueAt: MAINTENANT,
      expireAt: new Date(MAINTENANT.getTime() + 8 * 3_600_000),
    },
  });
  return { jeton, utilisateurId: utilisateur.id };
}

async function uneAttribution(
  apporteurId: string,
  statut: EtatAttribution,
  siren = unSiren()
): Promise<{ id: string; siren: string }> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-10-01',
       false, false, $6, $7, $8, $9, $10, $11, $12, $13, false)`,
    id,
    apporteurId,
    statut,
    siren,
    grilleId,
    bloc(),
    bloc(),
    bloc(),
    hex(32),
    bloc(),
    hex(32),
    bloc(),
    bloc()
  );
  return { id, siren };
}

const portsDe = () => ({
  role: {
    maintenant: () => MAINTENANT,
    depot: depotDeSessionsConsole(app),
    configuration: { secret: SECRET, kid: KID },
  },
  prisma: app,
  cles: CLES,
});

const DEMANDE = (apporteurId: string, jeton: string | undefined) => ({
  apporteurId,
  motif: 'ordinaire_apporteur' as const,
  dateReception: MAINTENANT,
  jeton,
});

describe('REQ-DM-011 — les effets de la fin du contrat, en une transaction', () => {
  it('REQ-DM-011 : TÉMOIN — chaque état atteint sa cible, avec son événement, et seules signee et convertie passent en figee_resiliation', async () => {
    const apporteurId = await unApporteur();
    const departs: readonly EtatAttribution[] = [
      'en_attente',
      'provisoire',
      'active',
      'rdv_pris',
      'proposition',
      'signee',
      'convertie',
    ];
    const lignes = new Map<EtatAttribution, string>();
    for (const e of departs) lignes.set(e, (await uneAttribution(apporteurId, e)).id);
    const { jeton, utilisateurId } = await sessionDeConsole('admin');
    const r = await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, jeton));
    expect(r).toMatchObject({ ok: true, de: 'signe', vers: 'resilie' });
    for (const [de, id] of lignes) {
      const apres = await base.prisma.attribution.findUniqueOrThrow({
        where: { id },
        select: { statut: true },
      });
      expect(apres.statut).toBe(etatApresFinDuContrat(de));
      const [fait] = await base.prisma.$queryRawUnsafe<{ transition: string; acteur: string }[]>(
        `SELECT charge->>'transition' AS transition, charge->'acteur'->>'id' AS acteur
         FROM evenements WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie'
         ORDER BY id DESC LIMIT 1`,
        id
      );
      expect(fait!.transition).toBe(
        de === 'signee' || de === 'convertie' ? 'figee' : 'fin_de_contrat'
      );
      expect(fait!.acteur).toBe(utilisateurId);
    }
    const figees = await base.prisma.attribution.count({
      where: { apporteurId, statut: 'figee_resiliation' },
    });
    expect(figees).toBe(2);
  });

  it('REQ-DM-011 : TÉMOIN — l’entreprise d’une provisoire annulée, ou d’une définitive expirée, redevient librement déclarable', async () => {
    const apporteurId = await unApporteur();
    const provisoire = await uneAttribution(apporteurId, 'provisoire');
    const definitive = await uneAttribution(apporteurId, 'active');
    const autre = await unApporteur();
    const { jeton } = await sessionDeConsole('admin');
    await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, jeton));
    // L'index des occupants ne retient plus ces SIREN : un autre apporteur peut les déclarer.
    await expect(uneAttribution(autre, 'provisoire', provisoire.siren)).resolves.toBeTruthy();
    await expect(uneAttribution(autre, 'provisoire', definitive.siren)).resolves.toBeTruthy();
  });

  it('REQ-DM-011 : TÉMOIN — l’entreprise d’une attribution figée reste occupée : le droit court', async () => {
    const apporteurId = await unApporteur();
    const figee = await uneAttribution(apporteurId, 'signee');
    const autre = await unApporteur();
    const { jeton } = await sessionDeConsole('admin');
    await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, jeton));
    await expect(uneAttribution(autre, 'provisoire', figee.siren)).rejects.toThrow(
      /attributions_un_occupant/
    );
  });

  it('REQ-DM-011 : TÉMOIN — la lecture est maintenue : au moins une attribution figee_resiliation, donc des droits en cours', async () => {
    const apporteurId = await unApporteur();
    await uneAttribution(apporteurId, 'convertie');
    const { jeton } = await sessionDeConsole('admin');
    await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, jeton));
    const figee = await base.prisma.attribution.findFirst({
      where: { apporteurId, statut: 'figee_resiliation' },
      select: { id: true },
    });
    expect(figee).not.toBeNull();
  });
});

describe('REQ-DM-011 — le geste de résiliation est réservé à un rôle nommé', () => {
  it('REQ-DM-011 : TÉMOIN — un autre rôle est refusé, sans effet : ni statut, ni attribution, ni événement', async () => {
    for (const role of ['comptable', 'qualifieur', 'lecteur'] as const) {
      const apporteurId = await unApporteur();
      const a = await uneAttribution(apporteurId, 'provisoire');
      const { jeton } = await sessionDeConsole(role);
      const r = await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, jeton));
      expect(r).toStrictEqual({ ok: false, motif: 'role_refuse' });
      const apporteur = await base.prisma.apporteur.findUniqueOrThrow({
        where: { id: apporteurId },
        select: { statut: true },
      });
      expect(apporteur.statut).toBe('signe');
      const attribution = await base.prisma.attribution.findUniqueOrThrow({
        where: { id: a.id },
        select: { statut: true },
      });
      expect(attribution.statut).toBe('provisoire');
      const evenements = await base.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM evenements WHERE agregat_id IN ($1::uuid, $2::uuid)`,
        apporteurId,
        a.id
      );
      expect(Number(evenements[0]!.n)).toBe(0);
    }
  });

  it('REQ-DM-011 : TÉMOIN — sans session, le geste est refusé sans effet', async () => {
    const apporteurId = await unApporteur();
    const r = await resilierDepuisLaConsole(portsDe(), DEMANDE(apporteurId, undefined));
    expect(r).toStrictEqual({ ok: false, motif: 'absente' });
    const apporteur = await base.prisma.apporteur.findUniqueOrThrow({
      where: { id: apporteurId },
      select: { statut: true },
    });
    expect(apporteur.statut).toBe('signe');
  });
});
