/**
 * session.ts — la session de l'espace apporteur rendue RÉVOCABLE (SEC-04, REQ-SEC-003, REQ-SEC-004).
 *
 * QUATRE RÈGLES, ET CE QUI LES TIENT.
 *  1. La session se vérifie EN BASE À CHAQUE REQUÊTE : `exigerSession` relit la ligne, la version et
 *     le statut de son apporteur à chaque appel. Aucune mémoire entre deux requêtes — ni cache de
 *     module, ni cache de données du cadriciel : une révocation vaut dès la requête SUIVANTE.
 *  2. `sessionVersion` coupe toutes les sessions d'un compte d'un seul cran. La BASE l'incrémente à
 *     la résiliation et au changement de courriel, et copie la version dans chaque session ouverte
 *     (déclencheurs de la migration `sessions_revocables`) ; une révocation pour motif de sécurité
 *     l'incrémente par `revoquerPourMotifDeSecurite`. La suspension ne l'incrémente pas.
 *  3. Le relèvement est celui de la session COURANTE : le lien qui l'a ouverte a été consommé il y a
 *     moins de 10 minutes. Il s'exige dans l'ACTION qui modifie, jamais dans la page qui l'affiche.
 *  4. Une session s'énumère sans son empreinte ni son `kid`, et ne se révoque que par son apporteur.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ET AUCUN CADRICIEL ICI : horloge, secret et dépôt entrent par des
 * ports ; l'adaptateur Prisma est `depotDeSessions`.
 */

import type { PrismaClient } from '@prisma/client';
import { DUREES_AUTH } from './durees';
import { empreinteDeSession } from './lien-magique';
import {
  niveauDAcces,
  routeOuverte,
  SEGMENT_DE_L_ACCEPTATION,
  type NiveauDAcces,
  type SegmentProtege,
} from '../../domain/apporteur/acces-espace';
import { exigerAcceptation, type MotifDeLaGarde, type PortsDeLaGarde } from './garde-espace';

// ── le cookie ────────────────────────────────────────────────────────────────────────────────────

/**
 * Le cookie de session (REQ-SEC-003). `__Host-` impose `Secure`, `Path=/` et l'absence de domaine :
 * aucun sous-domaine ne le lit ni ne l'écrase. Aucun attribut ne dépend de l'environnement.
 */
export const COOKIE_DE_SESSION = {
  nom: '__Host-partners-session',
  attributs: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DUREES_AUTH.sessionMs.valeur / 1000,
  },
} as const;

// ── le verdict ───────────────────────────────────────────────────────────────────────────────────

/** Les motifs de refus : une liste FERMÉE. Le motif part au journal, jamais au navigateur. */
export const MOTIFS_DE_REFUS = [
  'absente',
  'inconnue',
  'cle_perimee',
  'revoquee',
  'expiree',
  'version_perimee',
  'statut_ferme',
  'releve_requis',
  // SEC-43 : un apporteur en ouverture limitée sur une route hors de « Ma conformité » et « Mon
  // contrat ». Au journal seulement : le navigateur reçoit le même refus que pour toute route.
  'hors_ouverture_limitee',
  // SEC-19 (REQ-SEC-032) : un résilié en LECTURE tente une écriture. Le refus est porté par la
  // session, dans `actionEspace` et `exigerSessionRelevee`, pas seulement par l'écran.
  'lecture_seule',
] as const;
export type MotifDeRefus = (typeof MOTIFS_DE_REFUS)[number];

/**
 * Une ligne de `sessions_espace`, avec ce que le juge lit de son apporteur et de son lien. Sans
 * apporteur, c'est une session de la CONSOLE (SEC-17) : l'espace ne la reconnaît pas.
 */
export interface LigneDeSession {
  id: string;
  apporteurId: string | null;
  kid: string;
  expireAt: Date;
  revoqueAt: Date | null;
  sessionVersion: number;
  /** Le statut et la version, relus à chaque requête : un résilié est fermé (SEC-70). */
  apporteur: { statut: string; sessionVersion: number } | null;
  lienMagique: { consommeAt: Date | null };
}

/** Ce qu'une session acceptée laisse passer : son identité et son niveau d'accès, rien de plus. */
export interface SessionOuverte {
  id: string;
  apporteurId: string;
  lienConsommeAt: Date | null;
  /** `plein`, `limite` (SEC-43) ou `lecture` (SEC-19) : une session fermée n'est jamais ouverte. */
  niveau: Exclude<NiveauDAcces, 'ferme'>;
  /** Le statut de l'apporteur, pour la seule trace d'un refus d'ouverture limitée. */
  statut: string;
}

export type VerdictDeSession =
  { ok: true; session: SessionOuverte } | { ok: false; motif: MotifDeRefus };

/** Une déclaration de fonction, pas une constante : évaluée à l'appel, jamais figée au chargement. */
function refus(motif: MotifDeRefus): VerdictDeSession {
  return { ok: false, motif };
}

/** Le juge, pur : chaque motif dans son ordre, le premier qui s'applique l'emporte. */
export function jugerSession(
  ligne: LigneDeSession | null,
  maintenant: Date,
  kidCourant: string
): VerdictDeSession {
  // Une session de la console est INCONNUE de l'espace : même motif qu'une empreinte absente.
  if (ligne === null || ligne.apporteurId === null || ligne.apporteur === null) {
    return refus('inconnue');
  }
  if (ligne.kid !== kidCourant) return refus('cle_perimee');
  if (ligne.revoqueAt !== null) return refus('revoquee');
  if (ligne.expireAt.getTime() <= maintenant.getTime()) return refus('expiree');
  if (ligne.sessionVersion !== ligne.apporteur.sessionVersion) return refus('version_perimee');
  const niveau = niveauDAcces(ligne.apporteur.statut);
  if (niveau === 'ferme') return refus('statut_ferme');
  return {
    ok: true,
    session: {
      id: ligne.id,
      apporteurId: ligne.apporteurId,
      lienConsommeAt: ligne.lienMagique.consommeAt,
      niveau,
      statut: ligne.apporteur.statut,
    },
  };
}

// ── les ports ────────────────────────────────────────────────────────────────────────────────────

/** Une session telle que l'apporteur la voit dans sa liste : ni empreinte, ni `kid`. */
export interface SessionListee {
  id: string;
  creeAt: Date;
  expireAt: Date;
  revoqueAt: Date | null;
  derniereVueAt: Date | null;
}

export interface DepotDeSessions {
  lire(tokenHash: string): Promise<LigneDeSession | null>;
  marquerVue(id: string, maintenant: Date): Promise<void>;
  lister(apporteurId: string): Promise<SessionListee[]>;
  /** Révocation conditionnelle : la session, de CET apporteur, non révoquée. Rend le compte. */
  revoquer(id: string, apporteurId: string, maintenant: Date): Promise<number>;
  incrementerVersion(apporteurId: string): Promise<void>;
}

export interface PortsDeSession {
  maintenant(): Date;
  depot: DepotDeSessions;
  /** Le secret des sessions (SESSION_SECRET) et son `kid`. */
  configuration: { readonly secret: string; readonly kid: string };
  /**
   * Le journal d'un refus d'ouverture limitée (SEC-43) : le statut et le segment, jamais une donnée
   * de personne ni l'identifiant de la session. Absent, le refus tient : seule sa trace manque.
   */
  journal?: (ligne: RefusDOuvertureLimitee) => void;
  /**
   * La garde d'acceptation (SEC-53) : la politique courante et l'acceptation de l'apporteur. Absente,
   * toute route hors des exemptions nommées est REFUSÉE (`acceptation_illisible`).
   */
  acceptation?: PortsDeLaGarde;
}

/** La seule ligne qu'un refus d'ouverture limitée écrit. */
export interface RefusDOuvertureLimitee {
  signal: 'acces_espace_refuse';
  motif: 'hors_ouverture_limitee';
  statut: string;
  segment: SegmentProtege;
}

// ── la vérification ──────────────────────────────────────────────────────────────────────────────

/** La session de la requête, relue en base ; la dernière vue s'écrit pour une session acceptée. */
export async function exigerSession(
  jeton: string | undefined,
  ports: PortsDeSession
): Promise<VerdictDeSession> {
  if (!jeton) return refus('absente');
  const maintenant = ports.maintenant();
  const ligne = await ports.depot.lire(empreinteDeSession(jeton, ports.configuration.secret));
  const verdict = jugerSession(ligne, maintenant, ports.configuration.kid);
  if (verdict.ok) await ports.depot.marquerVue(verdict.session.id, maintenant);
  return verdict;
}

/**
 * La session de la requête POUR UNE ROUTE de l'espace (SEC-43) : la page, la route d'API ou l'action
 * serveur passe son premier segment (`docs/ESPACE-ROUTES.md`). En ouverture limitée, toute route hors
 * de la liste blanche est refusée — `hors_ouverture_limitee`, au journal — AVANT que l'appelant ne
 * lise ou n'écrive quoi que ce soit.
 */
export async function exigerSessionPour(
  segment: SegmentProtege,
  jeton: string | undefined,
  ports: PortsDeSession
): Promise<VerdictDeSession> {
  const verdict = await exigerSession(jeton, ports);
  if (!verdict.ok) return verdict;
  if (routeOuverte(verdict.session.niveau, segment)) return verdict;
  ports.journal?.({
    signal: 'acces_espace_refuse',
    motif: 'hors_ouverture_limitee',
    statut: verdict.session.statut,
    segment,
  });
  return refus('hors_ouverture_limitee');
}

/** Le verdict de l'espace : celui de la session, ou un refus de la garde d'acceptation (SEC-53). */
export type VerdictDeLEspace =
  { ok: true; session: SessionOuverte } | { ok: false; motif: MotifDeRefus | MotifDeLaGarde };

/**
 * LA GARDE de chaque page et route de l'espace (SEC-53, REQ-JUR-025), son PREMIER acte : la session
 * pour CE segment (SEC-43), puis l'acceptation de la version publiable courante de la politique
 * (`./garde-espace`), hors des exemptions nommées. Échec FERMÉ : une base qui ne répond pas est un
 * refus nommé (`session_illisible`, `acceptation_illisible`), jamais un passage ni une erreur qui
 * laisserait l'appelant décider.
 */
export async function pageEspace(
  segment: SegmentProtege,
  jeton: string | undefined,
  ports: PortsDeSession
): Promise<VerdictDeLEspace> {
  let verdict: VerdictDeSession;
  try {
    verdict = await exigerSessionPour(segment, jeton, ports);
  } catch {
    return { ok: false, motif: 'session_illisible' };
  }
  if (!verdict.ok) return verdict;
  const acceptation = await exigerAcceptation(
    verdict.session.apporteurId,
    segment,
    ports.acceptation
  );
  return acceptation.ok ? verdict : acceptation;
}

/**
 * Les ACTIONS qu'une session en lecture garde (SEC-19, critère 3 de la sécurité), par segment et
 * nommées : accepter la politique, l'accord qui précède toute lecture. Toute autre est refusée.
 */
export const ACTIONS_PERMISES_EN_LECTURE: readonly string[] = [SEGMENT_DE_L_ACCEPTATION];

/**
 * L'enveloppe d'une ACTION serveur de l'espace (SEC-43, SEC-53) : la garde de `pageEspace` pour CE
 * segment est son premier acte, et le corps ne s'exécute que si elle passe. Le refus est rendu tel
 * quel : l'action répond comme à une route inconnue, sans rien révéler. Une session en LECTURE
 * (SEC-19) n'écrit pas : `lecture_seule`, hors des actions permises nommées.
 */
export async function actionEspace<T>(
  segment: SegmentProtege,
  jeton: string | undefined,
  ports: PortsDeSession,
  corps: (session: SessionOuverte) => Promise<T>
): Promise<{ ok: true; valeur: T } | { ok: false; motif: MotifDeRefus | MotifDeLaGarde }> {
  const verdict = await pageEspace(segment, jeton, ports);
  if (!verdict.ok) return verdict;
  if (verdict.session.niveau === 'lecture' && !ACTIONS_PERMISES_EN_LECTURE.includes(segment)) {
    return { ok: false, motif: 'lecture_seule' };
  }
  return { ok: true, valeur: await corps(verdict.session) };
}

/**
 * La session de la requête, RELEVÉE : à appeler dans toute action qui modifie une coordonnée. Une
 * session en LECTURE (SEC-19) ne modifie aucune coordonnée : `lecture_seule`, même relevée.
 */
export async function exigerSessionRelevee(
  jeton: string | undefined,
  ports: PortsDeSession
): Promise<VerdictDeSession> {
  const verdict = await exigerSession(jeton, ports);
  if (!verdict.ok) return verdict;
  if (verdict.session.niveau === 'lecture') return refus('lecture_seule');
  const consommeAt = verdict.session.lienConsommeAt;
  const age = consommeAt === null ? Infinity : ports.maintenant().getTime() - consommeAt.getTime();
  return age < DUREES_AUTH.releveMs.valeur ? verdict : refus('releve_requis');
}

// ── énumérer et révoquer ─────────────────────────────────────────────────────────────────────────

export function listerSessions(
  apporteurId: string,
  ports: PortsDeSession
): Promise<SessionListee[]> {
  return ports.depot.lister(apporteurId);
}

export async function revoquerSession(
  id: string,
  apporteurId: string,
  ports: PortsDeSession
): Promise<'revoquee' | 'introuvable'> {
  const ecrites = await ports.depot.revoquer(id, apporteurId, ports.maintenant());
  return ecrites === 1 ? 'revoquee' : 'introuvable';
}

/** Contrat art. 3.8 : toutes les sessions du compte tombent à la requête suivante. */
export function revoquerPourMotifDeSecurite(
  apporteurId: string,
  ports: PortsDeSession
): Promise<void> {
  return ports.depot.incrementerVersion(apporteurId);
}

// ── l'adaptateur Prisma ──────────────────────────────────────────────────────────────────────────

/**
 * Le dépôt en base. Les empreintes arrivent CALCULÉES : aucun secret n'entre ici. La version d'une
 * session n'est jamais écrite par ce module : la base la copie à l'ouverture et refuse qu'elle change.
 */
export function depotDeSessions(prisma: PrismaClient): DepotDeSessions {
  return {
    lire(tokenHash) {
      return prisma.sessionEspace.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          apporteurId: true,
          kid: true,
          expireAt: true,
          revoqueAt: true,
          sessionVersion: true,
          apporteur: { select: { statut: true, sessionVersion: true } },
          lienMagique: { select: { consommeAt: true } },
        },
      });
    },
    async marquerVue(id, maintenant) {
      await prisma.sessionEspace.updateMany({ where: { id }, data: { derniereVueAt: maintenant } });
    },
    lister(apporteurId) {
      return prisma.sessionEspace.findMany({
        where: { apporteurId },
        orderBy: { creeAt: 'desc' },
        select: { id: true, creeAt: true, expireAt: true, revoqueAt: true, derniereVueAt: true },
      });
    },
    async revoquer(id, apporteurId, maintenant) {
      const { count } = await prisma.sessionEspace.updateMany({
        where: { id, apporteurId, revoqueAt: null },
        data: { revoqueAt: maintenant },
      });
      return count;
    },
    async incrementerVersion(apporteurId) {
      await prisma.apporteur.update({
        where: { id: apporteurId },
        data: { sessionVersion: { increment: 1 } },
      });
    },
  };
}
