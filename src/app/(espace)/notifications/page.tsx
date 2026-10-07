/**
 * `/notifications` — les notifications de l'espace apporteur (UX-P1-54, REQ-UX-016, REQ-UX-047).
 *
 * La garde de l'espace est le PREMIER acte : la session pour ce segment, puis l'acceptation de la
 * politique (SEC-43, SEC-53). L'apporteur est celui de la session, jamais une entrée de la requête.
 * Le lecteur dédié rend des textes déjà résolus ; la page n'écrit rien, et aucune date de lecture.
 * Elle y rend aussi, pour un résilié en `lecture`, sa notification de résiliation (UX-P1-59).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { portsDeLaGarde as portsDeLAcceptation } from '../../../server/auth/garde-espace';
import { dependancesDuProcessus } from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION, pageEspace, type PortsDeSession } from '../../../server/auth/session';
import { notificationsDeLEspace } from '../../../server/notifications/notifications-de-l-espace';
import { finDUneSuspension, lireLaChargeDUnFait } from '../../../server/evenement/journal';
import { clesPii } from '../../../server/securite/pii';
import {
  ROUTE_CONFIDENTIALITE,
  ROUTE_INDISPONIBLE,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';
import { EcranNotifications } from './ecran';

const ROUTE_CONNEXION = '/connexion';

/** Où mène un refus de la garde : la politique à accepter, l'indisponibilité, ou la connexion. */
function destinationDuRefus(motif: string): string {
  if (
    motif === 'acceptation_requise' ||
    motif === 'politique_non_publiable' ||
    motif === 'politique_illisible'
  )
    return ROUTE_CONFIDENTIALITE;
  if (motif === 'session_illisible' || motif === 'acceptation_illisible') return ROUTE_INDISPONIBLE;
  return ROUTE_CONNEXION;
}

/**
 * Les ports de la garde : la session de l'espace ET l'acceptation de la politique. Sans le second, la
 * garde refuserait toute route hors des exemptions nommées (`acceptation_illisible`).
 */
function portsDeLaGarde(): PortsDeSession {
  const dependances = dependancesDuProcessus({ apres: after, env: process.env });
  return {
    ...portsDuProcessus(dependances).session,
    acceptation: portsDeLAcceptation(dependances.prisma),
  };
}

export default async function PageNotifications() {
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const verdict = await pageEspace('notifications', jeton, portsDeLaGarde());
  if (!verdict.ok) redirect(destinationDuRefus(verdict.motif));
  const { prisma } = dependancesDuProcessus({ apres: after, env: process.env });
  // Les clés des faits d'une décision du contrat (UX-P1-59) ou d'une anomalie (UX-P1-58), et la lecture
  // d'un fait par l'écrivain unique du journal : les lecteurs réservés ne lisent que l'apporteur de la session.
  const notifications = await notificationsDeLEspace(prisma, verdict.session.apporteurId, {
    cles: clesPii(process.env),
    lireUnFait: (id) => lireLaChargeDUnFait(prisma, id),
    // SEC-15 : la fin d'une suspension purgée, lue au journal depuis le fait de sa pose.
    finDUneSuspension: async (id) =>
      (await finDUneSuspension(prisma, verdict.session.apporteurId, BigInt(id)))?.fin ?? null,
  });
  return <EcranNotifications notifications={notifications} />;
}
