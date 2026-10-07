// @req REQ-SEC-042
/**
 * SEC-51 (REQ-SEC-042) — la garde de la réserve en base RÉELLE, sous le rôle du serveur
 * (`partners_app`) : elle est rejugée DANS la transaction de l'action, sur des faits lus en base, et
 * un état illisible (une transaction avortée par la base) refuse sous le même code. Le port est celui
 * de PRODUCTION (`portSousVerrou`) : une cause d'acte à la fois, le verrou du
 * SIREN partagé avec le dépôt (avis de la sécurité, point 2), et la ligne de journal du refus.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  CODE_ENTREPRISE_RESERVEE,
  EntrepriseReservee,
  cleDuVerrouDuSiren,
  exigerHorsReserve,
  portSousVerrou,
  type RefusDeReserve,
} from '../../src/server/demarchage/garde-reserve';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';

let base: Base;
let app: PrismaClient;
let apporteurId: string;
let grilleId: string;

const MAINTENANT = new Date('2026-10-03T12:00:00.000Z');
const JOURS = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;
const unSiren = () => String(randomInt(100_000_000, 999_999_999));

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

/** Un dépôt refusé de l'apporteur, `joursAvant` jours avant MAINTENANT. */
async function refuser(siren: string, joursAvant: number, motif: 'insincerite' | 'file_complete') {
  await base.prisma.depotRefuse.create({
    data: {
      apporteurId,
      siren,
      motif,
      canal: 'espace',
      refuseAt: new Date(MAINTENANT.getTime() - joursAvant * MS_PAR_JOUR),
    },
  });
}

/** Une attribution de l'apporteur sur un SIREN, dans l'état voulu ; rend son identifiant. */
async function attribuer(siren: string, statut: 'en_attente' | 'provisoire'): Promise<string> {
  return (
    await base.prisma.attribution.create({
      data: {
        apporteurId,
        statut,
        rangAttente: statut === 'en_attente' ? 1 : null,
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

const demarcher = (siren: string, journaliser?: (l: RefusDeReserve) => void) =>
  app.$transaction((tx) =>
    exigerHorsReserve(
      portSousVerrou(tx, journaliser),
      { siren, action: 'tache:contacts_purger', nature: 'demarchage' },
      MAINTENANT
    )
  );

const refusDe = async (siren: string): Promise<{ code: string; message: string }> => {
  try {
    await demarcher(siren);
  } catch (e) {
    const { code, message } = e as { code: string; message: string };
    return { code, message };
  }
  throw new Error('aucun refus');
};

describe('REQ-SEC-042 — la garde jugée en base réelle, une cause à la fois', () => {
  it('REQ-SEC-042 : TÉMOIN — une vérification d’apporteur de moins de la réserve : refus NOMMÉ, dans la transaction', async () => {
    const siren = unSiren();
    await verifier(siren, 1, 'libre');
    await expect(demarcher(siren)).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : TÉMOIN — un dépôt refusé, puis un dépôt en attente : refus NOMMÉ ; refusé pour une entreprise occupée : l’acte est exempté', async () => {
    const refuse = unSiren();
    await refuser(refuse, 1, 'insincerite');
    await expect(demarcher(refuse)).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
    const attente = unSiren();
    await attribuer(attente, 'en_attente');
    await expect(demarcher(attente)).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
    const occupee = unSiren();
    await refuser(occupee, 1, 'file_complete');
    await expect(demarcher(occupee)).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : TÉMOIN — une demande de confirmation planifiée ne réserve RIEN, et une entreprise attribuée sans acte non exempté n’est pas réservée (contrat v2, art. 3.5)', async () => {
    const siren = unSiren();
    const attribution = await attribuer(siren, 'provisoire');
    await base.prisma.demandeConfirmation.create({
      data: { attributionId: attribution, etat: 'planifiee' },
    });
    await expect(demarcher(siren)).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : TÉMOIN — le corps du refus est IDENTIQUE pour une vérification et pour un dépôt refusé', async () => {
    const parVerification = unSiren();
    await verifier(parVerification, 1, 'libre');
    const parRefus = unSiren();
    await refuser(parRefus, 1, 'insincerite');
    const a = await refusDe(parVerification);
    const c = await refusDe(parRefus);
    expect(a).toEqual({ code: CODE_ENTREPRISE_RESERVEE, message: CODE_ENTREPRISE_RESERVEE });
    expect(c).toEqual(a);
  });

  it('REQ-SEC-042 : TÉMOIN — la réserve échue : l’action passe ; un acte exempté (cliente) ne réserve rien', async () => {
    const echue = unSiren();
    await verifier(echue, JOURS, 'libre');
    await expect(demarcher(echue)).resolves.toBeUndefined();
    const exemptee = unSiren();
    await verifier(exemptee, 1, 'cliente');
    await expect(demarcher(exemptee)).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : un appel de VÉRIFICATION pendant la réserve passe', async () => {
    const siren = unSiren();
    await verifier(siren, 1, 'libre');
    await expect(
      app.$transaction((tx) =>
        exigerHorsReserve(
          portSousVerrou(tx),
          { siren, action: 'tache:contacts_purger', nature: 'verification' },
          MAINTENANT
        )
      )
    ).resolves.toBeUndefined();
  });

  it('REQ-SEC-042 : TÉMOIN — le refus s’écrit au journal sous le SIREN et l’action seuls', async () => {
    const siren = unSiren();
    await verifier(siren, 1, 'libre');
    const lignes: RefusDeReserve[] = [];
    await expect(demarcher(siren, (l) => void lignes.push(l))).rejects.toBeInstanceOf(
      EntrepriseReservee
    );
    expect(lignes).toEqual([
      {
        signal: 'demarchage_refuse',
        code: CODE_ENTREPRISE_RESERVEE,
        siren,
        action: 'tache:contacts_purger',
      },
    ]);
  });

  it('REQ-SEC-042 : TÉMOIN — le verrou du SIREN : une garde tenue attend le verrou du dépôt, puis voit l’acte qu’il a écrit', async () => {
    const siren = unSiren();
    let liberer!: () => void;
    const tenu = new Promise<void>((r) => (liberer = r));
    let verrouPris!: () => void;
    const pris = new Promise<void>((r) => (verrouPris = r));
    const depot = app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cleDuVerrouDuSiren(siren)}, 0))`;
      verrouPris();
      await tenu;
      await tx.verification.create({
        data: {
          apporteurId,
          siren,
          resultat: 'libre',
          ipHash: 'c'.repeat(16),
          verifieeAt: MAINTENANT,
        },
      });
    });
    await pris;
    const garde = demarcher(siren);
    const attendu = await Promise.race([
      garde.then(() => 'termine'),
      new Promise((r) => setTimeout(() => r('attend'), 1500)),
    ]);
    expect(attendu).toBe('attend');
    liberer();
    await depot;
    await expect(garde).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : TÉMOIN — ÉCHEC FERMÉ : la base refuse une lecture (transaction avortée), le démarchage est refusé sous le même code', async () => {
    const siren = unSiren();
    await expect(
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1/0`.catch(() => undefined);
        await exigerHorsReserve(
          portSousVerrou(tx),
          { siren, action: 'tache:contacts_purger', nature: 'demarchage' },
          MAINTENANT
        );
      })
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });
});
