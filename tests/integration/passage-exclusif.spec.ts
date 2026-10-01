// @req REQ-DM-036
// @req REQ-ARG-003
/**
 * INT-T55, en base RÉELLE — le passage des événements reçus est EXCLUSIF.
 *
 * LE CHOIX (écrit dans la PR) : le verrou consultatif du lanceur des passages planifiés, et non une réclamation
 * ligne par ligne. La route du webhook prend le MÊME verrou que le lanceur (`cleDuVerrou` de
 * `evenements_recus`) : aucun chemin d'appel ne contourne l'exclusion. Un passage qui trouve le
 * verrou tenu saute ; l'événement reste `recu` et le passage suivant le prend. Un processus tué
 * relâche son verrou (verrou de transaction : la base le libère avec la connexion), et l'événement,
 * jamais marqué, est repris.
 *
 * NOTE DE LA LENTILLE SÉCURITÉ : un passage plus long que la patience de la transaction (10 min) ne
 * garde jamais le verrou pendant que le travail continue. Le passage est BORNÉ : passé son budget,
 * il ne commence plus d'événement, et ce qui reste `recu` attend le passage suivant.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { cleDuVerrou, verrouConsultatif } from '../../src/server/taches/lanceur';
import {
  BUDGET_D_UN_PASSAGE_MS,
  TACHE_DE_RECEPTION,
  depotDuTravail,
  passerLeTravail,
  type EvenementATraiter,
} from '../../src/server/queue/workers/evenement-recu';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const INSTANT = new Date('2026-10-02T08:00:00.000Z');

/** Inscrit un événement `recu` d'un type sans dépendance ; rend son id. */
async function unRecu(): Promise<string> {
  const id = randomUUID();
  await base.prisma.evenementRecu.create({
    data: {
      id,
      source: 'axionia',
      eventId: randomUUID(),
      eventType: 'client_cree',
      schemaVersion: 2,
      sequence: 1n,
      sujetRef: `client:${randomUUID()}`,
      charge: {},
      payloadHash: 'a'.repeat(64),
      statut: 'recu',
      receivedAt: INSTANT,
      survenuAt: INSTANT,
    },
  });
  return id;
}

const statutDe = async (id: string) =>
  (await base.prisma.evenementRecu.findUniqueOrThrow({ where: { id } })).statut;

/** Un passage EXCLUSIF, tel que la route et le lanceur le jouent : sous le verrou de la tâche. */
function passageExclusif(dispatch: (e: EvenementATraiter) => Promise<void>) {
  return verrouConsultatif(base.prisma).sous(cleDuVerrou(TACHE_DE_RECEPTION), () =>
    passerLeTravail({ depot: depotDuTravail(base.prisma), dispatch, maintenant: () => INSTANT })
  );
}

describe('REQ-DM-036 REQ-ARG-003 — deux passages simultanés, un seul effet', () => {
  it('REQ-ARG-003 : deux passages SIMULTANÉS sur le même événement le dispatchent UNE fois', async () => {
    const id = await unRecu();
    const effets: string[] = [];
    let liberer!: () => void;
    const tenu = new Promise<void>((r) => (liberer = r));
    let entre!: () => void;
    const dedans = new Promise<void>((r) => (entre = r));
    const premier = passageExclusif(async (e) => {
      effets.push(e.id);
      entre();
      await tenu;
    });
    await dedans;
    const second = await passageExclusif(async (e) => void effets.push(e.id));
    liberer();
    expect((await premier).pris).toBe(true);
    expect(second.pris).toBe(false);
    expect(effets.filter((x) => x === id)).toHaveLength(1);
    expect(await statutDe(id)).toBe('traite');
  });

  it('REQ-DM-036 : un passage TUÉ après avoir pris le verrou le relâche, et l’événement est repris au passage suivant', async () => {
    const id = await unRecu();
    let entre!: () => void;
    const dedans = new Promise<void>((r) => (entre = r));
    const tue = passageExclusif(async () => {
      entre();
      await new Promise(() => undefined);
    }).catch(() => 'tue');
    await dedans;
    // La mort du processus : sa connexion tombe, et la base relâche le verrou de transaction.
    await base.prisma.$queryRaw`
      SELECT pg_terminate_backend(pid) FROM pg_locks
      WHERE locktype = 'advisory' AND pid <> pg_backend_pid()`;
    expect(await tue).toBe('tue');
    expect(await statutDe(id)).toBe('recu');
    const effets: string[] = [];
    const suivant = await passageExclusif(async (e) => void effets.push(e.id));
    expect(suivant.pris).toBe(true);
    expect(effets).toContain(id);
    expect(await statutDe(id)).toBe('traite');
  });
});

describe('REQ-DM-036 — le passage est BORNÉ : il ne garde jamais le verrou au-delà de son budget', () => {
  it('REQ-DM-036 : passé son budget, le passage ne commence plus d’événement ; le reste demeure `recu` et le passage suivant le prend', async () => {
    const ids = [await unRecu(), await unRecu(), await unRecu()];
    let t = INSTANT.getTime();
    const effets: string[] = [];
    await verrouConsultatif(base.prisma).sous(cleDuVerrou(TACHE_DE_RECEPTION), () =>
      passerLeTravail({
        depot: depotDuTravail(base.prisma),
        // Chaque événement « dure » plus que le budget : le premier joué, le passage s'arrête.
        dispatch: async (e) => {
          effets.push(e.id);
          t += BUDGET_D_UN_PASSAGE_MS + 1;
        },
        maintenant: () => new Date(t),
      })
    );
    expect(effets).toHaveLength(1);
    const restants = (await Promise.all(ids.map(statutDe))).filter((s) => s === 'recu');
    expect(restants).toHaveLength(2);
    const suite: string[] = [];
    await passageExclusif(async (e) => void suite.push(e.id));
    expect(ids.every((id) => [...effets, ...suite].includes(id))).toBe(true);
  });
});
