/**
 * LE CONTRAT D'ADAPTATEUR DU SOCLE `axion-ops`, PORTÉ À L'IDENTIQUE — côté Partners (INT-T11,
 * REQ-INT-026).
 *
 * Le socle vit dans un autre dépôt, sans paquet publié : on ne l'importe pas, on le PORTE, et le
 * harnais (`scripts/gates/harnais-mcp.ts`) confronte ce qui doit l'être. Le socle ne consomme
 * jamais ce fichier : il consomme le MANIFESTE (`manifeste.ts`), épinglé par empreinte, et il
 * appelle `POST /api/mcp` en JSON-RPC.
 *
 * D'OÙ VIENNENT LES VALEURS. Toutes sont LUES, et le sceau EXÉCUTÉ, dans le code du socle au commit
 * désigné par `SOURCE_DU_CONTRAT` : `core/types.ts`, `core/adapter-kit/types.ts`,
 * `core/adapter-kit/autorisation.ts` (`lireClesDAutorisation()`), `core/profiles/profiles.ts`
 * (`SCEAU_PROFILS`). Elles sont identiques à celles que l'adaptateur d'axionia porte (ADR 0046
 * d'axionia) — deux ports du même socle, pas une copie de l'un par l'autre.
 */
import type { z } from 'zod/v4';

/** Le commit du socle où chaque valeur ci-dessous a été lue, et la date de la lecture. */
export const SOURCE_DU_CONTRAT = {
  depot: 'will383842/axion-ops',
  commit: '473e2aa',
  luLe: '2026-09-26',
} as const;

// ── L'identité de l'adaptateur ─────────────────────────────────────────────────────────────────

/**
 * L'id de l'adaptateur, dont DÉRIVE le préfixe de chaque outil (`partners.verifier_entreprise`) :
 * un outil n'écrit jamais son préfixe (contrôle 5). Sans point ni majuscule.
 */
export const ID_ADAPTATEUR = 'partners';

/** Version de l'ADAPTATEUR ; chaque outil porte la sienne. */
export const VERSION_ADAPTATEUR = '0.1.0';

/** Mode fédéré : l'adaptateur vit chez son produit, et le socle ne lui transmet aucun secret. */
export const MODE_ADAPTATEUR = 'fédéré' as const;

/** Mode fédéré ⇒ `secrets: []`, typé pour le rester. */
export const SECRETS_DE_L_ADAPTATEUR: readonly never[] = [];

// ── Les profils du socle, énumération FERMÉE, et son sceau ─────────────────────────────────────

export const PROFILS_DU_SOCLE = [
  { nom: 'courrier', depuis: '1.0.0' },
  { nom: 'dev', depuis: '1.0.0' },
  { nom: 'admin', depuis: '1.0.0' },
  { nom: 'audit', depuis: '1.0.0' },
] as const;

export type NomDeProfil = (typeof PROFILS_DU_SOCLE)[number]['nom'];

/**
 * Le sceau : version et empreinte SHA-256 du JSON canonique de `{ version, profils: [{ nom,
 * depuis }] }`. VALEUR EXÉCUTÉE depuis le socle (`SCEAU_PROFILS`), jamais recopiée d'une
 * spécification ; le harnais la recalcule depuis `PROFILS_DU_SOCLE` et rougit si elles divergent.
 */
export const SCEAU_PROFILS = {
  version: '1.0.0',
  empreinte: '6b9646f62b9451abeb4a5744e983bd1870cd62c5b9dccf0cc9af4c1fec27ed0a',
} as const;

/** Les profils sur lesquels cet adaptateur s'expose : la console. */
export const PROFILS_DE_L_ADAPTATEUR: readonly NomDeProfil[] = ['admin'];

// ── Les énumérations du socle, sans valeur par défaut permissive ───────────────────────────────

export const EFFECTS = ['read', 'write-draft', 'send', 'destructive'] as const;
export type Effect = (typeof EFFECTS)[number];

export const DATA_CLASSES = ['none', 'internal', 'personal', 'sensitive'] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const IDEMPOTENCES = ['key', 'non-rejouable', 'n/a'] as const;
export type Idempotence = (typeof IDEMPOTENCES)[number];

export const PAGINATIONS = ['keyset', 'page', 'none'] as const;
export type Pagination = (typeof PAGINATIONS)[number];

/**
 * Les noms que le socle RÉSERVE au contexte d'autorisation — `ToolContext`, `Habilitations`, et
 * les réservés hors contexte. Aucun schéma d'entrée ne peut porter l'un d'eux (contrôle 7).
 */
export const NOMS_RESERVES_AU_CONTEXTE = [
  'principal',
  'sessionId',
  'scopes',
  'policyLevel',
  'profile',
  'idempotencyRef',
  'requestId',
  'deadline',
  'habilitations',
  'peutVoirAppels',
  'roleConsole',
  'idempotencyKey',
] as const;

// ── Le contexte d'appel : le SEUL chemin d'une décision de droit ───────────────────────────────

export interface Habilitations {
  readonly peutVoirAppels: boolean;
  readonly roleConsole: string;
}

export interface ContexteOutil {
  readonly principal: string;
  readonly requestId: string;
  readonly deadline: Date;
  readonly habilitations: Habilitations;
}

// ── Un outil ───────────────────────────────────────────────────────────────────────────────────

export interface AnnotationsCompaction {
  readonly free: readonly string[];
  readonly tier2: readonly string[];
  readonly aggregateBy: string | null;
}

export interface DefinitionOutil<TEntree extends z.ZodType, TSortie extends z.ZodType> {
  /** Nom LOCAL ; le préfixe est dérivé, jamais saisi. */
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly effect: Effect;
  readonly dataClass: DataClass;
  readonly idempotency: Idempotence;
  readonly pagination: Pagination;
  /** Zod, FERMÉ (`z.strictObject`) jusqu'au dernier sous-objet. Contrôle 7. */
  readonly input: TEntree;
  /** La forme NON COMPACTÉE ; tout champ de rang 2 y est optionnel. */
  readonly output: TSortie;
  readonly maxBytes: number;
  readonly compaction: AnnotationsCompaction;
  readonly idFields: readonly string[];
  readonly governanceFields: readonly string[];
  /** Chemin du jeu MAXIMAL, relatif à `src/server/mcp/`. Contrôle 4. */
  readonly fixtureMax: string;
  readonly handler: (input: z.output<TEntree>, ctx: ContexteOutil) => Promise<z.output<TSortie>>;
}

export type OutilQuelconque = DefinitionOutil<z.ZodType, z.ZodType>;

/** Le nom complet servi par `tools/list` : préfixe DÉRIVÉ + nom local. */
export function nomComplet(nomLocal: string): string {
  return `${ID_ADAPTATEUR}.${nomLocal}`;
}
