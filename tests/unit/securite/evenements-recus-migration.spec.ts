// @req REQ-DM-036
// @req REQ-ARG-002
/**
 * `evenements-recus-migration.spec.ts` — lecture STATIQUE de la migration de SEC-06, sans Docker :
 * un CHECK, un index partiel ou une branche du déclencheur retirés font rougir ce spec sur tout
 * poste, pas seulement en CI. Même forme que `lien-magique-migration.spec.ts`.
 *
 * Chaque contrainte est exigée avec SON expression : un nom gardé sur une expression affaiblie
 * rougit aussi. Les témoins qui prouvent que la base REFUSE vivent dans
 * `tests/integration/webhook.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TYPES_EVENEMENT } from '../../../packages/contracts/events';

const sql = readFileSync(
  'prisma/migrations/20260927000000_evenements_recus_et_battements/migration.sql',
  'utf8'
);
/** Les espaces et sauts de ligne se lisent comme une espace : la forme, pas la mise en page. */
const plat = sql.replace(/\s+/g, ' ');
const code = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ');
const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UUID_V4 = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

/** Les CHECK : table, nom, expression — tels que la migration doit les porter. */
const CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['evenements_recus', 'evenements_recus_payload_hash_hex', `"payload_hash" ~ '^[0-9a-f]{64}$'`],
  ['evenements_recus', 'evenements_recus_retry_count_positif', `"retry_count" >= 0`],
  [
    'evenements_recus',
    'evenements_recus_traite_si_et_seulement_si_date',
    `("statut" = 'traite') = ("processed_at" IS NOT NULL)`,
  ],
  [
    'evenements_recus',
    'evenements_recus_attente_si_et_seulement_si_dependance',
    `("statut" = 'en_attente_dependance') = ("dependance_ref" IS NOT NULL)`,
  ],
  [
    'evenements_recus',
    'evenements_recus_sequence_si_et_seulement_si_axionia',
    `("source" = 'axionia') = ("sequence" IS NOT NULL)`,
  ],
  [
    'evenements_recus',
    'evenements_recus_event_id_uuid_v4_axionia',
    `"source" <> 'axionia' OR "event_id" ~ '${UUID_V4}'`,
  ],
  ['battements', 'battements_tache_forme', `"tache" ~ '^[a-z][a-z0-9_]*$'`],
];

/** Les colonnes qu'une mise à jour ne change jamais : tout sauf les cinq du traitement. */
const IMMUABLES = [
  'id',
  'source',
  'event_id',
  'event_type',
  'schema_version',
  'sequence',
  'sujet_ref',
  'cle_metier',
  'charge',
  'payload_hash',
  'received_at',
  'survenu_at',
] as const;

describe('REQ-DM-036 — les enums de la réception', () => {
  it('REQ-DM-036 : `type_evenement_recu` porte les sept types de TYPES_EVENEMENT, dans leur ordre, identifiants en snake_case', () => {
    const attendu = TYPES_EVENEMENT.map((t) => `'${t.replace('.', '_')}'`).join(', ');
    expect(plat).toContain(`CREATE TYPE "type_evenement_recu" AS ENUM (${attendu});`);
  });

  it('REQ-DM-036 : la source et le statut sont des enums fermés', () => {
    expect(plat).toContain(`CREATE TYPE "source_evenement_recu" AS ENUM ('axionia', 'docuseal');`);
    expect(plat).toContain(
      `CREATE TYPE "statut_evenement_recu" AS ENUM ('recu', 'traite', 'en_attente_dependance', 'held', 'en_erreur');`
    );
  });
});

describe('REQ-DM-036 REQ-ARG-002 — les unicités et les index (lecture statique)', () => {
  it('REQ-DM-036 : un événement unique par (source, eventId)', () => {
    expect(plat).toContain(
      'CREATE UNIQUE INDEX "evenements_recus_source_event_id_key" ON "evenements_recus"("source", "event_id");'
    );
  });

  it('REQ-ARG-002 : au plus un événement par type et par `paymentId`, tenu par un index unique PARTIEL', () => {
    expect(plat).toContain(
      'CREATE UNIQUE INDEX "evenements_recus_cle_metier_unique" ON "evenements_recus" ("event_type", "cle_metier") WHERE "cle_metier" IS NOT NULL;'
    );
  });

  it('REQ-DM-036 : les attentes se retrouvent par leur dépendance, index partiel', () => {
    expect(plat).toContain(
      `CREATE INDEX "evenements_recus_en_attente" ON "evenements_recus" ("dependance_ref") WHERE "statut" = 'en_attente_dependance';`
    );
  });
});

describe('REQ-DM-036 — les CHECK de la réception et du battement (lecture statique)', () => {
  for (const [table, nom, expression] of CHECKS) {
    it(`REQ-DM-036 : ${nom} porte son expression exacte`, () => {
      expect(plat).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${nom}" CHECK (${expression});`
      );
    });
  }
});

describe('REQ-DM-036 — le déclencheur evenements_recus_reception_immuable (lecture statique)', () => {
  const debut = plat.indexOf('CREATE FUNCTION evenements_recus_refuser_modification()');
  const corps = plat.slice(debut, plat.indexOf('$$;', debut));

  it('REQ-DM-036 : un déclencheur de LIGNE avant chaque UPDATE ou DELETE, et un d’INSTRUCTION avant TRUNCATE, sans clause WHEN', () => {
    expect(debut).toBeGreaterThanOrEqual(0);
    expect(plat).toContain(
      'CREATE TRIGGER evenements_recus_reception_immuable BEFORE UPDATE OR DELETE ON "evenements_recus" FOR EACH ROW EXECUTE FUNCTION evenements_recus_refuser_modification();'
    );
    expect(plat).toContain(
      'CREATE TRIGGER evenements_recus_reception_immuable_troncature BEFORE TRUNCATE ON "evenements_recus" FOR EACH STATEMENT EXECUTE FUNCTION evenements_recus_refuser_modification();'
    );
    expect(plat).not.toMatch(/CREATE TRIGGER evenements_recus_reception_immuable[^;]*WHEN/);
  });

  it('REQ-DM-036 : tout ce qui n’est pas un UPDATE — DELETE et TRUNCATE — est refusé, et le refus se nomme', () => {
    expect(corps).toContain(
      `IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'evenements_recus_reception_immuable : % refusé, la réception est conservée (REQ-DM-036)', TG_OP;`
    );
  });

  for (const colonne of IMMUABLES) {
    it(`REQ-DM-036 : la colonne ${colonne} ne change jamais`, () => {
      expect(corps).toMatch(
        new RegExp(
          `NEW\\."${echapper(colonne)}" IS DISTINCT FROM OLD\\."${echapper(colonne)}"[^;]*THEN RAISE EXCEPTION 'evenements_recus_reception_immuable : seuls statut, processed_at, error, retry_count et dependance_ref s''écrivent \\(REQ-DM-036\\)';`
        )
      );
    });
  }

  it('REQ-DM-036 : les colonnes immuables sont reliées par OR — une seule qui change suffit à refuser', () => {
    const condition = IMMUABLES.map((c) => `NEW."${c}" IS DISTINCT FROM OLD."${c}"`).join(' OR ');
    expect(corps).toContain(
      `IF ${condition} THEN RAISE EXCEPTION 'evenements_recus_reception_immuable : seuls statut, processed_at, error, retry_count et dependance_ref s''écrivent (REQ-DM-036)';`
    );
  });

  it('REQ-DM-036 : les cinq colonnes du traitement ne figurent PAS parmi les immuables', () => {
    for (const libre of ['statut', 'processed_at', 'error', 'retry_count', 'dependance_ref']) {
      expect(corps).not.toContain(`NEW."${libre}" IS DISTINCT FROM`);
    }
  });

  it('REQ-DM-036 : la fonction rend la ligne, et la migration ne désarme rien de ce qu’elle arme', () => {
    expect(corps.trimEnd()).toMatch(/RETURN NEW; END;$/);
    expect(corps).not.toMatch(/RETURN NULL/i);
    for (const desarmement of [
      /DROP CONSTRAINT/i,
      /DROP TRIGGER/i,
      /DISABLE TRIGGER/i,
      /NOT VALID/i,
      /DROP FUNCTION/i,
      /CREATE OR REPLACE FUNCTION/i,
    ]) {
      expect(code).not.toMatch(desarmement);
    }
  });

  it('REQ-DM-036 : `battements` n’est pas en ajout seul — une ligne par tâche, réécrite à chaque passage', () => {
    expect(plat).not.toMatch(/CREATE TRIGGER [a-z_]+ BEFORE [A-Z ]+ ON "battements"/);
  });
});
