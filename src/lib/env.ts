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
import { horlogeSysteme } from './horloge';

/** Les seuls motifs qu'un refus peut porter. Aucun n'est construit à partir de la valeur. */
export const MOTIFS_DE_REFUS = [
  'absente',
  'trop_courte',
  'format_invalide',
  'espace_en_bordure',
  'prefixe_interdit',
  'egale_a',
  'requise_hors_production',
  'echeance_au_dela_de_24_h',
  'requise_envoi_actif',
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

/** INT-T54 : l'identifiant d'un salon Telegram, un entier signé — court, donc pas un `secret` de 32 octets. */
const IDENTIFIANT_DE_SALON = /^-?\d{1,20}$/;
const identifiantDeSalon = z.string().superRefine((v, ctx) => {
  if (presenteEtNette(v, ctx) && !IDENTIFIANT_DE_SALON.test(v)) refuser(ctx, 'format_invalide');
});

/**
 * SEC-14 (REQ-SEC-017, REQ-GOV-031) : le réglage des signaux de sincérité — des paires `clé=entier`
 * séparées par `;`. Sa FORME est jugée ici, au démarrage ; ses clés et leurs bornes, par
 * `lireReglageDeSincerite` (`src/server/anomalie/sincerite.ts`), seul lecteur de la liste fermée.
 */
const FORME_DU_REGLAGE = /^[a-z_.]+=\d{1,5}(?:;[a-z_.]+=\d{1,5})*$/;
const reglageHorsDepot = z.string().superRefine((v, ctx) => {
  if (!presenteEtNette(v, ctx)) return;
  if (!FORME_DU_REGLAGE.test(v)) refuser(ctx, 'format_invalide');
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
  // INT-T10 (REQ-INT-023, REQ-SEC-010) : la clé qui authentifie les webhooks de rebonds du relais de
  // courriel — un secret dédié par source, dans CETTE liste pour les règles de REQ-SEC-028.
  ZEPTOMAIL_WEBHOOK_SECRET: secret,
  // INT-T26 (REQ-INT-032, partners/ADR-0023) : le secret DÉDIÉ qui signe les lectures de Partners
  // chez axionia (relecture, coordonnées d'un candidat) — la même valeur que le
  // `PARTNERS_RELECTURE_SECRET` d'axionia, distincte du secret des webhooks.
  AXIONIA_RELECTURE_SECRET: secret,
});

export type Secrets = z.infer<typeof schemaSecrets>;

/**
 * INT-T57 (REQ-INT-022) — les secrets CONDITIONNELS : des secrets, soumis aux règles de REQ-SEC-028
 * dès qu'ils sont posés (longueur, préfixe, égalité, jamais imprimés), mais exigés au démarrage
 * seulement quand leur fonction est allumée (`EXIGES_SI_ENVOI_ACTIF`, dans `lireDemarrage`). Ils
 * restent hors de `Secrets` : un porteur des secrets toujours exigés ne les voit jamais absents.
 */
export const schemaSecretsConditionnels = z.object({
  // Le jeton d'envoi du relais de courriels (`Authorization: Zoho-enczapikey <jeton>`).
  ZEPTOMAIL_SEND_TOKEN: secret.optional(),
  // INT-T54 : le jeton du canal d'alerte (Telegram) du SERVEUR. Exigé par aucune règle de démarrage :
  // une alerte due sans canal fait échouer le passage en le nommant (`canal_alerte_absent`).
  TELEGRAM_BOT_TOKEN: secret.optional(),
  // INT-T54 : le salon, classé là où il vit déjà (un secret de l'environnement `production`, lu par
  // backup.yml, deploy.yml et nightly.yml) : une seule source, aucune recopie.
  TELEGRAM_CHAT_ID: identifiantDeSalon.optional(),
  // SEC-14 (REQ-GOV-031) : les poids, le seuil et les paramètres des signaux de sincérité. Un
  // SECRET, et non une variable : le dépôt est public, et une variable s'imprime dans les journaux
  // de la CI. Absent, aucun dépôt n'est jugé — le défaut est fermé.
  PARTNERS_SINCERITE_REGLAGE: reglageHorsDepot.optional(),
});
export type SecretsConditionnels = z.infer<typeof schemaSecretsConditionnels>;
export const NOMS_DES_SECRETS_CONDITIONNELS: readonly string[] = Object.keys(
  schemaSecretsConditionnels.shape
);

/**
 * Les CLÉS D'EMPREINTE, nommées ICI et nulle part ailleurs. Deux usages, deux clés (SEC-01) : la
 * clé des empreintes de personnes et le sel des adresses. Un porteur qui n'a besoin que de l'une
 * prend `CleDesPersonnes` : le moindre privilège est conservé SANS que les noms des secrets soient
 * retapés hors de ce fichier, ce que REQ-SEC-028 interdit et que RM-01 appelle une recopie.
 * Un nom qui disparaîtrait de `schemaSecrets` fait rougir `tsc` ici, pas chez le porteur.
 */
export type CleDesPersonnes = Pick<Secrets, 'PII_HASH_KEY'>;
export type ClesDEmpreinte = CleDesPersonnes & Pick<Secrets, 'IP_HASH_SALT'>;

/** INT-T57 : ce que l'envoi réel exige au démarrage, quand il est allumé. */
export const EXIGES_SI_ENVOI_ACTIF = ['ZEPTOMAIL_SEND_TOKEN', 'ZEPTOMAIL_API_URL'] as const;

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
  // QA-T62 (REQ-DM-024) : l'URL du rôle PROPRIÉTAIRE, lue par l'entrée de l'image seulement (migration,
  // provisionnement du rôle d'exécution), puis retirée de l'environnement du serveur. Son exigence en
  // production est jugée par `src/server/deploiement/role-d-execution.ts`, avant le serveur.
  DATABASE_MIGRATION_URL: urlDe(['postgresql:', 'postgres:']).optional(),
  REDIS_URL: urlDe(['redis:', 'rediss:']),
  NOTIFY_SINK: z.string().optional(),
  PARTNERS_ENV: nette.optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  SENTRY_DSN: urlDe(['https:']).optional(),
  // INT-T10 (REQ-INT-022) : l'envoi automatique n'existe que si ce drapeau vaut `true`. Absent, il
  // vaut faux — le défaut est fermé. Il ne se pose qu'avec, dans `docs/tiers/zeptomail.md`, la
  // référence datée du rapport d'agrégation montrant `dkim=pass` et `spf=pass`.
  PARTNERS_EMAIL_DMARC_VERIFIE: z.enum(['true', 'false']).optional(),
  // INT-T10 (REQ-INT-022) : l'adresse HUMAINE d'expédition, du domaine d'envoi ; sa forme est jugée
  // par `configurationDeLEmetteur` (`src/server/integrations/zeptomail/emetteur.ts`).
  PARTNERS_EMAIL_EXPEDITEUR: nette.optional(),
  // INT-T26 (REQ-INT-032) : l'adresse d'axionia pour les lectures de Partners. Absente, le canal est
  // fermé de ce côté : une candidature reçue attend ses coordonnées, rien ne part.
  AXIONIA_BASE_URL: urlDe(['https:']).optional(),
  // SEC-44 (REQ-SEC-012) : les adresses d'où axionia appelle l'API entrante, séparées par des
  // virgules. Absente, personne n'entre ; posée, elle n'est jamais vide. Sa forme fine (adresses
  // lisibles) est jugée à chaque appel par `listeDAdresses` (`api-entrante.ts`).
  AXIONIA_API_ALLOWLIST: nette.optional(),
  // INT-T57 (REQ-INT-022) : l'URL d'envoi du relais ; son hôte est jugé contre la liste fermée de
  // `src/server/integrations/zeptomail/relais.ts`. Exigée au démarrage si l'envoi réel est allumé.
  ZEPTOMAIL_API_URL: urlDe(['https:']).optional(),
});

export type Configuration = z.infer<typeof schemaConfiguration>;
export type Environnement = Secrets & SecretsConditionnels & Configuration;

/** Les noms de configuration, DÉRIVÉS du schéma, dans son ordre. */
export const NOMS_DE_CONFIGURATION: readonly string[] = Object.keys(schemaConfiguration.shape);

/** TOUTES les variables jugées au démarrage : les secrets, puis la configuration. */
export const NOMS_DES_VARIABLES: readonly string[] = [
  ...NOMS_DES_SECRETS,
  ...NOMS_DES_SECRETS_CONDITIONNELS,
  ...NOMS_DE_CONFIGURATION,
];

/**
 * Les variables que le schéma déclare facultatives, DÉRIVÉES de lui. `NOTIFY_SINK` n'en est pas :
 * facultative pour Zod, elle est exigée hors production par la règle de REQ-CPL-021. La
 * CONFIGURATION seule : les secrets conditionnels ont leur propre liste, et se provisionnent comme
 * des secrets, jamais comme des variables.
 */
export const NOMS_FACULTATIFS: readonly string[] = Object.entries(schemaConfiguration.shape)
  .filter(
    ([nom, type]) => type.isOptional() && nom !== 'NOTIFY_SINK' && nom !== 'DATABASE_MIGRATION_URL'
  )
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
  // INT-T57 : les secrets conditionnels, jugés par les MÊMES règles dès qu'ils sont posés.
  const conditionnels = schemaSecretsConditionnels.safeParse(source);
  for (const issue of [
    ...(lu.success ? [] : lu.error.issues),
    ...(conditionnels.success ? [] : conditionnels.error.issues),
  ]) {
    refus.push({ variable: String(issue.path[0]), motif: motifDe(issue) });
  }
  const refusees = new Set(refus.map((r) => r.variable));
  const tousLesSecrets = [...NOMS_DES_SECRETS, ...NOMS_DES_SECRETS_CONDITIONNELS];

  if (!HORS_PRODUCTION.has(source.NODE_ENV ?? '')) {
    for (const nom of tousLesSecrets) {
      const v = source[nom];
      if (v !== undefined && !refusees.has(nom) && PREFIXE_INTERDIT.test(v)) {
        refus.push({ variable: nom, motif: 'prefixe_interdit' });
      }
    }
  }

  // L'égalité se juge sur des EMPREINTES, jamais en comparant ni en imprimant les valeurs, et sur
  // TOUT le jeu : chaque groupe de deux noms ou plus qui partagent une valeur est un refus unique.
  const parEmpreinte = new Map<string, string[]>();
  for (const nom of tousLesSecrets) {
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

  if (!lu.success || !conditionnels.success || refus.length > 0) return { ok: false, refus };
  return { ok: true, env: lu.data };
}

/**
 * PURE : juge TOUT l'environnement du démarrage (QA-T04, REQ-QA-030) — les secrets par
 * `lireEnvironnement`, puis la configuration, puis la règle du puits de notifications. Les refus
 * des secrets viennent d'abord, dans leur ordre ; aucun n'est perdu.
 */
export function lireDemarrage(
  source: Readonly<Record<string, string | undefined>>,
  maintenantMs: number = horlogeSysteme.maintenant()
): LectureDuDemarrage {
  const secrets = lireEnvironnement(source);
  const refus: Refus[] = secrets.ok ? [] : [...secrets.refus];
  // QA-T52 (REQ-QA-030) : une clé précédente mal posée refuse le démarrage comme un secret absent.
  refus.push(...jugerLaRotation(source, maintenantMs).refus);
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
  // INT-T57 (REQ-INT-022) : l'envoi réel allumé (`PARTNERS_EMAIL_DMARC_VERIFIE`), le relais doit
  // pouvoir partir — son jeton et son URL sont exigés ; éteint, ils peuvent manquer, et le relais
  // refuse alors en se nommant (`relais_non_configure`).
  if (source.PARTNERS_EMAIL_DMARC_VERIFIE === 'true') {
    for (const nom of EXIGES_SI_ENVOI_ACTIF) {
      const v = source[nom];
      if (v === undefined || v === '') refus.push({ variable: nom, motif: 'requise_envoi_actif' });
    }
  }
  if (!secrets.ok || !configuration.success || refus.length > 0) return { ok: false, refus };
  const conditionnels = schemaSecretsConditionnels.safeParse(source);
  return {
    ok: true,
    env: { ...secrets.env, ...(conditionnels.data ?? {}), ...configuration.data },
  };
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

// ── La double clé de rotation (QA-T52, REQ-QA-030) ─────────────────────────────────────────────

/** REQ-QA-030 : la clé précédente est acceptée « pendant 24 h », pas une milliseconde de plus. */
export const ROTATION_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Les secrets qui tournent à double clé : ceux qu'axionia présente, avec le `kid` de la clé dans
 * l'en-tête. `DOCUSEAL_WEBHOOK_SECRET` n'y est pas : il n'a aucun récepteur, et sa double clé sans
 * `kid` (le tiers n'en pose pas) viendra avec lui (arbitrage -d7 du 2026-09-30).
 */
export const NOMS_EN_ROTATION = ['AXIONIA_WEBHOOK_SECRET', 'AXIONIA_API_TOKEN'] as const;
export type NomEnRotation = (typeof NOMS_EN_ROTATION)[number];

/** La clé précédente d'un secret : `<NOM>_PRECEDENT`, et son échéance `<NOM>_PRECEDENT_ECHEANCE`. */
export const variablesDeRotation = (nom: NomEnRotation) =>
  ({ cle: `${nom}_PRECEDENT`, echeance: `${nom}_PRECEDENT_ECHEANCE` }) as const;

export type Trousseau = {
  courante: string;
  precedente: { valeur: string; echeanceMs: number } | null;
};

export type MotifDeCle = 'kid_absent' | 'kid_inconnu' | 'cle_precedente_echue';

/**
 * PURE. La clé que désigne le `kid` présenté. Jamais d'essai de toutes les clés : un `kid` absent
 * ou inconnu est un refus nommé. La clé précédente meurt À son échéance ; la courante ne meurt pas.
 */
export function cleDuKid(
  t: Trousseau,
  kid: string | null,
  maintenantMs: number
):
  | { ok: true; cle: string; laquelle: 'courante' | 'precedente' }
  | { ok: false; motif: MotifDeCle } {
  if (kid === null || kid === '') return { ok: false, motif: 'kid_absent' };
  if (kid === kidDe(t.courante)) return { ok: true, cle: t.courante, laquelle: 'courante' };
  if (t.precedente !== null && kid === kidDe(t.precedente.valeur)) {
    return maintenantMs < t.precedente.echeanceMs
      ? { ok: true, cle: t.precedente.valeur, laquelle: 'precedente' }
      : { ok: false, motif: 'cle_precedente_echue' };
  }
  return { ok: false, motif: 'kid_inconnu' };
}

/** Un instant ISO 8601 en UTC, écrit en entier : ni fuseau local, ni date seule. */
const INSTANT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/**
 * PURE. Les trousseaux des secrets en rotation, jugés au démarrage : la clé et son échéance se
 * posent ENSEMBLE ; l'échéance est un instant UTC au plus à 24 h de `maintenantMs` (une échéance
 * déjà passée est admise : la clé est aussitôt refusée) ; la clé précédente suit les règles d'un
 * secret et diffère de TOUTES les autres valeurs. Les refus nomment la variable, jamais la valeur.
 */
export function lireTrousseaux(
  source: Readonly<Record<string, string | undefined>>,
  maintenantMs: number
): { ok: true; trousseaux: Record<NomEnRotation, Trousseau> } | { ok: false; refus: Refus[] } {
  const secrets = lireEnvironnement(source);
  const r = jugerLaRotation(source, maintenantMs);
  const refus = [...(secrets.ok ? [] : secrets.refus), ...r.refus];
  return refus.length > 0 ? { ok: false, refus } : { ok: true, trousseaux: r.trousseaux };
}

/** Les refus et les trousseaux de la rotation SEULE : les secrets courants sont jugés à part. */
function jugerLaRotation(
  source: Readonly<Record<string, string | undefined>>,
  maintenantMs: number
): { refus: Refus[]; trousseaux: Record<NomEnRotation, Trousseau> } {
  const refus: Refus[] = [];
  const empreinte = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
  const connues = new Map<string, string>();
  for (const n of NOMS_DES_SECRETS) {
    const v = source[n];
    if (v !== undefined && v !== '') connues.set(empreinte(v), n);
  }
  const trousseaux = Object.fromEntries(
    NOMS_EN_ROTATION.map((n): [NomEnRotation, Trousseau] => [
      n,
      { courante: source[n] ?? '', precedente: null },
    ])
  ) as Record<NomEnRotation, Trousseau>;
  for (const nom of NOMS_EN_ROTATION) {
    const { cle, echeance } = variablesDeRotation(nom);
    const v = source[cle];
    const e = source[echeance];
    if (v === undefined && e === undefined) continue;
    if (v === undefined) {
      refus.push({ variable: cle, motif: 'absente' });
      continue;
    }
    if (e === undefined) {
      refus.push({ variable: echeance, motif: 'absente' });
      continue;
    }
    const lu = secret.safeParse(v);
    if (!lu.success) {
      refus.push({ variable: cle, motif: motifDe(lu.error.issues[0]!) });
      continue;
    }
    if (!HORS_PRODUCTION.has(source.NODE_ENV ?? '') && PREFIXE_INTERDIT.test(v)) {
      refus.push({ variable: cle, motif: 'prefixe_interdit' });
      continue;
    }
    const deja = connues.get(empreinte(v));
    if (deja !== undefined) {
      refus.push({ variable: cle, motif: 'egale_a', avec: [deja] });
      continue;
    }
    connues.set(empreinte(v), cle);
    const echeanceMs = INSTANT_UTC.test(e) ? Date.parse(e) : Number.NaN;
    if (Number.isNaN(echeanceMs)) {
      refus.push({ variable: echeance, motif: 'format_invalide' });
      continue;
    }
    if (echeanceMs > maintenantMs + ROTATION_MAX_MS) {
      refus.push({ variable: echeance, motif: 'echeance_au_dela_de_24_h' });
      continue;
    }
    trousseaux[nom] = { courante: source[nom] ?? '', precedente: { valeur: v, echeanceMs } };
  }
  return { refus, trousseaux };
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
  ZEPTOMAIL_WEBHOOK_SECRET:
    'authentifie les webhooks de rebonds du relais de courriel, en-tête `Producer-Signature`',
  AXIONIA_RELECTURE_SECRET:
    "signe les lectures de Partners chez axionia (coordonnées d'un candidat), en-tête `x-partners-signature`",
  DATABASE_URL:
    "la base Postgres, sous le rôle d'exécution du serveur (jamais superutilisateur, jamais membre de `partners_journal`) ; `readyz` la sonde",
  DATABASE_MIGRATION_URL:
    "la base sous le rôle propriétaire : migration et provisionnement du rôle d'exécution, par l'entrée de l'image seulement ; exigée en production, retirée avant le serveur",
  REDIS_URL: 'le cache Redis ; `readyz` le sonde',
  NOTIFY_SINK: "retient toute notification dans le journal au lieu de l'envoyer",
  PARTNERS_ENV: "nom de l'environnement ; `production` avec `NODE_ENV=production` vaut production",
  LOG_LEVEL: 'niveau du journal (pino), `info` si absente',
  SENTRY_DSN: 'adresse de collecte des erreurs ; absente, rien ne part',
  PARTNERS_EMAIL_DMARC_VERIFIE:
    "ouvre l'envoi automatique des courriels ; absente ou `false`, aucun courriel ne part (REQ-INT-022)",
  PARTNERS_EMAIL_EXPEDITEUR:
    "adresse humaine d'expédition, du sous-domaine d'envoi ; jamais une adresse sans réponse",
  AXIONIA_BASE_URL:
    "adresse d'axionia pour les lectures de Partners ; absente, aucune coordonnée n'est tirée",
  AXIONIA_API_ALLOWLIST:
    "adresses d'où axionia appelle l'API entrante, séparées par des virgules ; absente, personne n'entre",
  ZEPTOMAIL_SEND_TOKEN:
    "jeton d'envoi du relais de courriels ; exigé quand l'envoi réel est allumé (`PARTNERS_EMAIL_DMARC_VERIFIE`)",
  TELEGRAM_BOT_TOKEN:
    "jeton du canal d'alerte du serveur ; une alerte due sans lui fait échouer le passage en le nommant",
  TELEGRAM_CHAT_ID: "salon du canal d'alerte du serveur ; voir TELEGRAM_BOT_TOKEN",
  PARTNERS_SINCERITE_REGLAGE:
    "réglage des signaux de sincérité (poids, seuil, paramètres), hors dépôt ; absent, aucun dépôt n'est jugé",
  ZEPTOMAIL_API_URL:
    "URL d'envoi du relais de courriels, d'un hôte de la liste fermée ; exigée quand l'envoi réel est allumé",
};

/** La règle de forme, dite une fois par espèce de variable — celle que le schéma applique. */
function regleDe(nom: NomDeVariable): string {
  if (nom === 'PII_ENCRYPTION_KEY') return 'exactement 64 caractères hexadécimaux';
  if (nom === 'TELEGRAM_CHAT_ID') return 'entier signé, au plus 20 chiffres';
  if (nom === 'PARTNERS_SINCERITE_REGLAGE') {
    return 'paires `clé=entier` séparées par `;`, clés de la liste fermée de `src/server/anomalie/sincerite.ts`';
  }
  if (NOMS_DES_SECRETS.includes(nom) || NOMS_DES_SECRETS_CONDITIONNELS.includes(nom)) {
    return 'au moins 32 octets, distincte des autres secrets ; préfixes `dev_` et `stub` refusés en production';
  }
  switch (nom) {
    case 'DATABASE_URL':
    case 'DATABASE_MIGRATION_URL':
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
    case 'AXIONIA_BASE_URL':
      return 'URL `https:`';
    case 'ZEPTOMAIL_API_URL':
      return 'URL `https:`, hôte de la liste fermée du relais, chemin `/v1.1/email`';
    case 'PARTNERS_EMAIL_DMARC_VERIFIE':
      return schemaConfiguration.shape.PARTNERS_EMAIL_DMARC_VERIFIE.unwrap()
        .options.map((n) => `\`${n}\``)
        .join(', ');
    default:
      return 'non vide, sans espace en bordure';
  }
}

function presenceDe(nom: string): string {
  if (nom === 'NOTIFY_SINK') return 'requise hors production';
  if (nom === 'DATABASE_MIGRATION_URL') return "requise en production, par l'entrée de l'image";
  if ((EXIGES_SI_ENVOI_ACTIF as readonly string[]).includes(nom)) {
    return 'facultative, requise si l’envoi réel est allumé';
  }
  if (NOMS_DES_SECRETS_CONDITIONNELS.includes(nom))
    return 'facultative, jamais requise au démarrage';
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
    ...lignes(NOMS_DES_SECRETS_CONDITIONNELS),
    '',
    '## Configuration',
    '',
    '| Variable | Présence | Règle | Rôle |',
    '| --- | --- | --- | --- |',
    ...lignes(NOMS_DE_CONFIGURATION),
    '',
    '## Rotation à double clé (REQ-QA-030)',
    '',
    "Pendant une rotation, l'ancienne valeur d'un secret reste acceptée jusqu'à son échéance, au plus",
    "24 h. Le `kid` présenté dans l'en-tête, dérivé de la valeur (`kidDe`), choisit la clé : un `kid`",
    "absent ou inconnu est refusé. Partners émet toujours sous la clé courante. Les deux variables d'une",
    'paire se posent ensemble ; procédure : `docs/runbooks/secret-desynchronise.md`.',
    '',
    '| Variable | Présence | Règle | Rôle |',
    '| --- | --- | --- | --- |',
    ...NOMS_EN_ROTATION.flatMap((nom) => {
      const v = variablesDeRotation(nom);
      return [
        `| \`${v.cle}\` | facultative, avec son échéance | au moins 32 octets, distincte de tous les secrets | ancienne valeur de \`${nom}\`, acceptée jusqu'à l'échéance |`,
        `| \`${v.echeance}\` | facultative, avec sa clé | instant ISO 8601 UTC, au plus 24 h après le démarrage | fin d'acceptation de \`${v.cle}\` |`,
      ];
    }),
    '',
  ].join('\n');
}
