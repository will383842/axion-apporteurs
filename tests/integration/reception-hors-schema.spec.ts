// @req REQ-INT-003
// @req REQ-QA-007
/**
 * INT-T45 — la réception applique les `$defs` FERMÉS du contrat publié : un payload hors schéma est
 * refusé 422 `hors_schema`, AVANT toute inscription (un écart relevé par la vérification de bout en
 * bout du 2026-09-30).
 *
 * Par la vraie porte (`recevoirEvenementAxionia`) et le vrai dépôt (`depotDeReception`), en base
 * réelle. Les charges viennent de la fixture du producteur réel (RM-03) ; chaque cas hors schéma en
 * est une copie altérée d'UN champ.
 *
 * CONDITION DE LA LENTILLE SÉCURITÉ (rattrapage 45) : au rejeu d'un `held`, la charge CONSERVÉE est
 * jugée contre le même `$defs`, privé des `CHAMPS_NON_CONSERVES` (retirés des propriétés et de
 * `required`), sans jamais les réintroduire. Un `held` conforme, conservé sans `utm`, est accepté ;
 * un `held` hors schéma est refusé `hors_schema`.
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

const CANDIDATURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { evenement: { subject_ref: unknown; payload: Record<string, unknown> } };
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: { event_type: string; payload: Record<string, unknown> }[] };

const MAINTENANT_MS = Date.UTC(2026, 9, 1, 10, 0, 0);
const env: Record<string, string> = { NODE_ENV: 'test' };
for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
const SECRET = env.AXIONIA_WEBHOOK_SECRET!;

/** Envoie une enveloppe signée par la vraie porte, en base réelle ; rend le statut et l'eventId. */
async function envoyer(
  type: string,
  sujet: unknown,
  payload: Record<string, unknown>,
  version: number = SCHEMA_VERSION
): Promise<{ statut: number; corps: string; eventId: string }> {
  const eventId = randomUUID();
  const corps = JSON.stringify({
    event_id: eventId,
    event_type: type,
    schema_version: version,
    occurred_at: '2026-10-01T09:59:00.000Z',
    emitted_at: '2026-10-01T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: sujet,
    sequence: 7,
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

const inscrit = async (eventId: string) =>
  (await base.prisma.evenementRecu.count({ where: { eventId } })) > 0;

/**
 * La charge de `paiement.recu` du producteur réel, en version 2 : la fixture est celle de la
 * version 1, et le seul renommage de la version 2 (`amountHtCents` → `montantHtCents`, nommé par
 * `tests/unit/integration/contrat-hash.spec.ts`) y est appliqué. Une clé de paiement neuve à chaque
 * appel : l'index du paiement rendrait sinon un doublon.
 */
function paiementDuProducteur(): Record<string, unknown> {
  const e = PRODUCTEUR.evenements.find((x) => x.event_type === 'paiement.recu');
  if (e === undefined) throw new Error('fixture du producteur : aucun paiement.recu');
  const { amountHtCents, ...reste } = e.payload;
  return { ...reste, montantHtCents: amountHtCents, paymentId: randomUUID() };
}

describe('REQ-INT-003 REQ-QA-007 — un payload hors schéma est refusé 422, avant toute inscription', () => {
  it('REQ-INT-003 : un `candidature.recue` signé portant un champ intrus est refusé `hors_schema`, et rien n’est inscrit', async () => {
    const { statut, corps, eventId } = await envoyer(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      { ...CANDIDATURE.evenement.payload, champIntrus: 'x' }
    );
    expect([statut, corps]).toEqual([422, 'hors_schema']);
    expect(await inscrit(eventId)).toBe(false);
  });

  it('REQ-INT-003 : un montant en chaîne est refusé `hors_schema`, et rien n’est inscrit', async () => {
    const p = paiementDuProducteur();
    const { statut, corps, eventId } = await envoyer(
      'paiement.recu',
      { payment_id: randomUUID() },
      {
        ...p,
        montantEncaisseTtcCents: String(p.montantEncaisseTtcCents),
      }
    );
    expect([statut, corps]).toEqual([422, 'hors_schema']);
    expect(await inscrit(eventId)).toBe(false);
  });

  it('REQ-QA-007 : CONTRE-TÉMOIN — le paiement conforme du producteur est accepté : seul le montant en chaîne le fait refuser', async () => {
    const { statut, eventId } = await envoyer(
      'paiement.recu',
      { payment_id: randomUUID() },
      paiementDuProducteur()
    );
    expect(statut).toBe(200);
    expect(await inscrit(eventId)).toBe(true);
  });

  it('REQ-QA-007 : CONTRE-TÉMOIN — la charge conforme du producteur reste acceptée et inscrite', async () => {
    const { statut, eventId } = await envoyer(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      CANDIDATURE.evenement.payload
    );
    expect(statut).toBe(200);
    expect(await inscrit(eventId)).toBe(true);
  });
});

/**
 * La version d'un `held` qu'on rejoue : la version publiée ANTÉRIEURE à la courante. Depuis
 * INT-T46-P, un `held` se juge contre les `$defs` de SA version, et une version sans contrat publié
 * (la courante + 1) n'est jamais conforme : le témoin d'une charge conforme part donc d'une version
 * publiée. Depuis INT-T76-P, la v3 est TRAITÉE pendant la fenêtre de bascule (ouverte par la première
 * v4 reçue) : le témoin part donc de la v2, publiée, qui connaît la candidature, et qui est toujours
 * `held`.
 */
const VERSION_DU_HELD = 2;

describe('REQ-INT-003 — condition de la sécurité : le rejeu d’un `held` passe par la MÊME validation', () => {
  it('REQ-INT-003 : un `held` conforme, conservé sans `utm`, est jugé conforme à son rejeu', async () => {
    const { statut, eventId } = await envoyer(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      CANDIDATURE.evenement.payload,
      VERSION_DU_HELD
    );
    expect(statut).toBe(200);
    const ligne = await base.prisma.evenementRecu.findFirstOrThrow({ where: { eventId } });
    expect(ligne.statut).toBe('held');
    const charge = ligne.charge as Record<string, unknown>;
    expect(Object.hasOwn(charge, 'utm')).toBe(false);
    expect(chargeConforme('candidature.recue', charge, VERSION_DU_HELD)).toBe(true);
  });

  it('REQ-INT-003 : un `held` hors schéma est refusé `hors_schema` à son rejeu, sans que `utm` soit réintroduit', async () => {
    const { eventId } = await envoyer(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      { ...CANDIDATURE.evenement.payload, champIntrus: 'x' },
      VERSION_DU_HELD
    );
    const ligne = await base.prisma.evenementRecu.findFirstOrThrow({ where: { eventId } });
    expect(ligne.statut).toBe('held');
    expect(
      chargeConforme('candidature.recue', ligne.charge as Record<string, unknown>, VERSION_DU_HELD)
    ).toBe(false);
  });
});
