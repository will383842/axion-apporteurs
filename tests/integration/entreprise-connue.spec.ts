// @req REQ-DM-029
// @req REQ-DM-028
/**
 * L'antériorité projetée en base RÉELLE (DM-10-P, REQ-DM-029, REQ-DM-028, contrat art. 3.3), sous le
 * rôle du serveur (`partners_app`), comme en production. Les événements d'axionia sont posés dans
 * `evenements_recus` tels que la réception les garde ; la projection les relit et RECALCULE : un
 * rejeu ne compte rien deux fois, et l'ordre d'arrivée n'importe pas.
 *
 * Témoins de la forme d'A02 : chaque CHECK refusé sur son nom ; les enums égaux au glossaire, sans
 * `demande_entrante` ; aucune colonne `client_statut` ; les frontières de l'art. 3.3 ; un devis signé
 * ancien et non entièrement facturé ; un avoir qui rouvre ; un devis ancien jamais signé.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { anterioriteDe, projeterEvenement } from '../../src/server/entreprise-connue/projection';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-06-15T12:00:00.000Z');
const CLIENT = SEUILS.ANTERIORITE_CLIENT_MOIS.valeur;
const DEVIS = SEUILS.ANTERIORITE_DEVIS_MOIS.valeur;

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** La date `mois` mois civils avant MAINTENANT, en UTC, au format du contrat. */
function ilYA(mois: number): string {
  const d = new Date(MAINTENANT.getTime());
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString();
}

const unSiren = () => String(randomInt(100_000_000, 999_999_999));

/** Pose un événement reçu, comme la réception le garde, puis le projette sous le rôle du serveur. */
async function recevoir(type: TypeEvenementRecu, charge: Record<string, unknown>): Promise<void> {
  await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: type,
      schemaVersion: 3,
      charge: charge as object,
      payloadHash: randomBytes(32).toString('hex'),
      statut: 'recu',
      receivedAt: MAINTENANT,
      survenuAt: MAINTENANT,
    },
  });
  await projeterEvenement(app, { eventType: type, charge });
}

const devisEmis = (devisId: string, siren: string, emisLe: string) =>
  recevoir(TypeEvenementRecu.devis_emis, {
    devisId,
    numero: 'D-1',
    clientId: `c-${devisId}`,
    siren,
    emisLe,
  });

const devisSigne = (devisId: string, clientId: string, signeLe: string, montant: number) =>
  recevoir(TypeEvenementRecu.devis_signe, {
    devisId,
    numero: 'D-1',
    clientId,
    montantTotalHtCents: montant,
    signeLe,
    lignes: [],
  });

const factureEmise = (
  factureId: string,
  siren: string,
  emiseLe: string,
  montant: number,
  devisId: string | null
) =>
  recevoir(TypeEvenementRecu.facture_emise, {
    factureId,
    numero: 'F-1',
    clientId: null,
    siren,
    montantHtCents: montant,
    emiseLe,
    devisId,
  });

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-029 — la forme des tables (A02)', () => {
  it('REQ-DM-029 : TÉMOIN — chaque CHECK est refusé sur son nom', async () => {
    const siren = unSiren();
    const devis = (ecart: Partial<Prisma.DevisConnuUncheckedCreateInput>) => {
      const data: Prisma.DevisConnuUncheckedCreateInput = {
        devisRef: randomUUID(),
        siren,
        emisAt: new Date(ilYA(2)),
        montantTotalHtCents: 1,
        ...ecart,
      };
      return app.devisConnu.create({ data });
    };
    expect(await refus(devis({ siren: 'ABC' }))).toContain('devis_connus_siren_forme');
    expect(await refus(devis({ devisRef: '  ' }))).toContain('devis_connus_ref_non_vide');
    expect(await refus(devis({ montantTotalHtCents: -1 }))).toContain(
      'devis_connus_montant_positif'
    );
    expect(await refus(devis({ signeAt: new Date(ilYA(3)) }))).toContain(
      'devis_connus_signature_apres_emission'
    );
    expect(
      await refus(
        app.entrepriseConnue.create({
          data: {
            siren,
            origine: 'client',
            connueDepuisAt: new Date(ilYA(1)),
            dernierContactAt: new Date(ilYA(2)),
          },
        })
      )
    ).toContain('entreprises_connues_ordre');
    expect(
      await refus(
        app.entrepriseConnue.create({
          data: {
            siren: '12345678',
            origine: 'client',
            connueDepuisAt: new Date(ilYA(2)),
            dernierContactAt: new Date(ilYA(1)),
          },
        })
      )
    ).toContain('entreprises_connues_siren_forme');
  });

  it('REQ-DM-028 : TÉMOIN — la liste de la Société refuse un SIREN mal formé, sur son nom', async () => {
    const u = await base.prisma.utilisateurConsole.create({
      data: { role: 'admin', creeAt: new Date(ilYA(1)) },
    });
    expect(
      await refus(
        app.sirenListeNoire.create({ data: { siren: '1234', motif: 'opco', ajouteParId: u.id } })
      )
    ).toContain('sirens_liste_noire_siren_forme');
  });

  it('REQ-DM-029 : TÉMOIN — les enums sont ceux du glossaire, sans `demande_entrante`', async () => {
    const valeurs = async (type: string) =>
      (
        await base.prisma.$queryRawUnsafe<{ v: string }[]>(
          `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = $1 ORDER BY e.enumsortorder`,
          type
        )
      ).map((r) => r.v);
    expect(await valeurs('origine_entreprise_connue')).toEqual(['client', 'devis', 'financeur']);
    expect(await valeurs('origine_entreprise_connue')).not.toContain('demande_entrante');
    expect(await valeurs('motif_liste_noire')).toEqual([
      'opco',
      'france_travail',
      'region',
      'of_partenaire',
      'autre',
    ]);
  });

  it('REQ-DM-029 : TÉMOIN — aucune colonne `client_statut` (retirée par A02 : aucune source fermée, aucune règle ne la lit)', async () => {
    const [r] = await base.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE column_name = 'client_statut'`
    );
    expect(r!.n).toBe(0);
  });
});

describe('REQ-DM-029 — l’antériorité projetée, sous le rôle du serveur (art. 3.3)', () => {
  it('REQ-DM-029 : TÉMOIN — une facture à 23 mois rend l’entreprise connue (client) ; à 25 mois, elle est libre', async () => {
    const proche = unSiren();
    await factureEmise(randomUUID(), proche, ilYA(CLIENT - 1), 1_000, null);
    expect(await anterioriteDe(app, proche, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'client',
    });
    const lointaine = unSiren();
    await factureEmise(randomUUID(), lointaine, ilYA(CLIENT + 1), 1_000, null);
    expect(await anterioriteDe(app, lointaine, MAINTENANT)).toEqual({ connue: false });
  });

  it('REQ-DM-029 : TÉMOIN — un devis émis à 5 mois rend l’entreprise connue (devis) ; émis à 7 mois, jamais signé ni facturé, elle est libre', async () => {
    const recent = unSiren();
    await devisEmis(randomUUID(), recent, ilYA(DEVIS - 1));
    expect(await anterioriteDe(app, recent, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'devis',
    });
    const ancien = unSiren();
    await devisEmis(randomUUID(), ancien, ilYA(DEVIS + 1));
    expect(await anterioriteDe(app, ancien, MAINTENANT)).toEqual({ connue: false });
  });

  it('REQ-DM-029 : TÉMOIN — un devis signé il y a plus de six mois et non entièrement facturé rend l’entreprise connue ; un avoir qui fait repasser le facturé sous le montant la rend connue de nouveau', async () => {
    const siren = unSiren();
    const devisId = randomUUID();
    const clientId = `c-${devisId}`;
    await recevoir(TypeEvenementRecu.client_cree, { clientId, siren, type: 'entreprise' });
    await devisEmis(devisId, siren, ilYA(41));
    await devisSigne(devisId, clientId, ilYA(40), 10_000);
    expect(await anterioriteDe(app, siren, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'devis',
    });
    // Entièrement facturé il y a 30 mois : plus rien ne la tient.
    const factureId = randomUUID();
    await factureEmise(factureId, siren, ilYA(30), 10_000, devisId);
    expect(await anterioriteDe(app, siren, MAINTENANT)).toEqual({ connue: false });
    // Un avoir sur cette facture : le facturé repasse sous le montant, l'entreprise est connue.
    await recevoir(TypeEvenementRecu.avoir_emis, {
      avoirId: randomUUID(),
      numero: 'A-1',
      avoirDeFactureId: factureId,
      clientId: null,
      siren,
      montantHtCents: -1,
      emisLe: ilYA(29),
    });
    expect(await anterioriteDe(app, siren, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'devis',
    });
    const [ligne] = await base.prisma.devisConnu.findMany({ where: { devisRef: devisId } });
    expect(ligne!.factureHtCents).toBe(9_999);
  });

  it('REQ-DM-029 : TÉMOIN — le SIREN d’un devis signé se lit sur son client ; un rejeu ne compte rien deux fois', async () => {
    const siren = unSiren();
    const devisId = randomUUID();
    const clientId = `c-${devisId}`;
    await recevoir(TypeEvenementRecu.client_cree, { clientId, siren, type: 'entreprise' });
    await devisSigne(devisId, clientId, ilYA(40), 10_000);
    await factureEmise(randomUUID(), siren, ilYA(30), 4_000, devisId);
    // Le même événement projeté une seconde fois : le facturé reste celui des faits.
    await projeterEvenement(app, {
      eventType: TypeEvenementRecu.devis_signe,
      charge: { devisId, clientId, montantTotalHtCents: 10_000, signeLe: ilYA(40), lignes: [] },
    });
    const [ligne] = await base.prisma.devisConnu.findMany({ where: { devisRef: devisId } });
    expect(ligne!.siren).toBe(siren);
    expect(ligne!.factureHtCents).toBe(4_000);
    expect(await anterioriteDe(app, siren, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'devis',
    });
  });

  it('REQ-DM-029 : une facture annulée ne rend pas l’entreprise cliente, quel que soit l’ordre d’arrivée', async () => {
    const siren = unSiren();
    const factureId = randomUUID();
    // L'annulation arrive AVANT la facture : la projection de la facture la voit.
    await recevoir(TypeEvenementRecu.facture_annulee, {
      factureId,
      motif: 'erreur',
      clientId: null,
    });
    await factureEmise(factureId, siren, ilYA(2), 1_000, null);
    expect(await anterioriteDe(app, siren, MAINTENANT)).toEqual({ connue: false });
  });

  it('REQ-DM-028 : une entreprise inscrite sur la liste de la Société est connue (financeur)', async () => {
    const siren = unSiren();
    const u = await base.prisma.utilisateurConsole.create({
      data: { role: 'admin', creeAt: new Date(ilYA(1)) },
    });
    await base.prisma.sirenListeNoire.create({ data: { siren, motif: 'opco', ajouteParId: u.id } });
    expect(await anterioriteDe(app, siren, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'financeur',
    });
  });
});
