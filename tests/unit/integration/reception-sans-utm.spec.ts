// @req REQ-JUR-029
// @req REQ-DM-036
/**
 * INT-T44 — la réception retire `utm` de la charge CONSERVÉE des événements reçus.
 *
 * `evenements_recus.charge` est conservée dix ans et ne doit porter aucune donnée qui n'y sert pas.
 * Les paramètres de campagne d'une candidature n'entrent dans aucun traitement de Partners : ils
 * sont retirés AVANT l'inscription. Le `payload_hash` reste celui du corps reçu ENTIER : c'est lui,
 * et non la charge conservée, qui prouve ce qui a été reçu.
 *
 * `reponsesJson` reste, et c'est voulu : le traitement de la candidature le lit dans la charge
 * pour figer le snapshot de l'apporteur. Sa minimisation est une tâche à part, qui réécrit la
 * charge au passage à `traite` (arbitrage de la coordination, à la revendication d'INT-T44).
 *
 * Sur un dépôt en mémoire, par la vraie porte de réception ; la même chose en base réelle vit dans
 * `tests/integration/charge-minimisee.spec.ts`. La charge vient de la fixture du producteur réel
 * (RM-03).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { SCHEMA_VERSION } from '../../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../../src/server/securite/primitives-de-porte';
import { snapshotDeCandidature } from '../../../src/domain/apporteur/snapshot-candidature';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  recevoirEvenementAxionia,
  type EvenementAInscrire,
} from '../../../src/server/integrations/axionia/reception';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { evenement: { subject_ref: unknown; payload: Record<string, unknown> } };

const MAINTENANT_MS = Date.UTC(2026, 9, 1, 10, 0, 0);

function environnement(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return env;
}

/** Reçoit une enveloppe signée par la vraie porte ; rend la ligne inscrite et le corps envoyé. */
async function recevoir(
  type: string,
  sujet: unknown,
  payload: Record<string, unknown>
): Promise<{ statut: number; inscrites: EvenementAInscrire[]; corps: string }> {
  const env = environnement();
  const secret = env.AXIONIA_WEBHOOK_SECRET!;
  const corps = JSON.stringify({
    event_id: randomUUID(),
    event_type: type,
    schema_version: SCHEMA_VERSION,
    occurred_at: '2026-10-01T09:59:00.000Z',
    emitted_at: '2026-10-01T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: sujet,
    sequence: 7,
    payload,
  });
  const secondes = String(MAINTENANT_MS / 1000);
  const inscrites: EvenementAInscrire[] = [];
  const r = await recevoirEvenementAxionia(
    new Request('https://partners.test/api/webhooks/axionia', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENTETE_HORODATAGE]: secondes,
        [ENTETE_SIGNATURE]: createHmac('sha256', secret)
          .update(`${secondes}.${corps}`, 'utf8')
          .digest('hex'),
        [ENTETE_KID_AXIONIA]: kidDe(secret),
      },
      body: corps,
    }),
    {
      environnement: env,
      maintenantMs: MAINTENANT_MS,
      depot: {
        async inscrire(e) {
          inscrites.push(e);
          return 'inscrit';
        },
        // INT-T76-P : aucune v4 reçue, la fenêtre de bascule n'est pas ouverte.
        premiereReceptionDeLaVersionCourante: async () => null,
      },
      alerteur: creerAlerteurPlafonne(() => undefined),
      declencher: () => undefined,
    }
  );
  return { statut: r.status, inscrites, corps };
}

const sansUtm = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([cle]) => cle !== 'utm'));

describe('REQ-JUR-029 — la charge conservée d’une candidature ne porte plus `utm`', () => {
  it('REQ-JUR-029 : une candidature reçue AVEC `utm` est inscrite sans lui ; tout le reste est conservé', async () => {
    const payload = FIXTURE.evenement.payload;
    expect(payload.utm).not.toBeNull();
    const { statut, inscrites } = await recevoir(
      'candidature.recue',
      FIXTURE.evenement.subject_ref,
      payload
    );
    expect(statut).toBe(200);
    expect(inscrites).toHaveLength(1);
    expect(Object.hasOwn(inscrites[0]!.charge, 'utm')).toBe(false);
    expect(inscrites[0]!.charge).toEqual(sansUtm(payload));
  });

  it('REQ-JUR-029 : `utm` nul est retiré aussi : la clé n’existe pas dans la charge conservée', async () => {
    const { inscrites } = await recevoir('candidature.recue', FIXTURE.evenement.subject_ref, {
      ...FIXTURE.evenement.payload,
      utm: null,
    });
    expect(Object.hasOwn(inscrites[0]!.charge, 'utm')).toBe(false);
  });

  it('REQ-DM-036 : le `payload_hash` reste celui du corps reçu ENTIER, `utm` compris', async () => {
    const { inscrites, corps } = await recevoir(
      'candidature.recue',
      FIXTURE.evenement.subject_ref,
      FIXTURE.evenement.payload
    );
    expect(corps).toContain('"utm"');
    expect(inscrites[0]!.payloadHash).toBe(createHash('sha256').update(corps).digest('hex'));
  });

  it('REQ-DM-036 : le snapshot de la candidature se lit toujours sur la charge conservée (`reponsesJson` reste)', async () => {
    const { inscrites } = await recevoir(
      'candidature.recue',
      FIXTURE.evenement.subject_ref,
      FIXTURE.evenement.payload
    );
    const { snapshot } = snapshotDeCandidature(inscrites[0]!.charge);
    expect(snapshot.reponsesJson).toEqual(FIXTURE.evenement.payload.reponsesJson);
  });
});
