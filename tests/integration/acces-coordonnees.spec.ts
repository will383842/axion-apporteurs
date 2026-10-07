// @req REQ-SEC-042
/**
 * SEC-52 (REQ-SEC-042) — l'accès de la console aux coordonnées du contact d'une entreprise RÉSERVÉE s'écrit
 * au journal chaîné, en base RÉELLE, sous le rôle du serveur (`partners_app`) : un accès pendant la réserve →
 * UN événement, par identifiants seuls, rattaché à l'attribution ; un accès hors réserve → aucun ; la lecture
 * reste permise dans les deux cas et reste tracée au journal des accès à la console (SEC-58) ; la chaîne
 * du journal reste intacte. Le jugement est celui de SEC-51 (`portSousVerrou`), sous le verrou du SIREN que
 * le dépôt prend lui-même.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';
import { lireLesCoordonneesDuContactDeLaConsole } from '../../src/server/securite/acces-coordonnees';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';
import { SEUILS } from '../../src/domain/seuils/ssot';

let base: Base;
let app: PrismaClient;
let apporteurId: string;
let grilleId: string;
let consoleId: string;

const MAINTENANT = new Date('2026-10-07T12:00:00.000Z');
const JOURS = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;
const unSiren = () => String(randomInt(100_000_000, 999_999_999));
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-52-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
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
        hash: randomBytes(32).toString('hex'),
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
        codeParrainage: `AX${randomBytes(3).toString('hex').toUpperCase()}`,
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
  consoleId = (
    await base.prisma.utilisateurConsole.create({
      data: { role: 'conseiller_salarie', creeAt: new Date('2026-01-01T00:00:00.000Z') },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une vérification d'apporteur sur un SIREN, `joursAvant` jours avant MAINTENANT. */
async function verifier(siren: string, joursAvant: number, resultat: 'libre' | 'cliente') {
  await base.prisma.verification.create({
    data: {
      apporteurId,
      siren,
      resultat,
      // `verifications_ip_hash_purge_liee` : l'empreinte réseau est posée, ou sa purge datée.
      ipHash: 'c'.repeat(16),
      verifieeAt: new Date(MAINTENANT.getTime() - joursAvant * MS_PAR_JOUR),
    },
  });
}

/** Une attribution provisoire de l'apporteur sur un SIREN, sans coordonnées ; rend son identifiant. */
async function attribuer(siren: string): Promise<string> {
  return (
    await base.prisma.attribution.create({
      data: {
        apporteurId,
        statut: 'provisoire',
        siren,
        canal: 'espace',
        grilleCommissionId: grilleId,
        dateContact: new Date('2026-10-01'),
        verificationPrioritaire: false,
        entrepriseAVerifier: false,
        lienInteretDeclare: false,
      },
    })
  ).id;
}

const lire = (attributionId: string) =>
  lireLesCoordonneesDuContactDeLaConsole(
    app,
    { utilisateurConsoleId: consoleId, attributionId, adresse: null },
    CLES,
    MAINTENANT
  );

const evenementsDe = (attributionId: string) =>
  base.prisma.evenement.findMany({
    where: { type: 'acces_coordonnees_reservee', agregatId: attributionId },
    select: { agregat: true, charge: true },
  });

describe('REQ-SEC-042 — l’accès aux coordonnées d’une entreprise réservée, en base réelle', () => {
  it('REQ-SEC-042 : TÉMOIN — un accès pendant la réserve : UN événement, par identifiants seuls', async () => {
    const siren = unSiren();
    await verifier(siren, 2, 'libre');
    const attributionId = await attribuer(siren);
    await lire(attributionId);
    const ecrits = await evenementsDe(attributionId);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0]!.agregat).toBe('attribution');
    expect(ecrits[0]!.charge).toEqual({ acteur: { par: 'utilisateur_console', id: consoleId } });
    // La lecture reste tracée au journal des accès à la console (SEC-58), cible = l'attribution.
    const traces = await base.prisma.journalAccesConsole.findMany({
      where: { cibleId: attributionId, nature: 'lecture_coordonnees_contact' },
    });
    expect(traces).toHaveLength(1);
  });

  it('REQ-SEC-042 : TÉMOIN — un accès hors réserve : aucun événement, la lecture passe', async () => {
    const sansActe = unSiren();
    const a = await attribuer(sansActe);
    await lire(a);
    expect(await evenementsDe(a)).toHaveLength(0);

    const exempte = unSiren();
    await verifier(exempte, 2, 'cliente');
    const b = await attribuer(exempte);
    await lire(b);
    expect(await evenementsDe(b)).toHaveLength(0);

    const echue = unSiren();
    await verifier(echue, JOURS + 1, 'libre');
    const c = await attribuer(echue);
    await lire(c);
    expect(await evenementsDe(c)).toHaveLength(0);
  });

  it('REQ-SEC-042 : la chaîne du journal reste intacte après les écritures de la trace', async () => {
    const lignes = await base.prisma.evenement.findMany({
      orderBy: { id: 'asc' },
      select: { prevHash: true, selfHash: true },
    });
    expect(lignes.length).toBeGreaterThan(1);
    for (let i = 1; i < lignes.length; i++) {
      expect(lignes[i]!.prevHash, `ligne ${i}`).toBe(lignes[i - 1]!.selfHash);
    }
  });
});
