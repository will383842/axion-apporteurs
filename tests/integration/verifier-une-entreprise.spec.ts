// @req REQ-SEC-021 REQ-UX-007
/**
 * « Vérifier une entreprise » (SEC-16) sur la vraie base : l'occupation et la file se lisent dans
 * `attributions`, la vérification se journalise dans `verifications`, et rien d'autre ne s'écrit —
 * aucune demande de confirmation, aucun courriel (W20 : seul un dépôt en crée une).
 *
 * Les compteurs sont admis ici par un port de test : en production, ils refusent tant que Williams
 * n'a pas chiffré les limites (témoin unitaire). L'antériorité et la liste de la Société se lisent
 * sur les projections de DM-10-P ; ce banc les tient fausses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { portsDeLaBase } from '../../src/server/verification/ports-prisma';
import {
  verifierUneEntreprise,
  type PortsDeVerification,
} from '../../src/server/verification/verifier';
import { sujetDepuisEmpreinte } from '../../src/server/securite/rate-limit';

let base: Base;
let grilleId: string;
let apporteurA: string;
let apporteurB: string;
let apporteurC: string;

const MAINTENANT = new Date('2026-10-04T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sirens = 300000000;
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
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
  const apporteur = async () =>
    (
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
  apporteurA = await apporteur();
  apporteurB = await apporteur();
  apporteurC = await apporteur();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

async function inserer(apporteurId: string, siren: string, statut: string, rang: number | null) {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, rang_attente, siren, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, $5, 'espace'::canal_depot, $6::uuid,
       '2026-10-01', false, false, false)`,
    randomUUID(),
    apporteurId,
    statut,
    rang,
    siren,
    grilleId
  );
}

function ports(): PortsDeVerification {
  return {
    ...portsDeLaBase(base.prisma),
    compter: async () => ({ autorise: true }),
    entreprise: async () => 'active',
    anteriorite: async () => false,
    surLaListe: async () => false,
  };
}

const demande = (siren: string) => ({
  porteur: { apporteurId: apporteurC },
  siren,
  sujetIdentite: sujetDepuisEmpreinte('a'.repeat(64)),
  sujetIp: sujetDepuisEmpreinte('b'.repeat(64)),
  ipHash: 'c'.repeat(16),
});

const ecrits = async () => ({
  demandes: await base.prisma.demandeConfirmation.count(),
  courriels: await base.prisma.courrielEnvoye.count(),
});

describe('REQ-UX-007 — l’occupation et la file, lues dans attributions', () => {
  it('REQ-UX-007 : libre, puis occupée avec une place, puis file complète', async () => {
    const siren = unSiren();
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'libre' },
    });
    await inserer(apporteurA, siren, 'active', null);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_place_disponible' },
    });
    await inserer(apporteurB, siren, 'en_attente', 1);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_place_disponible' },
    });
    await inserer(apporteurC, siren, 'en_attente', 2);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_file_complete' },
    });
  });

  it('REQ-UX-007 : une attribution qui n’occupe plus (perdue) laisse l’entreprise libre', async () => {
    const siren = unSiren();
    await inserer(apporteurA, siren, 'perdue', null);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'libre' },
    });
  });
});

describe('REQ-SEC-021 — journalisée, et rien d’autre ne s’écrit (W20)', () => {
  it('REQ-SEC-021 : TÉMOIN — une ligne dans verifications ; zéro demande de confirmation, zéro courriel', async () => {
    const siren = unSiren();
    await inserer(apporteurA, siren, 'active', null);
    const avant = await ecrits();
    await verifierUneEntreprise(ports(), demande(siren));
    const lignes = await base.prisma.verification.findMany({ where: { siren } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      apporteurId: apporteurC,
      utilisateurConsoleId: null,
      siren,
      resultat: 'suivie',
      ipHash: 'c'.repeat(16),
    });
    expect(await ecrits()).toEqual(avant);
  });

  it('REQ-SEC-021 : refusée par un compteur, rien ne s’écrit, pas même le journal', async () => {
    const siren = unSiren();
    const p = { ...ports(), compter: portsDeLaBase(base.prisma).compter };
    expect(await verifierUneEntreprise(p, demande(siren))).toEqual({ ok: false, refus: 'limite' });
    expect(await base.prisma.verification.count({ where: { siren } })).toBe(0);
  });
});
