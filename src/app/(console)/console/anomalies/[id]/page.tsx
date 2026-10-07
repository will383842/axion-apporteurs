/**
 * `/console/anomalies/[id]` — confirmer une anomalie de sincérité avec ses faits retenus (UX-P1-56,
 * REQ-UX-047, REQ-SEC-023, REQ-DM-033). L'écran n'est ouvert qu'à l'administrateur
 * (`ecran:anomalies`) ; le geste est une action à step-up, son droit relu en base
 * (`../_anomalies/actions.ts`). La page tire au rendu la clé d'idempotence du formulaire. Elle ne lit ni
 * score ni faits, et ne pose aucun gel.
 */
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type MotifDeRefusConsole } from '../../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../server/auth/lien-magique-production';
import {
  lireUneAnomalie,
  type RefusDeConfirmation,
} from '../../../../../server/console/anomalies/confirmer';
import { entrepriseDeLaNotification } from '../../../../../server/attribution/notifications';
import { versParis } from '../../../../../domain/temps/paris';
import { jourDeParis } from '../../../../../server/console/utilisateurs/dates';
import { ANOMALIES_CONSOLE as T } from '../../../../../content/micro-copy/console/anomalies';
import { ConfirmerLAnomalie } from '../_anomalies/ecran';
import { confirmerLAnomalie } from '../_anomalies/actions';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** Un refus reçu en paramètre n'est rendu que s'il est l'un des motifs connus. */
function refusLu(valeur: unknown): RefusDeConfirmation | null {
  return typeof valeur === 'string' && Object.hasOwn(T.refus, valeur)
    ? (valeur as RefusDeConfirmation)
    : null;
}
/** Le retour du geste, s'il est l'un des deux connus. */
function faitLu(valeur: unknown): boolean {
  return valeur === 'confirmee';
}

/** « 4 octobre 2026 », à Paris. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

export default async function PageConfirmerLAnomalie(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const parametres = await props.searchParams;
  const ecran = `/console/anomalies/${UUID.test(id) ? id : ''}`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:anomalies', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  }
  const lecture = await lireUneAnomalie(d.prisma, id, entrepriseDeLaNotification);
  return (
    <ConfirmerLAnomalie
      lecture={lecture}
      refus={refusLu(parametres.refus)}
      fait={faitLu(parametres.fait)}
      cleIdempotence={randomUUID()}
      date={date}
      action={confirmerLAnomalie}
    />
  );
}
