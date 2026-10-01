// @req REQ-QA-027
/**
 * INT-T49, en base RÉELLE — les attentes de dépendance sont reprises par le LANCEUR (GOV-137), sans
 * qu'aucun nouvel événement ni aucun webhook ne les réveille ; la route ne lance plus le passage.
 *
 * Le lanceur est celui de la production (`lancerLesPassages`, `inscriptions`, `verrouConsultatif`,
 * le dépôt des battements) : seul l'instant est fixé.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { lancerLesPassages, verrouConsultatif } from '../../src/server/taches/lanceur';
import { inscriptions } from '../../src/server/taches/inscriptions';
import { depotDuTravail } from '../../src/server/queue/workers/evenement-recu';
import { refDependanceCoordonnees } from '../../packages/contracts/api';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const INSTANT = new Date();

/** Une candidature en attente de ses coordonnées, reçue il y a `ilYaMs`. */
async function uneAttente(ilYaMs: number): Promise<string> {
  const candidatureId = randomUUID();
  const charge = { candidatureId };
  const e = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.candidature_recue,
      schemaVersion: 2,
      sequence: 1n,
      sujetRef: `submission:${candidatureId}`,
      charge,
      payloadHash: createHash('sha256').update(JSON.stringify(charge)).digest('hex'),
      statut: 'en_attente_dependance',
      dependanceRef: refDependanceCoordonnees(candidatureId),
      receivedAt: new Date(INSTANT.getTime() - ilYaMs),
      survenuAt: new Date(INSTANT.getTime() - ilYaMs),
    },
    select: { id: true },
  });
  return e.id;
}

const lancer = () =>
  lancerLesPassages({
    inscriptions: inscriptions(base.prisma),
    verrou: verrouConsultatif(base.prisma),
    battre: depotDuTravail(base.prisma).battre,
    maintenant: () => INSTANT,
  });

describe('REQ-QA-027 — une attente sans nouvel événement est reprise par le lanceur', () => {
  it('REQ-QA-027 : TÉMOIN — une attente `coordonnees:` récente est reprise au passage du lanceur, sans webhook', async () => {
    await uneAttente(60_000);
    expect(await lancer()).toEqual({ evenements_recus: 'joue' });
    const b = await base.prisma.battement.findUniqueOrThrow({
      where: { tache: 'evenements_recus' },
    });
    expect((b.compteurs as { reveilles?: number } | null)?.reveilles ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('REQ-QA-027 : la route ne lance plus le passage — seul le lanceur le joue', () => {
    const route = readFileSync('src/app/api/webhooks/axionia/route.ts', 'utf8');
    expect(route).not.toMatch(/passageDesEvenementsRecus\s*\(/);
    expect(route).not.toMatch(/\bafter\s*\(/);
  });
});
