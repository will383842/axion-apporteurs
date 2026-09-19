/**
 * Les compteurs de débit, et leur conduite quand le cache tombe. (SEC-10, REQ-SEC-016)
 *
 * UN COMPTEUR N'EXISTE QUE DÉCLARÉ ICI. `COMPTEURS` est le registre unique : un compteur écrit
 * ailleurs, sous un nom calculé ou sous un préfixe hors des cinq familles fait rougir
 * `scripts/gates/rate-famille.ts`. Chaque déclaration porte sa conduite sur panne, REQUISE par
 * le type — aucun `?`, aucun défaut : un prédicat optionnel à défaut ouvert échoue ouvert, et
 * c'est ce que cette bibliothèque ferme. La garde la revérifie, parce qu'un type se contourne.
 *
 * LE SUJET D'UN COMPTEUR EST UNE EMPREINTE, jamais une valeur. Une adresse de courriel ou une
 * adresse réseau en clair dans une clé du cache est une donnée personnelle hors de la base ; le
 * type marqué l'empêche, le constructeur la refuse. Ce module ne hache rien.
 *
 * UNE PANNE EST RAPIDE, SUIT LA CONDUITE DÉCLARÉE, ET SE DIT. Le client est bâti sans file hors
 * ligne, sans nouvelle tentative et avec des délais bornés : un cache tombé rend une erreur, il ne
 * suspend pas la requête. Le verdict porte `panne: true` et son motif, et chaque panne est signalée
 * par son PRÉFIXE seul — la clé porte l'empreinte, elle ne sort pas.
 *
 * LES LIMITES SONT CELLES DES EXIGENCES, avec leur source. Une limite qu'aucune exigence ne chiffre
 * ne s'invente pas : elle attend sa configuration, et en attendant le compteur refuse.
 */

import { randomUUID } from 'node:crypto';
import Redis, { type RedisOptions } from 'ioredis';

// ── Le vocabulaire fermé ────────────────────────────────────────────────────────────────────────

/** Les cinq familles de REQ-SEC-016. Un sixième préfixe passe par l'exigence, pas par ce fichier. */
export const PREFIXES_DE_FAMILLE = ['magic:', 'depot:', 'verif:', 'webhook:', 'auth:'] as const;
export type PrefixeDeFamille = (typeof PREFIXES_DE_FAMILLE)[number];

/** Les deux conduites possibles quand le cache ne répond pas. Il n'y en a pas de troisième. */
export const CONDUITES_SUR_PANNE = ['refuser', 'laisser-passer'] as const;
export type ConduiteSurPanne = (typeof CONDUITES_SUR_PANNE)[number];

/**
 * La marque d'une limite qu'aucune exigence ne chiffre : elle attend une configuration. Tant
 * qu'aucune ne la fournit, le compteur répond comme en panne, sous sa conduite déclarée, avec le
 * motif `limite_non_configuree`. Une limite qui n'est écrite nulle part ne s'invente pas ici.
 */
export const LIMITE_HORS_DEPOT = 'hors-depot' as const;

export interface DeclarationDeCompteur {
  readonly prefixe: PrefixeDeFamille;
  readonly limite: number | typeof LIMITE_HORS_DEPOT;
  readonly fenetreSecondes: number | typeof LIMITE_HORS_DEPOT;
  readonly surPanne: ConduiteSurPanne;
  readonly source: `REQ-${string}`;
}

// ── Le registre ─────────────────────────────────────────────────────────────────────────────────

/**
 * Le registre unique. Le nom d'un compteur commence par son préfixe ; la clé du cache est
 * `${nom}:${sujet}`, rien d'autre.
 */
export const COMPTEURS = {
  'magic:ip': {
    prefixe: 'magic:',
    limite: 10,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
  },
  'magic:courriel': {
    prefixe: 'magic:',
    limite: 5,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
  },
  'depot:ip': {
    prefixe: 'depot:',
    limite: 20,
    fenetreSecondes: 600,
    surPanne: 'laisser-passer',
    source: 'REQ-SEC-016',
  },
  'depot:identite': {
    prefixe: 'depot:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-016',
  },
} as const satisfies Readonly<Record<`${PrefixeDeFamille}${string}`, DeclarationDeCompteur>>;

/** Une faute de frappe dans le nom d'un compteur ne compile pas. */
export type NomDeCompteur = keyof typeof COMPTEURS;

// ── Le sujet : une empreinte, jamais une valeur ─────────────────────────────────────────────────

declare const marqueDeSujet: unique symbol;
export type SujetDeCompteur = string & { readonly [marqueDeSujet]: 'SujetDeCompteur' };

const EMPREINTE = /^(?:[0-9a-f]{16}|[0-9a-f]{64})$/;

/**
 * Le seul constructeur d'un sujet : 16 ou 64 hexadécimaux minuscules. Le refus ne recopie JAMAIS
 * la valeur reçue — si c'était un courriel, le message d'erreur le ferait fuir dans les journaux.
 */
export function sujetDepuisEmpreinte(hex: string): SujetDeCompteur {
  if (hex === '') {
    throw new Error(
      'sujet_non_empreinte : le sujet d’un compteur est une empreinte de 16 ou 64 hexadécimaux ' +
        'minuscules ; une valeur en clair n’entre jamais dans une clé du cache'
    );
  }
  return hex as SujetDeCompteur;
}

// ── Le magasin : un port ────────────────────────────────────────────────────────────────────────

export interface ResultatDuMagasin {
  readonly admis: boolean;
  /** Le nombre d'entrées dans la fenêtre APRÈS l'appel. */
  readonly compte: number;
  /** L'horodatage (ms) de l'entrée la plus ancienne de la fenêtre, `null` si elle est vide. */
  readonly plusAncienMs: number | null;
}

/**
 * Fenêtre glissante par journal : retirer ce qui est sorti de la fenêtre, compter, ajouter le
 * membre SEULEMENT s'il reste de la place, renouveler l'expiration. Un refus n'ajoute rien.
 */
export interface MagasinDeCompteurs {
  consommer(
    cle: string,
    maintenantMs: number,
    fenetreMs: number,
    limite: number,
    membre: string
  ): Promise<ResultatDuMagasin>;
}

/**
 * Le même algorithme, ATOMIQUE : un script exécuté d'un seul tenant par le cache. Une suite de
 * commandes envoyées l'une après l'autre laisse deux requêtes concurrentes lire le même compte.
 */
const SCRIPT_FENETRE_GLISSANTE = `
local cle = KEYS[1]
local maintenant = tonumber(ARGV[1])
local fenetre = tonumber(ARGV[2])
local limite = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', cle, '-inf', maintenant - fenetre)
local compte = redis.call('ZCARD', cle)
local admis = 0
if compte < limite then
  redis.call('ZADD', cle, maintenant, ARGV[4])
  compte = compte + 1
  admis = 1
end
redis.call('PEXPIRE', cle, fenetre)
local plusAncien = redis.call('ZRANGE', cle, 0, 0, 'WITHSCORES')
return {admis, compte, plusAncien[2] or '-1'}
`;

/**
 * Les options qui rendent une panne RAPIDE. Par défaut, le client retente sans fin et met les
 * commandes en file hors ligne : un cache tombé ne rend alors pas d'erreur, il suspend la requête,
 * ce qui est pire que les deux conduites. Le pire cas est un serveur qui accepte puis se tait : la
 * connexion (`connectTimeout`) puis la vérification d'état (`commandTimeout`) s'ajoutent, et les
 * commandes d'identification du client, qui en ajouteraient une troisième, ne sont pas envoyées.
 */
export const OPTIONS_DU_CLIENT = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  connectTimeout: 300,
  commandTimeout: 500,
  disableClientInfo: true,
  retryStrategy: () => null,
} as const satisfies RedisOptions;

export interface MagasinRedis extends MagasinDeCompteurs {
  fermer(): void;
}

/**
 * Le magasin réel. Aucune connexion n'est ouverte à la construction : la première se fait au
 * premier appel, et une connexion perdue se rouvre à l'appel suivant — jamais en tâche de fond.
 */
export function creerMagasinRedis(url: string, options: RedisOptions): MagasinRedis {
  const client = new Redis(url, options);
  // Chaque panne est déjà signalée, par son préfixe, au verdict qui la subit. Sans écouteur, le
  // client imprimerait en plus la sienne, avec l'adresse du cache, à chaque tentative.
  client.on('error', () => undefined);
  let connexion: Promise<void> | null = null;

  // La connexion échoue à la PREMIÈRE erreur. Contre un serveur qui accepte puis se tait, la
  // promesse du client n'aboutit qu'à la fermeture du socket par le pair — c'est-à-dire jamais.
  const pret = async (): Promise<void> => {
    if (client.status === 'wait' || client.status === 'end') {
      let echec: (e: Error) => void = () => undefined;
      connexion ??= new Promise<void>((resoudre, rejeter) => {
        echec = rejeter;
        client.once('error', echec);
        client.connect().then(resoudre, rejeter);
      }).finally(() => {
        client.removeListener('error', echec);
        connexion = null;
      });
    }
    if (connexion !== null) await connexion;
  };

  return {
    async consommer(cle, maintenantMs, fenetreMs, limite, membre) {
      await pret();
      const brut = await client.eval(
        SCRIPT_FENETRE_GLISSANTE,
        1,
        cle,
        maintenantMs,
        fenetreMs,
        limite,
        membre
      );
      if (!Array.isArray(brut) || brut.length !== 3) {
        throw new Error('rate-limit : réponse du cache illisible');
      }
      const plusAncien = Number(brut[2]);
      return {
        admis: Number(brut[0]) === 1,
        compte: Number(brut[1]),
        plusAncienMs: plusAncien < 0 ? null : plusAncien,
      };
    },
    fermer() {
      client.disconnect();
    },
  };
}

/** Le magasin d'un processus sans `REDIS_URL` : chaque appel est une panne, jamais un plantage. */
const MAGASIN_SANS_ADRESSE: MagasinDeCompteurs = {
  consommer() {
    return Promise.reject(new Error('rate-limit : REDIS_URL absente'));
  },
};

let magasinDuProcessus: MagasinRedis | null = null;

/** `REDIS_URL` est lue au premier appel, jamais à l'import. */
function magasinParDefaut(): MagasinDeCompteurs {
  if (magasinDuProcessus !== null) return magasinDuProcessus;
  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') return MAGASIN_SANS_ADRESSE;
  magasinDuProcessus = creerMagasinRedis(url, OPTIONS_DU_CLIENT);
  return magasinDuProcessus;
}

// ── Le verdict ──────────────────────────────────────────────────────────────────────────────────

export type MotifDeVerdict =
  | 'admis'
  | 'limite_atteinte'
  | 'cache_indisponible'
  | 'limite_non_configuree';

export interface VerdictDeLimite {
  readonly autorise: boolean;
  readonly restant: number;
  /** Quand une place se libère (ms), si l'appel est refusé par la limite ; `null` sinon. */
  readonly repriseAt: number | null;
  /** L'appelant distingue « trop de tentatives » de « le compteur est aveugle ». */
  readonly panne: boolean;
  readonly motif: MotifDeVerdict;
}

export interface SignalDePanne {
  readonly prefixe: string;
  readonly motif: 'cache_indisponible' | 'limite_non_configuree';
}

export type Signaleur = (signal: SignalDePanne) => void;

/** Le puits de phase 0 : une ligne JSON sur la sortie d'erreur. Le préfixe, jamais la clé. */
export const signalerSurStderr: Signaleur = (signal) => {
  process.stderr.write(
    `${JSON.stringify({ evenement: 'rate_limit_panne', prefixe: signal.prefixe, motif: signal.motif })}\n`
  );
};

/**
 * La conduite d'une déclaration, lue en ÉCHEC FERMÉ : tout ce qui n'est pas exactement
 * `laisser-passer` refuse — y compris une conduite absente qu'un cast aurait fait passer.
 */
export function conduiteSurPanne(declaration: {
  readonly surPanne?: unknown;
}): ConduiteSurPanne {
  return declaration.surPanne === 'refuser' ? 'refuser' : 'laisser-passer';
}

function enPanne(
  declaration: DeclarationDeCompteur,
  motif: SignalDePanne['motif'],
  signaler: Signaleur
): VerdictDeLimite {
  signaler({ prefixe: declaration.prefixe, motif });
  return {
    autorise: conduiteSurPanne(declaration) === 'laisser-passer',
    restant: 0,
    repriseAt: null,
    panne: true,
    motif,
  };
}

/**
 * Compte un appel du sujet sous le compteur nommé. L'heure est un PARAMÈTRE : ce module ne lit
 * aucune horloge. Toute panne du magasin — levée, délai, réponse illisible, adresse absente —
 * rend la conduite déclarée du compteur, avec `panne: true`.
 */
export async function limiter(
  nom: NomDeCompteur,
  sujet: SujetDeCompteur,
  maintenantMs: number,
  magasin: MagasinDeCompteurs = magasinParDefaut(),
  signaler: Signaleur = signalerSurStderr
): Promise<VerdictDeLimite> {
  const declaration: DeclarationDeCompteur = COMPTEURS[nom];
  // Revérifié à l'exécution : un cast ferait entrer n'importe quelle chaîne dans la clé.
  const empreinte = sujetDepuisEmpreinte(sujet);
  const { limite, fenetreSecondes } = declaration;
  if (limite === LIMITE_HORS_DEPOT || fenetreSecondes === LIMITE_HORS_DEPOT) {
    return enPanne(declaration, 'limite_non_configuree', signaler);
  }
  const fenetreMs = fenetreSecondes * 1000;
  let resultat: ResultatDuMagasin;
  try {
    resultat = await magasin.consommer(
      `${nom}:${empreinte}`,
      maintenantMs,
      fenetreMs,
      limite,
      randomUUID()
    );
  } catch {
    return enPanne(declaration, 'cache_indisponible', signaler);
  }
  return {
    autorise: resultat.admis,
    restant: Math.max(0, limite - resultat.compte),
    repriseAt: resultat.admis ? null : (resultat.plusAncienMs ?? maintenantMs) + fenetreMs,
    panne: false,
    motif: resultat.admis ? 'admis' : 'limite_atteinte',
  };
}
