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
import {
  aviserPuisConfirmer,
  cleDesAppareils,
  reconnaitreALaConsommation,
  type AppareilDeLaConnexion,
  type AppareilEnAttente,
  type DepotDAppareils,
  type PortsDesAppareils,
} from './appareil';

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

/**
 * SEC-29 : l'empreinte d'une session de la CONSOLE, sous un domaine DISTINCT de celui de l'espace
 * (lentille sécurité, condition b) : le jeton d'une population ne se lit jamais comme celui de
 * l'autre, même présenté dans le mauvais cookie.
 */
export function empreinteDeSessionConsole(jeton: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`partners.session-console.v1\u001f${jeton}`)
    .digest('hex');
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
export const ETATS_DE_CONSOMMATION = ['ouverte', 'lien_invalide', 'deja_utilise'] as const;
export type EtatDeConsommation = (typeof ETATS_DE_CONSOMMATION)[number];

/**
 * Lit un état reçu de l'extérieur (une URL) : un état de la liste, ou `null`. L'appartenance suffit :
 * `includes` compare à l'identique, et aucune valeur qui n'est pas une chaîne n'égale un état.
 */
export function etatLu<E extends string>(liste: readonly E[], valeur: unknown): E | null {
  return (liste as readonly unknown[]).includes(valeur) ? (valeur as E) : null;
}
/**
 * `appareil` (SEC-55) : présent quand le port des appareils est branché — l'identifiant à POSER dans
 * `__Host-partners-appareil` et l'issue (`connu`, `confirme`, `avis_echoue`, `non_confirme`).
 */
export type ResultatDeConsommation =
  | { etat: 'ouverte'; jetonSession: string; appareil?: AppareilDeLaConnexion }
  | { etat: 'lien_invalide' }
  | { etat: 'deja_utilise' };

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

/** SEC-29 : un lien de la CONSOLE ne porte que son utilisateur, jamais un apporteur. */
export interface NouveauLienConsole {
  utilisateurConsoleId: string;
  tokenHash: string;
  codeHash: string;
  kid: string;
  creeAt: Date;
  expireAt: Date;
}

/**
 * SEC-29 : une session de la CONSOLE. Son empreinte est sous le domaine de la console, sa durée
 * celle de la console, et sa dernière vue est posée à l'ouverture : l'inactivité se mesure dès elle.
 */
export interface NouvelleSessionConsole {
  utilisateurConsoleId: string;
  lienMagiqueId: string;
  tokenHash: string;
  kid: string;
  ipHash: string | null;
  creeAt: Date;
  expireAt: Date;
  derniereVueAt: Date;
}

/** Tout ce qui dépend du compte : n'est appelé qu'APRÈS la réponse. */
export interface PortsDEmission {
  trouverApporteur(emailHash: string): Promise<{ id: string; statut: string } | null>;
  /**
   * SEC-19 : les droits d'un RÉSILIÉ courent-ils (au moins une attribution `figee_resiliation`) ? Lu
   * seulement pour un résilié. Absent : aucun droit — défaut fermé.
   */
  droitsEnCours?(apporteurId: string): Promise<boolean>;
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

/**
 * SEC-29 : ce qui dépend du compte de la CONSOLE. Un utilisateur désactivé est trouvé, puis écarté
 * dans le travail différé : la réponse, partie avant, est la même (lentille sécurité, condition c).
 */
export interface PortsDEmissionConsole extends Pick<
  PortsDEmission,
  'adresseStockee' | 'annulerLiensActifs' | 'envoyer' | 'signalerPotDeMiel' | 'signalerEchec'
> {
  trouverUtilisateurConsole(
    emailHash: string
  ): Promise<{ id: string; desactiveAt: Date | null } | null>;
  insererLien(lien: NouveauLienConsole): Promise<void>;
}

export interface PortsDeDemandeConsole extends Omit<PortsDeDemande, 'emission'> {
  emission: PortsDEmissionConsole;
}

/** Ce que la demande partage entre les deux populations : tout sauf le travail qui dépend du compte. */
type PortsDeDemandeCommuns = Omit<PortsDeDemande, 'emission'> & {
  emission: Pick<PortsDEmission, 'signalerPotDeMiel' | 'signalerEchec'>;
};

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

export function demanderLien(
  requete: RequeteDeLien,
  ports: PortsDeDemande
): Promise<EtatDeDemande> {
  return demander(requete, ports, (emailHash, maintenant) =>
    emettreLien(emailHash, maintenant, ports)
  );
}

/** SEC-29 : la demande de la console, par le MÊME parcours que l'espace ; seul le travail diffère. */
export function demanderLienConsole(
  requete: RequeteDeLien,
  ports: PortsDeDemandeConsole
): Promise<EtatDeDemande> {
  return demander(requete, ports, (emailHash, maintenant) =>
    emettreLienConsole(emailHash, maintenant, ports)
  );
}

/**
 * Le parcours commun : débit, forme, réponse, puis le travail différé. `emettre` est le seul point
 * qui dépend de la population, et il ne s'exécute qu'après la réponse.
 */
async function demander(
  requete: RequeteDeLien,
  ports: PortsDeDemandeCommuns,
  emettre: (emailHash: string, maintenant: Date) => Promise<void>
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
          : emettre(emailHash, maintenant));
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
  if (compte === null) return;
  if (!(await ouvertureDuCompte(compte.statut, compte.id, emission.droitsEnCours?.bind(emission))))
    return;
  const l = tirerUnLien(maintenant, configuration);
  await emission.annulerLiensActifs(compte.id, maintenant);
  await emission.insererLien({ apporteurId: compte.id, ...l.ligne });
  const a = await emission.adresseStockee(compte.id);
  await emission.envoyer({
    a,
    url: `${configuration.urlPublique}/connexion/${l.jeton}`,
    code: l.code,
    expireAt: l.ligne.expireAt,
  });
}

/** SEC-29 : le travail différé de la console. Un utilisateur désactivé ne reçoit rien. */
async function emettreLienConsole(
  emailHash: string,
  maintenant: Date,
  { emission, configuration }: PortsDeDemandeConsole
): Promise<void> {
  const compte = await emission.trouverUtilisateurConsole(emailHash);
  if (compte === null || compte.desactiveAt !== null) return;
  const l = tirerUnLien(maintenant, configuration);
  await emission.annulerLiensActifs(compte.id, maintenant);
  await emission.insererLien({ utilisateurConsoleId: compte.id, ...l.ligne });
  const a = await emission.adresseStockee(compte.id);
  await emission.envoyer({
    a,
    url: `${configuration.urlPublique}/console/connexion/${l.jeton}`,
    code: l.code,
    expireAt: l.ligne.expireAt,
  });
}

/**
 * SEC-71 (contrat v2, art. 3.8) — le lien NEUF d'un apporteur CONNU, après la révocation de son accès.
 * Le MÊME tirage que la demande (`tirerUnLien` : jeton, code à six chiffres, empreintes HMAC, `kid`,
 * durée de vie de `DUREES_AUTH`), la MÊME URL que `emettreLien`. Rendus SÉPARÉS : la ligne (les seules
 * empreintes), que l'appelant insère dans sa transaction courte, et le message (le jeton et le code EN
 * MÉMOIRE), qu'il envoie hors transaction et n'écrit nulle part (sécurité, 6034536145, conditions 1 et 4).
 * Ni l'indistinction ni le parcours de demande ne changent : ce chemin ne reçoit aucune adresse saisie.
 */
export function lienDuRenouvellement(
  apporteurId: string,
  maintenant: Date,
  configuration: ConfigurationDuLien
): { ligne: NouveauLien; message: { url: string; code: string; expireAt: Date } } {
  const l = tirerUnLien(maintenant, configuration);
  return {
    ligne: { apporteurId, ...l.ligne },
    message: {
      url: `${configuration.urlPublique}/connexion/${l.jeton}`,
      code: l.code,
      expireAt: l.ligne.expireAt,
    },
  };
}

/** Le jeton, le code et la ligne d'un lien neuf : les mêmes pour les deux populations. */
function tirerUnLien(maintenant: Date, configuration: ConfigurationDuLien) {
  const jeton = tirerJeton();
  const code = tirerCode();
  return {
    jeton,
    code,
    ligne: {
      tokenHash: empreinteDuJeton(jeton, configuration.secret),
      codeHash: empreinteDuCode(code, configuration.secret),
      kid: configuration.kid,
      creeAt: maintenant,
      expireAt: new Date(maintenant.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
    },
  };
}

// ── la consommation ──────────────────────────────────────────────────────────────────────────────

/** La condition d'UNE écriture : le lien existe, n'est ni consommé, ni annulé, ni expiré. */
export interface ConditionDeConsommation {
  tokenHash: string;
  consommeAt?: null;
  annuleAt?: null;
  expireAt?: { gt: Date };
  /** SEC-29 : la population est jugée DANS l'écriture ; un lien de la console n'est pas consommé ici. */
  apporteurId?: { not: null };
}

export function conditionDeConsommation(
  tokenHash: string,
  maintenant: Date
): ConditionDeConsommation {
  return {
    tokenHash,
    consommeAt: null,
    annuleAt: null,
    expireAt: { gt: maintenant },
    apporteurId: { not: null },
  };
}

/** SEC-29 : la même condition pour un lien de la CONSOLE ; un lien de l'espace n'est pas consommé. */
export interface ConditionDeConsommationConsole {
  tokenHash: string;
  consommeAt: null;
  annuleAt: null;
  expireAt: { gt: Date };
  utilisateurConsoleId: { not: null };
}

export function conditionDeConsommationConsole(
  tokenHash: string,
  maintenant: Date
): ConditionDeConsommationConsole {
  return {
    tokenHash,
    consommeAt: null,
    annuleAt: null,
    expireAt: { gt: maintenant },
    utilisateurConsoleId: { not: null },
  };
}

export interface TransactionDeConsommation {
  /** `updateMany` conditionnel : rend le nombre de lignes écrites. */
  consommer(condition: ConditionDeConsommation, donnees: { consommeAt: Date }): Promise<number>;
  /** Le lien et sa POPULATION : `apporteurId` nul pour un lien de la console (SEC-17). */
  lireLien(
    tokenHash: string
  ): Promise<{ id: string; apporteurId: string | null; kid: string } | null>;
  /**
   * SEC-54 : le lien de l'espace, sous la clé courante, est-il DÉJÀ CONSOMMÉ ? Lu seulement quand la
   * consommation a échoué, pour dire « déjà utilisé » plutôt que « invalide ». Absent : « invalide ».
   */
  dejaConsomme?(tokenHash: string, kid: string): Promise<boolean>;
  statutApporteur(apporteurId: string): Promise<string | null>;
  /** SEC-19 : comme `PortsDEmission.droitsEnCours`, dans la transaction. Absent : aucun droit. */
  droitsEnCours?(apporteurId: string): Promise<boolean>;
  /** Enregistre une session neuve. */
  ouvrirSession(s: NouvelleSession): Promise<void>;
  /**
   * SEC-55 : le dépôt des appareils DANS la transaction, qui RECONNAÎT l'appareil connu et ne
   * confirme jamais ; exigé quand le port `appareils` est branché.
   */
  appareils?: DepotDAppareils;
}

export interface PortsDeConsommation {
  maintenant(): Date;
  transaction<T>(travail: (tx: TransactionDeConsommation) => Promise<T>): Promise<T>;
  configuration: ConfigurationDuLien;
  appareils?: PortsDesAppareils;
}

/** SEC-29 : la transaction de consommation d'un lien de la CONSOLE. */
export interface TransactionDeConsommationConsole {
  consommer(
    condition: ConditionDeConsommationConsole,
    donnees: { consommeAt: Date }
  ): Promise<number>;
  /** Le lien et sa population : `utilisateurConsoleId` nul pour un lien de l'espace. */
  lireLienConsole(
    tokenHash: string
  ): Promise<{ id: string; utilisateurConsoleId: string | null; kid: string } | null>;
  /** Le lien de la console, sous la clé courante, est-il déjà consommé ? Absent : « invalide ». */
  dejaConsommeConsole?(tokenHash: string, kid: string): Promise<boolean>;
  /**
   * Vrai seulement si l'utilisateur existe, n'est pas désactivé et, s'il n'est pas encore activé, si
   * son invitation vaut encore à `maintenant` (SEC-30) ; relu dans la transaction.
   */
  utilisateurActif(utilisateurConsoleId: string, maintenant: Date): Promise<boolean>;
  ouvrirSessionConsole(s: NouvelleSessionConsole): Promise<void>;
}

export interface PortsDeConsommationConsole {
  maintenant(): Date;
  transaction<T>(travail: (tx: TransactionDeConsommationConsole) => Promise<T>): Promise<T>;
  configuration: ConfigurationDuLien;
}

const INVALIDE = { etat: 'lien_invalide' } as const;

/** Les options d'ouverture d'une session, communes aux deux populations. */
interface OuvertureDeSession {
  maintenant: Date;
  ipHash: string | null;
  configuration: ConfigurationDuLien;
  /** SEC-55, espace seulement : l'identifiant lu sur la requête, quand le port est branché. */
  appareil?: { identifiantLu: unknown };
}

/**
 * Une session ouverte : son jeton, et l'appareil — reconnu (`appareil`), ou à confirmer APRÈS la
 * validation de la transaction (`enAttente`, qui ne sort jamais du noyau : il porte l'empreinte).
 */
interface SessionOuverteParLeLien {
  jetonSession: string;
  appareil?: AppareilDeLaConnexion;
  enAttente?: AppareilEnAttente;
}

/** SEC-55 : l'appareil lu sur la requête, et les ports qui le feront confirmer après la validation. */
interface AppareilDeLaRequete {
  identifiantLu: unknown;
  ports: PortsDesAppareils;
}

/** Le résultat « ouverte », sans champ d'appareil quand aucun appareil n'a été jugé. */
function ouverte(o: { jetonSession: string; appareil?: AppareilDeLaConnexion }): {
  etat: 'ouverte';
  jetonSession: string;
  appareil?: AppareilDeLaConnexion;
} {
  return o.appareil === undefined
    ? { etat: 'ouverte', jetonSession: o.jetonSession }
    : { etat: 'ouverte', jetonSession: o.jetonSession, appareil: o.appareil };
}

/**
 * SEC-55, APRÈS la validation de la transaction de la consommation (voie (b) de la lentille
 * sécurité) : l'appareil à confirmer est avisé HORS de toute transaction, puis confirmé par une
 * transaction courte (`aviserPuisConfirmer`). Rien ne se passe ici tant que la consommation n'a pas
 * été validée : une transaction annulée ne laisse partir aucun avis.
 */
async function apresLaValidation(
  o: SessionOuverteParLeLien,
  appareil: AppareilDeLaRequete | undefined,
  kidDeSession: string
): Promise<{ etat: 'ouverte'; jetonSession: string; appareil?: AppareilDeLaConnexion }> {
  if (o.enAttente === undefined || appareil === undefined) return ouverte(o);
  return ouverte({
    jetonSession: o.jetonSession,
    appareil: await aviserPuisConfirmer(o.enAttente, kidDeSession, appareil.ports),
  });
}

/**
 * La consommation commune aux deux populations : UNE écriture conditionnelle, puis la lecture du
 * lien et l'ouverture de la session. Seuls la condition, le « déjà consommé » et l'ouverture
 * dépendent de la population ; chacune juge la population dans sa condition ET à la lecture.
 */
async function consommer<Tx>(
  entree: { jeton: string; ipHash: string | null },
  ports: {
    maintenant(): Date;
    configuration: ConfigurationDuLien;
    transaction<T>(travail: (tx: Tx) => Promise<T>): Promise<T>;
  },
  population: {
    ecrire(tx: Tx, tokenHash: string, maintenant: Date): Promise<number>;
    dejaConsomme(tx: Tx, tokenHash: string, kid: string): Promise<boolean | undefined>;
    ouvrir(
      tx: Tx,
      tokenHash: string,
      o: OuvertureDeSession
    ): Promise<SessionOuverteParLeLien | null>;
  },
  appareil?: AppareilDeLaRequete
): Promise<ResultatDeConsommation> {
  if (!aLaFormeDUnJeton(entree.jeton)) return INVALIDE;
  const tokenHash = empreinteDuJeton(entree.jeton, ports.configuration.secret);
  const maintenant = ports.maintenant();
  const issue = await ports.transaction(async (tx) => {
    if ((await population.ecrire(tx, tokenHash, maintenant)) !== 1) {
      // SEC-54 : un lien DÉJÀ CONSOMMÉ (par le clic ou par le code) se dit comme tel ; tout autre
      // échec (inconnu, expiré, annulé, autre clé, autre population) reste « invalide ». Le jeton
      // est un secret de 256 bits : le dire déjà utilisé n'apprend rien d'un compte.
      const dejaUtilise =
        (await population.dejaConsomme(tx, tokenHash, ports.configuration.kid)) === true;
      return dejaUtilise ? ({ etat: 'deja_utilise' } as const) : INVALIDE;
    }
    const ouverture = await population.ouvrir(tx, tokenHash, {
      maintenant,
      ipHash: entree.ipHash,
      configuration: ports.configuration,
      appareil: appareil === undefined ? undefined : { identifiantLu: appareil.identifiantLu },
    });
    return ouverture ?? INVALIDE;
  });
  return 'etat' in issue
    ? issue
    : apresLaValidation(issue, appareil, ports.configuration.session.kid);
}

/** L'appareil de la requête, quand le port est branché : l'identifiant lu et les ports. */
function appareilDeLaRequete(
  identifiantLu: unknown,
  appareils: PortsDesAppareils | undefined
): AppareilDeLaRequete | undefined {
  return appareils === undefined ? undefined : { identifiantLu, ports: appareils };
}

export function consommerLien(
  /** `identifiantAppareil` (SEC-55) : la valeur du cookie `__Host-partners-appareil`, telle que lue. */
  entree: { jeton: string; ipHash: string | null; identifiantAppareil?: unknown },
  ports: PortsDeConsommation
): Promise<ResultatDeConsommation> {
  return consommer(
    entree,
    ports,
    {
      ecrire: (tx, tokenHash, maintenant) =>
        tx.consommer(conditionDeConsommation(tokenHash, maintenant), { consommeAt: maintenant }),
      dejaConsomme: async (tx, tokenHash, kid) => tx.dejaConsomme?.(tokenHash, kid),
      async ouvrir(tx, tokenHash, o) {
        const lien = await tx.lireLien(tokenHash);
        if (lien === null || lien.kid !== o.configuration.kid) return null;
        // Un lien de la CONSOLE ne s'ouvre pas ici : l'espace n'ouvre de session qu'à un apporteur.
        if (lien.apporteurId === null) return null;
        return ouvrirLaSession(tx, { id: lien.id, apporteurId: lien.apporteurId }, o);
      },
    },
    appareilDeLaRequete(entree.identifiantAppareil, ports.appareils)
  );
}

/** SEC-29 : la consommation d'un lien de la CONSOLE, par le même parcours que l'espace. */
export function consommerLienConsole(
  entree: { jeton: string; ipHash: string | null },
  ports: PortsDeConsommationConsole
): Promise<ResultatDeConsommation> {
  return consommer(entree, ports, {
    ecrire: (tx, tokenHash, maintenant) =>
      tx.consommer(conditionDeConsommationConsole(tokenHash, maintenant), {
        consommeAt: maintenant,
      }),
    dejaConsomme: async (tx, tokenHash, kid) => tx.dejaConsommeConsole?.(tokenHash, kid),
    async ouvrir(tx, tokenHash, o) {
      const lien = await tx.lireLienConsole(tokenHash);
      if (lien === null || lien.kid !== o.configuration.kid) return null;
      // Un lien de l'ESPACE ne s'ouvre pas ici : la console n'ouvre de session qu'à son utilisateur.
      if (lien.utilisateurConsoleId === null) return null;
      return ouvrirLaSessionConsole(
        tx,
        { id: lien.id, utilisateurConsoleId: lien.utilisateurConsoleId },
        o
      );
    },
  });
}

/**
 * La session ouverte par un lien CONSOMMÉ, par le clic ou par le code (SEC-54, point 8) : UNE
 * fonction, donc même rotation, même empreinte, même durée, `lien_magique_id` unique. Rend le jeton
 * de session, ou `null` si l'apporteur ne peut pas ouvrir l'espace.
 */
async function ouvrirLaSession(
  tx: Pick<
    TransactionDeConsommation,
    'statutApporteur' | 'ouvrirSession' | 'appareils' | 'droitsEnCours'
  >,
  lien: { id: string; apporteurId: string },
  o: OuvertureDeSession
): Promise<SessionOuverteParLeLien | null> {
  const statut = await tx.statutApporteur(lien.apporteurId);
  // Un apporteur introuvable (`null`) est jugé par le prédicat, fermé comme un statut inconnu.
  if (!(await ouvertureDuCompte(statut, lien.apporteurId, tx.droitsEnCours?.bind(tx)))) return null;
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
  if (o.appareil === undefined) return { jetonSession };
  // SEC-55, (i) : l'appareil qui consomme est RECONNU dans cette transaction s'il est connu ; sinon
  // il reste non confirmé, à aviser puis confirmer après la validation. Le port branché sans dépôt
  // est une faute de câblage, qui échoue fort plutôt que de laisser croire à une confirmation.
  if (tx.appareils === undefined) throw new Error('depot_des_appareils_absent');
  const lu = await reconnaitreALaConsommation(lien.apporteurId, o.appareil.identifiantLu, {
    depot: tx.appareils,
    cle: cleDesAppareils(secret),
    maintenant: o.maintenant,
  });
  if ('issue' in lu) return { jetonSession, appareil: lu };
  return {
    jetonSession,
    enAttente: {
      identifiant: lu.identifiant,
      appareil: lu.aConfirmer,
      lienMagiqueId: lien.id,
      sessionTokenHash: empreinteDeSession(jetonSession, secret),
      consommeAt: o.maintenant,
    },
  };
}

/**
 * SEC-29 : la session de la CONSOLE, ouverte par le clic ou par le code. Même rotation que l'espace,
 * mais SON domaine d'empreinte, SA durée courte, et la dernière vue posée à l'ouverture. Rend le
 * jeton, ou `null` si l'utilisateur est désactivé ou introuvable.
 */
async function ouvrirLaSessionConsole(
  tx: Pick<TransactionDeConsommationConsole, 'utilisateurActif' | 'ouvrirSessionConsole'>,
  lien: { id: string; utilisateurConsoleId: string },
  o: OuvertureDeSession
): Promise<SessionOuverteParLeLien | null> {
  if (!(await tx.utilisateurActif(lien.utilisateurConsoleId, o.maintenant))) return null;
  const jetonSession = tirerJeton();
  const { secret, kid } = o.configuration.session;
  await tx.ouvrirSessionConsole({
    utilisateurConsoleId: lien.utilisateurConsoleId,
    lienMagiqueId: lien.id,
    tokenHash: empreinteDeSessionConsole(jetonSession, secret),
    kid,
    ipHash: o.ipHash,
    creeAt: o.maintenant,
    expireAt: new Date(o.maintenant.getTime() + DUREES_AUTH.sessionConsoleMs.valeur),
    derniereVueAt: o.maintenant,
  });
  return { jetonSession };
}

// ── la vérification du code (SEC-54) ─────────────────────────────────────────────────────────────

/** Les issues de la vérification : une liste FERMÉE ; `debit` se rend avec le statut 429. */
export const ETATS_DU_CODE = ['ouverte', 'code_refuse', 'debit'] as const;
export type EtatDuCode = (typeof ETATS_DU_CODE)[number];
export type ResultatDuCode =
  | { etat: 'ouverte'; jetonSession: string; appareil?: AppareilDeLaConnexion }
  | { etat: 'code_refuse' }
  | { etat: 'debit' };

/** Les motifs écrits au journal (point 7) : fermés, sans rien de la personne. */
export type MotifDuCode = 'code_refuse' | 'code_epuise' | 'debit';

export interface TransactionDuCode extends Pick<
  TransactionDeConsommation,
  'statutApporteur' | 'ouvrirSession' | 'appareils' | 'droitsEnCours'
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
  /** Les deux compteurs de la vérification (point 6), un port chacun. */
  compterAdresseCode(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  compterCourrielCode(sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
  transaction<T>(travail: (tx: TransactionDuCode) => Promise<T>): Promise<T>;
  signaler(motif: MotifDuCode): void;
  /** Appelé quand le lien est annulé au cinquième échec : l'action efface le cookie d'attente. */
  lienAnnule?(): void;
  configuration: ConfigurationDuLien;
  /** SEC-55 : la confirmation de l'appareil à la consommation par le code, comme par le clic. */
  appareils?: PortsDesAppareils;
}

/** SEC-29 : la transaction du code de la CONSOLE ; l'essai, l'annulation et la consommation sont ceux de l'espace. */
export interface TransactionDuCodeConsole
  extends
    Pick<TransactionDuCode, 'compterEssai' | 'annulerLien' | 'consommerParId'>,
    Pick<TransactionDeConsommationConsole, 'utilisateurActif' | 'ouvrirSessionConsole'> {
  /** Le seul lien actif le plus récent de l'utilisateur de la console : population console seule. */
  lienActifDeConsole(
    emailHash: string,
    maintenant: Date
  ): Promise<{ id: string; utilisateurConsoleId: string; kid: string } | null>;
}

export interface PortsDuCodeConsole extends Omit<PortsDuCode, 'transaction' | 'appareils'> {
  transaction<T>(travail: (tx: TransactionDuCodeConsole) => Promise<T>): Promise<T>;
}

/**
 * L'empreinte d'attente : 64 hexadécimaux minuscules, jamais une adresse. Jugée AVANT tout ; hors
 * forme, elle vaut une adresse hors forme (lentille sécurité, condition 3).
 */
export function empreinteDAttente(valeur: string | null | undefined): string | null {
  return typeof valeur === 'string' && /^[0-9a-f]{64}$/.test(valeur) ? valeur : null;
}

/** Les réponses, construites à l'appel : une seule forme par issue, quel que soit le motif. */
function refuse(): ResultatDuCode {
  return { etat: 'code_refuse' };
}

export function verifierLeCode(
  /**
   * `emailHash` : l'empreinte de l'adresse saisie à la DEMANDE, que l'action relit dans le cookie
   * d'attente `__Host-connexion_code` (lentille sécurité, 2026-10-03). L'adresse n'est jamais
   * redemandée ni transportée en clair.
   */
  requete: {
    emailHash: string | null;
    code: string;
    entetes: Headers;
    identifiantAppareil?: unknown;
  },
  ports: PortsDuCode
): Promise<ResultatDuCode> {
  return verifier(
    requete,
    ports,
    {
      lienActif: (tx, emailHash, maintenant) => tx.lienActifDe(emailHash, maintenant),
      ouvrir: (tx, lien, o) => ouvrirLaSession(tx, lien, o),
    },
    appareilDeLaRequete(requete.identifiantAppareil, ports.appareils)
  );
}

/** SEC-29 : le code de la CONSOLE, par la MÊME vérification que l'espace (débit, essais, factice). */
export function verifierLeCodeConsole(
  requete: { emailHash: string | null; code: string; entetes: Headers },
  ports: PortsDuCodeConsole
): Promise<ResultatDuCode> {
  return verifier(requete, ports, {
    lienActif: (tx, emailHash, maintenant) => tx.lienActifDeConsole(emailHash, maintenant),
    ouvrir: (tx, lien, o) => ouvrirLaSessionConsole(tx, lien, o),
  });
}

/**
 * La vérification commune : seuls la recherche du lien actif (population jugée) et l'ouverture de
 * la session dépendent de la population.
 */
async function verifier<
  Tx extends Pick<TransactionDuCode, 'compterEssai' | 'annulerLien' | 'consommerParId'>,
  Lien extends { id: string; kid: string },
>(
  requete: { emailHash: string | null; code: string; entetes: Headers },
  ports: Omit<PortsDuCode, 'transaction'> & {
    transaction<T>(travail: (tx: Tx) => Promise<T>): Promise<T>;
  },
  population: {
    lienActif(tx: Tx, emailHash: string, maintenant: Date): Promise<Lien | null>;
    ouvrir(tx: Tx, lien: Lien, o: OuvertureDeSession): Promise<SessionOuverteParLeLien | null>;
  },
  appareil?: AppareilDeLaRequete
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
  const emailHash = empreinteDAttente(requete.emailHash);
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
  const issue = await ports.transaction(async (tx) => {
    const lien = await population.lienActif(tx, emailHash, maintenant);
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
      if (epuise) {
        await tx.annulerLien(lien.id, maintenant);
        ports.lienAnnule?.();
      }
      ports.signaler(epuise ? 'code_epuise' : 'code_refuse');
      return refuse();
    }
    if ((await tx.consommerParId(lien.id, maintenant)) !== 1) {
      ports.signaler('code_refuse');
      return refuse();
    }
    const ouverture = await population.ouvrir(tx, lien, {
      maintenant,
      ipHash: ports.empreinteAdresseReseau(adresse),
      configuration: ports.configuration,
      appareil: appareil === undefined ? undefined : { identifiantLu: appareil.identifiantLu },
    });
    return ouverture ?? refuse();
  });
  return 'etat' in issue
    ? issue
    : apresLaValidation(issue, appareil, ports.configuration.session.kid);
}

/**
 * SEC-19 (sécurité, #703, 5981521068) : le compte peut-il recevoir ou consommer un lien ? Le jugement
 * de l'espace (`peutOuvrirLEspace`), avec les droits en cours lus pour un RÉSILIÉ seulement — un
 * résilié dont les droits courent se reconnecte en LECTURE. Sans lecteur, aucun droit : défaut fermé.
 * Le niveau de la session (`lecture`, jamais `plein`) est rejugé à chaque requête par `session.ts`.
 */
export async function ouvertureDuCompte(
  statut: string | null,
  apporteurId: string,
  droitsEnCours: ((apporteurId: string) => Promise<boolean>) | undefined
): Promise<boolean> {
  const droits =
    statut === 'resilie' && droitsEnCours !== undefined && (await droitsEnCours(apporteurId));
  return peutOuvrirLEspace(statut, droits);
}
