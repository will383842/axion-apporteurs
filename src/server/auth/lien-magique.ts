/**
 * lien-magique.ts — le lien magique de connexion de l'espace apporteur (SEC-03).
 *
 * TROIS RÈGLES, ET CE QUI LES TIENT.
 *  1. La réponse à une demande ne peut pas dépendre de l'existence du compte parce que le compte
 *     n'est PAS CONSULTÉ avant la réponse : `demanderLien` fait les mêmes appels pour toute
 *     adresse, puis confie à `planifier` (en production, `after()`) tout ce qui dépend du compte.
 *  2. Un lien ne s'ouvre qu'une fois : sa consommation est UNE écriture conditionnelle, dont la
 *     condition est portée par ce module (`conditionDeConsommation`) ; jamais un lire-puis-écrire.
 *  3. Seule l'empreinte du jeton est stockée : HMAC-SHA-256 sous le secret des liens, séparée par
 *     domaine, avec le `kid` de ce secret. Un accès en écriture à la base ne fabrique pas un lien.
 *     La session ouverte suit la même règle sous SON secret (`SESSION_SECRET`) et SON domaine :
 *     jamais la clé des empreintes de données personnelles.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ET AUCUN CADRICIEL ICI : clés, horloge, compteurs, dépôts et envoi
 * entrent par des ports. L'action serveur les câble ; les tests les simulent.
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { DUREES_AUTH } from './durees';
import { peutOuvrirLEspace } from '../../domain/apporteur/acces-espace';

// ── le jeton et son empreinte ────────────────────────────────────────────────────────────────────

const OCTETS_JETON = 32;

// Le motif et les domaines vivent DANS les fonctions qui les lisent, jamais en constantes de module :
// une constante est évaluée au chargement, avant toute activation d'un mutant, et Stryker y laisse
// survivre un mutant que chaque test tuerait (mesuré sur SEC-04, puis sur SEC-17). Une chaîne se
// hache en UTF-8 par défaut : l'encodage n'est pas écrit, il ne ferait qu'un mutant équivalent.

/** 32 octets en base64url sans remplissage : 43 caractères, ni plus ni moins. */
function aLaFormeDUnJeton(jeton: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(jeton);
}

export function tirerJeton(): string {
  return randomBytes(OCTETS_JETON).toString('base64url');
}

export function empreinteDuJeton(jeton: string, secret: string): string {
  return createHmac('sha256', secret).update(`partners.lien.v1\u001f${jeton}`).digest('hex');
}

export function empreinteDeSession(jeton: string, secret: string): string {
  return createHmac('sha256', secret).update(`partners.session.v1\u001f${jeton}`).digest('hex');
}

// ── le code à six chiffres (SEC-54) ──────────────────────────────────────────────────────────────
//
// LE CODE EST LE LIEN (lentille sécurité, point 1) : une seconde forme du MÊME lien, posée à son
// émission, qui vit et meurt avec lui (expiration, consommation, annulation) et n'a pas de durée
// propre (point b). Il n'est stocké qu'en empreinte, sous le secret des liens, domaine
// `partners.code.v1` (partners/ADR-0013, décision 14).

/** Le nombre d'essais d'un lien : la borne du CHECK et du déclencheur `liens_magiques_code_fige`. */
export const ESSAIS_DU_CODE_MAX = 5;

/** Six chiffres ASCII, rien d'autre : se juge AVANT toute recherche du lien (point a). */
export function codeBienForme(saisi: string): boolean {
  return /^[0-9]{6}$/.test(saisi);
}

/**
 * Un code de six chiffres, zéros de tête compris. `tirage` rend un entier de [0, 1 000 000) :
 * `randomInt`, uniforme et sans biais de modulo ; injectable pour les témoins, et borné ici.
 */
export function tirerCode(tirage: () => number = () => randomInt(0, 1_000_000)): string {
  const n = tirage();
  if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new Error(`code_hors_borne : ${n}`);
  return String(n).padStart(6, '0');
}

export function empreinteDuCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(`partners.code.v1\u001f${code}`).digest('hex');
}

/**
 * Deux empreintes comparées à TEMPS CONSTANT (point 4), sur des tampons de 32 octets. Une empreinte
 * absente ou abîmée est remplacée par une empreinte FACTICE de même longueur : la comparaison a
 * lieu quand même, et son résultat est écarté (point 3).
 */
function memeEmpreinte(calculee: string, attendue: string | null): boolean {
  const lisible = attendue !== null && /^[0-9a-f]{64}$/.test(attendue);
  const a = Buffer.from(calculee, 'hex');
  const b = Buffer.from(lisible ? attendue : '0'.repeat(64), 'hex');
  return timingSafeEqual(a, b) && lisible;
}

// ── les états rendus ─────────────────────────────────────────────────────────────────────────────

/** Les états d'une demande : une liste FERMÉE, que l'écran relit pour n'afficher qu'eux. */
export const ETATS_DE_DEMANDE = ['envoye', 'suspendu', 'indisponible', 'adresse_invalide'] as const;
export type EtatDeDemande = (typeof ETATS_DE_DEMANDE)[number];
/** Les issues d'une consommation, dans le même ordre que `ResultatDeConsommation`. */
export const ETATS_DE_CONSOMMATION = ['ouverte', 'lien_invalide'] as const;
export type EtatDeConsommation = (typeof ETATS_DE_CONSOMMATION)[number];

/**
 * Lit un état reçu de l'extérieur (une URL) : un état de la liste, ou `null`. L'appartenance suffit :
 * `includes` compare à l'identique, et aucune valeur qui n'est pas une chaîne n'égale un état.
 */
export function etatLu<E extends string>(liste: readonly E[], valeur: unknown): E | null {
  return (liste as readonly unknown[]).includes(valeur) ? (valeur as E) : null;
}
export type ResultatDeConsommation =
  { etat: 'ouverte'; jetonSession: string } | { etat: 'lien_invalide' };

// ── les ports ────────────────────────────────────────────────────────────────────────────────────

export interface ConfigurationDuLien {
  /** Le secret des liens (MAGIC_LINK_SECRET) et son `kid`. */
  readonly secret: string;
  readonly kid: string;
  /** L'adresse publique du service : la seule origine d'une URL envoyée. */
  readonly urlPublique: string;
  /** Le secret des sessions (SESSION_SECRET) et son `kid`. */
  readonly session: { readonly secret: string; readonly kid: string };
}

export interface VerdictDeLimite {
  readonly autorise: boolean;
  readonly panne: boolean;
}

export interface NouveauLien {
  apporteurId: string;
  tokenHash: string;
  /** L'empreinte du code à six chiffres, posée à l'émission (SEC-54). */
  codeHash: string;
  kid: string;
  creeAt: Date;
  expireAt: Date;
}

/** Une ligne de `sessions_espace` : l'empreinte du jeton de session, jamais le jeton. */
export interface NouvelleSession {
  apporteurId: string;
  lienMagiqueId: string;
  tokenHash: string;
  kid: string;
  ipHash: string | null;
  creeAt: Date;
  expireAt: Date;
}

/** Tout ce qui dépend du compte : n'est appelé qu'APRÈS la réponse. */
export interface PortsDEmission {
  trouverApporteur(emailHash: string): Promise<{ id: string; statut: string } | null>;
  /** L'adresse déchiffrée du compte : c'est à elle, jamais à la saisie, que le lien part. */
  adresseStockee(apporteurId: string): Promise<string>;
  annulerLiensActifs(apporteurId: string, maintenant: Date): Promise<void>;
  insererLien(lien: NouveauLien): Promise<void>;
  /** Le code part dans le MÊME courriel que l'URL : il n'est écrit nulle part ailleurs. */
  envoyer(message: { a: string; url: string; code: string; expireAt: Date }): Promise<void>;
  signalerPotDeMiel(signal: {
    formulaire: 'connexion';
    adresseHash: string;
    survenuAt: Date;
  }): Promise<void>;
  signalerEchec(motif: 'travail_differe_echoue'): void;
}

export interface PortsDeDemande {
  maintenant(): Date;
  adresseDuClient(entetes: Headers): string | null;
  empreinteAdresseReseau(adresse: string): string;
  /** L'empreinte de recherche du courriel saisi, ou `null` s'il est hors forme. */
  empreinteCourriel(saisie: string): string | null;
  /**
   * Les deux compteurs de REQ-SEC-002, un port chacun : le NOM du compteur ne vit qu'au registre
   * (`src/server/securite/rate-limit.ts`) et dans l'appel direct que câble l'action serveur.
   */
  compterAdresse(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  compterCourriel(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  /** Exécute le travail une fois la réponse partie. */
  planifier(travail: () => Promise<void>): void;
  emission: PortsDEmission;
  configuration: ConfigurationDuLien;
}

// ── la demande ───────────────────────────────────────────────────────────────────────────────────

export interface RequeteDeLien {
  saisie: string;
  /** Le champ piège a été rempli. */
  piege: boolean;
  entetes: Headers;
}

/** Une déclaration de fonction, pas une constante fléchée : évaluée à l'appel (voir plus haut). */
function refusDe(v: VerdictDeLimite): EtatDeDemande | null {
  return v.autorise ? null : v.panne ? 'indisponible' : 'suspendu';
}

export async function demanderLien(
  requete: RequeteDeLien,
  ports: PortsDeDemande
): Promise<EtatDeDemande> {
  const maintenant = ports.maintenant();
  try {
    const adresse = ports.adresseDuClient(requete.entetes);
    if (adresse === null) return 'indisponible';
    const adresseHash = ports.empreinteAdresseReseau(adresse);
    const parAdresse = refusDe(await ports.compterAdresse(adresseHash, maintenant.getTime()));
    if (parAdresse) return parAdresse;

    const emailHash = ports.empreinteCourriel(requete.saisie);
    if (emailHash === null) return 'adresse_invalide';
    const parCourriel = refusDe(await ports.compterCourriel(emailHash, maintenant.getTime()));
    if (parCourriel) return parCourriel;

    // Le piège et le nominal ne divergent qu'ICI, dans le travail différé.
    ports.planifier(async () => {
      try {
        await (requete.piege
          ? ports.emission.signalerPotDeMiel({
              formulaire: 'connexion',
              adresseHash,
              survenuAt: maintenant,
            })
          : emettreLien(emailHash, maintenant, ports));
      } catch {
        ports.emission.signalerEchec('travail_differe_echoue');
      }
    });
    return 'envoye';
  } catch {
    return 'indisponible';
  }
}

/** Le travail différé : tout ce qui dépend du compte. */
async function emettreLien(
  emailHash: string,
  maintenant: Date,
  { emission, configuration }: PortsDeDemande
): Promise<void> {
  const compte = await emission.trouverApporteur(emailHash);
  if (compte === null || !peutOuvrirLEspace(compte.statut)) return;
  const jeton = tirerJeton();
  const code = tirerCode();
  const expireAt = new Date(maintenant.getTime() + DUREES_AUTH.lienMagiqueMs.valeur);
  await emission.annulerLiensActifs(compte.id, maintenant);
  await emission.insererLien({
    apporteurId: compte.id,
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    codeHash: empreinteDuCode(code, configuration.secret),
    kid: configuration.kid,
    creeAt: maintenant,
    expireAt,
  });
  const a = await emission.adresseStockee(compte.id);
  await emission.envoyer({
    a,
    url: `${configuration.urlPublique}/connexion/${jeton}`,
    code,
    expireAt,
  });
}

// ── la consommation ──────────────────────────────────────────────────────────────────────────────

/** La condition d'UNE écriture : le lien existe, n'est ni consommé, ni annulé, ni expiré. */
export interface ConditionDeConsommation {
  tokenHash: string;
  consommeAt?: null;
  annuleAt?: null;
  expireAt?: { gt: Date };
}

export function conditionDeConsommation(
  tokenHash: string,
  maintenant: Date
): ConditionDeConsommation {
  return { tokenHash, consommeAt: null, annuleAt: null, expireAt: { gt: maintenant } };
}

export interface TransactionDeConsommation {
  /** `updateMany` conditionnel : rend le nombre de lignes écrites. */
  consommer(condition: ConditionDeConsommation, donnees: { consommeAt: Date }): Promise<number>;
  /** Le lien et sa POPULATION : `apporteurId` nul pour un lien de la console (SEC-17). */
  lireLien(
    tokenHash: string
  ): Promise<{ id: string; apporteurId: string | null; kid: string } | null>;
  statutApporteur(apporteurId: string): Promise<string | null>;
  /** Enregistre une session neuve. */
  ouvrirSession(s: NouvelleSession): Promise<void>;
}

export interface PortsDeConsommation {
  maintenant(): Date;
  transaction<T>(travail: (tx: TransactionDeConsommation) => Promise<T>): Promise<T>;
  configuration: ConfigurationDuLien;
}

const INVALIDE = { etat: 'lien_invalide' } as const;

export async function consommerLien(
  entree: { jeton: string; ipHash: string | null },
  ports: PortsDeConsommation
): Promise<ResultatDeConsommation> {
  if (!aLaFormeDUnJeton(entree.jeton)) return INVALIDE;
  const tokenHash = empreinteDuJeton(entree.jeton, ports.configuration.secret);
  const maintenant = ports.maintenant();
  return ports.transaction(async (tx) => {
    const ecrites = await tx.consommer(conditionDeConsommation(tokenHash, maintenant), {
      consommeAt: maintenant,
    });
    if (ecrites !== 1) return INVALIDE;
    const lien = await tx.lireLien(tokenHash);
    if (lien === null || lien.kid !== ports.configuration.kid) return INVALIDE;
    // Un lien de la CONSOLE ne s'ouvre pas ici : l'espace n'ouvre de session qu'à un apporteur.
    if (lien.apporteurId === null) return INVALIDE;
    const jetonSession = await ouvrirLaSession(
      tx,
      { id: lien.id, apporteurId: lien.apporteurId },
      { maintenant, ipHash: entree.ipHash, configuration: ports.configuration }
    );
    return jetonSession === null ? INVALIDE : { etat: 'ouverte', jetonSession };
  });
}

/**
 * La session ouverte par un lien CONSOMMÉ, par le clic ou par le code (SEC-54, point 8) : UNE
 * fonction, donc même rotation, même empreinte, même durée, `lien_magique_id` unique. Rend le jeton
 * de session, ou `null` si l'apporteur ne peut pas ouvrir l'espace.
 */
async function ouvrirLaSession(
  tx: Pick<TransactionDeConsommation, 'statutApporteur' | 'ouvrirSession'>,
  lien: { id: string; apporteurId: string },
  o: { maintenant: Date; ipHash: string | null; configuration: ConfigurationDuLien }
): Promise<string | null> {
  const statut = await tx.statutApporteur(lien.apporteurId);
  // Un apporteur introuvable (`null`) est jugé par le prédicat, fermé comme un statut inconnu.
  if (!peutOuvrirLEspace(statut)) return null;
  const jetonSession = tirerJeton();
  const { secret, kid } = o.configuration.session;
  await tx.ouvrirSession({
    apporteurId: lien.apporteurId,
    lienMagiqueId: lien.id,
    tokenHash: empreinteDeSession(jetonSession, secret),
    kid,
    ipHash: o.ipHash,
    creeAt: o.maintenant,
    expireAt: new Date(o.maintenant.getTime() + DUREES_AUTH.sessionMs.valeur),
  });
  return jetonSession;
}

// ── la vérification du code (SEC-54) ─────────────────────────────────────────────────────────────

/** Les issues de la vérification : une liste FERMÉE ; `debit` se rend avec le statut 429. */
export const ETATS_DU_CODE = ['ouverte', 'code_refuse', 'debit'] as const;
export type EtatDuCode = (typeof ETATS_DU_CODE)[number];
export type ResultatDuCode =
  { etat: 'ouverte'; jetonSession: string } | { etat: 'code_refuse' } | { etat: 'debit' };

/** Les motifs écrits au journal (point 7) : fermés, sans rien de la personne. */
export type MotifDuCode = 'code_refuse' | 'code_epuise' | 'debit';

export interface TransactionDuCode extends Pick<
  TransactionDeConsommation,
  'statutApporteur' | 'ouvrirSession'
> {
  /**
   * Le SEUL lien actif le plus récent de l'apporteur dont l'empreinte de courriel est donnée :
   * population apporteur, non consommé, non annulé, non expiré, portant un code (point 2).
   */
  lienActifDe(
    emailHash: string,
    maintenant: Date
  ): Promise<{ id: string; apporteurId: string; kid: string } | null>;
  /**
   * L'essai COMPTÉ AVANT la comparaison, en UNE instruction (point 5) : `tentatives_code + 1` sous la
   * condition d'un lien encore actif et de moins de cinq essais ; rend l'empreinte et le compte
   * après l'essai, ou `null` si la condition ne tient plus.
   */
  compterEssai(
    lienId: string,
    maintenant: Date
  ): Promise<{ codeHash: string | null; tentatives: number } | null>;
  /** Annule le lien au cinquième échec : le clic ne marche plus non plus. */
  annulerLien(lienId: string, maintenant: Date): Promise<void>;
  /** Consomme le lien par son identifiant, sous la même condition que le clic. */
  consommerParId(lienId: string, maintenant: Date): Promise<number>;
}

export interface PortsDuCode {
  maintenant(): Date;
  adresseDuClient(entetes: Headers): string | null;
  empreinteAdresseReseau(adresse: string): string;
  /** L'empreinte de recherche du courriel saisi, normalisé comme à l'émission, ou `null`. */
  empreinteCourriel(saisie: string): string | null;
  /** Les deux compteurs de la vérification (point 6), un port chacun. */
  compterAdresseCode(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  compterCourrielCode(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  transaction<T>(travail: (tx: TransactionDuCode) => Promise<T>): Promise<T>;
  signaler(motif: MotifDuCode): void;
  configuration: ConfigurationDuLien;
}

/** Les réponses, construites à l'appel : une seule forme par issue, quel que soit le motif. */
function refuse(): ResultatDuCode {
  return { etat: 'code_refuse' };
}

export async function verifierLeCode(
  requete: { saisie: string; code: string; entetes: Headers },
  ports: PortsDuCode
): Promise<ResultatDuCode> {
  const maintenant = ports.maintenant();
  const debit = (): ResultatDuCode => {
    ports.signaler('debit');
    return { etat: 'debit' };
  };
  // (6) Le débit d'abord, par l'adresse réseau puis par l'adresse saisie ; en échec fermé.
  const adresse = ports.adresseDuClient(requete.entetes);
  if (adresse === null) return debit();
  const parAdresse = await ports.compterAdresseCode(
    ports.empreinteAdresseReseau(adresse),
    maintenant.getTime()
  );
  if (!parAdresse.autorise) return debit();
  const emailHash = ports.empreinteCourriel(requete.saisie);
  if (emailHash !== null) {
    const parCourriel = await ports.compterCourrielCode(emailHash, maintenant.getTime());
    if (!parCourriel.autorise) return debit();
  }
  // (a) La saisie mal formée : refusée AVANT toute recherche du lien, sans essai.
  if (emailHash === null || !codeBienForme(requete.code)) {
    ports.signaler('code_refuse');
    return refuse();
  }
  const calculee = empreinteDuCode(requete.code, ports.configuration.secret);
  return ports.transaction(async (tx) => {
    const lien = await tx.lienActifDe(emailHash, maintenant);
    // L'essai part dans TOUS les cas, pour que l'aller-retour en base ne dise rien de l'existence du
    // lien (lentille sécurité, 2026-10-03) : sur un identifiant FACTICE quand aucun lien valide
    // n'existe, que l'écriture conditionnelle ne trouve jamais.
    const valide = lien !== null && lien.kid === ports.configuration.kid;
    const essai = await tx.compterEssai(
      valide ? lien.id : '00000000-0000-0000-0000-000000000000',
      maintenant
    );
    // (3) et (4) : la comparaison a lieu dans TOUS les cas, factice si rien n'est attendu.
    const bon = memeEmpreinte(calculee, essai?.codeHash ?? null);
    if (lien === null || essai === null || !bon) {
      const epuise = lien !== null && essai !== null && essai.tentatives >= ESSAIS_DU_CODE_MAX;
      if (epuise) await tx.annulerLien(lien.id, maintenant);
      ports.signaler(epuise ? 'code_epuise' : 'code_refuse');
      return refuse();
    }
    if ((await tx.consommerParId(lien.id, maintenant)) !== 1) {
      ports.signaler('code_refuse');
      return refuse();
    }
    const jetonSession = await ouvrirLaSession(tx, lien, {
      maintenant,
      ipHash: ports.empreinteAdresseReseau(adresse),
      configuration: ports.configuration,
    });
    return jetonSession === null ? refuse() : { etat: 'ouverte', jetonSession };
  });
}
