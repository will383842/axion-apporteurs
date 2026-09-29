/**
 * acceptation.ts — l'acceptation de la politique de confidentialité par l'apporteur (JUR-T34,
 * REQ-JUR-025) : à la première connexion, puis à chaque nouvelle version de la politique.
 *
 * LA RÈGLE. Une politique est acceptée quand `apporteurs.confidentialite_acceptee_at` est posée ET
 * que `apporteurs.confidentialite_version` est la version COURANTE — l'empreinte du contenu extrait
 * du registre (`src/domain/rgpd/politique.ts`). Une durée changée au registre change la version :
 * l'apporteur est invité à accepter de nouveau. Une acceptation ne porte que sur la version que la
 * page a AFFICHÉE : si le registre a changé entre l'affichage et l'envoi, rien n'est écrit.
 *
 * CŒUR PUR, PORTS INJECTÉS, comme la session (`src/server/auth/session.ts`) : le dépôt d'acceptation
 * et les ports de session entrent en argument ; l'adaptateur Prisma est `depotDAcceptation`, le
 * câblage du processus `portsDuProcessus`, la lecture du registre sur disque `lireLaPolitique`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { extrairePolitique, type LecturePolitique } from '../../domain/rgpd/politique';
import { configurationDuLien, type DependancesDuLien } from '../auth/lien-magique-production';
import { depotDeSessions, exigerSession, type PortsDeSession } from '../auth/session';

/** Le registre de l'article 30, copié dans l'image avec `docs/` et lu à l'exécution. */
export const CHEMIN_DU_REGISTRE = 'docs/rgpd/registre-article-30.md';

/** Les routes que ce module désigne. */
export const ROUTE_CONFIDENTIALITE = '/confidentialite';
export const ROUTE_ISSUE_OUVERTE = '/connexion?issue=ouverte';

// ── le cœur ──────────────────────────────────────────────────────────────────────────────────────

/** Ce que la base porte de l'acceptation d'un apporteur. */
export interface AcceptationLue {
  accepteeAt: Date | null;
  version: string | null;
}

export interface DepotDAcceptation {
  /** `null` : aucun apporteur de cet identifiant. */
  lire(apporteurId: string): Promise<AcceptationLue | null>;
  ecrire(apporteurId: string, accepteeAt: Date, version: string): Promise<void>;
}

/** Les états de la page : sans session (lecture seule), à accepter, acceptée. */
export const ETATS_D_ACCEPTATION = ['sans_session', 'a_accepter', 'acceptee'] as const;
export type EtatDAcceptation = (typeof ETATS_D_ACCEPTATION)[number];

/** L'état d'un apporteur (ou d'aucun) face à la version courante. */
export async function etatDAcceptation(
  apporteurId: string | null,
  versionCourante: string,
  depot: DepotDAcceptation
): Promise<EtatDAcceptation> {
  if (apporteurId === null) return 'sans_session';
  const lue = await depot.lire(apporteurId);
  const acceptee = lue !== null && lue.accepteeAt !== null && lue.version === versionCourante;
  return acceptee ? 'acceptee' : 'a_accepter';
}

export type IssueDAcceptation = 'acceptee' | 'version_perimee';

/** Écrit l'acceptation de la version AFFICHÉE, si elle est encore la version courante. */
export async function accepterLaPolitique(
  entree: {
    apporteurId: string;
    versionVue: string | null;
    versionCourante: string;
    maintenant: Date;
  },
  depot: DepotDAcceptation
): Promise<IssueDAcceptation> {
  if (entree.versionVue !== entree.versionCourante) return 'version_perimee';
  await depot.ecrire(entree.apporteurId, entree.maintenant, entree.versionCourante);
  return 'acceptee';
}

/** Les ports d'une requête : la session de l'espace et le dépôt d'acceptation. */
export interface PortsDAcceptation {
  session: PortsDeSession;
  depot: DepotDAcceptation;
}

/** L'état de la requête qui porte `jeton` : la session est relue en base (SEC-04). */
export async function etatDeLaRequete(
  jeton: string | undefined,
  versionCourante: string,
  ports: PortsDAcceptation
): Promise<EtatDAcceptation> {
  const verdict = await exigerSession(jeton, ports.session);
  return etatDAcceptation(
    verdict.ok ? verdict.session.apporteurId : null,
    versionCourante,
    ports.depot
  );
}

/**
 * Où mène une connexion qui vient d'ouvrir sa session : vers la politique si elle reste à accepter,
 * sinon vers l'issue habituelle. Une politique illisible ou une base injoignable ne bloquent pas la
 * connexion : l'issue habituelle, et le motif part au journal (la politique sera redemandée à la
 * connexion suivante, et reste lisible sur sa page).
 */
export async function destinationDeLOuverture(
  jetonSession: string,
  lecture: () => LecturePolitique,
  ports: () => PortsDAcceptation,
  signaler: (motif: string) => void
): Promise<string> {
  try {
    const lue = lecture();
    if (!lue.ok) {
      signaler('confidentialite_registre_illisible');
      return ROUTE_ISSUE_OUVERTE;
    }
    const etat = await etatDeLaRequete(jetonSession, lue.politique.version, ports());
    return etat === 'a_accepter' ? ROUTE_CONFIDENTIALITE : ROUTE_ISSUE_OUVERTE;
  } catch {
    signaler('confidentialite_etat_illisible');
    return ROUTE_ISSUE_OUVERTE;
  }
}

// ── la lecture du registre ───────────────────────────────────────────────────────────────────────

/** La politique lue dans le registre sur disque ; un fichier absent est un refus nommé. */
export function lireLaPolitique(racine: string = process.cwd()): LecturePolitique {
  let registre: string;
  try {
    registre = readFileSync(join(racine, CHEMIN_DU_REGISTRE), 'utf8');
  } catch {
    return { ok: false, refus: `registre introuvable : ${CHEMIN_DU_REGISTRE}` };
  }
  return extrairePolitique(registre);
}

// ── l'adaptateur Prisma et le câblage ────────────────────────────────────────────────────────────

export function depotDAcceptation(prisma: PrismaClient): DepotDAcceptation {
  return {
    async lire(apporteurId) {
      const ligne = await prisma.apporteur.findUnique({
        where: { id: apporteurId },
        select: { confidentialiteAccepteeAt: true, confidentialiteVersion: true },
      });
      return ligne === null
        ? null
        : { accepteeAt: ligne.confidentialiteAccepteeAt, version: ligne.confidentialiteVersion };
    },
    async ecrire(apporteurId, accepteeAt, version) {
      await prisma.apporteur.update({
        where: { id: apporteurId },
        data: { confidentialiteAccepteeAt: accepteeAt, confidentialiteVersion: version },
      });
    },
  };
}

/** Les ports du processus : l'horloge, la base et le secret des sessions de la connexion. */
export function portsDuProcessus(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'>
): PortsDAcceptation {
  return {
    session: {
      maintenant: () => new Date(d.horloge.maintenant()),
      depot: depotDeSessions(d.prisma),
      configuration: configurationDuLien(d.env).session,
    },
    depot: depotDAcceptation(d.prisma),
  };
}
