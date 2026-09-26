// @req REQ-DM-036
// @req REQ-INT-010
// @req REQ-SEC-011
/**
 * La réception des événements d'axionia en base RÉELLE — SEC-06.
 *
 * TÉMOIN À DEUX FACES (acceptance 6), compté en LIGNES de `evenements_recus`, jamais au code de
 * réponse seul : une requête signée avec un autre secret, puis une requête hors de la fenêtre de
 * 300 s, rendent 401 et n'écrivent RIEN ; la requête correctement signée rend 200 et écrit
 * exactement UNE ligne ; la même requête livrée deux fois rend 200 la seconde fois et n'écrit rien
 * de plus.
 *
 * CE QUE LA BASE TIENT, CONTRE UN CLIENT QUI PASSERAIT PAR DU SQL BRUT : chaque CHECK, l'unicité
 * (source, eventId), et le déclencheur `evenements_recus_reception_immuable` — seules les cinq
 * colonnes du traitement s'écrivent, DELETE et TRUNCATE sont refusés. Les libellés de `pg_enum`
 * sont confrontés à `TYPES_EVENEMENT` (partners/ADR-0022, point 10), et les deux index partiels à
 * `pg_indexes`.
 *
 * Secrets tirés à l'exécution ; aucune donnée personnelle n'est écrite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { SCHEMA_VERSION, TYPES_EVENEMENT } from '../../packages/contracts/events';
import { creerAlerteurPlafonne } from '../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../src/server/integrations/axionia/reception';
import {
  TACHE_DE_RECEPTION,
  depotDuTravail,
  passerLeTravail,
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
const CLIENT = TYPES_EVENEMENT[0];

function corpsDe(sujet: string): string {
  return JSON.stringify({
    event_id: randomUUID(),
    event_type: CLIENT,
    schema_version: SCHEMA_VERSION,
    occurred_at: '2026-09-26T09:59:00.000Z',
    emitted_at: '2026-09-26T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: { client_id: sujet },
    sequence: 1,
    payload: { clientId: sujet },
  });
}

function signee(secret: string, corps: string, secondes: string): Request {
  return new Request('https://partners.test/api/webhooks/axionia', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [ENTETE_HORODATAGE]: secondes,
      [ENTETE_SIGNATURE]: createHmac('sha256', secret)
        .update(`${secondes}.${corps}`, 'utf8')
        .digest('hex'),
    },
    body: corps,
  });
}

function recevoir(r: Request, declencher: () => void = () => undefined) {
  return recevoirEvenementAxionia(r, {
    environnement: env,
    maintenantMs: MAINTENANT_MS,
    depot: depotDeReception(base.prisma),
    declencher,
    alerteur: creerAlerteurPlafonne(() => undefined),
  });
}

const compter = () => base.prisma.evenementRecu.count();

describe('REQ-DM-036 — témoin à deux faces, compté en lignes de evenements_recus', () => {
  it('REQ-DM-036 : face ROUGE — un autre secret, puis hors fenêtre de 300 s : 401 et AUCUNE ligne', async () => {
    const avant = await compter();
    const corps = corpsDe(randomUUID());
    const autre = randomBytes(32).toString('hex');
    expect((await recevoir(signee(autre, corps, MAINTENANT_S))).status).toBe(401);
    const vieux = String(MAINTENANT_MS / 1000 - 301);
    expect((await recevoir(signee(SECRET, corps, vieux))).status).toBe(401);
    expect(await compter()).toBe(avant);
  });

  it('REQ-DM-036 : face VERTE — correctement signée, 200 et EXACTEMENT une ligne ; livrée deux fois, rien de plus', async () => {
    const avant = await compter();
    const corps = corpsDe(randomUUID());
    const r1 = await recevoir(signee(SECRET, corps, MAINTENANT_S));
    expect(r1.status).toBe(200);
    expect(await compter()).toBe(avant + 1);
    const r2 = await recevoir(signee(SECRET, corps, MAINTENANT_S));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ duplicate: true });
    expect(await compter()).toBe(avant + 1);
  });
});

describe('REQ-INT-010 — inscrit AVANT tout traitement, traité HORS requête', () => {
  it('REQ-INT-010 : la route rend 200 avec la ligne `recu` et sans date de traitement ; le travail de fond la passe `traite` et écrit son battement', async () => {
    const sujet = randomUUID();
    let declenche = 0;
    const r = await recevoir(signee(SECRET, corpsDe(sujet), MAINTENANT_S), () => {
      declenche += 1;
    });
    expect(r.status).toBe(200);
    expect(declenche).toBe(1);
    const inscrite = await base.prisma.evenementRecu.findFirstOrThrow({
      where: { sujetRef: `client:${sujet}` },
    });
    expect([inscrite.statut, inscrite.processedAt]).toEqual(['recu', null]);

    const instant = new Date(MAINTENANT_MS + 1000);
    await passerLeTravail({
      depot: depotDuTravail(base.prisma),
      dispatch: async () => undefined,
      maintenant: () => instant,
    });
    const traitee = await base.prisma.evenementRecu.findUniqueOrThrow({
      where: { id: inscrite.id },
    });
    expect([traitee.statut, traitee.processedAt?.toISOString()]).toEqual([
      'traite',
      instant.toISOString(),
    ]);
    const battement = await base.prisma.battement.findUniqueOrThrow({
      where: { tache: TACHE_DE_RECEPTION },
    });
    expect(battement.dernierSuccesAt?.toISOString()).toBe(instant.toISOString());
  });

  it('REQ-INT-010 : rejouer un événement déjà traité ne produit aucune écriture', async () => {
    const corps = corpsDe(randomUUID());
    await recevoir(signee(SECRET, corps, MAINTENANT_S));
    const depot = depotDuTravail(base.prisma);
    await passerLeTravail({
      depot,
      dispatch: async () => undefined,
      maintenant: () => new Date(MAINTENANT_MS),
    });
    const vus: string[] = [];
    expect((await recevoir(signee(SECRET, corps, MAINTENANT_S))).status).toBe(200);
    await passerLeTravail({
      depot,
      dispatch: async (e) => void vus.push(e.id),
      maintenant: () => new Date(MAINTENANT_MS),
    });
    expect(vus).toEqual([]);
  });
});

describe('REQ-DM-036 — les enums et les index partiels, lus dans la base', () => {
  it('REQ-DM-036 : les libellés de `pg_enum` de `type_evenement_recu` sont TYPES_EVENEMENT, dans l’ordre, et ceux du client Prisma aussi', async () => {
    const lignes = await base.prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'type_evenement_recu' ORDER BY e.enumsortorder`
    );
    const attendu = TYPES_EVENEMENT.map((t) => t.replace('.', '_'));
    expect(lignes.map((l) => l.enumlabel)).toEqual(attendu);
    expect(Object.values(TypeEvenementRecu)).toEqual(attendu);
  });

  it('REQ-SEC-011 : les deux index partiels sont en base, avec leur clause', async () => {
    const lignes = await base.prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'evenements_recus' AND indexname IN ('evenements_recus_cle_metier_unique', 'evenements_recus_en_attente') ORDER BY indexname`
    );
    expect(lignes.map((l) => l.indexname)).toEqual([
      'evenements_recus_cle_metier_unique',
      'evenements_recus_en_attente',
    ]);
    expect(lignes[0]!.indexdef).toMatch(
      /^CREATE UNIQUE INDEX evenements_recus_cle_metier_unique ON public\.evenements_recus USING btree \(event_type, cle_metier\) WHERE \(cle_metier IS NOT NULL\)$/
    );
    expect(lignes[1]!.indexdef).toMatch(
      /^CREATE INDEX evenements_recus_en_attente ON public\.evenements_recus USING btree \(dependance_ref\) WHERE \(statut = 'en_attente_dependance'::statut_evenement_recu\)$/
    );
  });
});

// ── La base refuse ce que le code ne ferait pas ─────────────────────────────────────────────────

type Brut = {
  source: string;
  event_id: string;
  event_type: string;
  sequence: number | null;
  cle_metier: string | null;
  dependance_ref: string | null;
  payload_hash: string;
  statut: string;
  processed_at: string | null;
  retry_count: number;
};

/** Une ligne valide, chaque champ que les CHECK font varier explicite. */
function valide(): Brut {
  return {
    source: 'axionia',
    event_id: randomUUID(),
    event_type: 'client_cree',
    sequence: 1,
    cle_metier: null,
    dependance_ref: null,
    payload_hash: 'a'.repeat(64),
    statut: 'recu',
    processed_at: null,
    retry_count: 0,
  };
}

function inserer(b: Brut): Promise<number> {
  return base.prisma.$executeRawUnsafe(
    `INSERT INTO evenements_recus (id, source, event_id, event_type, schema_version, sequence, sujet_ref, cle_metier, dependance_ref, charge, payload_hash, statut, received_at, survenu_at, processed_at, retry_count)
     VALUES ($1::uuid, $2::source_evenement_recu, $3, $4::type_evenement_recu, 1, $5::bigint, NULL, $6, $7, '{}'::jsonb, $8, $9::statut_evenement_recu, now(), now(), $10::timestamptz, $11)`,
    randomUUID(),
    b.source,
    b.event_id,
    b.event_type,
    b.sequence,
    b.cle_metier,
    b.dependance_ref,
    b.payload_hash,
    b.statut,
    b.processed_at,
    b.retry_count
  );
}

describe('REQ-DM-036 — chaque CHECK de evenements_recus, vu refuser', () => {
  it('REQ-DM-036 : face VERTE — une ligne valide insérée en SQL brut passe', async () => {
    expect(await inserer(valide())).toBe(1);
  });

  const fautes: ReadonlyArray<readonly [string, (b: Brut) => Brut]> = [
    ['evenements_recus_payload_hash_hex', (b) => ({ ...b, payload_hash: 'A'.repeat(64) })],
    ['evenements_recus_retry_count_positif', (b) => ({ ...b, retry_count: -1 })],
    ['evenements_recus_traite_si_et_seulement_si_date', (b) => ({ ...b, statut: 'traite' })],
    [
      'evenements_recus_traite_si_et_seulement_si_date',
      (b) => ({ ...b, processed_at: '2026-09-26T10:00:00Z' }),
    ],
    [
      'evenements_recus_attente_si_et_seulement_si_dependance',
      (b) => ({ ...b, statut: 'en_attente_dependance' }),
    ],
    [
      'evenements_recus_attente_si_et_seulement_si_dependance',
      (b) => ({ ...b, dependance_ref: 'client:x' }),
    ],
    ['evenements_recus_sequence_si_et_seulement_si_axionia', (b) => ({ ...b, sequence: null })],
    ['evenements_recus_sequence_si_et_seulement_si_axionia', (b) => ({ ...b, source: 'docuseal' })],
    ['evenements_recus_event_id_uuid_v4_axionia', (b) => ({ ...b, event_id: 'pas-un-uuid' })],
  ];
  for (const [contrainte, fausser] of fautes) {
    it(`REQ-DM-036 : face ROUGE — ${contrainte}`, async () => {
      await expect(inserer(fausser(valide()))).rejects.toThrow(contrainte);
    });
  }

  it('REQ-DM-036 : face ROUGE — un même (source, eventId) deux fois est refusé par la base', async () => {
    const b = valide();
    await inserer(b);
    await expect(inserer({ ...b })).rejects.toThrow(/evenements_recus_source_event_id_key/);
  });

  it('REQ-DM-036 : face ROUGE — une tâche de battement hors forme est refusée', async () => {
    await expect(
      base.prisma.$executeRawUnsafe(`INSERT INTO battements (tache) VALUES ('Pas Une Cle')`)
    ).rejects.toThrow(/battements_tache_forme/);
  });
});

describe('REQ-DM-036 — chaque branche de evenements_recus_reception_immuable, vue refuser', () => {
  let id: string;

  beforeAll(async () => {
    const b = valide();
    await inserer(b);
    id = (await base.prisma.evenementRecu.findFirstOrThrow({ where: { eventId: b.event_id } })).id;
  });

  it('REQ-DM-036 : face VERTE — les cinq colonnes du traitement s’écrivent', async () => {
    expect(
      await base.prisma.$executeRawUnsafe(
        `UPDATE evenements_recus SET statut = 'en_attente_dependance', dependance_ref = 'client:y', retry_count = 2, error = 'Nom' WHERE id = $1::uuid`,
        id
      )
    ).toBe(1);
    expect(
      await base.prisma.$executeRawUnsafe(
        `UPDATE evenements_recus SET statut = 'traite', dependance_ref = NULL, processed_at = now() WHERE id = $1::uuid`,
        id
      )
    ).toBe(1);
  });

  const colonnes: ReadonlyArray<readonly [string, string]> = [
    ['event_id', `event_id = '${randomUUID()}'`],
    ['event_type', `event_type = 'devis_signe'`],
    ['schema_version', 'schema_version = 2'],
    ['sequence', 'sequence = 99'],
    ['sujet_ref', `sujet_ref = 'client:autre'`],
    ['cle_metier', `cle_metier = 'autre'`],
    ['charge', `charge = '{"a":1}'::jsonb`],
    ['payload_hash', `payload_hash = '${'b'.repeat(64)}'`],
    ['received_at', "received_at = now() - interval '1 day'"],
    ['survenu_at', "survenu_at = now() - interval '1 day'"],
  ];
  for (const [colonne, affectation] of colonnes) {
    it(`REQ-DM-036 : face ROUGE — la colonne ${colonne} ne change pas, et le refus se nomme`, async () => {
      await expect(
        base.prisma.$executeRawUnsafe(
          `UPDATE evenements_recus SET ${affectation} WHERE id = $1::uuid`,
          id
        )
      ).rejects.toThrow(/evenements_recus_reception_immuable/);
    });
  }

  it('REQ-DM-036 : face ROUGE — DELETE est refusé', async () => {
    await expect(
      base.prisma.$executeRawUnsafe(`DELETE FROM evenements_recus WHERE id = $1::uuid`, id)
    ).rejects.toThrow(/evenements_recus_reception_immuable/);
  });

  it('REQ-DM-036 : face ROUGE — TRUNCATE est refusé', async () => {
    await expect(base.prisma.$executeRawUnsafe(`TRUNCATE evenements_recus`)).rejects.toThrow(
      /evenements_recus_reception_immuable/
    );
    expect(await compter()).toBeGreaterThan(0);
  });
});
