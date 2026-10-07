// @req REQ-DM-006
// @req REQ-DM-042
/**
 * DM-24 — la confirmation tacite contre la base RÉELLE (contrat v2, art. 3.2) : le passage sous
 * `partners_app`, provisionné comme en production ; les fixtures et les lectures sous le propriétaire.
 *
 * CE QU'IL PROUVE :
 *   — à l'échéance, l'attribution passe `active`, avec `confirmee_at`, `fenetre_fin_at` et UN
 *     événement `attribution_etat_modifie` (`confirmee_tacitement`), dans la même transaction ;
 *   — un second passage n'écrit rien de plus ;
 *   — à l'échéance moins une minute, rien ; une demande en erreur, jamais ;
 *   — une adresse corrigée fait courir le délai de sa communication.
 * Le refus du conseiller se juge à la présélection, en process : le rôle `conseiller_salarie`
 * n'existe pas encore dans `console_role` (SEC-31).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { demarrerBase, type Base } from './harnais';
import { confirmerTacitementLesEchues } from '../../src/server/jobs/confirmation-tacite';
import { ajouterJoursCivilsParis } from '../../src/domain/temps/sla';
import { SEUILS } from '../../src/domain/seuils/ssot';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 610000000;
const unSiren = () => String((sirens += 1));
const MINUTE = 60_000;
const TACITE = SEUILS.CONFIRMATION_TACITE_JOURS.valeur;
/** Le dépôt : le 1er février 2027 à 10 h, heure de Paris. */
const DEPOT = new Date(Date.UTC(2027, 1, 1, 9, 0));
const jour = (n: number) => new Date(ajouterJoursCivilsParis(DEPOT.getTime(), n));

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
        publieeAt: DEPOT,
        importeeAt: DEPOT,
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
        creeAt: DEPOT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/**
 * Une attribution d'apporteur `provisoire`, déposée à `DEPOT`, et sa demande ; chaque émission porte
 * son envoi et, le cas échéant, l'instant où une adresse corrigée l'a remplacée.
 */
async function uneAttribution(
  etat: string,
  emissions: { emiseAt: Date; revoqueeAt?: Date }[]
): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare, deposee_at)
     VALUES ($1::uuid, $2::uuid, 'provisoire', $3, 'espace', $4::uuid, '2027-01-31',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false, $13)`,
    id,
    apporteurId,
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
    DEPOT
  );
  const demandeId = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO demandes_confirmation (id, attribution_id, etat, creee_at, envoyee_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_demande_confirmation, $4, $5)`,
    demandeId,
    id,
    etat,
    DEPOT,
    emissions[0]?.emiseAt ?? null
  );
  for (const e of emissions) {
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO emissions_demande_confirmation (id, demande_id, emise_at, revoquee_at)
       VALUES ($1::uuid, $2::uuid, $3, $4)`,
      randomUUID(),
      demandeId,
      e.emiseAt,
      e.revoqueeAt ?? null
    );
  }
  return id;
}

async function etat(id: string) {
  return base.prisma.attribution.findUniqueOrThrow({
    where: { id },
    select: { statut: true, confirmeeAt: true, fenetreFinAt: true },
  });
}

async function evenementsTacites(id: string): Promise<number> {
  const [r] = await base.prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM evenements
     WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie'
       AND charge->>'transition' = 'confirmee_tacitement'`,
    id
  );
  return Number(r!.n);
}

describe('REQ-DM-006 — la confirmation tacite, en base réelle', () => {
  it('REQ-DM-042 : TÉMOIN — à l’échéance : active, confirmée, fenêtre posée, UN événement ; un second passage n’écrit rien', async () => {
    const id = await uneAttribution('envoyee', [{ emiseAt: jour(1) }]);
    const echeance = new Date(ajouterJoursCivilsParis(jour(1).getTime(), TACITE));
    await confirmerTacitementLesEchues(app, new Date(echeance.getTime() - MINUTE));
    expect((await etat(id)).statut).toBe('provisoire');
    await confirmerTacitementLesEchues(app, echeance);
    const e = await etat(id);
    expect(e.statut).toBe('active');
    expect(e.confirmeeAt).toEqual(echeance);
    expect(e.fenetreFinAt).not.toBeNull();
    expect(await evenementsTacites(id)).toBe(1);
    await confirmerTacitementLesEchues(app, new Date(echeance.getTime() + 60 * MINUTE));
    expect(await evenementsTacites(id)).toBe(1);
  });

  it('REQ-DM-006 : TÉMOIN — une demande en erreur, sans correction, n’est jamais confirmée', async () => {
    const id = await uneAttribution('rebond', [{ emiseAt: jour(1) }]);
    await confirmerTacitementLesEchues(app, jour(90));
    expect((await etat(id)).statut).toBe('provisoire');
    expect(await evenementsTacites(id)).toBe(0);
  });

  it('REQ-DM-006 : TÉMOIN — une adresse corrigée à J+10 fait courir le délai de J+10', async () => {
    const id = await uneAttribution('envoyee', [
      { emiseAt: jour(1), revoqueeAt: jour(10) },
      { emiseAt: jour(10) },
    ]);
    await confirmerTacitementLesEchues(app, new Date(jour(10 + TACITE).getTime() - MINUTE));
    expect((await etat(id)).statut).toBe('provisoire');
    await confirmerTacitementLesEchues(app, jour(10 + TACITE));
    expect((await etat(id)).statut).toBe('active');
  });
});
