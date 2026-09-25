/**
 * pii.ts — SEC-08 (REQ-SEC-024) : les données personnelles chiffrées et liées à leur ligne et à leur
 * champ, les empreintes de recherche, l'empreinte tronquée de l'adresse réseau.
 *
 * LE FORMAT EST UN CONTRAT, ÉCRIT PAR partners/ADR-0013 (décisions 9 à 13) ; un octet changé rend
 * illisibles, ou introuvables, toutes les données déjà écrites. Les vecteurs figés du témoin le
 * tiennent (`tests/unit/securite/chiffrement-avec-aad.spec.ts`).
 *
 *   bloc     = 0x01 (version) ‖ kid (4 octets) ‖ IV (12, tiré à chaque chiffrement) ‖ étiquette (16) ‖ chiffré
 *   AAD      = UTF-8 de JSON.stringify(["partners.pii", 1, modele, champ, id])
 *   empreinte de recherche = HMAC-SHA256(PII_HASH_KEY, "partners.empreinte.v1" ␟ type ␟ normalisé), 64 hex
 *   adresse réseau         = `empreinteAdresse` de la frontière (HMAC-SHA256 sous IP_HASH_SALT, 16 hex)
 *
 * LES CLÉS VIENNENT DU SCHÉMA DES SECRETS (`src/lib/env.ts`), ET DE LUI SEUL. `clesPii` fait juger l'environnement par
 * `lireEnvironnement` (présence, longueur, égalité entre secrets, préfixes) et n'en tire que trois
 * valeurs, une par usage, sans dérivation. `ClesPii` est MARQUÉ : aucune autre fonction ne sait en
 * fabriquer un, donc aucune primitive ci-dessous ne s'appelle sous une clé tapée dans le code.
 * Rien n'est lu à l'import : l'appelant passe `process.env`.
 *
 * LE CHEMIN D'ÉCRITURE EST `colonnesPii`. Il reçoit les clairs et rend l'objet à étaler dans `data` :
 * l'identifiant de la ligne (le même que celui de l'AAD, on ne peut pas les désaccorder), un bloc
 * `…Chiffre` par champ, et l'empreinte `…Hash` des champs recherchés. La garde `securite:schema-pii`
 * refuse toute colonne de personne en clair dans le schéma et toute écriture d'un `…Chiffre` ou d'une
 * empreinte hors de ce module.
 *
 * Aucun message d'erreur ne porte une valeur protégée : il nomme la ligne, le champ, un motif fermé.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { formaterRefus, kidDe, lireEnvironnement } from '../../lib/env';
import { cleIbanValide } from '../../lib/forme-iban';
import { empreinteAdresse } from '../integrations/axionia/api-entrante';

// ── les erreurs : une famille, un motif fermé ────────────────────────────────────────────────────

export type MotifPii =
  | 'bloc_illisible'
  | 'cle_inconnue'
  | 'echec_authentification'
  | 'cle_invalide'
  | 'ligne_incomplete'
  | 'courriel_invalide'
  | 'telephone_invalide'
  | 'iban_invalide'
  | 'siret_invalide';

export class ErreurPii extends Error {
  constructor(
    readonly motif: MotifPii,
    message: string
  ) {
    super(`${motif} : ${message}`);
    this.name = new.target.name;
  }
}

/** Le lien d'un bloc : le modèle, le champ (la colonne `…Chiffre`) et l'identifiant de la ligne. */
export interface LignePii {
  readonly modele: string;
  readonly champ: string;
  readonly id: string;
}

const decrire = (ligne: LignePii): string => `${ligne.modele}.${ligne.champ} (id ${ligne.id})`;

/** Version inconnue ou bloc trop court : ce n'est pas un bloc de ce format. */
export class BlocIllisiblePii extends ErreurPii {
  constructor(ligne: LignePii) {
    super('bloc_illisible', `${decrire(ligne)} ne porte pas un bloc au format version 1`);
  }
}

/** Le `kid` du bloc n'est pas celui de la clé présentée : distinct d'un échec d'authentification. */
export class CleInconnuePii extends ErreurPii {
  constructor(ligne: LignePii) {
    super('cle_inconnue', `${decrire(ligne)} a été chiffré sous une autre clé`);
  }
}

/** L'étiquette GCM ne s'authentifie pas sous l'AAD de CETTE ligne et de CE champ. */
export class EchecAuthentificationPii extends ErreurPii {
  readonly modele: string;
  readonly champ: string;
  readonly id: string;
  constructor(ligne: LignePii) {
    super(
      'echec_authentification',
      `${decrire(ligne)} : le bloc ne s'authentifie pas sous cette ligne et ce champ`
    );
    this.modele = ligne.modele;
    this.champ = ligne.champ;
    this.id = ligne.id;
  }
}

/** Un environnement que `lireEnvironnement` refuse : jamais un repli, jamais une clé devinée. */
export class CleInvalidePii extends ErreurPii {
  constructor(message: string) {
    super('cle_invalide', message);
  }
}

/** Une entrée hors forme : refusée par un motif nommé, sans que le message la porte. */
export class EntreeRefuseePii extends ErreurPii {}

// ── les clés : trois usages, trois secrets de src/lib/env.ts ─────────────────────────────────────────────

/** La clé de chiffrement : 32 octets, et son `kid` (`kidDe` de sa valeur hexadécimale). */
export interface CleChiffrementPii {
  readonly octets: Uint8Array;
  readonly kid: string;
}

declare const marqueDesCles: unique symbol;
export type ClesPii = {
  readonly chiffrement: CleChiffrementPii;
  /** PII_HASH_KEY : les empreintes de recherche, et rien d'autre. */
  readonly empreintes: string;
  /** IP_HASH_SALT : l'empreinte d'adresse réseau, et rien d'autre. */
  readonly adresses: string;
} & { readonly [marqueDesCles]: 'ClesPii' };

/**
 * Les clés, tirées d'un environnement que `lireEnvironnement` a jugé en ENTIER. Un refus lève `CleInvalidePii`
 * qui nomme les variables et leurs motifs (`formaterRefus`), jamais une valeur.
 */
export function clesPii(source: Readonly<Record<string, string | undefined>>): ClesPii {
  const lu = lireEnvironnement(source);
  if (!lu.ok) {
    throw new CleInvalidePii(
      `environnement refusé par src/lib/env.ts — ${lu.refus.map(formaterRefus).join(' ; ')}`
    );
  }
  const { PII_ENCRYPTION_KEY, PII_HASH_KEY, IP_HASH_SALT } = lu.env;
  const cles: Omit<ClesPii, typeof marqueDesCles> = {
    chiffrement: {
      octets: Uint8Array.from(Buffer.from(PII_ENCRYPTION_KEY, 'hex')),
      kid: kidDe(PII_ENCRYPTION_KEY),
    },
    empreintes: PII_HASH_KEY,
    adresses: IP_HASH_SALT,
  };
  // La marque n'existe qu'au typage : SEULE cette fonction la pose.
  return cles as ClesPii;
}

// ── le chiffrement ───────────────────────────────────────────────────────────────────────────────

const VERSION_FORMAT = 1;
const ALGORITHME = 'aes-256-gcm';
const OCTETS_KID = 4;
const OCTETS_IV = 12;
const OCTETS_ETIQUETTE = 16;
const DEBUT_KID = 1;
const DEBUT_IV = DEBUT_KID + OCTETS_KID;
const DEBUT_ETIQUETTE = DEBUT_IV + OCTETS_IV;
const DEBUT_CHIFFRE = DEBUT_ETIQUETTE + OCTETS_ETIQUETTE;

const exigerLigne = (ligne: { modele: string; id: string; champ?: string }): void => {
  if (ligne.modele === '' || ligne.id === '' || ligne.champ === '') {
    throw new EntreeRefuseePii(
      'ligne_incomplete',
      'le modèle, le champ et l’identifiant de la ligne sont tous exigés'
    );
  }
};

const donneeAuthentifiee = (ligne: LignePii): Buffer =>
  Buffer.from(
    JSON.stringify(['partners.pii', VERSION_FORMAT, ligne.modele, ligne.champ, ligne.id]),
    'utf8'
  );

/** Chiffre `clair` pour CETTE ligne et CE champ. Un IV neuf à chaque appel. */
export function encryptPii(ligne: LignePii, clair: string, cles: ClesPii): Uint8Array {
  exigerLigne(ligne);
  const { octets, kid } = cles.chiffrement;
  const iv = randomBytes(OCTETS_IV);
  const chiffreur = createCipheriv(ALGORITHME, octets, iv, { authTagLength: OCTETS_ETIQUETTE });
  chiffreur.setAAD(donneeAuthentifiee(ligne));
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([VERSION_FORMAT]),
      Buffer.from(kid, 'hex'),
      iv,
      chiffreur.getAuthTag(),
      chiffre,
    ])
  );
}

/**
 * Déchiffre un bloc présenté pour CETTE ligne et CE champ. Un bloc d'une autre ligne, d'un autre
 * champ ou d'un autre modèle, ou altéré d'un seul bit, lève `EchecAuthentificationPii`.
 */
export function decryptPii(ligne: LignePii, bloc: Uint8Array, cles: ClesPii): string {
  exigerLigne(ligne);
  const { octets: cle, kid } = cles.chiffrement;
  const octets = Buffer.from(bloc);
  if (octets.length < DEBUT_CHIFFRE || octets[0] !== VERSION_FORMAT) {
    throw new BlocIllisiblePii(ligne);
  }
  if (octets.subarray(DEBUT_KID, DEBUT_IV).toString('hex') !== kid) {
    throw new CleInconnuePii(ligne);
  }
  const iv = octets.subarray(DEBUT_IV, DEBUT_ETIQUETTE);
  const dechiffreur = createDecipheriv(ALGORITHME, cle, iv, { authTagLength: OCTETS_ETIQUETTE });
  dechiffreur.setAAD(donneeAuthentifiee(ligne));
  dechiffreur.setAuthTag(octets.subarray(DEBUT_ETIQUETTE, DEBUT_CHIFFRE));
  try {
    return Buffer.concat([
      dechiffreur.update(octets.subarray(DEBUT_CHIFFRE)),
      dechiffreur.final(),
    ]).toString('utf8');
  } catch {
    throw new EchecAuthentificationPii(ligne);
  }
}

// ── les empreintes de recherche ──────────────────────────────────────────────────────────────────

const refus = (motif: MotifPii, quoi: string): EntreeRefuseePii =>
  new EntreeRefuseePii(motif, `${quoi} hors forme : aucune empreinte n'est calculée`);

/** Courriel : bords retirés, forme NFC, minuscules ; une seule arobase entre deux parties. */
const FORME_COURRIEL = /^[^@\s]+@[^@\s]+$/;
const normaliserCourriel = (valeur: string): string => {
  const normalise = valeur.trim().normalize('NFC').toLowerCase();
  if (!FORME_COURRIEL.test(normalise)) throw refus('courriel_invalide', 'le courriel');
  return normalise;
};

/** Séparateurs admis dans un numéro écrit à la main ; tout autre caractère est un refus. */
const SEPARATEURS_TELEPHONE = /[\s.\-()]/g;
/** E.164 : un indicatif qui ne commence pas par 0, quinze chiffres au plus. */
const FORME_E164 = /^[1-9]\d{1,14}$/;
/** Numéro national français : dix chiffres, le premier est le 0 du préfixe. */
const FORME_NATIONALE_FR = /^0\d{9}$/;
const INDICATIF_FR = '33';

/**
 * Téléphone : `+` ou `00` → international ; un numéro national français de dix chiffres → `+33` et
 * ses neuf derniers chiffres. Le 0 du préfixe gardé après +33 (« +33 (0)6… ») est refusé : il
 * donnerait une seconde empreinte au même numéro.
 */
const normaliserTelephone = (valeur: string): string => {
  const compact = valeur.replace(SEPARATEURS_TELEPHONE, '');
  const international = compact.startsWith('+')
    ? compact.slice(1)
    : compact.startsWith('00')
      ? compact.slice(2)
      : FORME_NATIONALE_FR.test(compact)
        ? `${INDICATIF_FR}${compact.slice(1)}`
        : null;
  if (
    international === null ||
    !FORME_E164.test(international) ||
    international.startsWith(`${INDICATIF_FR}0`)
  ) {
    throw refus('telephone_invalide', 'le téléphone');
  }
  return `+${international}`;
};

/** IBAN : sans espaces, en majuscules, et sa clé de contrôle vérifiée par la règle du dépôt. */
const normaliserIban = (valeur: string): string => {
  const normalise = valeur.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]+$/.test(normalise) || !cleIbanValide(normalise)) {
    throw refus('iban_invalide', 'l’IBAN');
  }
  return normalise;
};

/** SIRET : quatorze chiffres exactement, espaces retirés. */
const normaliserSiret = (valeur: string): string => {
  const normalise = valeur.replace(/\s/g, '');
  if (!/^\d{14}$/.test(normalise)) throw refus('siret_invalide', 'le SIRET');
  return normalise;
};

/** La SOURCE des types d'empreinte : le type se dérive de ses clés, jamais d'une liste tapée. */
const NORMALISATIONS = {
  courriel: normaliserCourriel,
  telephone: normaliserTelephone,
  iban: normaliserIban,
  siret: normaliserSiret,
} satisfies Record<string, (valeur: string) => string>;

export type TypeEmpreinte = keyof typeof NORMALISATIONS;
/** Les types d'empreinte, dérivés : la garde `securite:schema-pii` reconnaît `siretHash` par eux. */
export const TYPES_EMPREINTE = Object.keys(NORMALISATIONS) as readonly TypeEmpreinte[];

/**
 * L'empreinte de recherche d'une valeur de type `type` : HMAC-SHA256 sous PII_HASH_KEY, entrée
 * séparée par domaine — une même chaîne donne deux empreintes selon son type. Forme `HASH_HEX_64`.
 */
export function empreinteRecherche(type: TypeEmpreinte, valeur: string, cles: ClesPii): string {
  const normalise = NORMALISATIONS[type](valeur);
  return createHmac('sha256', cles.empreintes)
    .update(['partners.empreinte.v1', type, normalise].join('\u001f'), 'utf8')
    .digest('hex');
}

/**
 * L'empreinte d'une adresse réseau, sous IP_HASH_SALT : LA primitive de la frontière, appelée avec
 * la clé de son usage. L'adresse est le sujet que rend `adresseDuClient` (IPv4, ou /64 d'IPv6).
 * Aucune adresse réseau n'est stockée autrement.
 */
export function empreinteAdresseReseau(adresse: string, cles: ClesPii): string {
  return empreinteAdresse(adresse, cles.adresses);
}

// ── le chemin d'écriture ─────────────────────────────────────────────────────────────────────────

/**
 * Les champs de personne de REQ-SEC-024 : leur colonne chiffrée, et pour ceux qu'on recherche,
 * leur colonne d'empreinte (noms fixés par l'exigence) et son type. Le SIRET n'a qu'une empreinte :
 * `empreinteRecherche('siret', …)`.
 */
export const CHAMPS_PII = {
  nom: { chiffre: 'nomChiffre' },
  prenom: { chiffre: 'prenomChiffre' },
  email: { chiffre: 'emailChiffre', empreinte: 'emailHash', type: 'courriel' },
  telephone: { chiffre: 'telephoneChiffre', empreinte: 'phoneHash', type: 'telephone' },
  iban: { chiffre: 'ibanChiffre', empreinte: 'ibanHash', type: 'iban' },
} as const satisfies Record<
  string,
  { chiffre: string } | { chiffre: string; empreinte: string; type: TypeEmpreinte }
>;

type ChampsPii = typeof CHAMPS_PII;
export type ChampPii = keyof ChampsPii;
/** Un clair par champ ; `null` efface le bloc ET l'empreinte ; absent, rien n'est écrit. */
export type ClairsPii = { readonly [C in ChampPii]?: string | null };
type ColonneEmpreinte = Extract<ChampsPii[ChampPii], { empreinte: string }>['empreinte'];
type ColonneChiffree = ChampsPii[ChampPii]['chiffre'];
export type ColonnesPii = { id: string } & { [C in ColonneChiffree]?: Uint8Array | null } & {
  [C in ColonneEmpreinte]?: string | null;
};

/**
 * Les colonnes d'une ligne de personne, prêtes à étaler dans `data` : l'identifiant auquel les
 * blocs sont liés, un bloc par champ fourni, l'empreinte des champs recherchés. Jamais un clair.
 */
export function colonnesPii(
  ligne: { readonly modele: string; readonly id: string },
  clairs: ClairsPii,
  cles: ClesPii
): ColonnesPii {
  exigerLigne(ligne);
  const sortie: Record<string, string | Uint8Array | null> = { id: ligne.id };
  for (const [champ, clair] of Object.entries(clairs) as [ChampPii, string | null | undefined][]) {
    if (clair === undefined) continue;
    const def: ChampsPii[ChampPii] = CHAMPS_PII[champ];
    sortie[def.chiffre] =
      clair === null ? null : encryptPii({ ...ligne, champ: def.chiffre }, clair, cles);
    if ('empreinte' in def) {
      sortie[def.empreinte] = clair === null ? null : empreinteRecherche(def.type, clair, cles);
    }
  }
  return sortie as ColonnesPii;
}
