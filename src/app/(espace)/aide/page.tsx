/**
 * `/aide` — « Écrire à Axion-IA » (UX-P1-62, REQ-DM-043, REQ-UX-047), le noyau de l'écrit de
 * l'apporteur ; le fil de conversation reste en phase 3 (UX-P3-03).
 *
 * La garde de l'espace est le PREMIER acte : la session pour ce segment, puis l'acceptation de la
 * politique (SEC-43, SEC-53). Le segment est PLEIN seulement : un résilié en lecture n'écrit pas ici.
 * La page n'écrit rien : elle tire la clé d'idempotence du formulaire, et rend les textes.
 */
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { portsDeLaGarde as portsDeLAcceptation } from '../../../server/auth/garde-espace';
import { dependancesDuProcessus } from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION, pageEspace, type PortsDeSession } from '../../../server/auth/session';
import {
  ROUTE_CONFIDENTIALITE,
  ROUTE_INDISPONIBLE,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';
import { EcranAide } from './ecran';

// Lue à chaque requête : elle lit le cookie de session et tire une clé neuve.
export const dynamic = 'force-dynamic';

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

/** Les ports de la garde : la session de l'espace ET l'acceptation de la politique. */
function portsDeLaGarde(): PortsDeSession {
  const dependances = dependancesDuProcessus({ apres: after, env: process.env });
  return {
    ...portsDuProcessus(dependances).session,
    acceptation: portsDeLAcceptation(dependances.prisma),
  };
}

export default async function PageAide() {
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const verdict = await pageEspace('aide', jeton, portsDeLaGarde());
  if (!verdict.ok) redirect(destinationDuRefus(verdict.motif));
  return <EcranAide cle={randomUUID()} />;
}
