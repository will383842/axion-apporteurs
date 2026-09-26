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
import { productionDeclaree } from './notify';

/** Les seuls motifs qu'un refus peut porter. Aucun n'est construit à partir de la valeur. */
export const MOTIFS_DE_REFUS = [
  'absente',
  'trop_courte',
  'format_invalide',
  'espace_en_bordure',
  'prefixe_interdit',
  'egale_a',
  'requise_hors_production',
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
  // INT-T11 (REQ-INT-026) : le secret propre de la porte MCP. Dans CETTE liste pour qu'il suive les
  // règles de REQ-SEC-028 — au moins 32 octets, distinct des autres, préfixes refusés en production.
  PARTNERS_MCP_SHARED_SECRET: secret,
});

export type Secrets = z.infer<typeof schemaSecrets>;

/**
 * Les CLÉS D'EMPREINTE, nommées ICI et nulle part ailleurs. Deux usages, deux clés (SEC-01) : la
 * clé des empreintes de personnes et le sel des adresses. Un porteur qui n'a besoin que de l'une
 * prend `CleDesPersonnes` : le moindre privilège est conservé SANS que les noms des secrets soient
 * retapés hors de ce fichier, ce que REQ-SEC-028 interdit et que RM-01 appelle une recopie.
 * Un nom qui disparaîtrait de `schemaSecrets` fait rougir `tsc` ici, pas chez le porteur.
 */
export type CleDesPersonnes = Pick<Secrets, 'PII_HASH_KEY'>;
export type ClesDEmpreinte = CleDesPersonnes & Pick<Secrets, 'IP_HASH_SALT'>;

/** Les noms, DÉRIVÉS du schéma, dans son ordre. */
export const NOMS_DES_SECRETS: readonly string[] = Object.keys(schemaSecrets.shape);

/**
 * Une URL dont le protocole est l'un de ceux donnés. Ni repli ni rognage : une URL illisible, d'un
 * autre protocole ou entourée d'une espace est un refus, et sa valeur n'est jamais imprimée.
 */
function urlDe(protocoles: readonly string[]) {
  return z.string().superRefine((v, ctx) => {
    if (!presenteEtNette(v, ctx)) return;
    let protocole: string;
    try {
      protocole = new URL(v).protocol;
    } catch {
      refuser(ctx, 'format_invalide');
      return;
    }
    if (!protocoles.includes(protocole)) refuser(ctx, 'format_invalide');
  });
}

/** Facultative, mais nette si elle est posée : ni chaîne vide, ni espace en bordure. */
const nette = z.string().superRefine((v, ctx) => {
  presenteEtNette(v, ctx);
});

/**
 * QA-T04 (REQ-QA-030) : la CONFIGURATION — ce qui n'est pas un secret, mais sans quoi l'instance ne
 * sait pas servir. La base et le cache sont exactement ce que `readyz` sonde. `NOTIFY_SINK` n'est
 * jugé ici que par sa présence : la règle de REQ-CPL-021 vit dans `lireEnvironnement`. Les niveaux
 * de journal sont ceux de pino, que `creerJournal` reçoit tels quels.
 */
export const schemaConfiguration = z.object({
  DATABASE_URL: urlDe(['postgresql:', 'postgres:']),
  REDIS_URL: urlDe(['redis:', 'rediss:']),
  NOTIFY_SINK: z.string().optional(),
  PARTNERS_ENV: nette.optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  SENTRY_DSN: urlDe(['https:']).optional(),
});

export type Configuration = z.infer<typeof schemaConfiguration>;
export type Environnement = Secrets & Configuration;

/** Les noms de configuration, DÉRIVÉS du schéma, dans son ordre. */
export const NOMS_DE_CONFIGURATION: readonly string[] = Object.keys(schemaConfiguration.shape);

/** TOUTES les variables jugées au démarrage : les secrets, puis la configuration. */
export const NOMS_DES_VARIABLES: readonly string[] = [
  ...NOMS_DES_SECRETS,
  ...NOMS_DE_CONFIGURATION,
];

/**
 * Les variables que le schéma déclare facultatives, DÉRIVÉES de lui. `NOTIFY_SINK` n'en est pas :
 * facultative pour Zod, elle est exigée hors production par la règle de REQ-CPL-021.
 */
export const NOMS_FACULTATIFS: readonly string[] = Object.entries(schemaConfiguration.shape)
  .filter(([nom, type]) => type.isOptional() && nom !== 'NOTIFY_SINK')
  .map(([nom]) => nom);

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
export type LectureDuDemarrage = { ok: true; env: Environnement } | { ok: false; refus: Refus[] };

/**
 * PURE : juge les SECRETS d'un environnement (SEC-01), n'écrit rien, ne sort pas. Ses porteurs
 * (`clesPii`, la frontière axionia) n'ont besoin que des secrets : leur imposer la configuration
 * les ferait refuser un jeu de secrets valide.
 */
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

  // L'égalité se juge sur des EMPREINTES, jamais en comparant ni en imprimant les valeurs, et sur
  // TOUT le jeu : chaque groupe de deux noms ou plus qui partagent une valeur est un refus unique.
  const parEmpreinte = new Map<string, string[]>();
  for (const nom of NOMS_DES_SECRETS) {
    const v = source[nom];
    if (v === undefined || v === '') continue;
    const empreinte = createHash('sha256').update(v, 'utf8').digest('hex');
    parEmpreinte.set(empreinte, [...(parEmpreinte.get(empreinte) ?? []), nom]);
  }
  for (const [premier, ...autres] of parEmpreinte.values()) {
    if (premier !== undefined && autres.length > 0) {
      refus.push({ variable: premier, motif: 'egale_a', avec: autres });
    }
  }

  if (!lu.success || refus.length > 0) return { ok: false, refus };
  return { ok: true, env: lu.data };
}

/**
 * PURE : juge TOUT l'environnement du démarrage (QA-T04, REQ-QA-030) — les secrets par
 * `lireEnvironnement`, puis la configuration, puis la règle du puits de notifications. Les refus
 * des secrets viennent d'abord, dans leur ordre ; aucun n'est perdu.
 */
export function lireDemarrage(
  source: Readonly<Record<string, string | undefined>>
): LectureDuDemarrage {
  const secrets = lireEnvironnement(source);
  const refus: Refus[] = secrets.ok ? [] : [...secrets.refus];
  const configuration = schemaConfiguration.safeParse(source);
  if (!configuration.success) {
    for (const issue of configuration.error.issues) {
      refus.push({ variable: String(issue.path[0]), motif: motifDe(issue) });
    }
  }
  // REQ-CPL-021 : hors production, le puits de notifications est exigé. « Production » est le
  // prédicat du notifieur, importé — jamais une seconde écriture qui divergerait de lui.
  if (!productionDeclaree(source) && source.NOTIFY_SINK !== 'true') {
    refus.push({ variable: 'NOTIFY_SINK', motif: 'requise_hors_production' });
  }
  if (!secrets.ok || !configuration.success || refus.length > 0) return { ok: false, refus };
  return { ok: true, env: { ...secrets.env, ...configuration.data } };
}

/** Une ligne de refus : le nom, le motif, et pour une égalité les autres noms. Jamais la valeur. */
export function formaterRefus(r: Refus): string {
  return `${r.variable} : ${r.motif}${r.avec ? ` ${r.avec.join(', ')}` : ''}`;
}

/** Écrit les refus sur la sortie d'erreur, une ligne chacun, et sort en 1. Jamais la valeur. */
function refuserLeDemarrage(entete: string, refus: readonly Refus[]): never {
  process.stderr.write(`${entete}\n${refus.map((r) => `  ${formaterRefus(r)}\n`).join('')}`);
  process.exit(1);
}

/**
 * Le boot des SECRETS (SEC-01) : rend les secrets, ou écrit les refus sur la sortie d'erreur et sort
 * en 1. N'est appelé par personne à l'import.
 */
export function exigerEnvironnement(
  source: Readonly<Record<string, string | undefined>> = process.env
): Secrets {
  const lu = lireEnvironnement(source);
  if (lu.ok) return lu.env;
  return refuserLeDemarrage(
    "Démarrage refusé : secrets d'environnement en défaut (src/lib/env.ts, .env.example).",
    lu.refus
  );
}

/**
 * Le DÉMARRAGE du serveur (QA-T04) : tout l'environnement, ou la sortie en 1. C'est ce que
 * `register()` de `src/instrumentation.ts` appelle avant toute composition.
 */
export function exigerDemarrage(
  source: Readonly<Record<string, string | undefined>> = process.env
): Environnement {
  const lu = lireDemarrage(source);
  if (lu.ok) return lu.env;
  return refuserLeDemarrage(
    "Démarrage refusé : variables d'environnement en défaut (src/lib/env.ts, docs/env.md).",
    lu.refus
  );
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

// ── docs/env.md : le RENDU du schéma (QA-T04, REQ-QA-030) ──────────────────────────────────────

/** Le chemin de la vue. Elle se régénère par `pnpm env:doc`, et `env-fail-fast.spec.ts` la compare. */
export const CHEMIN_DOC_ENV = 'docs/env.md';

type NomDeVariable = keyof Environnement;

/**
 * Le RÔLE de chaque variable, en une phrase. Le type exige une entrée par nom du schéma : une
 * variable ajoutée sans son rôle ne compile pas, et une variable retirée laisse une clé en trop qui
 * ne compile pas non plus.
 */
const ROLES: Record<NomDeVariable, string> = {
  SESSION_SECRET: "signe les sessions de la console et de l'espace",
  MAGIC_LINK_SECRET: 'signe les liens de connexion envoyés par courriel',
  DEPOSIT_TOKEN_SECRET: "signe les jetons de dépôt d'un contact",
  AXIONIA_WEBHOOK_SECRET: "authentifie les webhooks reçus d'axionia",
  AXIONIA_API_TOKEN: "authentifie les appels de l'API entrante d'axionia",
  DOCUSEAL_WEBHOOK_SECRET: 'authentifie les webhooks reçus de DocuSeal',
  PII_ENCRYPTION_KEY: 'chiffre les données personnelles (AES-256-GCM)',
  IP_HASH_SALT: "sale l'empreinte des adresses réseau",
  PII_HASH_KEY: 'clé des empreintes de recherche des données personnelles',
  PARTNERS_MCP_SHARED_SECRET: 'serrure de la porte MCP `POST /api/mcp`, en-tête `x-mcp-secret`',
  DATABASE_URL: 'la base Postgres ; `readyz` la sonde',
  REDIS_URL: 'le cache Redis ; `readyz` le sonde',
  NOTIFY_SINK: "retient toute notification dans le journal au lieu de l'envoyer",
  PARTNERS_ENV: "nom de l'environnement ; `production` avec `NODE_ENV=production` vaut production",
  LOG_LEVEL: 'niveau du journal (pino), `info` si absente',
  SENTRY_DSN: 'adresse de collecte des erreurs ; absente, rien ne part',
};

/** La règle de forme, dite une fois par espèce de variable — celle que le schéma applique. */
function regleDe(nom: NomDeVariable): string {
  if (nom === 'PII_ENCRYPTION_KEY') return 'exactement 64 caractères hexadécimaux';
  if (NOMS_DES_SECRETS.includes(nom)) {
    return 'au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production';
  }
  switch (nom) {
    case 'DATABASE_URL':
      return 'URL `postgresql:` ou `postgres:`';
    case 'REDIS_URL':
      return 'URL `redis:` ou `rediss:`';
    case 'NOTIFY_SINK':
      return '`true` exigé hors production (REQ-CPL-021)';
    case 'LOG_LEVEL':
      return schemaConfiguration.shape.LOG_LEVEL.unwrap()
        .options.map((n) => `\`${n}\``)
        .join(', ');
    case 'SENTRY_DSN':
      return 'URL `https:`';
    default:
      return 'non vide, sans espace en bordure';
  }
}

function presenceDe(nom: string): string {
  if (nom === 'NOTIFY_SINK') return 'requise hors production';
  return NOMS_FACULTATIFS.includes(nom) ? 'facultative' : 'requise';
}

/** PURE : le texte de `docs/env.md`, dérivé du schéma. Aucune valeur, jamais. */
export function documenterEnvironnement(): string {
  const lignes = (noms: readonly string[]) =>
    noms.map((n) => {
      const nom = n as NomDeVariable;
      return `| \`${nom}\` | ${presenceDe(nom)} | ${regleDe(nom)} | ${ROLES[nom]} |`;
    });
  return [
    "# Variables d'environnement — Axion Partners",
    '',
    '> VUE GÉNÉRÉE depuis le schéma de `src/lib/env.ts` par `pnpm env:doc` — ne pas éditer à la main.',
    '> `tests/unit/qualite/env-fail-fast.spec.ts` rougit si ce fichier diffère du rendu.',
    '',
    'Toute variable requise absente, et toute valeur hors règle, fait refuser le démarrage en code',
    'non nul (`register()` de `src/instrumentation.ts`) ; le refus nomme la variable et un motif,',
    "jamais la valeur. Aucune variable requise n'a de valeur par défaut. Une variable facultative",
    'posée est jugée comme les autres.',
    '',
    '## Secrets',
    '',
    '| Variable | Présence | Règle | Rôle |',
    '| --- | --- | --- | --- |',
    ...lignes(NOMS_DES_SECRETS),
    '',
    '## Configuration',
    '',
    '| Variable | Présence | Règle | Rôle |',
    '| --- | --- | --- | --- |',
    ...lignes(NOMS_DE_CONFIGURATION),
    '',
  ].join('\n');
}
