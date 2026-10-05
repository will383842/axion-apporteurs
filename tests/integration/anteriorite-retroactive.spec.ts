// @req REQ-JUR-007
/**
 * DM-25 — l'antériorité établie APRÈS l'enregistrement, en base RÉELLE : le job quotidien
 * (`rapprocherLesAnteriorites`) sur une entreprise connue de la Société et des faits reçus d'axion-ia.
 *
 * Ce que le banc unitaire ne pouvait pas voir, puisqu'il simule l'écrivain : la transition
 * `anteriorite_etablie` passe par le VRAI écrivain des transitions, qui exige le critère ET le fait fondateur
 * (condition (c) de la sécurité). L'événement porte la référence du fait (voie (a) d'A02, #731), et la
 * notification de l'apporteur est écrite avec son événement, pour le passage d'envoi.
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures et
 * les lectures restent sous le propriétaire. Chaque cas prend un SIREN neuf : aucun ne dépend d'un
 * autre. La date du dépôt est posée par la base (`clock_timestamp()`) : les faits sont datés depuis elle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { rapprocherLesAnteriorites } from '../../src/server/jobs/anteriorite-retroactive';
import { refDuFaitFondateur } from '../../src/server/attribution/transitionner';

let base: Base;
let app: PrismaClient;
let grilleId: string;

const JOUR = 86_400_000;
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 810000000;
const unSiren = () => String((sirens += 1));
let sequence = 9_000_000n;

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
        publieeAt: new Date(),
        importeeAt: new Date(),
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: new Date(),
      },
    })
  ).id;
}

/** Une attribution `provisoire` d'apporteur ; rend son id et sa date de dépôt, posée par la base. */
async function uneAttribution(
  apporteurId: string,
  siren: string
): Promise<{ id: string; deposeeAt: Date }> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
    id,
    apporteurId,
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
  const [l] = await base.prisma.$queryRaw<{ d: Date }[]>`
    SELECT deposee_at AS d FROM attributions WHERE id = ${id}::uuid`;
  return { id, deposeeAt: l!.d };
}

/** L'entreprise, connue de la Société comme cliente depuis `connueDepuisAt`. */
async function connue(siren: string, connueDepuisAt: Date): Promise<void> {
  await base.prisma.entrepriseConnue.create({
    data: { siren, origine: 'client', connueDepuisAt, dernierContactAt: connueDepuisAt },
  });
}

/** Une facture émise par axion-ia, reçue par Partners ; rend son identifiant opaque. */
async function uneFacture(siren: string, emiseLe: Date): Promise<string> {
  const factureId = randomUUID();
  const charge = { factureId, siren, montantHtCents: 120_000, emiseLe: emiseLe.toISOString() };
  sequence += 1n;
  await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.facture_emise,
      schemaVersion: 3,
      sequence,
      charge,
      payloadHash: createHash('sha256').update(JSON.stringify(charge)).digest('hex'),
      // Traité, donc daté de son traitement : la base l'exige (contrainte « traité si et seulement si daté »).
      statut: 'traite',
      processedAt: emiseLe,
      receivedAt: emiseLe,
      survenuAt: emiseLe,
    },
  });
  return factureId;
}

async function statutDe(attributionId: string): Promise<string> {
  return (
    await base.prisma.attribution.findUniqueOrThrow({
      where: { id: attributionId },
      select: { statut: true },
    })
  ).statut;
}

describe('REQ-JUR-007 — l’antériorité établie après coup, en base réelle', () => {
  it('REQ-JUR-007 : TÉMOIN — une facture ANTÉRIEURE au dépôt annule par le vrai écrivain, avec le critère et la RÉFÉRENCE du fait ; l’apporteur est notifié avec l’événement', async () => {
    const apporteurId = await unApporteur();
    const siren = unSiren();
    const { id, deposeeAt } = await uneAttribution(apporteurId, siren);
    const emiseLe = new Date(deposeeAt.getTime() - 30 * JOUR);
    await connue(siren, emiseLe);
    const factureId = await uneFacture(siren, emiseLe);

    await rapprocherLesAnteriorites(app, new Date(deposeeAt.getTime() + JOUR));

    expect(await statutDe(id)).toBe('annulee');
    const [fait] = await base.prisma.$queryRawUnsafe<
      { id: bigint; charge: Record<string, unknown> }[]
    >(
      `SELECT id, charge FROM evenements
       WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie' ORDER BY id DESC LIMIT 1`,
      id
    );
    expect(fait!.charge).toMatchObject({
      transition: 'anteriorite_etablie',
      critere: 'cliente',
      acteur: { par: 'systeme' },
      fait: {
        nature: 'facture',
        ref: refDuFaitFondateur('facture', factureId),
        le: emiseLe.toISOString(),
      },
    });
    // Le fait d'affaires n'entre JAMAIS en clair : seule sa référence, sans clé, sur l'id opaque.
    expect(JSON.stringify(fait!.charge)).not.toContain(factureId);
    const notification = await base.prisma.notificationEspace.findFirst({
      where: { apporteurId, cle: 'attribution_annulee_anteriorite' },
      select: { attributionId: true, evenementId: true },
    });
    expect(notification).toEqual({ attributionId: id, evenementId: fait!.id });
  });

  it('REQ-JUR-007 : TÉMOIN — une facture datée APRÈS le dépôt n’annule jamais', async () => {
    const apporteurId = await unApporteur();
    const siren = unSiren();
    const { id, deposeeAt } = await uneAttribution(apporteurId, siren);
    // Connue AVANT le dépôt, mais par un fait postérieur : rien ne fonde l'annulation au dépôt.
    await connue(siren, new Date(deposeeAt.getTime() - 30 * JOUR));
    await uneFacture(siren, new Date(deposeeAt.getTime() + 60_000));

    await rapprocherLesAnteriorites(app, new Date(deposeeAt.getTime() + JOUR));

    expect(await statutDe(id)).toBe('provisoire');
    expect(
      await base.prisma.notificationEspace.count({
        where: { apporteurId, cle: 'attribution_annulee_anteriorite' },
      })
    ).toBe(0);
  });

  it('REQ-JUR-007 : un second passage ne relit pas une attribution déjà annulée : un seul événement d’antériorité', async () => {
    const apporteurId = await unApporteur();
    const siren = unSiren();
    const { id, deposeeAt } = await uneAttribution(apporteurId, siren);
    const emiseLe = new Date(deposeeAt.getTime() - 10 * JOUR);
    await connue(siren, emiseLe);
    await uneFacture(siren, emiseLe);

    const maintenant = new Date(deposeeAt.getTime() + JOUR);
    await rapprocherLesAnteriorites(app, maintenant);
    await rapprocherLesAnteriorites(app, maintenant);

    const [compte] = await base.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM evenements
       WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie'
         AND charge->>'transition' = 'anteriorite_etablie'`,
      id
    );
    expect(Number(compte!.n)).toBe(1);
  });
});
