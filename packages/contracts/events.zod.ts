/**
 * events.zod.ts — FICHIER GÉNÉRÉ par `scripts/contracts/export.ts`. NE PAS ÉDITER.
 *
 * Source unique : `packages/contracts/enveloppe.ts` et `packages/contracts/events.ts`.
 * Toute correction se fait là-bas, puis `pnpm contracts:export` ; `--verifier` rougit sinon.
 *
 * `zod` n'est pas encore une dépendance de ce dépôt : ce fichier n'est importé nulle part et
 * n'est pas typé par `tsc`. Il l'est le jour où la dépendance est ajoutée, sans une ligne à
 * retaper (REQ-INT-003, REQ-QA-007, RM-01).
 */

import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const TYPES_EVENEMENT = [
  'client.cree',
  'client.mis_a_jour',
  'devis.signe',
  'facture.emise',
  'avoir.emis',
  'paiement.recu',
  'paiement.rembourse',
] as const;

export const enveloppeEvenement = z
  .object({
    event_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    event_type: z.enum(TYPES_EVENEMENT),
    schema_version: z.literal(1),
    occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/),
    emitted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/),
    producer: z.string().min(1),
    subject_ref: z.custom<unknown>((v) => v !== undefined),
    sequence: z.number().int(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type EnveloppeEvenement = z.infer<typeof enveloppeEvenement>;
