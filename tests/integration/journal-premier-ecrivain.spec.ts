// @req REQ-DM-024
/**
 * DM-45, en base RÉELLE — le journal chaîné a son premier écrivain : une candidature reçue qui CRÉE
 * un apporteur écrit exactement UN événement `apporteur_cree`, dans la même transaction, par
 * l'écrivain unique du journal ; un rattachement à un apporteur existant n'en écrit aucun. La chaîne
 * reste vérifiée après l'écriture.
 *
 * Le comptage lit le type par son texte (`type::text`), pour que ce témoin s'exécute aussi sur une
 * base dont l'enum ne connaît pas encore la valeur : il y rougit en comptant zéro.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  traiterCandidatureRecue,
  type Coordonnees,
} from '../../src/server/integrations/axionia/candidature-recue';
import { sourceAleatoireSysteme } from '../../src/domain/apporteur/identifiants';
import { verifierChaine, type LigneJournal } from '../../src/domain/evenement/journal';
import { clesPii } from '../../src/server/securite/pii';
import fixture from '../fixtures/axionia/candidature-recue.json';
import { demarrerBase, type Base } from './harnais';

let base: Base;
beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);
afterAll(async () => {
  await base?.arreter();
});

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-45-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});
const MAINTENANT = new Date('2026-10-02T10:00:00.000Z');
let sequence = 0n;

/** Une candidature reçue, traitée par la vraie fonction, au courriel donné ; rend son issue. */
async function recevoir(candidatureId: string, courriel: string) {
  const charge = { ...fixture.evenement.payload, candidatureId, parrainCodeCapture: null };
  sequence += 1n;
  const recu = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.candidature_recue,
      schemaVersion: 2,
      sequence,
      sujetRef: `submission:${candidatureId}`,
      charge: charge as object,
      payloadHash: createHash('sha256').update(JSON.stringify(charge)).digest('hex'),
      statut: 'recu',
      receivedAt: MAINTENANT,
      survenuAt: MAINTENANT,
    },
    select: { id: true, charge: true },
  });
  const coordonnees: Coordonnees = { nom: 'Camille Durand', prenom: null, email: courriel, telephone: null };
  return traiterCandidatureRecue(base.prisma, recu, {
    tirer: async () => coordonnees,
    cles: CLES,
    maintenant: () => MAINTENANT,
    aleatoire: sourceAleatoireSysteme,
  });
}

/** Le nombre d'événements `apporteur_cree` du journal pour un apporteur. */
async function apporteursCrees(apporteurId: string): Promise<number> {
  const [l] = await base.prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM evenements
    WHERE type::text = 'apporteur_cree' AND agregat_id = ${apporteurId}::uuid`;
  return Number(l?.n ?? 0n);
}

describe('REQ-DM-024 — le journal chaîné a son premier écrivain', () => {
  it('REQ-DM-024 : TÉMOIN — une candidature reçue qui crée un apporteur écrit exactement UN `apporteur_cree`', async () => {
    const candidatureId = randomUUID();
    expect(await recevoir(candidatureId, `${candidatureId}@example.test`)).toBe('cree');
    const a = await base.prisma.apporteur.findUniqueOrThrow({
      where: { candidatureId },
      select: { id: true },
    });
    expect(await apporteursCrees(a.id)).toBe(1);
  });

  it('REQ-DM-024 : un RATTACHEMENT à un apporteur existant n’écrit aucun `apporteur_cree` de plus', async () => {
    const candidatureId = randomUUID();
    const courriel = `${candidatureId}@example.test`;
    expect(await recevoir(candidatureId, courriel)).toBe('cree');
    const a = await base.prisma.apporteur.findUniqueOrThrow({
      where: { candidatureId },
      select: { id: true },
    });
    expect(await recevoir(randomUUID(), courriel)).toBe('rattache');
    expect(await apporteursCrees(a.id)).toBe(1);
  });

  it('REQ-DM-024 : après l’écriture, la chaîne du journal est toujours vérifiée', async () => {
    const lignes = await base.prisma.$queryRaw<LigneJournal[]>`
      SELECT id::text AS id, type::text AS type, agregat::text AS agregat, agregat_id::text AS "agregatId",
             to_char(survenu_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "survenuAt",
             charge, prev_hash AS "prevHash", self_hash AS "selfHash"
      FROM evenements ORDER BY id`;
    expect(lignes.some((l) => (l as { type: string }).type === 'apporteur_cree')).toBe(true);
    expect(verifierChaine(lignes)).toMatchObject({ ok: true });
  });
});
