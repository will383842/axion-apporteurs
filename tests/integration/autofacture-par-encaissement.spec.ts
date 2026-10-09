// @req REQ-ARG-014
// @req REQ-ARG-018
/**
 * T-ARG-045 — l'émission des autofactures en base RÉELLE (REQ-ARG-014, REQ-ARG-018).
 *
 * TÉMOINS : deux passages concurrents sur les mêmes lignes ne font qu'UNE autofacture, chaque ligne
 * affectée une seule fois (`UPDATE … WHERE autofacture_id IS NULL` dans la transaction) ; un passage
 * rejoué ne crée rien ; la numérotation est posée par la base, propre à l'apporteur, continue et
 * sans trou, y compris sous concurrence et après une transaction annulée.
 *
 * Les montants sont des témoins arbitraires, sans rapport avec une grille.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { depotAutofacturesPrisma } from '../../src/server/commission/depot-autofactures-prisma';
import { emettreAutofactures } from '../../src/server/commission/emission-autofactures';
import { horlogeFigee } from '../../src/domain/temps/horloge';

/** Le passage a lieu bien après toutes les dates des témoins. */
const HORLOGE = horlogeFigee(Date.UTC(2027, 11, 31, 12));

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 240_000);

afterAll(async () => {
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'signe',
      codeParrainage: `AX${randomUUID()
        .replace(/-/g, '')
        .slice(0, 6)
        .toUpperCase()
        .replace(/[ILOU]/g, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: new Date(),
    },
  });
  return a.id;
}

/** Une ligne acquise ; `jour` est un mercredi, jeudi… de mars 2027 (tous ouvrés ici). */
async function uneLigne(apporteurId: string, cents: number, jour = '2027-03-10') {
  const le = new Date(`${jour}T00:00:00.000Z`);
  const l = await base.prisma.ligneCommission.create({
    data: {
      apporteurId,
      type: 'commission',
      statut: 'acquise',
      commissionCents: cents,
      encaissementIntegralLe: le,
      constateLe: le,
      commandeRef: `CMD-${randomUUID().slice(0, 8)}`,
      prixFactureCents: cents * 7,
      prixPublicCents: cents * 9,
    },
  });
  return l.id;
}

const autofacturesDe = (apporteurId: string) =>
  base.prisma.autofacture.findMany({
    where: { apporteurId },
    orderBy: { numero: 'asc' },
    include: { lignes: { select: { id: true } } },
  });

describe('REQ-ARG-014 — en base, une ligne n’entre que dans une autofacture', () => {
  it('REQ-ARG-014 : TÉMOIN DE CONCURRENCE — trois passages qui ont lu les mêmes lignes font UNE autofacture', async () => {
    const app = await unApporteur();
    const ids = [await uneLigne(app, 123), await uneLigne(app, 456)];
    const vrai = depotAutofacturesPrisma(base.prisma);
    // La BARRIÈRE : aucun passage n'ouvre sa transaction avant que les trois aient lu les mêmes
    // lignes libres. Sans elle, les passages pourraient se suivre, et le témoin ne jugerait rien.
    const N = 3;
    let lus = 0;
    let ouvrir!: () => void;
    const tousOntLu = new Promise<void>((r) => (ouvrir = r));
    const depot: typeof vrai = {
      async lignesLibres() {
        const lues = await vrai.lignesLibres();
        if (++lus === N) ouvrir();
        await tousOntLu;
        return lues;
      },
      transaction: (fn) => vrai.transaction(fn),
    };
    const rendus = await Promise.all(
      Array.from({ length: N }, () => emettreAutofactures(depot, HORLOGE))
    );
    const afs = await autofacturesDe(app);
    expect(afs).toHaveLength(1);
    expect(afs[0]!.montantCents).toBe(123 + 456);
    expect(afs[0]!.lignes.map((l) => l.id).sort()).toEqual([...ids].sort());
    expect(rendus.flat().filter((a) => a.apporteurId === app)).toHaveLength(1);
  });

  it('REQ-ARG-014 : TÉMOIN — un passage rejoué ne crée aucune seconde autofacture', async () => {
    const app = await unApporteur();
    await uneLigne(app, 77);
    const depot = depotAutofacturesPrisma(base.prisma);
    await emettreAutofactures(depot, HORLOGE);
    await emettreAutofactures(depot, HORLOGE);
    expect(await autofacturesDe(app)).toHaveLength(1);
  });

  it('REQ-ARG-014 : TÉMOIN — une ligne bloquée entre la lecture et la transaction n’est pas facturée', async () => {
    const app = await unApporteur();
    const libre = await uneLigne(app, 31);
    const bloquee = await uneLigne(app, 41);
    const vrai = depotAutofacturesPrisma(base.prisma);
    const depot: typeof vrai = {
      async lignesLibres() {
        const lues = await vrai.lignesLibres();
        await base.prisma.ligneCommission.update({
          where: { id: bloquee },
          data: { statut: 'bloquee' },
        });
        return lues;
      },
      transaction: (fn) => vrai.transaction(fn),
    };
    await emettreAutofactures(depot, HORLOGE);
    const afs = await autofacturesDe(app);
    expect(afs.map((a) => a.lignes.map((l) => l.id))).toEqual([[libre]]);
    expect(afs[0]!.montantCents).toBe(31);
  });
});

describe('REQ-ARG-018 — la numérotation, posée par la base, sans trou', () => {
  it('REQ-ARG-018 : TÉMOIN — des jours concurrents reçoivent 1, 2, 3 ; le compteur suit', async () => {
    const app = await unApporteur();
    await uneLigne(app, 10, '2027-03-10');
    await uneLigne(app, 20, '2027-03-11');
    await uneLigne(app, 30, '2027-03-12');
    const depot = depotAutofacturesPrisma(base.prisma);
    await Promise.all([emettreAutofactures(depot, HORLOGE), emettreAutofactures(depot, HORLOGE)]);
    const afs = await autofacturesDe(app);
    expect(afs.map((a) => a.numero)).toEqual([1, 2, 3]);
    const compteur = await base.prisma.compteurAutofacture.findUnique({
      where: { apporteurId: app },
    });
    expect(compteur?.dernierNumero).toBe(3);
  });

  it('REQ-ARG-018 : une transaction d’émission annulée ne consomme aucun numéro', async () => {
    const app = await unApporteur();
    await uneLigne(app, 11, '2027-03-10');
    const vrai = depotAutofacturesPrisma(base.prisma);
    const qui_echoue: typeof vrai = {
      lignesLibres: () => vrai.lignesLibres(),
      transaction: (fn) =>
        vrai.transaction(async (tx) => {
          await fn(tx);
          throw new Error('panne simulée après l’insertion');
        }),
    };
    await expect(emettreAutofactures(qui_echoue, HORLOGE)).rejects.toThrow('panne simulée');
    expect(await autofacturesDe(app)).toHaveLength(0);
    await uneLigne(app, 22, '2027-03-11');
    await emettreAutofactures(vrai, HORLOGE);
    const afs = await autofacturesDe(app);
    expect(afs.map((a) => a.numero)).toEqual([1, 2]);
    expect(afs.map((a) => a.montantCents)).toEqual([11, 22]);
  });

  it('REQ-ARG-018 : TÉMOIN — une ligne du 16/03 créée avant une ligne du 15/03 : le n° 1 est le 15', async () => {
    const app = await unApporteur();
    await uneLigne(app, 16, '2027-03-16');
    await uneLigne(app, 15, '2027-03-15');
    await emettreAutofactures(depotAutofacturesPrisma(base.prisma), HORLOGE);
    const afs = await autofacturesDe(app);
    expect(afs.map((a) => [a.numero, a.emiseLe.toISOString().slice(0, 10)])).toEqual([
      [1, '2027-03-15'],
      [2, '2027-03-16'],
    ]);
  });

  it('REQ-ARG-018 : TÉMOIN — une ligne régularisée est émise le jour de sa régularisation (art. 5.4)', async () => {
    const app = await unApporteur();
    const acquise = new Date('2027-03-01T00:00:00.000Z');
    await base.prisma.ligneCommission.create({
      data: {
        apporteurId: app,
        type: 'commission',
        statut: 'acquise',
        commissionCents: 9,
        encaissementIntegralLe: acquise,
        constateLe: acquise,
        regulariseLe: new Date('2027-03-22T00:00:00.000Z'),
        commandeRef: `CMD-${randomUUID().slice(0, 8)}`,
        prixFactureCents: 63,
        prixPublicCents: 81,
      },
    });
    await emettreAutofactures(depotAutofacturesPrisma(base.prisma), HORLOGE);
    const [af] = await autofacturesDe(app);
    expect(af!.emiseLe.toISOString().slice(0, 10)).toBe('2027-03-22');
    expect(af!.echeanceLe.toISOString().slice(0, 10)).toBe('2027-04-21');
  });

  it('REQ-ARG-018 : TÉMOIN — la régularisation d’une ligne facturée est figée, même de nul vers une date', async () => {
    const app = await unApporteur();
    const nue = await uneLigne(app, 7, '2027-03-10');
    const regularisee = await base.prisma.ligneCommission.create({
      data: {
        apporteurId: app,
        type: 'commission',
        statut: 'acquise',
        commissionCents: 8,
        encaissementIntegralLe: new Date('2027-03-01T00:00:00.000Z'),
        constateLe: new Date('2027-03-01T00:00:00.000Z'),
        regulariseLe: new Date('2027-03-22T00:00:00.000Z'),
        commandeRef: `CMD-${randomUUID().slice(0, 8)}`,
        prixFactureCents: 56,
        prixPublicCents: 72,
      },
    });
    await emettreAutofactures(depotAutofacturesPrisma(base.prisma), HORLOGE);
    expect(await autofacturesDe(app)).toHaveLength(2);
    const poser = (id: string, jour: string) =>
      base.prisma
        .$executeRaw`UPDATE "lignes_commission" SET "regularise_le" = ${jour}::date WHERE "id" = ${id}::uuid`;
    await expect(poser(nue, '2027-03-25')).rejects.toThrow(
      'lignes_commission_regularisation_figee'
    );
    await expect(poser(regularisee.id, '2027-03-29')).rejects.toThrow(
      'lignes_commission_regularisation_figee'
    );
    // Une ligne encore libre reste régularisable.
    const libre = await uneLigne(app, 9, '2027-03-10');
    await expect(poser(libre, '2027-03-25')).resolves.toBe(1);
  });

  it('REQ-ARG-018 : l’émission rend des dates d’émission et d’échéance justes, en jours civils', async () => {
    const app = await unApporteur();
    await uneLigne(app, 5, '2027-03-13'); // samedi → émise le lundi 15
    await emettreAutofactures(depotAutofacturesPrisma(base.prisma), HORLOGE);
    const [af] = await autofacturesDe(app);
    expect(af!.emiseLe.toISOString().slice(0, 10)).toBe('2027-03-15');
    expect(af!.echeanceLe.toISOString().slice(0, 10)).toBe('2027-04-14');
  });
});
