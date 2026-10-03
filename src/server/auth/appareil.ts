/**
 * appareil.ts — l'appareil inconnu, un signal de sécurité du COMPTE, jamais une anomalie (SEC-55,
 * REQ-SEC-003 ; texte de la juriste et cadrage de la lentille sécurité, rattrapage 82).
 *
 * UNE GARDE, POSÉE AVANT SES APPELANTS. Toute action sensible de l'espace — RIB, coordonnées, adresse
 * de connexion — appelle `exigerAppareilConfirme` avant d'écrire. La garde ne décide que d'une mesure
 * de CONNEXION : elle n'écrit ni anomalie, ni statut, ni dépôt, ni événement ; la console n'en voit
 * aucun jugement. Elle n'écrit que `appareils_connus`.
 *
 * CINQ RÈGLES, ET CE QUI LES TIENT.
 *  1. L'empreinte est MINIMALE. L'appareil présente un identifiant tiré au hasard, posé dans son
 *     cookie `__Host-partners-appareil` (la lecture d'un identifiant strictement nécessaire à
 *     l'authentification). Seul un HMAC-SHA-256 de cet identifiant, séparé par domaine et TRONQUÉ à
 *     128 bits, est gardé, sous la clé DÉDIÉE des appareils — dérivée du secret des sessions par HKDF,
 *     elle ne signe rien d'autre — et avec son `kid`. Jamais l'adresse réseau, jamais l'identifiant.
 *  2. Elle vit au plus la DURÉE D'UNE SESSION après sa dernière vue : au-delà, l'appareil redevient
 *     inconnu, et `purger-appareils.ts` efface la ligne.
 *  3. Un appareil inconnu est REFUSÉ (`appareil_inconnu`) tant que la session n'a pas été
 *     fraîchement authentifiée sur lui. La confirmation renforcée est ce relèvement (REQ-SEC-004) :
 *     un nouveau lien, ou son code (SEC-54), envoyés à l'adresse vérifiée et consommés sur CET
 *     appareil, puisque le cookie de session qu'ils posent lui appartient. L'avis à l'adresse
 *     vérifiée part D'ABORD, l'appareil devient connu ENSUITE : aucun appareil ne devient connu sans
 *     son avis.
 *  4. En échec FERMÉ : un identifiant absent ou hors forme ne produit AUCUNE empreinte ; l'appareil
 *     compte comme inconnu, et rien ne le confirme. L'action pose alors un identifiant neuf.
 *  5. Un appareil est connu pour UN compte : la reconnaissance porte le compte de la session.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ET AUCUN CADRICIEL ICI : clé, horloge, dépôts et avis entrent par
 * des ports ; l'adaptateur Prisma est `depotDAppareils`.
 */

import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { kidDe } from '../../lib/env';
import { DUREES_AUTH } from './durees';
import {
  exigerSession,
  sessionRelevee,
  type PortsDeSession,
  type VerdictDeSession,
} from './session';

// ── l'identifiant et son empreinte ───────────────────────────────────────────────────────────────

/**
 * Le cookie de l'appareil : `__Host-` impose `Secure`, `Path=/` et l'absence de domaine. Il vit au
 * plus la durée d'une session, comme l'empreinte qu'il permet de reconnaître.
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

export interface PortsDAppareil {
  session: PortsDeSession;
  depot: DepotDAppareils;
  /** La clé des appareils et son `kid` (`cleDesAppareils`). */
  cle: { readonly secret: string; readonly kid: string };
  aviser(avis: AvisDAppareil): Promise<void>;
}

export type VerdictDAppareil = VerdictDeSession | { ok: false; motif: 'appareil_inconnu' };

// ── la garde ─────────────────────────────────────────────────────────────────────────────────────

/** Une déclaration de fonction, pas une constante : évaluée à l'appel, jamais figée au chargement. */
function inconnu(): VerdictDAppareil {
  return { ok: false, motif: 'appareil_inconnu' };
}

/**
 * La session de la requête, sur un appareil CONNU ou CONFIRMÉ à l'instant : à appeler dans toute
 * action sensible, avant d'écrire. Une session refusée est rendue telle quelle.
 */
export async function exigerAppareilConfirme(
  jeton: string | undefined,
  identifiant: unknown,
  ports: PortsDAppareil
): Promise<VerdictDAppareil> {
  const verdict = await exigerSession(jeton, ports.session);
  if (!verdict.ok) return verdict;
  const empreinte = empreinteDAppareil(identifiant, ports.cle.secret);
  if (empreinte === null) return inconnu();
  const maintenant = ports.session.maintenant();
  const appareil = { apporteurId: verdict.session.apporteurId, empreinte, kid: ports.cle.kid };
  const vuApres = new Date(maintenant.getTime() - DUREES_AUTH.sessionMs.valeur);
  if ((await ports.depot.reconnaitre(appareil, maintenant, vuApres)) === 1) return verdict;
  if (!sessionRelevee(verdict.session, maintenant)) return inconnu();
  await ports.aviser({ apporteurId: appareil.apporteurId, confirmeAt: maintenant });
  await ports.depot.confirmer(appareil, maintenant);
  return verdict;
}

// ── l'adaptateur Prisma ──────────────────────────────────────────────────────────────────────────

/** Le dépôt en base. Les empreintes arrivent CALCULÉES : aucune clé n'entre ici. */
export function depotDAppareils(prisma: PrismaClient): DepotDAppareils {
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
