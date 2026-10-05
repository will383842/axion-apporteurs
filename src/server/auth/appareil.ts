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
 *     son code (SEC-54), envoyés à l'adresse vérifiée, sur l'appareil qui consomme et dans la même
 *     transaction (`confirmerALaConsommation`). Un cookie de session volé ne suffit donc pas : le
 *     relèvement est une propriété de la SESSION, pas de l'appareil (note de la lentille sécurité sur
 *     4913c6a3). L'avis à l'adresse vérifiée part D'ABORD, l'appareil devient connu ENSUITE : aucun
 *     appareil ne devient connu sans son avis ; un avis qui échoue le laisse inconnu.
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
  /** L'appareil devient connu, ou le redevient : confirmé et vu à l'instant. */
  confirmer(appareil: AppareilVu, maintenant: Date): Promise<void>;
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

/** Les ports de la CONFIRMATION, à la consommation d'un lien ou d'un code de l'espace. */
export interface PortsDeConfirmation {
  /** Le dépôt de la transaction de la consommation : la confirmation en partage l'issue. */
  depot: DepotDAppareils;
  cle: { readonly secret: string; readonly kid: string };
  aviser(avis: AvisDAppareil): Promise<void>;
  maintenant: Date;
}

/** Ce que la consommation rend de l'appareil : l'identifiant à POSER et l'issue, rien d'autre. */
export type IssueDeLAppareil = 'connu' | 'confirme' | 'avis_echoue';
export interface AppareilDeLaConnexion {
  identifiant: string;
  issue: IssueDeLAppareil;
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
 * La CONFIRMATION, à la consommation d'un lien ou d'un code de l'espace, sur l'appareil qui
 * consomme, dans la transaction de la consommation (note de la lentille sécurité sur 4913c6a3).
 * L'identifiant lu sur la requête est gardé s'il a la forme d'un tirage ; sinon un identifiant
 * neuf le remplace. Connu de ce compte, l'appareil est reconnu ; neuf, l'avis part D'ABORD, puis il
 * est confirmé. Un avis qui échoue le laisse inconnu : la connexion n'en dépend pas, l'issue le dit.
 * Rend l'identifiant à poser et l'issue, jamais l'empreinte.
 */
export async function confirmerALaConsommation(
  apporteurId: string,
  identifiantLu: unknown,
  ports: PortsDeConfirmation
): Promise<AppareilDeLaConnexion> {
  const lu = empreinteDAppareil(identifiantLu, ports.cle.secret);
  const identifiant = lu === null ? tirerIdentifiantDAppareil() : (identifiantLu as string);
  const empreinte = lu ?? (empreinteDAppareil(identifiant, ports.cle.secret) as string);
  const appareil = { apporteurId, empreinte, kid: ports.cle.kid };
  const { maintenant } = ports;
  if ((await ports.depot.reconnaitre(appareil, maintenant, vuApresDe(maintenant))) === 1) {
    return { identifiant, issue: 'connu' };
  }
  try {
    await ports.aviser({ apporteurId, confirmeAt: maintenant });
  } catch {
    return { identifiant, issue: 'avis_echoue' };
  }
  await ports.depot.confirmer(appareil, maintenant);
  return { identifiant, issue: 'confirme' };
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
    async confirmer(appareil, maintenant) {
      await prisma.appareilConnu.upsert({
        where: { apporteurId_empreinte_kid: appareil },
        create: { ...appareil, confirmeAt: maintenant, derniereVueAt: maintenant },
        update: { confirmeAt: maintenant, derniereVueAt: maintenant },
      });
    },
  };
}
