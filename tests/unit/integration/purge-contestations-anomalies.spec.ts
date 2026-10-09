// @req REQ-DM-033
// @req REQ-DM-043
/**
 * DM-62 — la purge des anomalies, des contestations et du démenti d'un contact, jugée EN PROCESSUS
 * sur un double de Prisma : ce que chaque passage DEMANDE à la base (ses limites, sa sélection, son
 * écriture) et ce qu'il en rend. Ce que la base en fait — gardes, CHECK, gel, échéances jouées une
 * milliseconde avant et pile — est jugé en base réelle par
 * `tests/integration/purge-contestations-anomalies.spec.ts`. Ce fichier-ci existe pour la mutation :
 * `pnpm mutation:pr` ne lance que les tests en processus (`vitest.mutation.config.ts`).
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  anonymiserLesAnomalies,
  limitesDePurge,
  mesuresOuvertesAuDela,
  purgerLesContestations,
  purgerLesDementis,
} from '../../../src/server/taches/purger-contestations-anomalies';

const MAINTENANT = new Date('2031-06-21T15:02:03.004Z');
const T = MAINTENANT.toISOString();
/** Les limites attendues, écrites en clair : deux mois, cinq ans, quatre-vingt-dix jours avant. */
const LEVEE = new Date('2031-04-21T15:02:03.004Z');
const CINQ_ANS = new Date('2026-06-21T15:02:03.004Z');
const ALERTE = new Date('2031-03-23T15:02:03.004Z');

function unDouble() {
  const appels: { sql: string; valeurs: unknown[] }[] = [];
  const d = {
    $queryRaw: vi.fn(async (morceaux: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ sql: morceaux.join('?').replace(/\s+/g, ' ').trim(), valeurs });
      return [{ anonymisees: 3 }];
    }),
    anomalie: {
      count: vi.fn(async () => 2),
      findMany: vi.fn(async () => [{ id: 'a1' }, { id: 'a2' }]),
    },
    contestation: { updateMany: vi.fn(async () => ({ count: 4 })) },
    qualification: { updateMany: vi.fn(async () => ({ count: 5 })) },
  };
  return { d, appels, prisma: d as unknown as PrismaClient };
}

const MESURES_OUVERTES = {
  statut: 'confirmee',
  mesureTermineeAt: null,
  anonymiseeAt: null,
  traiteAt: { lt: ALERTE },
};

describe('REQ-DM-033 et REQ-DM-043 — les limites d’un passage', () => {
  it('REQ-DM-033 : deux mois civils pour une levée, cinq ans pour une confirmée, quatre-vingt-dix jours pour l’alerte', () => {
    const l = limitesDePurge(MAINTENANT);
    expect(l.anomalieLevee).toEqual(LEVEE);
    expect(l.anomalieConfirmee).toEqual(CINQ_ANS);
    expect(l.mesureOuverte).toEqual(ALERTE);
  });

  it('REQ-DM-043 : cinq ans pour une contestation et pour un démenti', () => {
    const l = limitesDePurge(MAINTENANT);
    expect(l.contestation).toEqual(CINQ_ANS);
    expect(l.dementi).toEqual(CINQ_ANS);
  });

  it('REQ-DM-033 : la limite est calculée sans toucher à la date reçue', () => {
    const m = new Date(MAINTENANT.getTime());
    limitesDePurge(m);
    expect(m).toEqual(MAINTENANT);
  });

  // Les mois et les années sont CIVILS, en heure de Paris, comme le reste du domaine
  // (`ajouterMoisParis`) : un jour absent du mois d'arrivée devient son dernier, jamais un débordement
  // sur le mois suivant, qui ferait sortir une ligne avant son échéance.
  it('REQ-DM-033 : mois civils de Paris — deux mois avant le 30 avril, c’est le 28 février, jamais le 2 mars', () => {
    // 2027-04-30 12:00 à Paris (heure d'été) → 2027-02-28 12:00 à Paris (heure d'hiver).
    const l = limitesDePurge(new Date('2027-04-30T10:00:00.000Z'));
    expect(l.anomalieLevee).toEqual(new Date('2027-02-28T11:00:00.000Z'));
  });

  it('REQ-DM-033 : mois civils de Paris, à travers le changement d’heure — même heure légale, pas même heure UTC', () => {
    // 2026-12-03 13:00 à Paris (heure d'hiver) → 2026-10-03 13:00 à Paris (heure d'été).
    const l = limitesDePurge(new Date('2026-12-03T12:00:00.000Z'));
    expect(l.anomalieLevee).toEqual(new Date('2026-10-03T11:00:00.000Z'));
  });

  it('REQ-DM-043 : années civiles de Paris — cinq ans avant un 29 février, c’est le 28 février, jamais le 1er mars', () => {
    // 2032-02-29 13:00 à Paris → 2027-02-28 13:00 à Paris, les deux en heure d'hiver.
    const l = limitesDePurge(new Date('2032-02-29T12:00:00.000Z'));
    const attendue = new Date('2027-02-28T12:00:00.000Z');
    expect(l.anomalieConfirmee).toEqual(attendue);
    expect(l.contestation).toEqual(attendue);
    expect(l.dementi).toEqual(attendue);
  });
});

describe('REQ-DM-033 — l’anonymisation des anomalies, telle que la base la reçoit', () => {
  it('REQ-DM-033 : UNE instruction, qui vide tout ce qui désigne une personne, tronque les mois en UTC, et DÉLIE les notifications de l’espace (juriste, DM-55)', async () => {
    const { appels, prisma } = unDouble();
    await anonymiserLesAnomalies(prisma, MAINTENANT);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.sql).toBe(
      'WITH "anonymisees" AS (UPDATE "anomalies" SET "anonymisee_at" = ?::timestamptz, "score" = NULL, ' +
        '"apporteur_id" = NULL, "attribution_id" = NULL, "traite_par_id" = NULL, ' +
        '"justification_chiffre" = NULL, "justification_purgee_at" = NULL, ' +
        '"mesure_terminee_at" = NULL, "gel_litige_at" = NULL, "gel_litige_leve_at" = NULL, ' +
        '"gel_litige_ref" = NULL, ' +
        "\"ouverte_at\" = date_trunc('month', \"ouverte_at\" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', " +
        "\"traite_at\" = date_trunc('month', \"traite_at\" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' " +
        'WHERE "anonymisee_at" IS NULL ' +
        'AND ("gel_litige_at" IS NULL OR "gel_litige_leve_at" <= ?::timestamptz) ' +
        'AND (("statut" = \'levee\' AND "traite_at" <= ?::timestamptz) ' +
        'OR ("statut" = \'confirmee\' AND "mesure_terminee_at" <= ?::timestamptz)) ' +
        'RETURNING "id"), ' +
        '"deliees" AS (UPDATE "notifications_espace" SET "anomalie_id" = NULL ' +
        'WHERE "anomalie_id" IN (SELECT "id" FROM "anonymisees") RETURNING 1) ' +
        'SELECT (SELECT count(*) FROM "anonymisees")::int AS "anonymisees"'
    );
    // L'instant du passage, puis les deux limites, toutes en ISO.
    expect(appels[0]!.valeurs).toEqual([T, T, LEVEE.toISOString(), CINQ_ANS.toISOString()]);
  });

  it('REQ-DM-033 : le passage rend le nombre d’anonymisées et le NOMBRE des mesures ouvertes, rien d’autre', async () => {
    const { d, prisma } = unDouble();
    const r = await anonymiserLesAnomalies(prisma, MAINTENANT);
    expect(r).toEqual({ anonymisees: 3, mesuresOuvertes: 2 });
    expect(d.anomalie.count).toHaveBeenCalledTimes(1);
    expect(d.anomalie.count).toHaveBeenCalledWith({ where: MESURES_OUVERTES });
    expect(d.anomalie.findMany).not.toHaveBeenCalled();
  });
});

describe('REQ-DM-033 — les mesures ouvertes, nommées pour la console seule', () => {
  it('REQ-DM-033 : confirmées, sans fin posée, non anonymisées, closes avant la limite ; les plus anciennes d’abord', async () => {
    const { d, prisma } = unDouble();
    expect(await mesuresOuvertesAuDela(prisma, MAINTENANT)).toEqual(['a1', 'a2']);
    expect(d.anomalie.findMany).toHaveBeenCalledWith({
      where: MESURES_OUVERTES,
      select: { id: true },
      orderBy: [{ traiteAt: 'asc' }, { id: 'asc' }],
    });
  });
});

describe('REQ-DM-043 — le vidage des contestations, tel que la base le reçoit', () => {
  it('REQ-DM-043 : non purgées, échues par leur réponse ou, sans réponse, par leur réception, hors gel actif ; texte et réponse vidés, date posée', async () => {
    const { d, prisma } = unDouble();
    expect(await purgerLesContestations(prisma, MAINTENANT)).toEqual({ videes: 4 });
    expect(d.contestation.updateMany).toHaveBeenCalledTimes(1);
    expect(d.contestation.updateMany).toHaveBeenCalledWith({
      where: {
        purgeeAt: null,
        AND: [
          {
            OR: [
              { repondueAt: { lte: CINQ_ANS } },
              { repondueAt: null, recueAt: { lte: CINQ_ANS } },
            ],
          },
          { OR: [{ gelLitigeAt: null }, { gelLitigeLeveAt: { lte: MAINTENANT } }] },
        ],
      },
      data: { texteChiffre: null, reponseChiffre: null, purgeeAt: MAINTENANT },
    });
  });
});

describe('REQ-DM-043 — la purge dédiée du démenti, telle que la base la reçoit', () => {
  it('REQ-DM-043 : le seul `non_confirme` non purgé, échu par sa qualification ; ses deux blocs et sa date, rien d’autre', async () => {
    const { d, prisma } = unDouble();
    expect(await purgerLesDementis(prisma, MAINTENANT)).toEqual({ vides: 5 });
    expect(d.qualification.updateMany).toHaveBeenCalledTimes(1);
    expect(d.qualification.updateMany).toHaveBeenCalledWith({
      where: { resultatContact: 'non_confirme', contactPurgeAt: null, creeAt: { lte: CINQ_ANS } },
      data: {
        personneInterrogeeChiffre: null,
        termesReponseChiffre: null,
        contactPurgeAt: MAINTENANT,
      },
    });
  });
});
