// @req REQ-INT-003
// @req REQ-QA-007
/**
 * INT-T45, en mémoire — la réception juge le payload contre le `$defs` FERMÉ du contrat publié, par
 * la vraie porte, sur un dépôt qui compte. La même chose en base réelle :
 * `tests/integration/reception-hors-schema.spec.ts`. Les charges viennent des fixtures du producteur
 * réel (RM-03), altérées d'UN champ.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { SCHEMA_VERSION } from '../../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../../src/server/securite/primitives-de-porte';
import {
  CHAMPS_NON_CONSERVES,
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  chargeConforme,
  chargeConservee,
  payloadConforme,
  recevoirEvenementAxionia,
  type EvenementAInscrire,
} from '../../../src/server/integrations/axionia/reception';

const CANDIDATURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { evenement: { subject_ref: unknown; payload: Record<string, unknown> } };
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: { event_type: string; payload: Record<string, unknown> }[] };

const MAINTENANT_MS = Date.UTC(2026, 9, 1, 10, 0, 0);

/** Le paiement du producteur en version 2 (le seul renommage : `amountHtCents` → `montantHtCents`). */
function paiement(): Record<string, unknown> {
  const e = PRODUCTEUR.evenements.find((x) => x.event_type === 'paiement.recu')!;
  const { amountHtCents, ...reste } = e.payload;
  return { ...reste, montantHtCents: amountHtCents, paymentId: randomUUID() };
}

async function recevoir(
  type: string,
  sujet: unknown,
  payload: Record<string, unknown>,
  version: number = SCHEMA_VERSION,
  premiereV4: Date | null = null
): Promise<{ statut: number; corps: string; inscrites: EvenementAInscrire[]; alertes: string[] }> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  const secret = env.AXIONIA_WEBHOOK_SECRET!;
  const corps = JSON.stringify({
    event_id: randomUUID(),
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
  const inscrites: EvenementAInscrire[] = [];
  const alertes: string[] = [];
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
        // INT-T76-P : la réception du premier événement v4, départ de la fenêtre de bascule.
        premiereReceptionDeLaVersionCourante: async () => premiereV4,
      },
      alerteur: creerAlerteurPlafonne((a) => void alertes.push(a.motif)),
      declencher: () => undefined,
    }
  );
  return { statut: r.status, corps: await r.text(), inscrites, alertes };
}

describe('REQ-INT-003 REQ-QA-007 — la réception applique les `$defs` fermés du contrat', () => {
  it('REQ-INT-003 : un champ intrus dans une candidature est refusé 422 `hors_schema`, rien n’est inscrit, l’alerte le nomme', async () => {
    const r = await recevoir('candidature.recue', CANDIDATURE.evenement.subject_ref, {
      ...CANDIDATURE.evenement.payload,
      champIntrus: 'x',
    });
    expect([r.statut, r.corps]).toEqual([422, 'hors_schema']);
    expect(r.inscrites).toEqual([]);
    expect(r.alertes).toContain('hors_schema');
  });

  it('REQ-INT-003 : un montant en chaîne dans un paiement est refusé 422 `hors_schema`, rien n’est inscrit', async () => {
    const p = paiement();
    const r = await recevoir(
      'paiement.recu',
      { payment_id: randomUUID() },
      { ...p, montantEncaisseTtcCents: String(p.montantEncaisseTtcCents) }
    );
    expect([r.statut, r.corps]).toEqual([422, 'hors_schema']);
    expect(r.inscrites).toEqual([]);
  });

  it('REQ-INT-003 : un champ requis absent est refusé 422 `hors_schema`', async () => {
    const sans = { ...CANDIDATURE.evenement.payload };
    delete sans.candidatureId;
    const r = await recevoir('candidature.recue', CANDIDATURE.evenement.subject_ref, sans);
    expect([r.statut, r.corps]).toEqual([422, 'hors_schema']);
  });

  it('REQ-QA-007 : CONTRE-TÉMOIN — la candidature et le paiement conformes du producteur sont acceptés et inscrits', async () => {
    const c = await recevoir(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      CANDIDATURE.evenement.payload
    );
    expect([c.statut, c.inscrites.length]).toEqual([200, 1]);
    const p = await recevoir('paiement.recu', { payment_id: randomUUID() }, paiement());
    expect([p.statut, p.inscrites.length]).toEqual([200, 1]);
  });

  it('REQ-INT-003 : une autre `schema_version` n’est pas jugée à la réception — elle s’inscrit `held`, même hors schéma', async () => {
    const r = await recevoir(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      { ...CANDIDATURE.evenement.payload, champIntrus: 'x' },
      SCHEMA_VERSION + 1
    );
    expect(r.statut).toBe(200);
    expect(r.inscrites.map((e) => e.statut)).toEqual(['held']);
  });
});

/**
 * La version d'un `held` qu'on rejoue : la version publiée ANTÉRIEURE à la courante. Depuis
 * INT-T46-P, un `held` se juge contre les `$defs` de SA version, et une version sans contrat publié
 * (la courante + 1) n'est jamais conforme : le témoin d'une charge conforme part donc d'une version
 * publiée. Depuis INT-T76-P, cette version est TRAITÉE tant que la fenêtre de bascule est ouverte :
 * le témoin la reçoit donc après sa fermeture (première v4 reçue trente jours plus tôt).
 */
const VERSION_DU_HELD = SCHEMA_VERSION - 1;
const BASCULE_REFERMEE = new Date(MAINTENANT_MS - 30 * 86_400_000);

describe('REQ-INT-003 — condition de la sécurité : le rejeu d’un `held` passe par la MÊME validation', () => {
  it('REQ-INT-003 : un `held` conforme, conservé sans `utm`, est jugé conforme à son rejeu', async () => {
    const r = await recevoir(
      'candidature.recue',
      CANDIDATURE.evenement.subject_ref,
      CANDIDATURE.evenement.payload,
      VERSION_DU_HELD,
      BASCULE_REFERMEE
    );
    expect(r.inscrites.map((e) => e.statut)).toEqual(['held']);
    const charge = r.inscrites[0]!.charge;
    expect(Object.hasOwn(charge, 'utm')).toBe(false);
    expect(chargeConforme('candidature.recue', charge, VERSION_DU_HELD)).toBe(true);
  });

  it('REQ-INT-003 : un `held` hors schéma est refusé à son rejeu', () => {
    const charge = chargeConservee({ ...CANDIDATURE.evenement.payload, champIntrus: 'x' });
    expect(chargeConforme('candidature.recue', charge, VERSION_DU_HELD)).toBe(false);
  });

  it('REQ-INT-003 : les champs non conservés ne sont JAMAIS réintroduits — une charge qui porte `utm` est refusée au rejeu', () => {
    expect(CHAMPS_NON_CONSERVES).toContain('utm');
    const avecUtm = { ...chargeConservee(CANDIDATURE.evenement.payload), utm: null };
    expect(chargeConforme('candidature.recue', avecUtm, VERSION_DU_HELD)).toBe(false);
  });

  it('REQ-INT-003 : la charge reçue, elle, exige `utm` — le payload sans lui est hors schéma à la réception', () => {
    expect(payloadConforme('candidature.recue', CANDIDATURE.evenement.payload)).toBe(true);
    expect(
      payloadConforme('candidature.recue', chargeConservee(CANDIDATURE.evenement.payload))
    ).toBe(false);
  });

  it('REQ-INT-003 : un type sans `$defs` publié lève en le nommant, jamais un vert par défaut', () => {
    expect(() => payloadConforme('type.inconnu' as never, {})).toThrow(/contrat_sans_defs/);
  });
});
