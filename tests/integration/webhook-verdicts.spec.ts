// @req REQ-ARG-002
// @req REQ-ARG-003
// @req REQ-INT-011
// @req REQ-QA-009 → REQ-ARG-003
/**
 * Les verdicts de la réception des événements d'axionia, en base RÉELLE — SEC-06.
 *
 *   — les quatre verdicts de la porte : 503 sans secret, 401 hors tolérance, 401 signature,
 *     200 `{duplicate:true}` ; jamais un 5xx pour un traitement qui lève (`processedAt` nul,
 *     `retryCount` 1, et la route a rendu 200) ;
 *   — REQ-ARG-002 : au plus UN `paiement.recu` et UN `paiement.rembourse` par `paymentId`, tenus
 *     par l'index unique partiel `evenements_recus_cle_metier_unique`, jamais par une lecture
 *     préalable : le doublon rend 200 `{duplicate:true}` et n'écrit rien ;
 *   — REQ-INT-011 : une dépendance manquante est CONSERVÉE en attente, puis rejouée à l'arrivée
 *     du parent ;
 *   — REQ-ARG-003 : le même dossier livré dans l'ordre puis en ordre inverse rend le même ensemble
 *     de statuts et la même résolution des dépendances ; un événement bien formé de
 *     `schema_version` inconnue est inscrit `held`, jamais rejeté. Le golden du registre de
 *     commissions appartient à T-ARG-022.
 *
 * Les permutations exhaustives d'un dossier, sur un dépôt en mémoire, vivent dans
 * `tests/unit/integration/evenement-recu-travail.spec.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  SCHEMA_VERSION,
  TYPES_EVENEMENT,
  type TypeEvenement,
} from '../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../src/server/integrations/axionia/reception';
import {
  depotDuTravail,
  passerLeTravail,
  type Dispatch,
} from '../../src/server/queue/workers/evenement-recu';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const env: Record<string, string> = { NODE_ENV: 'test' };
for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
const SECRET = env.AXIONIA_WEBHOOK_SECRET!;

const MAINTENANT_MS = Date.UTC(2026, 8, 26, 10, 0, 0);
const MAINTENANT_S = String(MAINTENANT_MS / 1000);

const type = (prefixe: string): TypeEvenement =>
  TYPES_EVENEMENT.find((t) => t.startsWith(prefixe))!;
const CLIENT = type('client.');
const DEVIS = type('devis.');
const FACTURE = type('facture.');
const PAIEMENT_RECU = TYPES_EVENEMENT.filter((t) => t.startsWith('paiement.'))[0]!;
const PAIEMENT_REMBOURSE = TYPES_EVENEMENT.filter((t) => t.startsWith('paiement.'))[1]!;

function corps(
  t: TypeEvenement,
  sujet: Record<string, string>,
  payload: Record<string, unknown>,
  version = SCHEMA_VERSION
): string {
  return JSON.stringify({
    event_id: randomUUID(),
    event_type: t,
    schema_version: version,
    occurred_at: '2026-09-26T09:59:00.000Z',
    emitted_at: '2026-09-26T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: sujet,
    sequence: 1,
    payload,
  });
}

function signee(secret: string, c: string, secondes = MAINTENANT_S): Request {
  return new Request('https://partners.test/api/webhooks/axionia', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [ENTETE_HORODATAGE]: secondes,
      [ENTETE_SIGNATURE]: createHmac('sha256', secret)
        .update(`${secondes}.${c}`, 'utf8')
        .digest('hex'),
    },
    body: c,
  });
}

function recevoir(r: Request, environnement: Record<string, string> = env) {
  return recevoirEvenementAxionia(r, {
    environnement,
    maintenantMs: MAINTENANT_MS,
    depot: depotDeReception(base.prisma),
    declencher: () => undefined,
    alerteur: creerAlerteurPlafonne(() => undefined),
  });
}

const sansEffet: Dispatch = async () => undefined;

/**
 * Le nom de la contrainte d'unicité qui refuse une insertion, lu dans le diagnostic de Postgres :
 * pour une requête brute, Prisma ne transmet que le code 23505 et le détail, jamais le nom
 * (mesuré en porte A sur la PR 134). La valeur de l'insertion est littérale et tirée ici.
 */
async function uniciteRefusee(insertion: string): Promise<string> {
  try {
    await base.prisma.$executeRawUnsafe(`DO $$
      DECLARE contrainte text;
      BEGIN
        ${insertion};
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS contrainte = CONSTRAINT_NAME;
        RAISE EXCEPTION 'unicite_refusee:%', contrainte;
      END $$`);
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}
const passer = (dispatch: Dispatch = sansEffet) =>
  passerLeTravail({
    depot: depotDuTravail(base.prisma),
    dispatch,
    maintenant: () => new Date(MAINTENANT_MS),
  });

describe('REQ-ARG-003 — les quatre verdicts de la porte, et jamais un 5xx pour un traitement qui lève', () => {
  it('REQ-ARG-003 : 503 sans secret, 401 hors tolérance, 401 signature, 200 duplicate — et une seule ligne en tout', async () => {
    const avant = await base.prisma.evenementRecu.count();
    const c = corps(CLIENT, { client_id: randomUUID() }, {});
    const sansSecret = { ...env };
    delete sansSecret.AXIONIA_WEBHOOK_SECRET;
    const verdicts = [
      (await recevoir(signee(SECRET, c), sansSecret)).status,
      (await recevoir(signee(SECRET, c, String(MAINTENANT_MS / 1000 + 301)))).status,
      (await recevoir(signee(randomBytes(32).toString('hex'), c))).status,
      (await recevoir(signee(SECRET, c))).status,
    ];
    const doublon = await recevoir(signee(SECRET, c));
    expect([...verdicts, doublon.status]).toEqual([503, 401, 401, 200, 200]);
    expect(await doublon.json()).toEqual({ duplicate: true });
    expect(await base.prisma.evenementRecu.count()).toBe(avant + 1);
  });

  it('REQ-ARG-003 : un dispatch qui lève — route 200, puis `en_erreur`, `processedAt` nul, `retryCount` 1', async () => {
    const sujet = randomUUID();
    expect((await recevoir(signee(SECRET, corps(CLIENT, { client_id: sujet }, {})))).status).toBe(
      200
    );
    await passer(async () => {
      throw new TypeError('panne');
    });
    const l = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { sujetRef: `client:${sujet}` },
    });
    expect([l.statut, l.processedAt, l.retryCount, l.error]).toEqual([
      'en_erreur',
      null,
      1,
      'TypeError',
    ]);
  });
});

describe('REQ-ARG-002 — au plus un paiement par `paymentId`, tenu par l’index unique partiel', () => {
  it('REQ-ARG-002 : deux événements distincts du même paiement — une ligne, la seconde 200 {duplicate:true}', async () => {
    const paymentId = randomUUID();
    const payload = { paymentId, factureId: randomUUID() };
    const r1 = await recevoir(
      signee(SECRET, corps(PAIEMENT_RECU, { payment_id: paymentId }, payload))
    );
    const r2 = await recevoir(
      signee(SECRET, corps(PAIEMENT_RECU, { payment_id: paymentId }, payload))
    );
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await r2.json()).toEqual({ duplicate: true });
    expect(await base.prisma.evenementRecu.count({ where: { cleMetier: paymentId } })).toBe(1);
  });

  it('REQ-ARG-002 : le remboursement du même paiement est un AUTRE événement : il s’inscrit, une fois', async () => {
    const paymentId = randomUUID();
    const payload = { paymentId, factureId: randomUUID() };
    await recevoir(signee(SECRET, corps(PAIEMENT_RECU, { payment_id: paymentId }, payload)));
    const r = await recevoir(
      signee(SECRET, corps(PAIEMENT_REMBOURSE, { payment_id: paymentId }, payload))
    );
    const r2 = await recevoir(
      signee(SECRET, corps(PAIEMENT_REMBOURSE, { payment_id: paymentId }, payload))
    );
    expect([r.status, r2.status]).toEqual([200, 200]);
    expect(await r2.json()).toEqual({ duplicate: true });
    expect(await base.prisma.evenementRecu.count({ where: { cleMetier: paymentId } })).toBe(2);
  });

  it('REQ-ARG-002 : l’unicité est celle de la BASE — un INSERT brut du même (type, paymentId) est refusé par l’index nommé', async () => {
    const paymentId = randomUUID();
    const inserer = () =>
      base.prisma.$executeRawUnsafe(
        `INSERT INTO evenements_recus (id, source, event_id, event_type, schema_version, sequence, cle_metier, charge, payload_hash, statut, received_at, survenu_at)
         VALUES ($1::uuid, 'axionia', $2, 'paiement_recu', 1, 1, $3, '{}'::jsonb, $4, 'recu', now(), now())`,
        randomUUID(),
        randomUUID(),
        paymentId,
        'c'.repeat(64)
      );
    expect(await inserer()).toBe(1);
    expect(
      await uniciteRefusee(
        `INSERT INTO evenements_recus (id, source, event_id, event_type, schema_version, sequence, cle_metier, charge, payload_hash, statut, received_at, survenu_at)
         VALUES ('${randomUUID()}'::uuid, 'axionia', '${randomUUID()}', 'paiement_recu', 1, 1, '${paymentId}', '{}'::jsonb, '${'c'.repeat(64)}', 'recu', now(), now())`
      )
    ).toContain('unicite_refusee:evenements_recus_cle_metier_unique');
  });
});

describe('REQ-INT-011 — la dépendance manquante est conservée, puis rejouée à l’arrivée du parent', () => {
  it('REQ-INT-011 : un paiement dont la facture est inconnue attend ; la facture arrive, il passe `traite`', async () => {
    const factureId = randomUUID();
    const paymentId = randomUUID();
    await recevoir(
      signee(SECRET, corps(PAIEMENT_RECU, { payment_id: paymentId }, { paymentId, factureId }))
    );
    await passer();
    const enAttente = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { cleMetier: paymentId },
    });
    expect([enAttente.statut, enAttente.dependanceRef]).toEqual([
      'en_attente_dependance',
      `facture:${factureId}`,
    ]);

    await recevoir(signee(SECRET, corps(FACTURE, { facture_id: factureId }, { factureId })));
    await passer();
    const rejoue = await base.prisma.evenementRecu.findUniqueOrThrow({
      where: { id: enAttente.id },
    });
    expect([rejoue.statut, rejoue.dependanceRef]).toEqual(['traite', null]);
  });

  it('REQ-INT-011 : un devis dont le client est inconnu attend, jamais rejeté', async () => {
    const clientId = randomUUID();
    const r = await recevoir(
      signee(SECRET, corps(DEVIS, { devis_id: randomUUID() }, { clientId }))
    );
    expect(r.status).toBe(200);
    await passer();
    await passer();
    const l = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { dependanceRef: `client:${clientId}` },
    });
    expect(l.statut).toBe('en_attente_dependance');
  });
});

describe('REQ-ARG-003 — le rejeu d’un dossier, dans l’ordre puis en ordre inverse', () => {
  /** Un dossier, ses identifiants propres à chaque livraison : la table est en ajout seul. */
  function dossier() {
    const clientId = randomUUID();
    const factureId = randomUUID();
    const p1 = randomUUID();
    const p2 = randomUUID();
    return {
      clientId,
      evenements: [
        ['client', corps(CLIENT, { client_id: clientId }, { clientId })],
        ['devis', corps(DEVIS, { devis_id: randomUUID() }, { clientId })],
        ['facture', corps(FACTURE, { facture_id: factureId }, { factureId, clientId })],
        ['paiement', corps(PAIEMENT_RECU, { payment_id: p1 }, { paymentId: p1, factureId })],
        [
          'orphelin',
          corps(PAIEMENT_RECU, { payment_id: p2 }, { paymentId: p2, factureId: randomUUID() }),
        ],
      ] as const,
    };
  }

  async function livrer(ordre: readonly (readonly [string, string])[]) {
    const etats: Record<string, string> = {};
    const ids: [string, string][] = [];
    for (const [nom, c] of ordre) {
      await recevoir(signee(SECRET, c));
      await passer();
      const eventId = (JSON.parse(c) as { event_id: string }).event_id;
      ids.push([nom, eventId]);
    }
    for (const [nom, eventId] of ids) {
      const l = await base.prisma.evenementRecu.findFirstOrThrow({ where: { eventId } });
      etats[nom] = `${l.statut}|${l.dependanceRef === null ? '' : l.dependanceRef.split(':')[0]}`;
    }
    return etats;
  }

  it('REQ-ARG-003 : mêmes statuts et même résolution des dépendances, quel que soit l’ordre d’arrivée', async () => {
    const dansLOrdre = await livrer(dossier().evenements);
    const aLEnvers = await livrer([...dossier().evenements].reverse());
    expect(dansLOrdre).toEqual({
      client: 'traite|',
      devis: 'traite|',
      facture: 'traite|',
      paiement: 'traite|',
      orphelin: 'en_attente_dependance|facture',
    });
    expect(aLEnvers).toEqual(dansLOrdre);
  });

  it('REQ-ARG-003 : un événement bien formé de `schema_version` inconnue est inscrit `held` — jamais rejeté, jamais traité', async () => {
    const clientId = randomUUID();
    const r = await recevoir(
      signee(SECRET, corps(CLIENT, { client_id: clientId }, { clientId }, SCHEMA_VERSION + 1))
    );
    expect(r.status).toBe(200);
    await passer();
    const l = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { sujetRef: `client:${clientId}` },
    });
    expect([l.statut, l.schemaVersion, l.processedAt]).toEqual(['held', SCHEMA_VERSION + 1, null]);
  });
});
