// @req REQ-JUR-029
// @req REQ-DM-036
/**
 * INT-T44, en base RÉELLE — une candidature reçue avec `utm` est conservée dans `evenements_recus`
 * sans lui, et son `payload_hash` est celui du corps reçu entier.
 *
 * Par la vraie porte (`recevoirEvenementAxionia`) et le vrai dépôt (`depotDeReception`). La charge
 * vient de la fixture du producteur réel (RM-03). Les mêmes règles sur un dépôt en mémoire :
 * `tests/unit/integration/reception-sans-utm.spec.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { ENTETE_KID_AXIONIA } from '../../packages/contracts/api';
import { SCHEMA_VERSION } from '../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
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

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { evenement: { subject_ref: unknown; payload: Record<string, unknown> } };

const MAINTENANT_MS = Date.UTC(2026, 9, 1, 10, 0, 0);
const env: Record<string, string> = { NODE_ENV: 'test' };
for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
const SECRET = env.AXIONIA_WEBHOOK_SECRET!;

describe('REQ-JUR-029 — `evenements_recus.charge` ne conserve pas `utm`', () => {
  it('une candidature reçue avec `utm` est inscrite sans lui, et son hash est celui du corps entier', async () => {
    const eventId = randomUUID();
    const corps = JSON.stringify({
      event_id: eventId,
      event_type: 'candidature.recue',
      schema_version: SCHEMA_VERSION,
      occurred_at: '2026-10-01T09:59:00.000Z',
      emitted_at: '2026-10-01T09:59:30.000Z',
      producer: 'axionia',
      subject_ref: FIXTURE.evenement.subject_ref,
      sequence: 7,
      payload: FIXTURE.evenement.payload,
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
    expect(r.status).toBe(200);

    const ligne = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { eventId },
      select: { charge: true, payloadHash: true },
    });
    const charge = ligne.charge as Record<string, unknown>;
    expect(FIXTURE.evenement.payload.utm).not.toBeNull();
    expect(Object.hasOwn(charge, 'utm')).toBe(false);
    expect(charge.reponsesJson).toEqual(FIXTURE.evenement.payload.reponsesJson);
    expect(ligne.payloadHash).toBe(createHash('sha256').update(corps).digest('hex'));
  });
});
