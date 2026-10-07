// @req REQ-JUR-029
/**
 * DM-70 — la purge du texte des décisions de contrat, en base RÉELLE, sous `partners_app`, sur une
 * horloge fixée (règle de la juriste, #703, 5982101876 ; corrections, #766, 5988086461) :
 *   - les trois points de départ : la `date_effet` d'une résiliation ; celle de la résiliation qui suit
 *     une mise en demeure ; à défaut, le jour civil de Paris du `cree_at` de la mise en demeure ;
 *   - une mise en demeure suivie d'une résiliation qui ne compte pas (fondée sur un autre fait qu'un
 *     changement de statut : la limite nommée de la purge) court de son `cree_at` ;
 *   - l'échéance au jour près : la veille et le jour anniversaire, rien ; le lendemain, la purge ;
 *   - la ligne nue qui reste, par la garde dédiée de la table, et le rendu qui refuse un texte purgé.
 *
 * Les fixtures sont écrites sous le propriétaire, la purge joue sous le rôle d'exécution. Chaque
 * passage est global : un test ne juge que SES lignes.
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
import { rendreUneDecisionDeContrat } from '../../src/server/apporteur/resiliation';
import { purgerLesTextesDesDecisions } from '../../src/server/taches/purger-textes-des-decisions';

let base: Base;
let app: PrismaClient;

const hex = (octets: number) => randomBytes(octets).toString('hex');
const ACTEUR = { par: 'utilisateur_console', id: randomUUID() } as const;

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

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'resilie',
        // CHECK `apporteurs_motif_si_resilie` : un apporteur résilié porte son motif, celui des faits
        // de changement de statut de ces fixtures.
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

/** Le fait qui fonde une décision : un changement de statut (la coupure immédiate), ou un autre fait. */
async function unFait(apporteurId: string, statut: boolean): Promise<bigint> {
  const inscrit = await base.prisma.$transaction((tx) =>
    ajouterEvenement(
      tx,
      statut
        ? {
            type: 'apporteur_statut_modifie',
            agregat: 'apporteur',
            agregatId: apporteurId,
            survenuAt: new Date('2026-01-01T08:00:00.000Z'),
            charge: {
              de: 'signe',
              vers: 'resilie',
              transition: 'resilier',
              resiliationMotif: 'manquement_grave',
              acteur: ACTEUR,
            },
          }
        : {
            type: 'apporteur_mis_en_demeure',
            agregat: 'apporteur',
            agregatId: apporteurId,
            survenuAt: new Date('2026-01-01T08:00:00.000Z'),
            charge: { article: '6', acteur: ACTEUR },
          }
    )
  );
  return BigInt(inscrit.id);
}

/** Une mise en demeure, avec son texte, sa clé et l'empreinte de ses faits ; rend son id. */
async function uneMiseEnDemeure(apporteurId: string, creeAt: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, article, texte_chiffre, evenement_id,
       cle_idempotence, faits_empreinte, cree_at)
     VALUES ($1::uuid, $2::uuid, 'mise_en_demeure', '6', $3, $4, $5::uuid, $6, $7::timestamptz)`,
    id,
    apporteurId,
    randomBytes(40),
    await unFait(apporteurId, false),
    randomUUID(),
    hex(32),
    creeAt
  );
  return id;
}

/** Une résiliation ; `statut: false` la fonde sur un autre fait qu'un changement de statut. */
async function uneResiliation(
  apporteurId: string,
  l: { creeAt: string; dateEffet: string; texte?: boolean; statut?: boolean }
): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, texte_chiffre, date_reception,
       date_effet, evenement_id, cree_at)
     VALUES ($1::uuid, $2::uuid, 'resiliation', $3, $4::date, $4::date, $5, $6::timestamptz)`,
    id,
    apporteurId,
    l.texte === false ? null : randomBytes(40),
    l.dateEffet,
    await unFait(apporteurId, l.statut ?? true),
    l.creeAt
  );
  return id;
}

async function lue(id: string) {
  return base.prisma.decisionDeContrat.findUniqueOrThrow({ where: { id } });
}
const purge = (instant: string) => purgerLesTextesDesDecisions(app, new Date(instant));
const purgee = async (id: string) => (await lue(id)).textePurgeAt !== null;

describe('REQ-JUR-029 — les trois points de départ, et l’échéance au jour près', () => {
  it('REQ-JUR-029 : TÉMOIN — une résiliation court de sa date_effet : la veille et le jour anniversaire, rien ; le lendemain, purgée', async () => {
    const a = await unApporteur();
    const r = await uneResiliation(a, { creeAt: '2026-03-10T09:00:00Z', dateEffet: '2026-03-10' });
    await purge('2031-03-09T12:00:00Z');
    expect(await purgee(r)).toBe(false);
    await purge('2031-03-10T12:00:00Z');
    expect(await purgee(r)).toBe(false);
    await purge('2031-03-11T12:00:00Z');
    expect(await purgee(r)).toBe(true);
  });

  it('REQ-JUR-029 : TÉMOIN — une mise en demeure suivie d’une résiliation court de la date_effet de celle-ci', async () => {
    const a = await unApporteur();
    const m = await uneMiseEnDemeure(a, '2026-04-01T08:00:00Z');
    await uneResiliation(a, { creeAt: '2026-04-20T09:00:00Z', dateEffet: '2026-04-20' });
    // Cinq ans de SON cree_at sont passés : elle est gardée aussi longtemps que la résiliation.
    await purge('2031-04-02T12:00:00Z');
    expect(await purgee(m)).toBe(false);
    await purge('2031-04-20T12:00:00Z');
    expect(await purgee(m)).toBe(false);
    await purge('2031-04-21T12:00:00Z');
    expect(await purgee(m)).toBe(true);
  });

  it('REQ-JUR-029 : TÉMOIN — une mise en demeure sans résiliation court du jour civil de PARIS de son cree_at', async () => {
    const a = await unApporteur();
    // 22h30 UTC le 4 mai est déjà le 5 mai à Paris : l'échéance est le 5 mai 2031.
    const m = await uneMiseEnDemeure(a, '2026-05-04T22:30:00Z');
    await purge('2031-05-05T12:00:00Z');
    expect(await purgee(m)).toBe(false);
    // Minuit du 6 mai à Paris (22h00 UTC, heure d'été) : le lendemain de l'échéance.
    await purge('2031-05-05T21:59:59.999Z');
    expect(await purgee(m)).toBe(false);
    await purge('2031-05-05T22:00:00.000Z');
    expect(await purgee(m)).toBe(true);
  });

  it('REQ-JUR-029 : TÉMOIN — une résiliation qui ne compte pas (limite nommée) laisse la mise en demeure à son cree_at', async () => {
    const a = await unApporteur();
    const m = await uneMiseEnDemeure(a, '2026-06-01T08:00:00Z');
    await uneResiliation(a, {
      creeAt: '2026-06-10T09:00:00Z',
      dateEffet: '2026-07-10',
      statut: false,
    });
    await purge('2031-06-02T12:00:00Z');
    expect(await purgee(m)).toBe(true);
  });

  it('REQ-JUR-029 : une résiliation ANTÉRIEURE à la mise en demeure ne déplace pas son départ', async () => {
    const a = await unApporteur();
    await uneResiliation(a, {
      creeAt: '2026-02-01T09:00:00Z',
      dateEffet: '2026-12-01',
      texte: false,
    });
    const m = await uneMiseEnDemeure(a, '2026-08-03T08:00:00Z');
    await purge('2031-08-04T12:00:00Z');
    expect(await purgee(m)).toBe(true);
  });
});

describe('REQ-JUR-029 — la ligne nue reste, et le texte purgé ne se rend plus', () => {
  it('REQ-JUR-029 : TÉMOIN — le texte ET l’empreinte sont vidés, la date posée, le reste intact ; un second passage n’y touche pas', async () => {
    const a = await unApporteur();
    const m = await uneMiseEnDemeure(a, '2026-09-01T08:00:00Z');
    const avant = await lue(m);
    await purge('2031-09-02T12:00:00Z');
    const apres = await lue(m);
    expect(apres.texteChiffre).toBeNull();
    expect(apres.faitsEmpreinte).toBeNull();
    expect(apres.textePurgeAt).toEqual(new Date('2031-09-02T12:00:00Z'));
    for (const champ of [
      'apporteurId',
      'geste',
      'article',
      'dateReception',
      'dateEffet',
      'evenementId',
      'cleIdempotence',
      'creeAt',
    ] as const) {
      expect(apres[champ], champ).toEqual(avant[champ]);
    }
    await purge('2032-01-01T12:00:00Z');
    expect((await lue(m)).textePurgeAt).toEqual(new Date('2031-09-02T12:00:00Z'));
  });

  it('REQ-JUR-029 : TÉMOIN — le rendu de la notification refuse un texte purgé (faits_non_conserves)', async () => {
    const a = await unApporteur();
    const m = await uneMiseEnDemeure(a, '2026-09-15T08:00:00Z');
    await purge('2031-09-16T12:00:00Z');
    const d = await lue(m);
    const rendu = await base.prisma.$transaction((tx) =>
      rendreUneDecisionDeContrat(
        tx,
        {
          cle: 'mise_en_demeure',
          apporteurId: a,
          evenementId: d.evenementId.toString(),
          decisionContratId: m,
        },
        {
          cles: undefined as never,
          composer: () => {
            throw new Error('un texte purgé ne se compose pas');
          },
        }
      )
    );
    expect(rendu).toEqual({ nonRendue: 'faits_non_conserves' });
  });

  it('REQ-JUR-029 : une résiliation sans texte n’est jamais prise', async () => {
    const a = await unApporteur();
    const r = await uneResiliation(a, {
      creeAt: '2026-10-01T09:00:00Z',
      dateEffet: '2026-10-01',
      texte: false,
    });
    await purge('2035-01-01T12:00:00Z');
    expect((await lue(r)).textePurgeAt).toBeNull();
  });
});
