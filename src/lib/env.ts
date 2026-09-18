/**
 * src/lib/env.ts — les secrets d'Axion Partners : leur liste UNIQUE, leurs règles, le refus de démarrer.
 *
 * Livré par SEC-01 (REQ-SEC-028). QA-T04 étend CE schéma — jamais un second — et câble
 * `exigerEnvironnement()` au démarrage réel du serveur.
 *
 * CE QUE CE MODULE GARANTIT.
 *  - La liste des secrets vit ICI, et nulle part ailleurs : c'est la forme de `schemaSecrets`.
 *    `.env.example` et la gate `G-SEC-ENV` la citent sans la recopier ; le test les confronte.
 *  - Aucun défaut, aucun repli, aucun rognage : une variable absente, trop courte, hors format,
 *    entourée d'une espace, ou ÉGALE à une autre est un refus. Deux noms qui pointent une même
 *    valeur sont un seul secret, et c'est exactement ce que « distincts » interdit.
 *  - Un refus nomme la variable et un motif FERMÉ. Il n'imprime ni la valeur, ni un fragment, ni
 *    sa longueur ; le texte d'une `issue` Zod ne sort jamais tel quel.
 *  - Rien n'est évalué à l'import : `lireEnvironnement` est pure, `exigerEnvironnement` sort.
 *
 * Les arbitrages (neuvième secret, prédicat de production fermé, `kid` dérivé de la valeur) sont
 * consignés par partners/ADR-0013.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Les seuls motifs qu'un refus peut porter. Aucun n'est construit à partir de la valeur. */
export const MOTIFS_DE_REFUS = [
  'absente',
  'trop_courte',
  'format_invalide',
  'espace_en_bordure',
  'prefixe_interdit',
  'egale_a',
] as const;
export type MotifDeRefus = (typeof MOTIFS_DE_REFUS)[number];

export interface Refus {
  variable: string;
  motif: MotifDeRefus;
  /** Pour `egale_a` seulement : les autres noms du groupe de variables égales. */
  avec?: string[];
}

/** REQ-SEC-028 : « ≥ 32 octets ». Des octets UTF-8, pas des caractères. */
const OCTETS_MINIMUM = 32;
/** REQ-SEC-028 : « 64 hex pour la clé », ancré aux deux bouts. */
const CLE_HEXADECIMALE = /^[0-9a-f]{64}$/i;
/** Une valeur collée avec un saut de ligne n'est pas la clé qu'on croit : on refuse, on ne rogne pas. */
const ESPACE_EN_BORDURE = /^\s|\s$/;
/** REQ-SEC-028 : « préfixes `dev_`/`stub` refusés en production », sans égard à la casse. */
const PREFIXE_INTERDIT = /^(?:dev_|stub)/i;
/**
 * Les SEULS environnements où un préfixe de développement est admis. Le prédicat échoue FERMÉ :
 * `NODE_ENV` absent, mal orthographié ou inconnu vaut production.
 */
const HORS_PRODUCTION: ReadonlySet<string> = new Set(['development', 'test']);

function estMotif(x: unknown): x is MotifDeRefus {
  return MOTIFS_DE_REFUS.some((m) => m === x);
}

function refuser(ctx: z.RefinementCtx, motif: MotifDeRefus): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, params: { motif } });
}

/** Absente (chaîne vide) ou entourée d'une espace : `false`, et le refus est posé. */
function presenteEtNette(v: string, ctx: z.RefinementCtx): boolean {
  if (v === '') refuser(ctx, 'absente');
  else if (ESPACE_EN_BORDURE.test(v)) refuser(ctx, 'espace_en_bordure');
  else return true;
  return false;
}

const secret = z.string().superRefine((v, ctx) => {
  if (presenteEtNette(v, ctx) && Buffer.byteLength(v, 'utf8') < OCTETS_MINIMUM) {
    refuser(ctx, 'trop_courte');
  }
});

const cleHexadecimale = z.string().superRefine((v, ctx) => {
  if (presenteEtNette(v, ctx) && !CLE_HEXADECIMALE.test(v)) refuser(ctx, 'format_invalide');
});

/**
 * LA liste des secrets. Les huit de REQ-SEC-028, plus la clé des empreintes de recherche des
 * données personnelles, qui ne peut être ni le sel d'adresse ni la clé de chiffrement (autres
 * usages) ni dérivée de l'une d'elles.
 */
export const schemaSecrets = z.object({
  SESSION_SECRET: secret,
  MAGIC_LINK_SECRET: secret,
  DEPOSIT_TOKEN_SECRET: secret,
  AXIONIA_WEBHOOK_SECRET: secret,
  AXIONIA_API_TOKEN: secret,
  DOCUSEAL_WEBHOOK_SECRET: secret,
  PII_ENCRYPTION_KEY: cleHexadecimale,
  IP_HASH_SALT: secret,
  PII_HASH_KEY: secret,
});

export type Secrets = z.infer<typeof schemaSecrets>;

/** Les noms, DÉRIVÉS du schéma, dans son ordre. */
export const NOMS_DES_SECRETS: readonly string[] = Object.keys(schemaSecrets.shape);

/** Le motif est construit ICI : le `message` d'une issue Zod peut porter la valeur reçue. */
function motifDe(issue: z.ZodIssue): MotifDeRefus {
  if (issue.code === z.ZodIssueCode.custom && estMotif(issue.params?.motif)) {
    return issue.params.motif;
  }
  if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
    return 'absente';
  }
  return 'format_invalide';
}

export type Lecture = { ok: true; env: Secrets } | { ok: false; refus: Refus[] };

/** PURE : juge un environnement, n'écrit rien, ne sort pas. */
export function lireEnvironnement(source: Readonly<Record<string, string | undefined>>): Lecture {
  const refus: Refus[] = [];
  const lu = schemaSecrets.safeParse(source);
  if (!lu.success) {
    for (const issue of lu.error.issues) {
      refus.push({ variable: String(issue.path[0]), motif: motifDe(issue) });
    }
  }
  const refusees = new Set(refus.map((r) => r.variable));

  if (!HORS_PRODUCTION.has(source.NODE_ENV ?? '')) {
    for (const nom of NOMS_DES_SECRETS) {
      const v = source[nom];
      if (v !== undefined && !refusees.has(nom) && PREFIXE_INTERDIT.test(v)) {
        refus.push({ variable: nom, motif: 'prefixe_interdit' });
      }
    }
  }

  if (!lu.success || refus.length > 0) return { ok: false, refus };
  return { ok: true, env: lu.data };
}

/** Une ligne de refus : le nom, le motif, et pour une égalité les autres noms. Jamais la valeur. */
export function formaterRefus(r: Refus): string {
  return `${r.variable} : ${r.motif}${r.avec ? ` ${r.avec.join(', ')}` : ''}`;
}

/**
 * Le boot : rend les secrets, ou écrit les refus sur la sortie d'erreur et sort en 1. N'est appelé
 * par personne à l'import.
 */
export function exigerEnvironnement(
  source: Readonly<Record<string, string | undefined>> = process.env
): Secrets {
  const lu = lireEnvironnement(source);
  if (lu.ok) return lu.env;
  process.stderr.write(
    "Démarrage refusé : secrets d'environnement en défaut (src/lib/env.ts, .env.example).\n" +
      lu.refus.map((r) => `  ${formaterRefus(r)}\n`).join('')
  );
  process.exit(1);
}

/**
 * REQ-SEC-028 : « `kid` dans les jetons pour la rotation ». L'identifiant d'une clé est DÉRIVÉ de sa
 * valeur : huit caractères hexadécimaux d'une empreinte séparée par domaine. Stable pour une valeur,
 * distinct d'un secret à l'autre, et il ne révèle rien d'exploitable. Son EMPLOI dans les jetons et
 * dans le format chiffré appartient à leurs producteurs.
 */
export function kidDe(valeur: string): string {
  return createHash('sha256')
    .update(`partners.kid.v1\u001f${valeur}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
}
