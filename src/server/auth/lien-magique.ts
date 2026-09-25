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

import { createHmac, randomBytes } from 'node:crypto';
import { DUREES_AUTH } from './durees';
import { peutOuvrirLEspace } from '../../domain/apporteur/acces-espace';

// ── le jeton et son empreinte ────────────────────────────────────────────────────────────────────

const OCTETS_JETON = 32;
/** 32 octets en base64url sans remplissage : 43 caractères, ni plus ni moins. */
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;
const DOMAINE_EMPREINTE = 'partners.lien.v1\u001f';
const DOMAINE_SESSION = 'partners.session.v1\u001f';

export function tirerJeton(): string {
  return randomBytes(OCTETS_JETON).toString('base64url');
}

export function empreinteDuJeton(jeton: string, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAINE_EMPREINTE}${jeton}`, 'utf8').digest('hex');
}

export function empreinteDeSession(jeton: string, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAINE_SESSION}${jeton}`, 'utf8').digest('hex');
}

// ── les états rendus ─────────────────────────────────────────────────────────────────────────────

export type EtatDeDemande = 'envoye' | 'suspendu' | 'indisponible' | 'adresse_invalide';
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

export type CompteurDeLien = 'magic:ip' | 'magic:courriel';

export interface VerdictDeLimite {
  readonly autorise: boolean;
  readonly panne: boolean;
}

export interface NouveauLien {
  apporteurId: string;
  tokenHash: string;
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
  envoyer(message: { a: string; url: string; expireAt: Date }): Promise<void>;
  signalerPotDeMiel(signal: {
    formulaire: 'connexion';
    adresseHash: string;
    survenuAt: Date;
  }): Promise<void>;
  journaliser(evenement: 'travail_differe_echoue'): void;
}

export interface PortsDeDemande {
  maintenant(): Date;
  adresseDuClient(entetes: Headers): string | null;
  empreinteAdresseReseau(adresse: string): string;
  /** L'empreinte de recherche du courriel saisi, ou `null` s'il est hors forme. */
  empreinteCourriel(saisie: string): string | null;
  limiter(nom: CompteurDeLien, sujet: string, maintenantMs: number): Promise<VerdictDeLimite>;
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

const refusDe = (v: VerdictDeLimite): EtatDeDemande | null =>
  v.autorise ? null : v.panne ? 'indisponible' : 'suspendu';

export async function demanderLien(
  requete: RequeteDeLien,
  ports: PortsDeDemande
): Promise<EtatDeDemande> {
  const maintenant = ports.maintenant();
  try {
    const adresse = ports.adresseDuClient(requete.entetes);
    if (adresse === null) return 'indisponible';
    const adresseHash = ports.empreinteAdresseReseau(adresse);
    const parAdresse = refusDe(await ports.limiter('magic:ip', adresseHash, maintenant.getTime()));
    if (parAdresse) return parAdresse;

    const emailHash = ports.empreinteCourriel(requete.saisie);
    if (emailHash === null) return 'adresse_invalide';
    const parCourriel = refusDe(
      await ports.limiter('magic:courriel', emailHash, maintenant.getTime())
    );
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
        ports.emission.journaliser('travail_differe_echoue');
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
  const expireAt = new Date(maintenant.getTime() + DUREES_AUTH.lienMagiqueMs.valeur);
  await emission.annulerLiensActifs(compte.id, maintenant);
  await emission.insererLien({
    apporteurId: compte.id,
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    kid: configuration.kid,
    creeAt: maintenant,
    expireAt,
  });
  const a = await emission.adresseStockee(compte.id);
  await emission.envoyer({ a, url: `${configuration.urlPublique}/connexion/${jeton}`, expireAt });
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
  lireLien(tokenHash: string): Promise<{ id: string; apporteurId: string; kid: string } | null>;
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
  if (!FORME_JETON.test(entree.jeton)) return INVALIDE;
  const tokenHash = empreinteDuJeton(entree.jeton, ports.configuration.secret);
  const maintenant = ports.maintenant();
  return ports.transaction(async (tx) => {
    const ecrites = await tx.consommer(conditionDeConsommation(tokenHash, maintenant), {
      consommeAt: maintenant,
    });
    if (ecrites !== 1) return INVALIDE;
    const lien = await tx.lireLien(tokenHash);
    if (lien === null || lien.kid !== ports.configuration.kid) return INVALIDE;
    const statut = await tx.statutApporteur(lien.apporteurId);
    if (statut === null || !peutOuvrirLEspace(statut)) return INVALIDE;
    const jetonSession = tirerJeton();
    const { secret, kid } = ports.configuration.session;
    await tx.ouvrirSession({
      apporteurId: lien.apporteurId,
      lienMagiqueId: lien.id,
      tokenHash: empreinteDeSession(jetonSession, secret),
      kid,
      ipHash: entree.ipHash,
      creeAt: maintenant,
      expireAt: new Date(maintenant.getTime() + DUREES_AUTH.sessionMs.valeur),
    });
    return { etat: 'ouverte', jetonSession };
  });
}
