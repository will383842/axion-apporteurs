/**
 * `/console/prolongations` — les attributions dont la décision de prolongation est ouverte, les termes
 * les plus proches d'abord (EXT-T07, REQ-EXT-020, REQ-UX-047). L'écran n'est ouvert qu'à
 * l'administrateur (`ecran:prolongations`) ; la liste est bornée. Textes : `console/prolongations.ts`.
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
import { listerLesProlongationsADecider } from '../../../../server/attribution/prolonger';
import { entrepriseDeLaNotification } from '../../../../server/attribution/notifications';
import { versParis } from '../../../../domain/temps/paris';
import { jourDeParis } from '../../../../server/console/utilisateurs/dates';
import { ListeDesProlongations } from './_prolongations/ecran';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const ECRAN = '/console/prolongations';
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** « 2 novembre 2026 », à Paris. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

/** L'entreprise lisible, ou `null` : un numéro illisible n'arrête pas la liste. */
function entreprise(raisonSociale: string | null, siren: string): string | null {
  try {
    return entrepriseDeLaNotification(raisonSociale, siren);
  } catch {
    return null;
  }
}

export default async function PageDesProlongations() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:prolongations', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
  }
  const lues = await listerLesProlongationsADecider(d.prisma, new Date(d.horloge.maintenant()));
  const lignes = lues.map((l) => ({
    id: l.id,
    entreprise: entreprise(l.raisonSociale, l.siren),
    termeAt: l.termeAt,
  }));
  return <ListeDesProlongations lignes={lignes} date={date} />;
}
