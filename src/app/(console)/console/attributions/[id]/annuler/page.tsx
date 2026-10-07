/**
 * `/console/attributions/[id]/annuler` — annuler une attribution CONFIRMÉE pour l'une des deux exceptions
 * de l'art. 3.3 du contrat v2 : l'erreur d'identification de l'entreprise, ou la fraude de l'apporteur
 * établie par une anomalie de sincérité confirmée (UX-P1-63, REQ-UX-047, REQ-SEC-023 ; geste serveur de
 * DM-71). Réservé à l'administrateur, sous step-up : la page pose le droit du geste lui-même.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type MotifDeRefusConsole } from '../../../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../../server/auth/lien-magique-production';
import { entrepriseDeLaNotification } from '../../../../../../server/attribution/notifications';
import { versParis } from '../../../../../../domain/temps/paris';
import { jourDeParis } from '../../../../../../server/console/utilisateurs/dates';
import { ANNULATION_APRES_CONFIRMATION_CONSOLE as T } from '../../../../../../content/micro-copy/console/annulation-apres-confirmation';
import { lireLAnnulation } from './_annuler/lecture';
import { AnnulerLAttribution, type RefusDeLAnnulation } from './_annuler/ecran';
import { annulerLAttribution } from './_annuler/actions';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** Un refus reçu en paramètre n'est rendu que s'il est l'un des motifs connus. */
function refusLu(valeur: unknown): RefusDeLAnnulation | null {
  return typeof valeur === 'string' && Object.hasOwn(T.refus, valeur)
    ? (valeur as RefusDeLAnnulation)
    : null;
}

/** L'entreprise lisible, ou `null` : un numéro illisible n'arrête pas la page. */
function entrepriseLisible(raisonSociale: string | null, siren: string): string | null {
  try {
    return entrepriseDeLaNotification(raisonSociale, siren);
  } catch {
    return null;
  }
}

/** « 2 mai 2026 », à Paris. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

export default async function PageAnnulerLAttribution(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const parametres = await props.searchParams;
  const valide = UUID.test(id);
  const ecran = valide ? `/console/attributions/${id}/annuler` : '/console';
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole(
    'action:annuler_apres_confirmation',
    jeton,
    portsDeRoleConsole(d)
  );
  if (!verdict.ok) {
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  }
  const lecture = valide
    ? await lireLAnnulation(d.prisma, id)
    : ({ etat: 'attribution_introuvable' } as const);
  const entreprise =
    lecture.etat === 'a_annuler'
      ? entrepriseLisible(lecture.attribution.raisonSociale, lecture.attribution.siren)
      : null;
  return (
    <AnnulerLAttribution
      lecture={lecture}
      entreprise={entreprise}
      ficheHref="/console/attributions"
      refus={refusLu(parametres.refus)}
      fait={parametres.fait === 'annulee'}
      date={date}
      action={annulerLAttribution}
    />
  );
}
