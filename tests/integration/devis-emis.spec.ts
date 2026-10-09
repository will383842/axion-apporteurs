// @req REQ-INT-004
// @req REQ-QA-007
// @req REQ-DM-028
/**
 * INT-T46-P — le contrat d'événements passe en version 3 : le type « devis émis » (`devis.emis`)
 * entre dans la liste fermée (`HYP-ANTERIORITE-DEVIS`, décision de Williams du 2026-10-01).
 *
 * Par la vraie porte (`recevoirEvenementAxionia`) et le vrai dépôt (`depotDeReception`), en base
 * réelle : l'enum `type_evenement_recu` doit porter `devis_emis` pour qu'un « devis émis » se range.
 *
 * D'OÙ VIENNENT LES CHARGES (RM-03). Le producteur de `devis.emis` n'existe pas encore : il est la
 * tâche jumelle côté axion-ia, qui attend ce contrat (lockstep). La charge d'un « devis émis » est donc
 * PRISE, champ pour champ, dans la fixture du producteur réel : `devisId`, `numero` et `clientId`
 * du `devis.signe` produit, `siren` du `client.cree` produit, et l'instant d'émission est
 * l'`occurred_at` du `devis.signe`. Rien n'est inventé ; la fixture du producteur de `devis.emis`
 * remplacera cette dérivation quand la tâche jumelle l'aura générée.
 *
 * LA VERSION D'UN `held` (amendement de l'audit du plan de la Phase 1, note de la lentille
 * exactitude au rattrapage 48) : un événement mis en attente sous une version antérieure se juge contre
 * les `$defs` de SA version, jamais contre ceux de la version courante.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { ENTETE_KID_AXIONIA } from '../../packages/contracts/api';
import { SCHEMA_VERSION } from '../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  chargeConforme,
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../src/server/integrations/axionia/reception';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Produit = { event_type: string; occurred_at: string; payload: Record<string, unknown> };
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: Produit[] };

function produit(type: string): Produit {
  const e = PRODUCTEUR.evenements.find((x) => x.event_type === type);
  if (e === undefined) throw new Error(`fixture du producteur : aucun ${type}`);
  return structuredClone(e);
}

/** La charge d'un « devis émis », prise champ pour champ dans la fixture du producteur réel. */
function devisEmis(): Record<string, unknown> {
  const signe = produit('devis.signe');
  const client = produit('client.cree');
  return {
    devisId: signe.payload.devisId,
    numero: signe.payload.numero,
    clientId: signe.payload.clientId,
    siren: client.payload.siren,
    emisLe: signe.occurred_at,
  };
}

const MAINTENANT_MS = Date.UTC(2026, 9, 3, 10, 0, 0);
const env: Record<string, string> = { NODE_ENV: 'test' };
for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
const SECRET = env.AXIONIA_WEBHOOK_SECRET!;

/** Envoie une enveloppe signée par la vraie porte, en base réelle. */
async function envoyer(
  type: string,
  sujet: unknown,
  payload: Record<string, unknown>,
  version: number
): Promise<{ statut: number; corps: string; eventId: string }> {
  const eventId = randomUUID();
  const corps = JSON.stringify({
    event_id: eventId,
    event_type: type,
    schema_version: version,
    occurred_at: '2026-10-03T09:59:00.000Z',
    emitted_at: '2026-10-03T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: sujet,
    sequence: 11,
    payload,
  });
  const secondes = String(MAINTENANT_MS / 1000);
  const r = await recevoirEvenementAxionia(
    new Request('https://partners.test/api/webhooks/axionia', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENTETE_HORODATAGE]: secondes,
        [ENTETE_SIGNATURE]: createHmac('sha256', SECRET)
          .update(`${secondes}.${corps}`, 'utf8')
          .digest('hex'),
        [ENTETE_KID_AXIONIA]: kidDe(SECRET),
      },
      body: corps,
    }),
    {
      environnement: env,
      maintenantMs: MAINTENANT_MS,
      depot: depotDeReception(base.prisma),
      alerteur: creerAlerteurPlafonne(() => undefined),
      declencher: () => undefined,
    }
  );
  return { statut: r.status, corps: await r.text(), eventId };
}

const ligne = (eventId: string) => base.prisma.evenementRecu.findFirst({ where: { eventId } });

describe('REQ-INT-004 — le « devis émis » entre dans la liste fermée, en version 3', () => {
  it('REQ-INT-004 : le contrat publié en version 3 le déclare, et la version courante le garde', () => {
    // Entré en v3 (INT-T46-P), repris tel quel par la v4 (INT-T76-P).
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
    for (const v of [3, SCHEMA_VERSION]) {
      const publie = JSON.parse(
        readFileSync(`packages/contracts/contracts.v${v}.json`, 'utf8')
      ) as { $defs: Record<string, unknown> };
      expect(Object.keys(publie.$defs), `v${v}`).toContain('payload_devis_emis');
    }
  });

  it('REQ-INT-004 : un `devis.emis` conforme est RANGÉ — 200, inscrit `recu` sous `devis_emis`', async () => {
    const { statut, eventId } = await envoyer(
      'devis.emis',
      { devis_id: devisEmis().devisId },
      devisEmis(),
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
    const l = await ligne(eventId);
    expect([l?.eventType, l?.statut, l?.schemaVersion]).toEqual([
      'devis_emis',
      'recu',
      SCHEMA_VERSION,
    ]);
  });

  it('REQ-INT-004 : un `devis.emis` HORS SCHÉMA (un champ intrus) est refusé 422, et rien n’est inscrit', async () => {
    const { statut, corps, eventId } = await envoyer(
      'devis.emis',
      { devis_id: devisEmis().devisId },
      { ...devisEmis(), champIntrus: 'x' },
      SCHEMA_VERSION
    );
    expect([statut, corps]).toEqual([422, 'hors_schema']);
    expect(await ligne(eventId)).toBeNull();
  });

  it('REQ-INT-004 : un `devis.emis` privé de son instant d’émission est refusé 422', async () => {
    const sansDate = devisEmis();
    delete sansDate.emisLe;
    const { statut, eventId } = await envoyer(
      'devis.emis',
      { devis_id: devisEmis().devisId },
      sansDate,
      SCHEMA_VERSION
    );
    expect(statut).toBe(422);
    expect(await ligne(eventId)).toBeNull();
  });

  it('REQ-INT-004 : un `devis.emis` qui porterait un montant est refusé 422 — un devis émis n’est pas signé, aucun montant ne traverse (REQ-INT-029)', async () => {
    const { statut, eventId } = await envoyer(
      'devis.emis',
      { devis_id: devisEmis().devisId },
      { ...devisEmis(), montantTotalHtCents: 500000 },
      SCHEMA_VERSION
    );
    expect(statut).toBe(422);
    expect(await ligne(eventId)).toBeNull();
  });

  it('REQ-DM-028 : le « devis émis » porte le SIREN du destinataire, conservé dans la charge', async () => {
    const charge = devisEmis();
    expect(typeof charge.siren).toBe('string');
    const { statut, eventId } = await envoyer(
      'devis.emis',
      { devis_id: charge.devisId },
      charge,
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
    expect(((await ligne(eventId))?.charge as Record<string, unknown>).siren).toBe(charge.siren);
  });
});

describe('REQ-QA-007 — la version 3 : `devisId` sur la facture, montants jamais négatifs hors avoir', () => {
  it('REQ-QA-007 : une `facture.emise` v3 portant le `devisId` de son devis est rangée', async () => {
    const f = produit('facture.emise');
    const { statut } = await envoyer(
      'facture.emise',
      { facture_id: f.payload.factureId },
      { ...f.payload, devisId: devisEmis().devisId },
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
  });

  it('REQ-QA-007 : une `facture.emise` v3 sans devis porte `devisId: null`, et elle est rangée', async () => {
    const f = produit('facture.emise');
    const { statut } = await envoyer(
      'facture.emise',
      { facture_id: f.payload.factureId },
      { ...f.payload, devisId: null },
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
  });

  it('REQ-QA-007 : un paiement reçu au montant encaissé NÉGATIF est refusé 422 (`minimum: 0`)', async () => {
    const p = produit('paiement.recu').payload;
    const { amountHtCents, ...reste } = p;
    const { statut } = await envoyer(
      'paiement.recu',
      { payment_id: randomUUID() },
      {
        ...reste,
        montantHtCents: amountHtCents,
        paymentId: randomUUID(),
        montantEncaisseTtcCents: -1,
      },
      SCHEMA_VERSION
    );
    expect(statut).toBe(422);
  });

  it('REQ-QA-007 : CONTRE-TÉMOIN — le même paiement au montant positif du producteur est rangé', async () => {
    const p = produit('paiement.recu').payload;
    const { amountHtCents, ...reste } = p;
    const { statut } = await envoyer(
      'paiement.recu',
      { payment_id: randomUUID() },
      { ...reste, montantHtCents: amountHtCents, paymentId: randomUUID() },
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
  });

  it('REQ-QA-007 : un `avoir.emis` aux montants NÉGATIFS du producteur reste rangé — l’avoir est négatif par conception', async () => {
    const a = produit('avoir.emis');
    expect(a.payload.montantHtCents as number).toBeLessThan(0);
    const { statut } = await envoyer(
      'avoir.emis',
      { avoir_id: a.payload.avoirId },
      a.payload,
      SCHEMA_VERSION
    );
    expect(statut).toBe(200);
  });
});

describe('REQ-QA-007 — un `held` se juge contre les `$defs` de SA version', () => {
  it('REQ-QA-007 : un `devis.signe` v2 mis en `held`, puis rejoué après la v3, est jugé conforme', async () => {
    const d = produit('devis.signe');
    const { statut, eventId } = await envoyer(
      'devis.signe',
      { devis_id: d.payload.devisId },
      d.payload,
      2
    );
    expect(statut).toBe(200);
    const l = await ligne(eventId);
    expect(l?.statut).toBe('held');
    expect(chargeConforme('devis.signe', l?.charge, l!.schemaVersion)).toBe(true);
  });

  it('REQ-QA-007 : une `facture.emise` v2 en `held`, sans `devisId`, est conforme à SES `$defs` v2 et pas à ceux de la v3', async () => {
    const f = produit('facture.emise');
    const { eventId } = await envoyer(
      'facture.emise',
      { facture_id: f.payload.factureId },
      f.payload,
      2
    );
    const l = await ligne(eventId);
    expect(l?.statut).toBe('held');
    expect(chargeConforme('facture.emise', l?.charge, 2)).toBe(true);
    expect(chargeConforme('facture.emise', l?.charge, SCHEMA_VERSION)).toBe(false);
  });

  it('REQ-QA-007 : un `held` d’une version dont aucun contrat n’est publié n’est JAMAIS conforme — échec fermé', async () => {
    const d = produit('devis.signe');
    const { eventId } = await envoyer(
      'devis.signe',
      { devis_id: d.payload.devisId },
      d.payload,
      99
    );
    const l = await ligne(eventId);
    expect(l?.statut).toBe('held');
    expect(chargeConforme('devis.signe', l?.charge, 99)).toBe(false);
  });

  it('REQ-QA-007 : un `devis.emis` n’existe pas en v2 — un `held` v2 de ce type n’est jamais conforme', () => {
    expect(chargeConforme('devis.emis', devisEmis(), 2)).toBe(false);
  });
});
