// @req REQ-JUR-007
/**
 * DM-71 — la garde `attributions_annulation_apres_confirmation` en base RÉELLE, sous `partners_app`
 * (forme d'A02, #806 6039768837 ; témoins de sa liste) : après la confirmation, seule une exception
 * humaine annule, et elle le dit en base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { demarrerBase, type Base } from './harnais';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;
let adminId: string;

const MAINTENANT = new Date('2026-10-08T09:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 640000000;
const unSiren = () => String((sirens += 1));

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
  apporteurId = (
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
        creeAt: MAINTENANT,
      },
    })
  ).id;
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    MAINTENANT
  );
  adminId = admin!.id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une attribution d'apporteur, `statut` donné, CONFIRMÉE (`confirmee_at`) ou non. */
async function uneAttribution(statut: string, confirmee: boolean): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare, confirmee_at,
       fenetre_fin_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-10-01',
       false, false, $6, $7, $8, $9, $10, $11, $12, $13, false, $14, $15)`,
    id,
    apporteurId,
    statut,
    unSiren(),
    grilleId,
    bloc(),
    bloc(),
    bloc(),
    hex(32),
    bloc(),
    hex(32),
    bloc(),
    bloc(),
    confirmee ? MAINTENANT : null,
    confirmee ? new Date('2027-04-08T09:00:00.000Z') : null
  );
  return id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const annuler = (id: string, exception: string | null, parId: string | null) =>
  app.$executeRawUnsafe(
    `UPDATE attributions SET statut = 'annulee', annulation_exception = $2::exception_annulation,
       annulation_par_id = $3::uuid WHERE id = $1::uuid`,
    id,
    exception,
    parId
  );

const GARDE = 'attributions_annulation_apres_confirmation';

describe('REQ-JUR-007 — après la confirmation, seule une exception humaine annule (garde en base)', () => {
  it('REQ-JUR-007 : TÉMOIN — une confirmée, passée à `annulee` SANS exception, est refusée par la base', async () => {
    const id = await uneAttribution('active', true);
    expect(await refus(annuler(id, null, null))).toContain(GARDE);
  });

  it('REQ-JUR-007 : TÉMOIN à deux faces — elle passe AVEC une exception et son auteur', async () => {
    for (const exception of ['erreur_identification', 'fraude']) {
      const id = await uneAttribution('signee', true);
      await annuler(id, exception, adminId);
      const r = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
      expect([r.statut, r.annulationException, r.annulationParId]).toEqual([
        'annulee',
        exception,
        adminId,
      ]);
    }
  });

  it('REQ-JUR-007 : une provisoire passe à `annulee` sans exception : rien ne change avant la confirmation', async () => {
    const id = await uneAttribution('provisoire', false);
    await annuler(id, null, null);
    expect((await base.prisma.attribution.findUniqueOrThrow({ where: { id } })).statut).toBe(
      'annulee'
    );
  });

  it('REQ-JUR-007 : TÉMOIN — l’exception sans auteur, ou sur une attribution non annulée, est refusée', async () => {
    const id = await uneAttribution('active', true);
    expect(await refus(annuler(id, 'fraude', null))).toContain(
      'attributions_annulation_exception_liee'
    );
    const encore = await uneAttribution('active', true);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE attributions SET annulation_exception = 'fraude', annulation_par_id = $2::uuid
           WHERE id = $1::uuid`,
          encore,
          adminId
        )
      )
    ).toContain(GARDE);
  });

  it('REQ-JUR-007 : TÉMOIN — l’exception ne se réécrit pas', async () => {
    const id = await uneAttribution('convertie', true);
    await annuler(id, 'erreur_identification', adminId);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE attributions SET annulation_exception = 'fraude' WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('ne se réécrit pas');
  });
});
