/**
 * appareil.ts — l'appareil inconnu, un signal de sécurité du COMPTE, jamais une anomalie (SEC-55,
 * REQ-SEC-003 ; texte de la juriste et cadrage de la lentille sécurité, rattrapage 82).
 *
 * UNE GARDE, POSÉE AVANT SES APPELANTS. Toute action sensible de l'espace — RIB, coordonnées, adresse
 * de connexion — juge l'appareil avant d'écrire : `jugerAppareil` sur la session qu'`actionEspace`
 * (SEC-53) lui rend, ou `exigerAppareilConfirme`, qui relit d'abord la session. La garde ne décide
 * que d'une mesure de CONNEXION : elle n'écrit ni anomalie, ni statut, ni dépôt, ni événement ; la
 * console n'en voit aucun jugement. Elle n'écrit que `appareils_connus`.
 *
 * CINQ RÈGLES, ET CE QUI LES TIENT.
 *  1. L'empreinte est MINIMALE. L'appareil présente un identifiant tiré au hasard, posé dans son
 *     cookie `__Host-partners-appareil` (la lecture d'un identifiant strictement nécessaire à
 *     l'authentification). Seul un HMAC-SHA-256 de cet identifiant, séparé par domaine et TRONQUÉ à
 *     128 bits, est gardé, sous la clé DÉDIÉE des appareils — dérivée du secret des sessions par HKDF,
 *     elle ne signe rien d'autre — et avec son `kid`. Jamais l'adresse réseau, jamais l'identifiant.
 *  2. Elle vit au plus la DURÉE D'UNE SESSION après sa dernière vue : au-delà, l'appareil redevient
 *     inconnu, et `purger-appareils.ts` efface la ligne.
 *  3. Un appareil inconnu est REFUSÉ (`appareil_inconnu`), quelle que soit la fraîcheur de la
 *     session : la garde ne confirme JAMAIS. L'appareil se confirme À LA CONSOMMATION d'un lien ou de
 *     son code (SEC-54), envoyés à l'adresse vérifiée, sur l'appareil qui consomme. Un cookie de
 *     session volé ne suffit donc pas : le relèvement est une propriété de la SESSION, pas de
 *     l'appareil (note de la lentille sécurité sur 4913c6a3). Dans l'ordre de la voie (b) de la
 *     lentille sécurité : (i) la transaction de la consommation se valide, l'appareil reconnu s'il
 *     est connu, NON confirmé sinon (`reconnaitreALaConsommation`) ; (ii) l'avis part ensuite à
 *     l'adresse vérifiée, HORS de toute transaction ; (iii) seulement s'il est accepté, une
 *     transaction COURTE rejuge la session et confirme l'appareil, une fois (`aviserPuisConfirmer`).
 *     Aucun appareil ne devient connu sans son avis ; un avis en échec, ou un arrêt entre (i) et
 *     (iii), le laisse inconnu.
 *  4. En échec FERMÉ : un identifiant absent ou hors forme ne produit AUCUNE empreinte ; l'appareil
 *     compte comme inconnu, et la garde ne lit rien. À la consommation, un identifiant neuf est tiré
 *     à sa place et rendu à l'appelant, qui le pose ; le hors-forme n'est jamais écrit.
 *  5. Un appareil est connu pour UN compte : la reconnaissance porte le compte de la session.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ET AUCUN CADRICIEL ICI : clé, horloge, dépôts et avis entrent par
 * des ports ; l'adaptateur Prisma est `depotDAppareils`.
 */

import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { kidDe } from '../../lib/env';
import { DUREES_AUTH } from './durees';
import {
  exigerSession,
  jugerSession,
  type LigneDeSession,
  type PortsDeSession,
  type SessionOuverte,
  type VerdictDeSession,
} from './session';

// ── l'identifiant et son empreinte ───────────────────────────────────────────────────────────────

/**
 * Le cookie de l'appareil : `__Host-` impose `Secure`, `Path=/` et l'absence de domaine. Il vit une
 * durée de session après la CONSOMMATION qui l'a posé, alors que l'empreinte vit une durée de session
 * après sa dernière VUE : un appareil revenu sans cookie reçoit un identifiant neuf, et son avis.
 */
export const COOKIE_D_APPAREIL = {
  nom: '__Host-partners-appareil',
  attributs: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DUREES_AUTH.sessionMs.valeur / 1000,
  },
} as const;

/** 32 octets en base64url sans remplissage : 43 caractères, ni plus ni moins. */
export function tirerIdentifiantDAppareil(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * L'empreinte d'un identifiant d'appareil sous la clé des appareils : 32 hexadécimaux (128 bits). Un
 * identifiant qui n'a pas la forme d'un tirage ne produit RIEN — `null`, l'appareil inconnu.
 */
export function empreinteDAppareil(identifiant: unknown, cle: string): string | null {
  if (typeof identifiant !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(identifiant)) return null;
  return createHmac('sha256', cle)
    .update(`partners.appareil.v1\u001f${identifiant}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * La clé DÉDIÉE des appareils, dérivée du secret des sessions (SESSION_SECRET) par HKDF-SHA-256,
 * domaine `partners.appareil.v1` : distincte de ce secret, elle ne signe ni session ni lien. Son
 * `kid` est celui de toute clé (`kidDe`) : une rotation du secret rend chaque appareil inconnu.
 */
export function cleDesAppareils(secretDesSessions: string): { secret: string; kid: string } {
  const secret = Buffer.from(
    hkdfSync('sha256', secretDesSessions, Buffer.alloc(0), 'partners.appareil.v1', 32)
  ).toString('hex');
  return { secret, kid: kidDe(secret) };
}

// ── les ports ────────────────────────────────────────────────────────────────────────────────────

/** Un appareil tel que la base le reconnaît : un compte, une empreinte, une clé. */
export interface AppareilVu {
  apporteurId: string;
  empreinte: string;
  kid: string;
}

export interface DepotDAppareils {
  /**
   * UNE écriture conditionnelle : la dernière vue avance si l'appareil est connu de ce compte, sous
   * cette clé, et vu après `vuApres`. Rend le nombre de lignes écrites : 1, il est connu.
   */
  reconnaitre(appareil: AppareilVu, maintenant: Date, vuApres: Date): Promise<number>;
  /**
   * (iii) L'appareil devient connu, ou le redevient (ligne périmée), confirmé et vu à l'instant :
   * `confirme`. Déjà connu — vu après `vuApres` —, il ne l'est pas deux fois : RIEN n'est réécrit,
   * `deja_connu`.
   */
  confirmerSiInconnu(
    appareil: AppareilVu,
    maintenant: Date,
    vuApres: Date
  ): Promise<'confirme' | 'deja_connu'>;
}

/** L'avis à l'adresse vérifiée : le compte et l'instant, RIEN de l'appareil. */
export interface AvisDAppareil {
  apporteurId: string;
  confirmeAt: Date;
}

/** Les ports de la GARDE : elle lit la session et reconnaît l'appareil, elle n'avise jamais. */
export interface PortsDAppareil {
  session: PortsDeSession;
  depot: DepotDAppareils;
  /** La clé des appareils et son `kid` (`cleDesAppareils`). */
  cle: { readonly secret: string; readonly kid: string };
}

/** Ce que la consommation rend de l'appareil : l'identifiant à POSER et l'issue, rien d'autre. */
export type IssueDeLAppareil = 'connu' | 'confirme' | 'avis_echoue' | 'non_confirme';
export interface AppareilDeLaConnexion {
  identifiant: string;
  issue: IssueDeLAppareil;
}

/**
 * (i) Ce que la transaction de la consommation sait de l'appareil : connu, ou À CONFIRMER après sa
 * validation. L'empreinte reste dans le noyau ; seul l'identifiant sort vers l'appelant.
 */
export type AppareilALaConsommation =
  { identifiant: string; issue: 'connu' } | { identifiant: string; aConfirmer: AppareilVu };

/** La transaction COURTE de la confirmation (iii) : la session relue, et le dépôt des appareils. */
export interface TransactionDeConfirmation {
  /** La session par l'empreinte de son jeton, avec le lien qui l'a ouverte ; `null` si absente. */
  lireSession(tokenHash: string): Promise<{ ligne: LigneDeSession; lienMagiqueId: string } | null>;
  appareils: DepotDAppareils;
}

/**
 * SEC-55 : les ports de la confirmation à la consommation, côté espace. Branchés, ils font aviser
 * puis confirmer l'appareil qui consomme, APRÈS la validation de la consommation ; absents, la
 * consommation est celle d'avant (aucun appareil lu).
 */
export interface PortsDesAppareils {
  /** (ii) L'avis à l'adresse vérifiée : le compte et l'instant, rien de l'appareil. */
  aviser(avis: AvisDAppareil): Promise<void>;
  /** L'instant de la confirmation, lu APRÈS l'avis. */
  maintenant(): Date;
  /** (iii) La transaction courte, ouverte seulement si l'avis est accepté. */
  transaction<T>(travail: (tx: TransactionDeConfirmation) => Promise<T>): Promise<T>;
}

/** L'appareil à confirmer, et de quoi rejuger la session que la consommation a ouverte. */
export interface AppareilEnAttente {
  identifiant: string;
  appareil: AppareilVu;
  lienMagiqueId: string;
  sessionTokenHash: string;
  /** L'instant de la consommation, que l'avis dit. */
  consommeAt: Date;
}

export type VerdictDAppareil = VerdictDeSession | { ok: false; motif: 'appareil_inconnu' };

// ── la garde ─────────────────────────────────────────────────────────────────────────────────────

/** Une déclaration de fonction, pas une constante : évaluée à l'appel, jamais figée au chargement. */
function inconnu(): { ok: false; motif: 'appareil_inconnu' } {
  return { ok: false, motif: 'appareil_inconnu' };
}

/** La limite de vue : un appareil vu à cet instant ou avant n'est plus reconnu. */
function vuApresDe(maintenant: Date): Date {
  return new Date(maintenant.getTime() - DUREES_AUTH.sessionMs.valeur);
}

/**
 * L'appareil d'une session DÉJÀ acceptée : dans une action de l'espace, celle qu'`actionEspace`
 * (SEC-53 : session et acceptation de la politique) rend à son corps, qui n'est pas relue ici.
 * Connu, il passe ; inconnu, il est refusé — même sur une session fraîche : la garde ne confirme
 * jamais, la confirmation est celle de la consommation.
 */
export async function jugerAppareil(
  session: SessionOuverte,
  identifiant: unknown,
  ports: PortsDAppareil
): Promise<{ ok: true } | { ok: false; motif: 'appareil_inconnu' }> {
  const empreinte = empreinteDAppareil(identifiant, ports.cle.secret);
  if (empreinte === null) return inconnu();
  const maintenant = ports.session.maintenant();
  const appareil = { apporteurId: session.apporteurId, empreinte, kid: ports.cle.kid };
  const connu = (await ports.depot.reconnaitre(appareil, maintenant, vuApresDe(maintenant))) === 1;
  return connu ? { ok: true } : inconnu();
}

/**
 * (i) DANS la transaction de la consommation, sur l'appareil qui consomme : l'identifiant lu sur la
 * requête est gardé s'il a la forme d'un tirage ; sinon un identifiant neuf le remplace, et le
 * hors-forme n'est jamais écrit. Connu de ce compte, l'appareil est reconnu, sa vue avance ; sinon
 * il reste NON confirmé, à confirmer APRÈS la validation (`aviserPuisConfirmer`).
 */
export async function reconnaitreALaConsommation(
  apporteurId: string,
  identifiantLu: unknown,
  ports: {
    depot: DepotDAppareils;
    cle: { readonly secret: string; readonly kid: string };
    maintenant: Date;
  }
): Promise<AppareilALaConsommation> {
  const lu = empreinteDAppareil(identifiantLu, ports.cle.secret);
  const identifiant = lu === null ? tirerIdentifiantDAppareil() : (identifiantLu as string);
  const empreinte = lu ?? (empreinteDAppareil(identifiant, ports.cle.secret) as string);
  const appareil = { apporteurId, empreinte, kid: ports.cle.kid };
  const { maintenant } = ports;
  if ((await ports.depot.reconnaitre(appareil, maintenant, vuApresDe(maintenant))) === 1) {
    return { identifiant, issue: 'connu' };
  }
  return { identifiant, aConfirmer: appareil };
}

/**
 * (ii) puis (iii), APRÈS la validation de la consommation (voie (b) de la lentille sécurité). L'avis
 * part HORS de toute transaction ; refusé, en échec ou au-delà du délai, il ne confirme RIEN
 * (`avis_echoue`). Accepté, une transaction COURTE REJUGE la session que la consommation a ouverte
 * — présente, non révoquée, non expirée, de la bonne version, d'un apporteur toujours actif, de CE
 * compte, ouverte par CE lien, et pas en LECTURE (SEC-19) — et confirme l'appareil s'il ne l'est pas
 * déjà ; sinon rien n'est confirmé (`non_confirme`). Un arrêt entre la consommation et la confirmation laisse l'appareil
 * inconnu : rien n'a été écrit pour lui.
 */
export async function aviserPuisConfirmer(
  attente: AppareilEnAttente,
  kidDeSession: string,
  ports: PortsDesAppareils
): Promise<AppareilDeLaConnexion> {
  const { identifiant, appareil } = attente;
  try {
    await ports.aviser({ apporteurId: appareil.apporteurId, confirmeAt: attente.consommeAt });
  } catch {
    return { identifiant, issue: 'avis_echoue' };
  }
  const maintenant = ports.maintenant();
  const issue = await ports.transaction(async (tx): Promise<IssueDeLAppareil> => {
    const lue = await tx.lireSession(attente.sessionTokenHash);
    const verdict = jugerSession(lue?.ligne ?? null, maintenant, kidDeSession);
    if (
      !verdict.ok ||
      lue?.lienMagiqueId !== attente.lienMagiqueId ||
      verdict.session.apporteurId !== appareil.apporteurId
    ) {
      return 'non_confirme';
    }
    // SEC-19 (A09, #563 5983094689) : une session en LECTURE n'a aucune action sensible ; un appareil
    // n'a rien à y gagner. Le refus est une RÈGLE, pas l'effet d'un champ non relu.
    if (verdict.session.niveau === 'lecture') return 'non_confirme';
    const confirmation = await tx.appareils.confirmerSiInconnu(
      appareil,
      maintenant,
      vuApresDe(maintenant)
    );
    return confirmation === 'confirme' ? 'confirme' : 'connu';
  });
  return { identifiant, issue };
}

/**
 * La session de la requête, sur un appareil CONNU : la session d'abord, relue en base, puis
 * `jugerAppareil`. Une session refusée est rendue telle quelle. Une action sensible ÉCRIT : une
 * session en LECTURE (SEC-19, résilié) est refusée ici même, `lecture_seule`, avant l'appareil.
 */
export async function exigerAppareilConfirme(
  jeton: string | undefined,
  identifiant: unknown,
  ports: PortsDAppareil
): Promise<VerdictDAppareil> {
  const verdict = await exigerSession(jeton, ports.session);
  if (!verdict.ok) return verdict;
  if (verdict.session.niveau === 'lecture') return { ok: false, motif: 'lecture_seule' };
  const appareil = await jugerAppareil(verdict.session, identifiant, ports);
  return appareil.ok ? verdict : appareil;
}

// ── l'adaptateur Prisma ──────────────────────────────────────────────────────────────────────────

/**
 * Le dépôt en base, sur le client ou dans une transaction (celle de la consommation). Les
 * empreintes arrivent CALCULÉES : aucune clé n'entre ici.
 */
export function depotDAppareils(
  prisma: Pick<PrismaClient | Prisma.TransactionClient, 'appareilConnu'>
): DepotDAppareils {
  return {
    async reconnaitre({ apporteurId, empreinte, kid }, maintenant, vuApres) {
      const { count } = await prisma.appareilConnu.updateMany({
        where: { apporteurId, empreinte, kid, derniereVueAt: { gt: vuApres } },
        data: { derniereVueAt: maintenant },
      });
      return count;
    },
    async confirmerSiInconnu(appareil, maintenant, vuApres) {
      const frais = await prisma.appareilConnu.count({
        where: { ...appareil, derniereVueAt: { gt: vuApres } },
      });
      if (frais > 0) return 'deja_connu';
      await prisma.appareilConnu.upsert({
        where: { apporteurId_empreinte_kid: appareil },
        create: { ...appareil, confirmeAt: maintenant, derniereVueAt: maintenant },
        update: { confirmeAt: maintenant, derniereVueAt: maintenant },
      });
      return 'confirme';
    },
  };
}
