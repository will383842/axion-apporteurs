// @req REQ-QA-005
/**
 * Le test de charge léger, en base RÉELLE : cinquante dépôts simultanés, par cinquante
 * apporteurs, sur un MÊME SIREN. Le pendant de `concurrence.spec.ts` (vingt dépôts), à la taille
 * que la tâche fixe ; le juge est `scripts/gates/QA-T29/juge-charge.ts`, pur et prouvé rouge en unitaire.
 *
 * CE QU'IL PROUVE (REQ-QA-005) : sous la course, UN seul occupant (l'index partiel sur les états
 * occupants tient), la file pleine derrière lui, tous les autres refusés et tracés, une demande de
 * confirmation, aucun dépôt en échec, sous le plafond de durée. Le second membre de REQ-QA-005 (« un
 * SIREN périmé peut être redéposé ») n'est PAS rejoué ici : la tâche ne porte que la course de
 * cinquante dépôts, et la transition vers `perimee` d'un occupant passe par la machine d'états.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { clesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { PLACES_DE_LA_FILE } from '../../src/domain/verification/etats';
import { deposer, type DemandeDeDepot, type PortsDuDepot } from '../../src/server/depot/deposer';
import {
  DEPOTS_SIMULTANES,
  jugerLaCharge,
  type MesureDeCharge,
} from '../../scripts/gates/QA-T29/juge-charge';

let base: Base;
let codes = 0;

const T0 = new Date('2026-10-03T12:00:00.000Z');
const SIREN = '510000001';
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-qa-t29-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});
const PORTS: PortsDuDepot = {
  cles: CLES,
  secretConfirmation: randomBytes(32).toString('hex'),
  maintenant: () => T0,
  oppositionDemarchage: async () => false,
  adresseDe: async () => 'apporteur.temoin@example.org',
  notifier: async () => undefined,
  debit: async () => ({ autorise: true, repriseAt: null }),
  captcha: async () => 'non_requis',
};

beforeAll(async () => {
  base = await demarrerBase();
  await base.prisma.grilleCommission.create({
    data: {
      version: 1,
      hash: randomBytes(32).toString('hex'),
      contenuJson: { essai: true },
      publieeAt: T0,
      importeeAt: T0,
    },
  });
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

async function apporteur(): Promise<string> {
  codes += 1;
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'signe',
      codeParrainage: `AX${String(codes).padStart(6, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: T0,
    },
  });
  return a.id;
}

/** Une demande COMPLÈTE : chaque champ écrit (RM-11). */
function demande(apporteurId: string, siren: string): DemandeDeDepot {
  return {
    apporteurId,
    canal: 'espace',
    jetonDepotId: null,
    saisie: {
      siren,
      siret: null,
      dateContact: '2026-10-01',
      contact: {
        nom: 'Témoin',
        prenom: 'Camille',
        fonction: 'Gérante',
        email: 'camille.temoin@gmail.com',
        telephone: '06 12 34 56 78',
      },
      contexte: null,
      informationTiersCochee: true,
      lienInteretDeclare: false,
    },
    fiche: { raisonSociale: 'Entreprise Témoin SAS', etatAdministratif: 'actif' },
    adresseReseau: '203.0.113.7',
    session: `session-${apporteurId}`,
    reponseCaptcha: null,
    agentUtilisateur: 'Mozilla/5.0 (témoin)',
    clientCapturedAt: null,
  };
}

describe('REQ-QA-005 — cinquante dépôts simultanés sur un même SIREN', () => {
  it('REQ-QA-005 : un seul occupant, la file pleine, le reste refusé et tracé, sans échec, sous le plafond', async () => {
    const ids = await Promise.all(Array.from({ length: DEPOTS_SIMULTANES }, () => apporteur()));

    const debut = performance.now();
    const rendus = await Promise.allSettled(
      ids.map((id) => deposer(base.prisma, demande(id, SIREN), PORTS))
    );
    const dureeMs = Math.round(performance.now() - debut);

    const issues: Record<string, number> = {};
    let echecs = 0;
    for (const r of rendus) {
      if (r.status === 'rejected' || 'reessayer' in r.value) {
        echecs += 1;
        continue;
      }
      issues[r.value.issue] = (issues[r.value.issue] ?? 0) + 1;
    }

    const lignes = await base.prisma.attribution.findMany({
      where: { siren: SIREN },
      orderBy: { deposeeAt: 'asc' },
    });
    const mesure: MesureDeCharge = {
      depots: DEPOTS_SIMULTANES,
      places: PLACES_DE_LA_FILE,
      issues,
      echecs,
      lignes: lignes.map((l) => ({
        statut: l.statut,
        rangAttente: l.rangAttente,
        deposeeAt: l.deposeeAt,
      })),
      refusFileComplete: await base.prisma.depotRefuse.count({
        where: { siren: SIREN, motif: 'file_complete' },
      }),
      demandesDeConfirmation: await base.prisma.demandeConfirmation.count({
        where: { attribution: { siren: SIREN } },
      }),
      dureeMs,
    };
    expect(jugerLaCharge(mesure)).toEqual([]);
  }, 120_000);
});
