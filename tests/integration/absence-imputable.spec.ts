// @req REQ-DM-007
/**
 * UX-P1-61 — le geste « absence d'échange imputable à la Société » et le RÉTABLISSEMENT, en base RÉELLE
 * (contrat v2, art. 3.4 al. 2 ; juriste #803 6039744045 et 6041561265 ; forme d'A02 #803 6039776225).
 *
 * CE QU'IL PROUVE, le geste joué sous `partners_app` (le rôle d'exécution, provisionné comme en
 * production) :
 *   — poser sur une attribution active : le motif, l'instant et l'auteur, la péremption annulée ;
 *   — rétablir une attribution PÉRIMÉE FAUTE D'ÉCHANGE vers `active`, avec l'avis à l'apporteur ; une
 *     libérée sans confirmation, arrivée elle aussi en `perimee`, n'est PAS rétablie ;
 *   — une prise en charge de la Société CÈDE (exception `retablissement_apporteur`, l'administrateur pour
 *     auteur), puis l'apporteur est rétabli, et l'avis est le MÊME qu'sans cession ;
 *   — un autre apporteur occupant : `entreprise_reprise` ; un terme passé : `terme_depasse` ; rien n'est
 *     écrit ;
 *   — le contact déjà purgé n'empêche pas le rétablissement : `contact_purge_at` est inchangé, la purge
 *     suivante ne la reprend pas, et aucun courriel ne part au contact (A02).
 * Les prises en charge de la Société sont semées par le propriétaire, le déclencheur du conseiller
 * suspendu le temps de l'insertion : `console_role` n'a pas encore le rôle du conseiller (SEC-31).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { poserLAbsenceImputable } from '../../src/server/attribution/absence-imputable';
import { purgerLesContacts } from '../../src/server/taches/purger-contacts';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let adminId: string;

const CONFIRMEE = new Date('2026-05-02T10:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 710000000;
const unSiren = () => String((sirens += 1));
/** Un terme dans le FUTUR RÉEL : le geste compare au terme l'instant qu'on lui passe. */
const termeFutur = () => new Date(Date.now() + 30 * MS_PAR_JOUR);
const MOTIF = 'rdv_annule_par_la_societe';

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
        publieeAt: CONFIRMEE,
        importeeAt: CONFIRMEE,
      },
    })
  ).id;
  const [a] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    CONFIRMEE
  );
  adminId = a!.id;
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
        creeAt: CONFIRMEE,
      },
    })
  ).id;
}

/** Une attribution d'apporteur, par SQL brut, et la transition qui l'a menée là, au journal. */
async function semer(s: {
  statut: string;
  siren: string;
  fin: Date | null;
  arrivee?: string;
  contactPurge?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
       confirmee_at, fenetre_fin_at, raison_sociale, purge_contact_at, contact_purge_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-05-01',
       false, false, false, $6, $7, 'Garage de la Démo', $8, $9)`,
    id,
    await unApporteur(),
    s.statut,
    s.siren,
    grilleId,
    CONFIRMEE,
    s.fin,
    s.statut === 'perimee' ? new Date(Date.now() - MS_PAR_JOUR) : null,
    s.contactPurge === true ? new Date(Date.now() - MS_PAR_JOUR) : null
  );
  if (s.arrivee !== undefined) await journaliser(id, 'active', s.statut, s.arrivee);
  return id;
}

async function journaliser(id: string, de: string, vers: string, transition: string) {
  const { ajouterEvenement } = await import('../../src/server/evenement/journal');
  await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'attribution_etat_modifie',
      agregat: 'attribution',
      agregatId: id,
      survenuAt: new Date(Date.now() - MS_PAR_JOUR),
      charge: { de, vers, transition, acteur: { par: 'systeme' } },
    })
  );
}

/** Une prise en charge de la Société, CONFIRMÉE, le déclencheur du conseiller suspendu. */
async function unePriseEnCharge(siren: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE attributions DISABLE TRIGGER attributions_porteur_conseiller'
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO attributions (id, utilisateur_console_id, statut, siren, canal,
         date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
         confirmee_at, fenetre_fin_at)
       VALUES ($1::uuid, $2::uuid, 'active', $3, 'console', '2026-09-01', false, false, false, $4, $5)`,
      id,
      adminId,
      siren,
      CONFIRMEE,
      termeFutur()
    );
    await tx.$executeRawUnsafe(
      'ALTER TABLE attributions ENABLE TRIGGER attributions_porteur_conseiller'
    );
  });
  return id;
}

const poser = (attributionId: string) =>
  poserLAbsenceImputable(app, {
    acteur: { id: adminId, role: 'admin' },
    attributionId,
    motif: MOTIF,
    maintenant: new Date(),
  });

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const lire = (id: string) => base.prisma.attribution.findUniqueOrThrow({ where: { id } });
const evenements = (id: string) =>
  base.prisma.$queryRawUnsafe<{ type: string; charge: Record<string, unknown> }[]>(
    `SELECT type::text AS type, charge FROM evenements WHERE agregat_id = $1::uuid ORDER BY id`,
    id
  );
const avis = (id: string) =>
  base.prisma.notificationEspace.findMany({ where: { attributionId: id } });

describe('REQ-DM-007 — poser le fait sur une attribution en cours', () => {
  it('REQ-DM-007 : TÉMOIN — le motif, l’instant et l’auteur ensemble, la péremption annulée, le terme inchangé ; posé deux fois, refusé', async () => {
    const fin = termeFutur();
    const id = await semer({ statut: 'active', siren: unSiren(), fin });
    expect(await poser(id)).toEqual({ termeAt: fin, retablie: false });
    const a = await lire(id);
    expect(a.peremptionSuspendueMotif).toBe(MOTIF);
    expect(a.peremptionSuspendueParId).toBe(adminId);
    expect(a.peremptionAt).toBeNull();
    expect(a.fenetreFinAt).toEqual(fin);
    expect(await refus(poser(id))).toContain('deja_pose');
  });
});

describe('REQ-DM-007 — le rétablissement d’une attribution périmée faute d’échange', () => {
  it('REQ-DM-007 : TÉMOIN — périmée faute d’échange : rétablie vers active, la purge du contact retirée, deux événements dans l’ordre, l’avis à l’apporteur', async () => {
    const fin = termeFutur();
    const id = await semer({ statut: 'perimee', siren: unSiren(), fin, arrivee: 'perimee' });
    expect(await poser(id)).toEqual({ termeAt: fin, retablie: true });
    const a = await lire(id);
    expect(a.statut).toBe('active');
    expect(a.purgeContactAt).toBeNull();
    expect(a.peremptionAt).toBeNull();
    expect(a.fenetreFinAt).toEqual(fin);
    const types = (await evenements(id)).map((e) => [e.type, e.charge['transition'] ?? null]);
    expect(types.slice(1)).toEqual([
      ['attribution_peremption_suspendue', null],
      ['attribution_etat_modifie', 'retablie_absence_imputable'],
    ]);
    expect((await avis(id)).map((n) => n.cle)).toEqual(['attribution_retablie']);
  });

  it('REQ-DM-007 : TÉMOIN — une libérée sans confirmation, arrivée elle aussi en perimee, n’est PAS rétablie', async () => {
    const id = await semer({
      statut: 'perimee',
      siren: unSiren(),
      fin: termeFutur(),
      arrivee: 'liberee_sans_confirmation',
    });
    expect(await refus(poser(id))).toContain('sans_objet');
    expect((await lire(id)).statut).toBe('perimee');
  });

  it('REQ-DM-007 : TÉMOIN — le terme passé : terme_depasse, rien n’est écrit', async () => {
    const id = await semer({
      statut: 'perimee',
      siren: unSiren(),
      fin: new Date(Date.now() - MS_PAR_JOUR),
      arrivee: 'perimee',
    });
    expect(await refus(poser(id))).toContain('terme_depasse');
    expect((await lire(id)).peremptionSuspendueAt).toBeNull();
  });

  it('REQ-DM-007 : TÉMOIN — un AUTRE APPORTEUR occupe le SIREN : entreprise_reprise, sans éviction ni écriture', async () => {
    const siren = unSiren();
    const id = await semer({ statut: 'perimee', siren, fin: termeFutur(), arrivee: 'perimee' });
    const autre = await semer({ statut: 'active', siren, fin: termeFutur() });
    expect(await refus(poser(id))).toContain('entreprise_reprise');
    expect((await lire(autre)).statut).toBe('active');
    expect((await lire(id)).statut).toBe('perimee');
  });

  it('REQ-DM-007 : TÉMOIN — une prise en charge CONFIRMÉE de la Société cède (l’exception, l’administrateur), puis l’apporteur est rétabli ; l’avis est le MÊME que sans cession', async () => {
    const siren = unSiren();
    const id = await semer({ statut: 'perimee', siren, fin: termeFutur(), arrivee: 'perimee' });
    const societe = await unePriseEnCharge(siren);
    await poser(id);
    const s = await lire(societe);
    expect(s.statut).toBe('annulee');
    expect(s.annulationException).toBe('retablissement_apporteur');
    expect(s.annulationParId).toBe(adminId);
    const [cession] = await evenements(societe);
    expect(cession!.charge).toMatchObject({
      transition: 'cedee_au_retablissement',
      exception: 'retablissement_apporteur',
    });
    expect((await lire(id)).statut).toBe('active');
    // L'avis ne dit rien de l'occupant : la même clé, une fois, et rien pour la Société.
    expect((await avis(id)).map((n) => n.cle)).toEqual(['attribution_retablie']);
    expect(await avis(societe)).toEqual([]);
  });

  it('REQ-DM-007 : TÉMOIN — le contact déjà purgé n’empêche pas le rétablissement ; contact_purge_at inchangé, la purge suivante ne la reprend pas', async () => {
    const id = await semer({
      statut: 'perimee',
      siren: unSiren(),
      fin: termeFutur(),
      arrivee: 'perimee',
      contactPurge: true,
    });
    const purgeAvant = (await lire(id)).contactPurgeAt;
    await poser(id);
    const a = await lire(id);
    expect(a.statut).toBe('active');
    expect(a.contactPurgeAt).toEqual(purgeAvant);
    const avant = (await evenements(id)).length;
    await purgerLesContacts(app, new Date(Date.now() + 400 * MS_PAR_JOUR));
    expect((await lire(id)).contactPurgeAt).toEqual(purgeAvant);
    expect(await evenements(id)).toHaveLength(avant);
    // Aucun courriel n'est écrit pour le contact.
    expect(await base.prisma.courrielEnvoye.findMany({ where: { attributionId: id } })).toEqual([]);
  });
});
