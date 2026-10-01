// @req REQ-INT-032
// @req REQ-DM-035
// @req REQ-QA-035
/**
 * INT-T26 en base RÉELLE — `candidature.recue` passe par le travail de fond des événements reçus, tire les
 * coordonnées, crée UN apporteur `candidat` ou rattache, et attend quand la route ne répond pas.
 *
 * TÉMOIN À DEUX FACES (acceptation 5) : la même candidature livrée deux fois laisse UNE ligne
 * `apporteurs`, compte à l'appui ; une route en panne laisse ZÉRO ligne et un événement en attente,
 * puis la reprise en crée exactement une. Et aucune coordonnée n'apparaît dans `evenements_recus`
 * (partners/ADR-0023, « Reste à faire »).
 *
 * La route d'axionia est simulée au niveau du port `tirer` : le client HTTP signé a son unitaire.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  PREFIXE_ATTENTE_COORDONNEES,
  traiterCandidatureRecue,
  type Coordonnees,
} from '../../src/server/integrations/axionia/candidature-recue';
import {
  depotDuTravail,
  passerLeTravail,
  reprendreLesAttentes,
} from '../../src/server/queue/workers/evenement-recu';
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

const CHARGE = fixture.evenement.payload as { candidatureId: string };
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t26-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});
const COORDONNEES: Coordonnees = {
  nom: 'Camille Durand',
  prenom: null,
  email: 'camille@example.test',
  telephone: '0600000000',
};
const MAINTENANT = new Date('2026-09-29T12:00:00.000Z');

let routeDisponible = false;
const tirer = async (): Promise<Coordonnees | null> => (routeDisponible ? COORDONNEES : null);

let sequence = 0n;
async function inscrire(charge: unknown): Promise<string> {
  sequence += 1n;
  const corps = JSON.stringify(charge);
  const e = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.candidature_recue,
      schemaVersion: 2,
      sequence,
      sujetRef: `submission:${(charge as { candidatureId: string }).candidatureId}`,
      charge: charge as object,
      payloadHash: createHash('sha256').update(corps).digest('hex'),
      statut: 'recu',
      receivedAt: MAINTENANT,
      survenuAt: MAINTENANT,
    },
    select: { id: true },
  });
  return e.id;
}

const passage = () =>
  passerLeTravail({
    depot: depotDuTravail(base.prisma),
    dispatch: async (recu) => {
      if (recu.eventType !== TypeEvenementRecu.candidature_recue) return;
      await traiterCandidatureRecue(base.prisma, recu, {
        tirer,
        cles: CLES,
        maintenant: () => MAINTENANT,
        aleatoire: (n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)),
      });
    },
    reprendre: reprendreLesAttentes(base.prisma, PREFIXE_ATTENTE_COORDONNEES, () => MAINTENANT),
    maintenant: () => MAINTENANT,
  });

describe('REQ-INT-032, REQ-DM-035, REQ-QA-035 — la candidature reçue, en base réelle', () => {
  it('REQ-INT-032 — TÉMOIN : route en panne → zéro apporteur, un événement en attente de `coordonnees:<id>`', async () => {
    const id = await inscrire(CHARGE);
    const c = await passage();
    expect(c).toMatchObject({ enAttente: 1, traites: 0, enErreur: 0 });
    expect(await base.prisma.apporteur.count()).toBe(0);
    expect(await base.prisma.evenementRecu.findUnique({ where: { id } })).toMatchObject({
      statut: 'en_attente_dependance',
      dependanceRef: `coordonnees:${CHARGE.candidatureId}`,
    });
  });

  it('REQ-DM-035, REQ-QA-035 — la reprise, route rétablie, crée EXACTEMENT un apporteur candidat', async () => {
    routeDisponible = true;
    const c = await passage();
    expect(c).toMatchObject({ reveilles: 1, traites: 1, enAttente: 0 });
    const apporteurs = await base.prisma.apporteur.findMany();
    expect(apporteurs).toHaveLength(1);
    expect(apporteurs[0]).toMatchObject({
      statut: 'candidat',
      candidatureId: CHARGE.candidatureId,
      creeAt: MAINTENANT,
    });
    expect(apporteurs[0]!.emailChiffre).not.toBeNull();
    expect(apporteurs[0]!.prenomChiffre).toBeNull();
  });

  it('REQ-INT-032 — TÉMOIN : la même candidature livrée une seconde fois laisse UNE ligne `apporteurs`', async () => {
    await inscrire(CHARGE);
    const c = await passage();
    expect(c).toMatchObject({ traites: 1, enErreur: 0 });
    expect(await base.prisma.apporteur.count()).toBe(1);
  });

  it('REQ-INT-032 : une AUTRE candidature de la même personne est rattachée, pas doublée', async () => {
    await inscrire({ ...CHARGE, candidatureId: randomUUID() });
    await passage();
    expect(await base.prisma.apporteur.count()).toBe(1);
  });

  it('REQ-INT-032 : aucune coordonnée n’apparaît dans `evenements_recus` ni en clair dans `apporteurs`', async () => {
    const [recus] = await base.prisma.$queryRaw<{ texte: string }[]>`
      SELECT string_agg(charge::text || coalesce(dependance_ref, '') || coalesce(error, ''), ' ') AS texte
      FROM evenements_recus`;
    expect(recus!.texte).not.toMatch(/Camille|Durand|camille@example|0600000000/);
    const [ligne] = await base.prisma.$queryRaw<{ texte: string }[]>`
      SELECT row_to_json(a)::text AS texte FROM apporteurs a`;
    expect(ligne!.texte).not.toMatch(/Camille|Durand|camille@example|0600000000/);
  });
});
