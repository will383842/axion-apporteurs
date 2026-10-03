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
 * JUR-T57 — LA POLITIQUE PUBLIABLE (condition de mise en service d'A07). Une politique qui porte un
 * seul segment « en cours de rédaction » n'est JAMAIS présentée à l'acceptation : l'état est
 * `non_publiable`, nommé, et l'acceptation est REFUSÉE. Le refus tient FERMÉ (aucune acceptation
 * implicite) et se REJUGE au moment d'écrire : `accepterLaPolitique` reçoit la politique elle-même,
 * jamais un drapeau fourni par l'appelant, et juge sa publiabilité avant sa version.
 *
 * CŒUR PUR, PORTS INJECTÉS, comme la session (`src/server/auth/session.ts`) : le dépôt d'acceptation
 * et les ports de session entrent en argument ; l'adaptateur Prisma est `depotDAcceptation`, le
 * câblage du processus `portsDuProcessus`, la lecture du registre sur disque `lireLaPolitique`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  estPubliable,
  extrairePolitique,
  type LecturePolitique,
  type Politique,
} from '../../domain/rgpd/politique';
import { configurationDuLien, type DependancesDuLien } from '../auth/lien-magique-production';
import {
  depotDeSessions,
  exigerSession,
  type PortsDeSession,
  type RefusDOuvertureLimitee,
} from '../auth/session';

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

/**
 * Les états de la page : sans session (lecture seule), à accepter, acceptée — et non publiable
 * (JUR-T57) : la politique porte un segment en cours de rédaction, elle n'est pas présentée à
 * l'acceptation.
 */
export const ETATS_D_ACCEPTATION = [
  'sans_session',
  'a_accepter',
  'acceptee',
  'non_publiable',
] as const;
export type EtatDAcceptation = (typeof ETATS_D_ACCEPTATION)[number];

/** L'état d'un apporteur (ou d'aucun) face à la politique COURANTE. */
export async function etatDAcceptation(
  apporteurId: string | null,
  courante: Politique,
  depot: DepotDAcceptation
): Promise<EtatDAcceptation> {
  if (apporteurId === null) return 'sans_session';
  if (!estPubliable(courante)) return 'non_publiable';
  const lue = await depot.lire(apporteurId);
  const acceptee = lue !== null && lue.accepteeAt !== null && lue.version === courante.version;
  return acceptee ? 'acceptee' : 'a_accepter';
}

export type IssueDAcceptation = 'acceptee' | 'version_perimee' | 'non_publiable';

/**
 * Écrit l'acceptation de la version AFFICHÉE, si la politique courante est PUBLIABLE et si la version
 * affichée est encore la sienne. La publiabilité se rejuge ICI, au moment d'écrire (lentille
 * sécurité) : un formulaire envoyé avant que le registre ne rouvre une rubrique n'écrit rien.
 */
export async function accepterLaPolitique(
  entree: {
    apporteurId: string;
    versionVue: string | null;
    courante: Politique;
    maintenant: Date;
  },
  depot: DepotDAcceptation
): Promise<IssueDAcceptation> {
  if (!estPubliable(entree.courante)) return 'non_publiable';
  if (entree.versionVue !== entree.courante.version) return 'version_perimee';
  await depot.ecrire(entree.apporteurId, entree.maintenant, entree.courante.version);
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
  courante: Politique,
  ports: PortsDAcceptation
): Promise<EtatDAcceptation> {
  const verdict = await exigerSession(jeton, ports.session);
  return etatDAcceptation(verdict.ok ? verdict.session.apporteurId : null, courante, ports.depot);
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
    const etat = await etatDeLaRequete(jetonSession, lue.politique, ports());
    // Non publiable : la page de la politique, jamais l'issue habituelle (refus FERMÉ, JUR-T57).
    return etat === 'acceptee' ? ROUTE_ISSUE_OUVERTE : ROUTE_CONFIDENTIALITE;
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
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'> &
    Partial<Pick<DependancesDuLien, 'journal'>>
): PortsDAcceptation {
  const journal = d.journal;
  return {
    session: {
      maintenant: () => new Date(d.horloge.maintenant()),
      depot: depotDeSessions(d.prisma),
      configuration: configurationDuLien(d.env).session,
      // SEC-43 : un refus d'ouverture limitée, au journal — le statut et le segment, rien d'autre.
      ...(journal === undefined
        ? {}
        : {
            journal: ({ signal, motif, statut, segment }: RefusDOuvertureLimitee) =>
              journal.warn(signal, { motif, statut, segment }),
          }),
    },
    depot: depotDAcceptation(d.prisma),
  };
}
