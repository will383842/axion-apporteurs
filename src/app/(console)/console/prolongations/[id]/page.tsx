/**
 * `/console/prolongations/[id]` — décider de la prolongation d'une attribution : prolonger sur une des
 * trois conditions de l'art. 3.4 al. 3, ou constater qu'aucune n'est remplie (EXT-T07, REQ-EXT-020,
 * REQ-UX-047). L'écran n'est ouvert qu'à l'administrateur (`ecran:prolongations`) ; le geste est une
 * action à step-up, son droit relu en base (`../_prolongations/actions.ts`).
 */
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
  lireUneProlongation,
  type RefusDeProlongation,
} from '../../../../../server/attribution/prolonger';
import { entrepriseDeLaNotification } from '../../../../../server/attribution/notifications';
import { versParis } from '../../../../../domain/temps/paris';
import { jourDeParis } from '../../../../../server/console/utilisateurs/dates';
import { PROLONGATIONS_CONSOLE as T } from '../../../../../content/micro-copy/console/prolongations';
import { DeciderDeLaProlongation } from '../_prolongations/ecran';
import { deciderLaProlongation } from '../_prolongations/actions';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** Un refus reçu en paramètre n'est rendu que s'il est l'un des motifs connus. */
function refusLu(valeur: unknown): Exclude<RefusDeProlongation, 'droit_absent'> | null {
  return typeof valeur === 'string' && Object.hasOwn(T.refus, valeur)
    ? (valeur as Exclude<RefusDeProlongation, 'droit_absent'>)
    : null;
}
/** Le retour du geste, s'il est l'un des deux connus. */
function issueLue(valeur: unknown): 'prolongee' | 'constatee' | null {
  return valeur === 'prolongee' || valeur === 'constatee' ? valeur : null;
}

/** L'entreprise lisible, ou `null` : un numéro illisible n'arrête pas la page. */
function entrepriseLisible(raisonSociale: string | null, siren: string): string | null {
  try {
    return entrepriseDeLaNotification(raisonSociale, siren);
  } catch {
    return null;
  }
}

/** « 2 novembre 2026 », à Paris. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

export default async function PageDeciderDeLaProlongation(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const parametres = await props.searchParams;
  const valide = UUID.test(id);
  const ecran = `/console/prolongations/${valide ? id : ''}`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:prolongations', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  }
  const lue = valide
    ? await d.prisma.attribution.findUnique({
        where: { id },
        select: { raisonSociale: true, siren: true, fenetreFinAt: true },
      })
    : null;
  const lecture = valide
    ? await lireUneProlongation(d.prisma, id, new Date(d.horloge.maintenant()))
    : ({ etat: 'introuvable' } as const);
  const entreprise = lue === null ? null : entrepriseLisible(lue.raisonSociale, lue.siren);
  // Le retour du geste : l'issue vient de l'adresse, le terme est RELU en base.
  const issue = issueLue(parametres.fait);
  const retour =
    issue === null || lue?.fenetreFinAt == null ? null : { issue, terme: date(lue.fenetreFinAt) };
  return (
    <DeciderDeLaProlongation
      lecture={lecture}
      entreprise={entreprise}
      refus={refusLu(parametres.refus)}
      retour={retour}
      date={date}
      action={deciderLaProlongation}
    />
  );
}
