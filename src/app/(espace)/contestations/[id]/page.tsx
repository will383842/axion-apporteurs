/**
 * `/contestations/[id]` — « Ma contestation » (UX-P1-51, REQ-DM-043, REQ-UX-047).
 *
 * La garde de l'espace est le PREMIER acte : la session pour ce segment, puis l'acceptation de la
 * politique (SEC-53). Un résilié dont les droits courent y lit, en `lecture` (sécurité, #775,
 * 6032748282) ; aucune action n'est ouverte ici. L'apporteur est celui de la session, jamais une entrée
 * de la requête : le lecteur unique le met dans son `where`. Un identifiant hors forme, une contestation
 * inconnue ou celle d'un autre apporteur rendent la MÊME page « indisponible ». La page n'écrit rien.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { portsDeLaGarde as portsDeLAcceptation } from '../../../../server/auth/garde-espace';
import { dependancesDuProcessus } from '../../../../server/auth/lien-magique-production';
import {
  COOKIE_DE_SESSION,
  pageEspace,
  type PortsDeSession,
} from '../../../../server/auth/session';
import { dateDeLaContestation, relireLaContestation } from '../../../../server/contestation/relire';
import { clesPii } from '../../../../server/securite/pii';
import {
  ROUTE_CONFIDENTIALITE,
  ROUTE_INDISPONIBLE,
  portsDuProcessus,
} from '../../../../server/rgpd/acceptation';
import { EcranContestation } from './ecran';

// Lue à chaque requête : elle lit le cookie de session et les secrets de l'environnement.
export const dynamic = 'force-dynamic';

const ROUTE_CONNEXION = '/connexion';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Les ports de la garde : la session de l'espace ET l'acceptation de la politique. */
function portsDeLaGarde(): PortsDeSession {
  const dependances = dependancesDuProcessus({ apres: after, env: process.env });
  return {
    ...portsDuProcessus(dependances).session,
    acceptation: portsDeLAcceptation(dependances.prisma),
  };
}

export default async function PageContestation({ params }: { params: Promise<{ id: string }> }) {
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const verdict = await pageEspace('contestations', jeton, portsDeLaGarde());
  if (!verdict.ok) redirect(destinationDuRefus(verdict.motif));
  const { id } = await params;
  const { prisma } = dependancesDuProcessus({ apres: after, env: process.env });
  const c = UUID.test(id)
    ? await relireLaContestation(
        prisma,
        { contestationId: id, apporteurId: verdict.session.apporteurId },
        clesPii(process.env)
      )
    : ({ etat: 'indisponible' } as const);
  return <EcranContestation contestationId={id} c={c} date={dateDeLaContestation} />;
}
