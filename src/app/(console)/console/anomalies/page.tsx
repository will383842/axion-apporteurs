/**
 * `/console/anomalies` — les anomalies de sincérité OUVERTES, les plus anciennes d'abord (UX-P1-56,
 * REQ-UX-047, REQ-SEC-023). L'écran n'est ouvert qu'à l'administrateur (`ecran:anomalies`) ; la liste
 * est bornée et ne montre ni score, ni rang, ni seuil. Textes : `console/anomalies.ts`.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type MotifDeRefusConsole } from '../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../server/auth/lien-magique-production';
import { lireLesAnomaliesOuvertes } from '../../../../server/console/anomalies/confirmer';
import { entrepriseDeLaNotification } from '../../../../server/attribution/notifications';
import { versParis } from '../../../../domain/temps/paris';
import { jourDeParis } from '../../../../server/console/utilisateurs/dates';
import { ListeDesAnomalies } from './_anomalies/ecran';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const ECRAN = '/console/anomalies';
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** « 4 octobre 2026 », à Paris. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

export default async function PageDesAnomalies() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:anomalies', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
  }
  const anomalies = await lireLesAnomaliesOuvertes(d.prisma, entrepriseDeLaNotification);
  return <ListeDesAnomalies anomalies={anomalies} date={date} />;
}
