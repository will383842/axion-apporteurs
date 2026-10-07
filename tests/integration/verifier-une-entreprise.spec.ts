// @req REQ-SEC-021
// @req REQ-UX-007
// @req REQ-JUR-011
// @req REQ-SEC-022
// @req REQ-EXT-006
/**
 * « Vérifier une entreprise » (SEC-16) sur la vraie base : l'occupation et la file se lisent dans
 * `attributions`, la vérification se journalise dans `verifications`, et rien d'autre ne s'écrit —
 * aucune demande de confirmation, aucun courriel (W20 : seul un dépôt en crée une).
 *
 * Les compteurs sont admis ici par un port de test : en production, ils refusent tant que Williams
 * n'a pas chiffré les limites (témoin unitaire). L'antériorité et la liste de la Société se lisent
 * sur leurs vraies tables ; seul le registre public est simulé (actif).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { portsDeLaBase } from '../../src/server/verification/ports-prisma';
import { ajouterEvenement } from '../../src/server/evenement/journal';
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
let utilisateurConsole: string;

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
  utilisateurConsole = (
    await base.prisma.utilisateurConsole.create({
      // Désactivé, comme dans les témoins de l'antériorité : seul l'auteur de l'inscription compte ici.
      data: { role: 'admin', creeAt: MAINTENANT, desactiveAt: MAINTENANT },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

async function inserer(apporteurId: string, siren: string, statut: string, rang: number | null) {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, rang_attente, siren, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, $5, 'espace'::canal_depot, $6::uuid,
       '2026-10-01', false, false, false)`,
    id,
    apporteurId,
    statut,
    rang,
    siren,
    grilleId
  );
  return id;
}

function ports(): PortsDeVerification {
  return {
    ...portsDeLaBase(base.prisma),
    compter: async () => ({ autorise: true }),
    entreprise: async () => 'active',
    maintenant: () => MAINTENANT,
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
      dto: { etat: 'libre', dejaDeclaree: false },
    });
    await inserer(apporteurA, siren, 'active', null);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_place_disponible', dejaDeclaree: false },
    });
    await inserer(apporteurB, siren, 'en_attente', 1);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_place_disponible', dejaDeclaree: false },
    });
    await inserer(apporteurC, siren, 'en_attente', 2);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_file_complete', dejaDeclaree: false },
    });
  });

  it('REQ-UX-007 : une attribution qui n’occupe plus (perdue) laisse l’entreprise libre', async () => {
    const siren = unSiren();
    await inserer(apporteurA, siren, 'perdue', null);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'libre', dejaDeclaree: false },
    });
  });
});

describe('REQ-JUR-011 REQ-SEC-022 — la liste de la Société et l’antériorité, lues dans leurs tables', () => {
  it('REQ-SEC-022 : un SIREN de la liste — non_disponible, sans sa catégorie ; la cause tenue au journal est la liste', async () => {
    const siren = unSiren();
    await base.prisma.sirenListeNoire.create({
      data: { siren, motif: 'financeur_public', ajouteParId: utilisateurConsole },
    });
    const r = await verifierUneEntreprise(ports(), demande(siren));
    expect(r).toEqual({ ok: true, dto: { etat: 'non_disponible', dejaDeclaree: false } });
    // La catégorie ne se dit qu'au refus d'un DÉPÔT : jamais dans une vérification.
    expect(JSON.stringify(r)).not.toContain('financeur_public');
    expect(await base.prisma.verification.findFirst({ where: { siren } })).toMatchObject({
      resultat: 'liste_noire',
    });
  });

  it('REQ-JUR-011 : une cliente récente et un SIREN de la liste rendent la même réponse, octet pour octet ; la cause « cliente » au journal', async () => {
    const siren = unSiren();
    const recente = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await base.prisma.entrepriseConnue.create({
      data: { siren, origine: 'client', connueDepuisAt: recente, dernierContactAt: recente },
    });
    const surLaListe = unSiren();
    await base.prisma.sirenListeNoire.create({
      data: { siren: surLaListe, motif: 'administration', ajouteParId: utilisateurConsole },
    });
    const cliente = JSON.stringify(await verifierUneEntreprise(ports(), demande(siren)));
    expect(cliente).toBe(JSON.stringify(await verifierUneEntreprise(ports(), demande(surLaListe))));
    expect(cliente).toBe(
      JSON.stringify({ ok: true, dto: { etat: 'non_disponible', dejaDeclaree: false } })
    );
    expect(await base.prisma.verification.findFirst({ where: { siren } })).toMatchObject({
      resultat: 'cliente',
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

/**
 * EXT-T06 (REQ-EXT-006) — le lecteur RÉSERVÉ de la dernière fin, sur la base : la fin d'une attribution
 * terminée est le `survenuAt` de son dernier `attribution_etat_modifie` ; le signal n'apparaît qu'après
 * plus de `SIGNAL_DEJA_DECLAREE_ANCIENNETE_JOURS` jours civils de Paris, et une fin sans événement
 * lisible ne donne rien (échec fermé).
 */
describe('REQ-EXT-006 — « Déjà déposée par le passé », lu sur la base', () => {
  const JOUR = 86_400_000;
  async function terminer(id: string, ilYAJours: number) {
    await base.prisma.$transaction((tx) =>
      ajouterEvenement(tx, {
        type: 'attribution_etat_modifie',
        agregat: 'attribution',
        agregatId: id,
        survenuAt: new Date(MAINTENANT.getTime() - ilYAJours * JOUR),
        charge: { de: 'active', vers: 'perdue', transition: 'perdue', acteur: { par: 'systeme' } },
      })
    );
  }

  it('REQ-EXT-006 : TÉMOIN — une fin à J-40 donne le signal ; une fin plus récente, à J-10, sur une autre attribution, l’éteint : seule la DERNIÈRE compte', async () => {
    const siren = unSiren();
    const ancienne = await inserer(apporteurA, siren, 'perdue', null);
    await terminer(ancienne, 40);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'libre', dejaDeclaree: true },
    });
    const recente = await inserer(apporteurB, siren, 'perdue', null);
    await terminer(recente, 10);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'libre', dejaDeclaree: false },
    });
  });

  it('REQ-EXT-006 : TÉMOIN — une attribution non terminée ne compte pas, et la console ne reçoit jamais le signal', async () => {
    const siren = unSiren();
    const fin = await inserer(apporteurA, siren, 'perdue', null);
    await terminer(fin, 40);
    expect(
      await verifierUneEntreprise(ports(), {
        ...demande(siren),
        porteur: { utilisateurConsoleId: utilisateurConsole },
      })
    ).toEqual({ ok: true, dto: { etat: 'libre', dejaDeclaree: false } });
    await inserer(apporteurB, siren, 'active', null);
    expect(await verifierUneEntreprise(ports(), demande(siren))).toEqual({
      ok: true,
      dto: { etat: 'suivie_place_disponible', dejaDeclaree: false },
    });
  });
});
