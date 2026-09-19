/**
 * pii.ts — SEC-08 (REQ-SEC-024) : chiffrement des données personnelles lié à leur ligne et à leur
 * champ, empreintes de recherche, empreinte tronquée de l'adresse réseau.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ICI : chaque clé entre en PARAMÈTRE. Le câblage aux secrets validés
 * au démarrage (PII_ENCRYPTION_KEY, PII_HASH_KEY, IP_HASH_SALT — trois clés, trois usages, aucune
 * dérivation) et le `kid` calculé par `kidDe` appartiennent à l'appelant. Recalculer le `kid` ici
 * serait recopier `kidDe` : il est donc FOURNI avec la clé, et seulement vérifié dans sa forme.
 *
 * Le format et les entrées des empreintes sont un CONTRAT : un octet changé rend illisibles, ou
 * introuvables, toutes les données déjà écrites. Ils suivent l'ADR du format de chiffrement
 * (« Secrets et données personnelles chiffrées ») ; les vecteurs figés du témoin les tiennent.
 *
 *   bloc     = 0x01 (version) ‖ kid (4 octets) ‖ IV (12) ‖ étiquette (16) ‖ chiffré
 *   AAD      = UTF-8 de JSON.stringify(["partners.pii", 1, modele, champ, id])
 *   empreinte de recherche = HMAC-SHA256(clé, "partners.empreinte.v1" ␟ type ␟ normalisé), 64 hex
 *   adresse réseau         = HMAC-SHA256(sel, "partners.ip.v1" ␟ normalisée), 16 premiers hex
 *
 * Aucun message d'erreur ne porte une valeur protégée : il nomme la ligne, le champ, un motif fermé.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

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
  | 'siret_invalide'
  | 'adresse_reseau_invalide';

export class ErreurPii extends Error {
  constructor(
    readonly motif: MotifPii,
    message: string
  ) {
    super(`${motif} : ${message}`);
    this.name = new.target.name;
  }
}

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

/** Une clé hors forme : jamais un repli, jamais une clé devinée. */
export class CleInvalidePii extends ErreurPii {
  constructor(message: string) {
    super('cle_invalide', message);
  }
}

/** Une entrée hors forme : refusée par un motif nommé, sans que le message la porte. */
export class EntreeRefuseePii extends ErreurPii {}

// ── le chiffrement ───────────────────────────────────────────────────────────────────────────────

/** La ligne et le champ auxquels un bloc est lié. */
export interface LignePii {
  readonly modele: string;
  readonly champ: string;
  readonly id: string;
}

/** La clé de chiffrement : 32 octets, et le `kid` que `kidDe` donne de sa valeur (8 hex). */
export interface CleChiffrementPii {
  readonly octets: Uint8Array;
  readonly kid: string;
}

const VERSION_FORMAT = 1;
const ALGORITHME = 'aes-256-gcm';
const OCTETS_CLE = 32;
const OCTETS_KID = 4;
const OCTETS_IV = 12;
const OCTETS_ETIQUETTE = 16;
const DEBUT_KID = 1;
const DEBUT_IV = DEBUT_KID + OCTETS_KID;
const DEBUT_ETIQUETTE = DEBUT_IV + OCTETS_IV;
const DEBUT_CHIFFRE = DEBUT_ETIQUETTE + OCTETS_ETIQUETTE;
const FORME_KID = new RegExp(`^[0-9a-f]{${OCTETS_KID * 2}}$`);

const decrire = (ligne: LignePii): string => `${ligne.modele}.${ligne.champ} (id ${ligne.id})`;

const exigerLigne = (ligne: LignePii): void => {
  if (ligne.modele === '' || ligne.champ === '' || ligne.id === '') {
    throw new EntreeRefuseePii(
      'ligne_incomplete',
      'le modèle, le champ et l’identifiant de la ligne sont tous exigés'
    );
  }
};

const exigerCle = (cle: CleChiffrementPii): void => {
  if (cle.octets.length !== OCTETS_CLE) {
    throw new CleInvalidePii(`la clé de chiffrement doit faire ${OCTETS_CLE} octets`);
  }
  if (!FORME_KID.test(cle.kid)) {
    throw new CleInvalidePii(
      `le kid doit faire ${OCTETS_KID * 2} caractères hexadécimaux minuscules`
    );
  }
};

const donneeAuthentifiee = (ligne: LignePii): Buffer =>
  Buffer.from(
    JSON.stringify(['partners.pii', VERSION_FORMAT, ligne.modele, ligne.champ, ligne.id]),
    'utf8'
  );

/** Chiffre `clair` pour CETTE ligne et CE champ. Un IV neuf à chaque appel. */
export function chiffrerPii(ligne: LignePii, clair: string, cle: CleChiffrementPii): Uint8Array {
  exigerLigne(ligne);
  exigerCle(cle);
  const iv = randomBytes(OCTETS_IV);
  const chiffreur = createCipheriv(ALGORITHME, cle.octets, iv, { authTagLength: OCTETS_ETIQUETTE });
  chiffreur.setAAD(donneeAuthentifiee(ligne));
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return Buffer.concat([
    Buffer.from([VERSION_FORMAT]),
    Buffer.from(cle.kid, 'hex'),
    iv,
    chiffreur.getAuthTag(),
    chiffre,
  ]);
}

/**
 * Déchiffre un bloc présenté pour CETTE ligne et CE champ. Un bloc d'une autre ligne, d'un autre
 * champ ou d'un autre modèle, ou altéré d'un seul bit, lève `EchecAuthentificationPii`.
 */
export function dechiffrerPii(ligne: LignePii, bloc: Uint8Array, cle: CleChiffrementPii): string {
  exigerLigne(ligne);
  exigerCle(cle);
  const octets = Buffer.from(bloc);
  if (octets.length < DEBUT_CHIFFRE || octets[0] !== VERSION_FORMAT) {
    throw new BlocIllisiblePii(ligne);
  }
  if (octets.subarray(DEBUT_KID, DEBUT_IV).toString('hex') !== cle.kid) {
    throw new CleInconnuePii(ligne);
  }
  const dechiffreur = createDecipheriv(
    ALGORITHME,
    cle.octets,
    octets.subarray(DEBUT_IV, DEBUT_ETIQUETTE),
    { authTagLength: OCTETS_ETIQUETTE }
  );
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

/** Courriel : bords retirés, forme NFC, minuscules. */
const normaliserCourriel = (valeur: string): string => {
  const normalise = valeur.trim().normalize('NFC').toLowerCase();
  if (normalise === '') throw refus('courriel_invalide', 'le courriel');
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
 * Téléphone : chiffres seuls, `00` → `+`, un numéro national français de dix chiffres → `+33` et
 * ses neuf derniers chiffres. Le 0 du préfixe gardé après +33 (« +33 (0)6… ») est refusé : il
 * donnerait une seconde empreinte au même numéro. Tout le reste est refusé (pas de bibliothèque
 * de numérotation).
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

/** IBAN : sans espaces, en majuscules, forme pays ‖ deux chiffres ‖ compte. La clé n'est pas jugée ici. */
const FORME_IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;
const normaliserIban = (valeur: string): string => {
  const normalise = valeur.replace(/\s/g, '').toUpperCase();
  if (!FORME_IBAN.test(normalise)) throw refus('iban_invalide', 'l’IBAN');
  return normalise;
};

/** SIRET : quatorze chiffres exactement, espaces retirés. */
const FORME_SIRET = /^\d{14}$/;
const normaliserSiret = (valeur: string): string => {
  const normalise = valeur.replace(/\s/g, '');
  if (!FORME_SIRET.test(normalise)) throw refus('siret_invalide', 'le SIRET');
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

const SEPARATEUR = '\u001f';

const exigerCleHmac = (cle: string, usage: string): void => {
  if (cle === '') throw new CleInvalidePii(`la clé ${usage} est vide`);
};

/**
 * L'empreinte de recherche d'une valeur de type `type` : HMAC-SHA256 sous la clé des empreintes,
 * entrée séparée par domaine — une même chaîne donne deux empreintes selon son type.
 */
export function empreinteRecherche(type: TypeEmpreinte, valeur: string, cle: string): string {
  exigerCleHmac(cle, 'des empreintes de recherche');
  const normalise = NORMALISATIONS[type](valeur);
  return createHmac('sha256', cle)
    .update(['partners.empreinte.v1', type, normalise].join(SEPARATEUR), 'utf8')
    .digest('hex');
}

// ── l'adresse réseau : une empreinte tronquée, jamais un clair, jamais un chiffré ────────────────

const CARACTERES_EMPREINTE_ADRESSE = 16;
const GROUPES_IPV6 = 8;
const GROUPES_PREFIXE_64 = 4;
/** `::ffff:a.b.c.d` : cinq groupes nuls puis `ffff`. */
const PREFIXE_ENCAPSULEE = [0, 0, 0, 0, 0, 0xffff];

/** Les huit groupes de 16 bits d'une adresse IPv6 déjà reconnue par `isIP`. */
const groupesIpv6 = (adresse: string): number[] => {
  const versGroupes = (partie: string): number[] =>
    partie === ''
      ? []
      : partie.split(':').flatMap((morceau) => {
          if (!morceau.includes('.')) return [parseInt(morceau, 16)];
          const [a = 0, b = 0, c = 0, d = 0] = morceau.split('.').map(Number);
          return [(a << 8) | b, (c << 8) | d];
        });
  const [gauche = '', droite] = adresse.split('::');
  const debut = versGroupes(gauche);
  if (droite === undefined) return debut;
  const fin = versGroupes(droite);
  return [...debut, ...Array<number>(GROUPES_IPV6 - debut.length - fin.length).fill(0), ...fin];
};

/**
 * L'adresse normalisée : IPv4 telle quelle ; IPv4 encapsulée dans IPv6 → l'IPv4 ; IPv6 → son
 * préfixe /64, écrit `g1:g2:g3:g4::/64` (hexadécimal minuscule, sans zéros de tête). Un même poste
 * change d'adresse IPv6 temporaire, pas de /64. L'identifiant de zone (`%eth0`) est retiré.
 */
const normaliserAdresseReseau = (valeur: string): string => {
  const version = isIP(valeur);
  if (version === 4) return valeur;
  if (version !== 6) throw refus('adresse_reseau_invalide', 'l’adresse réseau');
  const groupes = groupesIpv6(valeur.split('%')[0] ?? '');
  if (PREFIXE_ENCAPSULEE.every((g, i) => groupes[i] === g)) {
    const [haut = 0, bas = 0] = groupes.slice(PREFIXE_ENCAPSULEE.length);
    return [haut >> 8, haut & 0xff, bas >> 8, bas & 0xff].join('.');
  }
  return `${groupes
    .slice(0, GROUPES_PREFIXE_64)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
};

/**
 * L'empreinte d'une adresse réseau : HMAC-SHA256 sous le sel des adresses, tronquée à 64 bits.
 * Aucune adresse réseau n'est stockée autrement.
 */
export function empreinteAdresseReseau(adresse: string, sel: string): string {
  exigerCleHmac(sel, 'des adresses réseau');
  const normalisee = normaliserAdresseReseau(adresse);
  return createHmac('sha256', sel)
    .update(['partners.ip.v1', normalisee].join(SEPARATEUR), 'utf8')
    .digest('hex')
    .slice(0, CARACTERES_EMPREINTE_ADRESSE);
}
