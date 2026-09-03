/**
 * enveloppe.ts — l'enveloppe de tout événement axionia → Axion Partners (REQ-INT-003).
 *
 * SOURCE UNIQUE. Ce fichier est le DESCRIPTEUR ; il ne dépend de rien. Deux projections en sont
 * dérivées par `scripts/contracts/export.ts`, et jamais tapées à la main (RM-01) :
 *   — `packages/contracts/contracts.v1.json` — le JSON Schema publié, celui qu'axionia copie et
 *     dont l'empreinte `contracts.sha256` tient la transcription (REQ-QA-007) ;
 *   — `packages/contracts/events.zod.ts` — le schéma Zod que REQ-INT-003 nomme.
 *
 * POURQUOI LA CASSE EST EN `snake_case`, contre CONVENTIONS §1. REQ-INT-003 énumère les neuf
 * champs sous leur forme littérale : `event_id`, `event_type`, `schema_version`, `occurred_at`,
 * `emitted_at`, `producer`, `subject_ref`, `sequence`, `payload`. L'enveloppe est un FORMAT DE FIL
 * partagé avec un autre dépôt, au même titre que les champs d'une API tierce que CONVENTIONS §1
 * exempte nommément ; le camelCase et les suffixes `…Cents` / `…At` restent la règle DANS le
 * payload, qui est du code de ce dépôt. L'arbitrage est consigné par `partners/ADR-0008`.
 *
 * CE QUI EST LAISSÉ OUVERT, ET PAR QUI. Trois champs ne sont contraints que par ce que le registre
 * en dit — leur forme exacte n'est écrite nulle part, et l'inventer serait la figer par accident :
 * `producer`, `subject_ref` et `sequence`. Chacun porte un `$comment` qui nomme la tâche qui le
 * fermera. Un `unknown` déclaré est une dette nommée ; un champ deviné est une dette cachée.
 */

/**
 * La version du contrat. Elle est machine-lisible à deux endroits, et à deux seulement : le `const`
 * du champ `schema_version` du JSON Schema publié, et le nom de l'artefact (`contracts.v1.json`).
 * Aucun autre fichier ne la retape.
 */
export const SCHEMA_VERSION = 1;

/** Un fragment de JSON Schema — assez pour décrire un champ, sans dépendre d'une bibliothèque. */
export type FragmentSchema = Record<string, unknown>;

export type ChampEnveloppe = {
  /** Le nom sur le fil, dans la casse de REQ-INT-003. */
  readonly nom: string;
  /** La projection JSON Schema du champ. */
  readonly schema: FragmentSchema;
  /** La projection Zod du champ, en source — rendue telle quelle par l'export. */
  readonly zod: string;
};

/**
 * UUID version 4 : REQ-INT-003 écrit « uuid v4 », pas « uuid ». Le chiffre de version et le nibble
 * de variante sont donc contrôlés — un UUID v7, un identifiant nul ou un ULID sont refusés.
 * `ajv-formats` n'est pas installé (`package.json` est partagé) : le contrôle porte sur le
 * `pattern`, l'annotation `format` restant dans l'artefact publié pour l'autre dépôt.
 */
const MOTIF_UUID_V4 = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

/** Horodatage RFC 3339 avec fuseau explicite : un instant sans fuseau n'est pas un instant. */
const MOTIF_INSTANT = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$';

/**
 * Les neuf champs, dans l'ORDRE de REQ-INT-003. L'ordre n'est pas décoratif : le test de contrat
 * compare cette liste, position par position, à celle qu'il lit dans `docs/requirements.json`.
 */
export const CHAMPS_ENVELOPPE: readonly ChampEnveloppe[] = [
  {
    nom: 'event_id',
    schema: {
      type: 'string',
      format: 'uuid',
      pattern: MOTIF_UUID_V4,
      $comment: "REQ-INT-003 : uuid v4. C'est la clé d'idempotence du récepteur.",
    },
    zod: `z.string().regex(/${MOTIF_UUID_V4}/)`,
  },
  {
    nom: 'event_type',
    // L'énumération est injectée par `events.ts` : la liste fermée des types y vit, et une seule
    // fois. Un descripteur qui porterait sa propre copie de la liste en serait la seconde source.
    schema: { type: 'string', $comment: "REQ-INT-004 : liste fermée, injectée depuis `events.ts`." },
    zod: 'z.enum(TYPES_EVENEMENT)',
  },
  {
    nom: 'schema_version',
    schema: {
      type: 'integer',
      const: SCHEMA_VERSION,
      $comment: 'La version du contrat. Une enveloppe qui en porte une autre est refusée, pas devinée.',
    },
    zod: `z.literal(${SCHEMA_VERSION})`,
  },
  {
    nom: 'occurred_at',
    schema: {
      type: 'string',
      format: 'date-time',
      pattern: MOTIF_INSTANT,
      $comment: "L'instant du FAIT métier, côté axionia.",
    },
    zod: `z.string().regex(/${MOTIF_INSTANT}/)`,
  },
  {
    nom: 'emitted_at',
    schema: {
      type: 'string',
      format: 'date-time',
      pattern: MOTIF_INSTANT,
      $comment: "L'instant de l'ÉMISSION. Distinct du précédent : l'outbox peut rejouer (REQ-INT-001).",
    },
    zod: `z.string().regex(/${MOTIF_INSTANT}/)`,
  },
  {
    nom: 'producer',
    schema: {
      type: 'string',
      minLength: 1,
      $comment:
        "OUVERT — aucune exigence du registre n'énumère les producteurs. La liste fermée est à trancher " +
        'par INT-T01b ; en attendant, une chaîne non vide, jamais une valeur devinée.',
    },
    zod: 'z.string().min(1)',
  },
  {
    nom: 'subject_ref',
    schema: {
      $comment:
        "OUVERT — la forme de la référence de sujet n'est écrite dans aucune exigence. Le champ est " +
        'EXIGÉ (sa présence est un invariant) et sa forme reste libre jusqu\'à INT-T01b.',
    },
    // `z.unknown()` rendrait la clé optionnelle en Zod, ce que la liste `required` du JSON Schema
    // contredirait : les deux projections diraient deux choses. D'où un `custom` qui exige la clé.
    zod: 'z.custom<unknown>((v) => v !== undefined)',
  },
  {
    nom: 'sequence',
    schema: {
      type: 'integer',
      $comment:
        "OUVERT sur sa PORTÉE — le registre nomme le champ sans dire si la monotonie est globale ou " +
        "par sujet. C'est l'outbox (INT-T02) qui la tranche ; aucune borne n'est inventée ici.",
    },
    zod: 'z.number().int()',
  },
  {
    nom: 'payload',
    schema: {
      type: 'object',
      $comment: "Fermé par type dans `$defs`, et par INT-T01b (REQ-INT-005, REQ-INT-006, REQ-INT-032).",
    },
    zod: 'z.record(z.string(), z.unknown())',
  },
];

/**
 * Le corps du JSON Schema de l'enveloppe. `additionalProperties: false` n'est pas un ornement :
 * c'est lui qui donne son sens au 422 de REQ-INT-003 — un champ de plus est un événement hors
 * schéma, refusé, et que l'outbox passe en `gave_up`.
 */
export function schemaEnveloppe(typesAutorises: readonly string[]): FragmentSchema {
  const proprietes: Record<string, FragmentSchema> = {};
  for (const champ of CHAMPS_ENVELOPPE) {
    proprietes[champ.nom] =
      champ.nom === 'event_type' ? { ...champ.schema, enum: [...typesAutorises] } : { ...champ.schema };
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: CHAMPS_ENVELOPPE.map((c) => c.nom),
    properties: proprietes,
  };
}
