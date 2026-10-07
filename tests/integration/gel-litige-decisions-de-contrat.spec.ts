// @req REQ-JUR-029
/**
 * JUR-T64 — le gel pour litige du texte d'une décision de contrat, en base RÉELLE, sous `partners_app`
 * (forme d'A02, #703 6041868006 ; règle de la juriste, #703 6041829569 ; témoins de la liste d'A02) :
 *   - un litige naît OUVERT, à l'heure de la BASE ; il est refusé sur un texte déjà purgé, ou sur une
 *     décision sans texte ;
 *   - un second litige OUVERT sur la même décision est refusé ; un second, après la clôture, passe ;
 *   - la clôture est unique et liée ; DELETE et TRUNCATE sont refusés ;
 *   - la purge est refusée par la base tant qu'un litige est ouvert (le filet), et sautée par le passage ;
 *   - après la clôture, le départ est la dernière clôture si elle est plus tardive : rien le jour
 *     anniversaire de la clôture, la purge le lendemain ; la clôture elle-même ne purge rien.
 *
 * Les fixtures sont écrites sous le propriétaire ; les gestes et la purge jouent sous le rôle
 * d'exécution. Les dates de clôture sont FUTURES : `ouvert_at` est l'heure réelle de la base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import { purgerLesTextesDesDecisions } from '../../src/server/taches/purger-textes-des-decisions';
import {
  cloreUnLitige,
  ErreurLitige,
  ouvrirUnLitige,
} from '../../src/server/console/litiges-des-decisions';

let base: Base;
let app: PrismaClient;
let adminId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, now(), now()) RETURNING id`,
    randomUUID(),
    hex(32)
  );
  adminId = admin!.id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'resilie',
        resiliationMotif: 'manquement_grave',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: new Date('2026-01-01T08:00:00.000Z'),
      },
    })
  ).id;
}

/** Une résiliation (fondée sur un changement de statut), avec son texte sauf `texte: false`. */
async function uneResiliation(dateEffet: string, texte = true): Promise<string> {
  const apporteurId = await unApporteur();
  const fait = await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: apporteurId,
      survenuAt: new Date('2026-01-01T08:00:00.000Z'),
      charge: {
        de: 'signe',
        vers: 'resilie',
        transition: 'resilier',
        resiliationMotif: 'manquement_grave',
        acteur: { par: 'utilisateur_console', id: adminId },
      },
    })
  );
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, texte_chiffre, date_reception,
       date_effet, evenement_id, cree_at)
     VALUES ($1::uuid, $2::uuid, 'resiliation', $3, $4::date, $4::date, $5, $4::timestamptz)`,
    id,
    apporteurId,
    texte ? randomBytes(40) : null,
    dateEffet,
    BigInt(fait.id)
  );
  return id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return e instanceof ErreurLitige ? e.motif : String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const ouvrir = (decisionId: string, instant = '2028-01-10T10:00:00Z') =>
  ouvrirUnLitige(app, {
    acteur: { id: adminId },
    decisionId,
    motif: 'action_en_justice',
    maintenant: new Date(instant),
  });
const clore = (decisionId: string, instant: string) =>
  cloreUnLitige(app, {
    acteur: { id: adminId },
    decisionId,
    motif: 'decision_definitive',
    maintenant: new Date(instant),
  });
const purge = (instant: string) => purgerLesTextesDesDecisions(app, new Date(instant));
const purgee = async (id: string) =>
  (await base.prisma.decisionDeContrat.findUniqueOrThrow({ where: { id } })).textePurgeAt !== null;

describe('REQ-JUR-029 — JUR-T64 : la naissance et la forme du litige', () => {
  it('REQ-JUR-029 : TÉMOIN — un litige naît OUVERT, à l’heure de la BASE, même si une heure est fournie', async () => {
    const d = await uneResiliation('2026-03-10');
    const avant = new Date();
    const id = randomUUID();
    await app.$executeRawUnsafe(
      `INSERT INTO litiges_decisions_de_contrat (id, decision_id, motif_ouverture, ouvert_at, ouvert_par_id)
       VALUES ($1::uuid, $2::uuid, 'mediation', '2000-01-01T00:00:00Z', $3::uuid)`,
      id,
      d,
      adminId
    );
    const l = await base.prisma.litigeDecisionDeContrat.findUniqueOrThrow({ where: { id } });
    expect(l.ouvertAt.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 5_000);
    expect([l.closAt, l.closParId, l.motifCloture]).toEqual([null, null, null]);
  });

  it('REQ-JUR-029 : TÉMOIN — un litige qui naîtrait clos est refusé par la base', async () => {
    const d = await uneResiliation('2026-03-10');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `INSERT INTO litiges_decisions_de_contrat (id, decision_id, motif_ouverture, ouvert_par_id,
             motif_cloture, clos_at, clos_par_id)
           VALUES ($1::uuid, $2::uuid, 'mediation', $3::uuid, 'accord', now(), $3::uuid)`,
          randomUUID(),
          d,
          adminId
        )
      )
    ).toContain('litiges_decisions_de_contrat_naissance');
  });

  it('REQ-JUR-029 : TÉMOIN — sur une décision SANS texte, ou au texte déjà purgé : refusé par le geste et par la base', async () => {
    const sans = await uneResiliation('2026-03-10', false);
    expect(await refus(ouvrir(sans))).toBe('texte_efface');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `INSERT INTO litiges_decisions_de_contrat (id, decision_id, motif_ouverture, ouvert_par_id)
           VALUES ($1::uuid, $2::uuid, 'mediation', $3::uuid)`,
          randomUUID(),
          sans,
          adminId
        )
      )
    ).toContain('litiges_decisions_de_contrat_naissance');
  });

  it('REQ-JUR-029 : TÉMOIN — un second litige OUVERT est refusé ; après la clôture du premier, un second passe', async () => {
    const d = await uneResiliation('2026-03-10');
    await ouvrir(d);
    expect(await refus(ouvrir(d))).toBe('deja_ouvert');
    // L'index unique partiel tient la règle, même sans le geste.
    expect(
      await refus(
        app.$executeRawUnsafe(
          `INSERT INTO litiges_decisions_de_contrat (id, decision_id, motif_ouverture, ouvert_par_id)
           VALUES ($1::uuid, $2::uuid, 'mediation', $3::uuid)`,
          randomUUID(),
          d,
          adminId
        )
      )
    ).toContain('litiges_decisions_de_contrat_un_ouvert');
    await clore(d, '2028-02-01T10:00:00Z');
    await ouvrir(d, '2028-03-01T10:00:00Z');
    expect(await base.prisma.litigeDecisionDeContrat.count({ where: { decisionId: d } })).toBe(2);
  });

  it('REQ-JUR-029 : TÉMOIN — la clôture est liée et UNIQUE ; DELETE et TRUNCATE sont refusés', async () => {
    const d = await uneResiliation('2026-03-10');
    const { litigeId } = await ouvrir(d);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE litiges_decisions_de_contrat SET clos_at = '2028-02-01T10:00:00Z' WHERE id = $1::uuid`,
          litigeId
        )
      )
    ).toContain('litiges_decisions_de_contrat_cloture_liee');
    await clore(d, '2028-02-01T10:00:00Z');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE litiges_decisions_de_contrat SET motif_cloture = 'accord' WHERE id = $1::uuid`,
          litigeId
        )
      )
    ).not.toBe('aucun refus');
    expect(await refus(clore(d, '2028-03-01T10:00:00Z'))).toBe('aucun_litige');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `DELETE FROM litiges_decisions_de_contrat WHERE id = $1::uuid`,
          litigeId
        )
      )
    ).not.toBe('aucun refus');
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE litiges_decisions_de_contrat`))
    ).not.toBe('aucun refus');
  });
});

describe('REQ-JUR-029 — JUR-T64 : le gel de la purge, et le départ après la clôture', () => {
  it('REQ-JUR-029 : TÉMOIN — un litige OUVERT : la base refuse la purge du texte (le filet), et le passage le saute, même échu', async () => {
    const d = await uneResiliation('2026-03-10');
    await ouvrir(d);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET texte_chiffre = NULL, faits_empreinte = NULL,
             texte_purge_at = now() WHERE id = $1::uuid`,
          d
        )
      )
    ).toContain('decisions_de_contrat_gel_litige');
    await purge('2032-01-01T12:00:00Z');
    expect(await purgee(d)).toBe(false);
  });

  it('REQ-JUR-029 : TÉMOIN — la clôture ne purge rien ; la purge repart de la clôture : rien le jour anniversaire, purgée le lendemain', async () => {
    const d = await uneResiliation('2026-03-10');
    await ouvrir(d);
    await clore(d, '2028-06-14T10:00:00Z');
    expect(await purgee(d)).toBe(false);
    await purge('2033-06-14T12:00:00Z');
    expect(await purgee(d)).toBe(false);
    await purge('2033-06-15T12:00:00Z');
    expect(await purgee(d)).toBe(true);
  });

  it('REQ-JUR-029 : TÉMOIN — deux litiges successifs : la DERNIÈRE clôture compte', async () => {
    const d = await uneResiliation('2026-03-10');
    await ouvrir(d);
    await clore(d, '2028-02-01T10:00:00Z');
    await ouvrir(d, '2028-03-01T10:00:00Z');
    await clore(d, '2029-09-20T10:00:00Z');
    await purge('2034-09-20T12:00:00Z');
    expect(await purgee(d)).toBe(false);
    await purge('2034-09-21T12:00:00Z');
    expect(await purgee(d)).toBe(true);
  });

  it('REQ-JUR-029 : le litige d’une AUTRE décision ne gèle rien', async () => {
    const gelee = await uneResiliation('2026-03-10');
    const libre = await uneResiliation('2026-03-10');
    await ouvrir(gelee);
    await purge('2031-03-11T12:00:00Z');
    expect([await purgee(gelee), await purgee(libre)]).toEqual([false, true]);
  });
});
