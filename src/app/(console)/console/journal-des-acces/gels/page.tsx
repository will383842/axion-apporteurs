/**
 * `/console/journal-des-acces/gels` — les gels du journal des accès : la liste, poser et lever
 * (REQ-SEC-023, REQ-UX-047). L'écran n'est ouvert qu'à un administrateur VALIDÉ, droit RELU en base
 * par la lecture de la liste ; poser et lever sont des actions à step-up (`actions.ts`). Textes :
 * `console/gels-journal-acces.ts`.
 *
 * La liste est bornée et paginée par curseur, et chaque page écrit ses traces AVANT d'être rendue
 * (`lireLesGels`) : un administrateur en attente, ou tout autre rôle, est renvoyé à l'accès refusé
 * sans qu'aucun gel soit lu.
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type MotifDeRefusConsole } from '../../../../../server/roles/require-role';
import { clesPii } from '../../../../../server/securite/pii';
import {
  SAUTS_DE_CONFIANCE,
  adresseDuClient,
} from '../../../../../server/securite/adresse-du-client';
import { versParis } from '../../../../../domain/temps/paris';
import { jourDeParis } from '../../../../../server/console/utilisateurs/dates';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../server/auth/lien-magique-production';
import {
  CurseurDesGelsIllisible,
  droitsDuLecteurSurLesGels,
  ErreurGelJournal,
  lireLesGels,
  type MotifDuGel,
} from '../../../../../server/console/gels-journal-acces';
import { GELS_JOURNAL_ACCES as T } from '../../../../../content/micro-copy/console/gels-journal-acces';
import { EcranDesGels } from './_gels/ecran';
import { leverLeGel, poserLeGel } from './_gels/actions';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const ECRAN = '/console/journal-des-acces/gels';
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** Un refus reçu en paramètre n'est rendu que s'il est l'un des motifs connus. */
function refusLu(valeur: unknown): MotifDuGel | 'saisie' | null {
  if (typeof valeur !== 'string') return null;
  return valeur === 'saisie' || Object.hasOwn(T.refus, valeur)
    ? (valeur as MotifDuGel | 'saisie')
    : null;
}

/** « 4 octobre 2026 », à Paris : une période de gel se lit avec son année. */
const date = (d: Date) => `${jourDeParis(d)} ${versParis(d.getTime()).annee}`;

export default async function PageDesGels(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await props.searchParams;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('action:lire_journal_des_acces', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    // Un rôle qui n'a pas l'écran voit l'accès refusé ; une session absente ou tombée, la connexion.
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
  }
  const lecteurId = verdict.utilisateur.id;
  const curseur = typeof parametres.apres === 'string' ? parametres.apres : null;

  let page: Awaited<ReturnType<typeof lireLesGels>>;
  try {
    page = await lireLesGels(
      d.prisma,
      {
        lecteurId,
        curseur,
        adresse: adresseDuClient(await headers(), SAUTS_DE_CONFIANCE),
      },
      clesPii(d.env)
    );
  } catch (e) {
    if (e instanceof CurseurDesGelsIllisible) redirect(ECRAN);
    if (e instanceof ErreurGelJournal) redirect('/console/acces-refuse');
    throw e;
  }
  // La liste a relu le droit dans sa transaction ; les gestes, eux, le relisent chacun.
  const droits = (await droitsDuLecteurSurLesGels(d.prisma, lecteurId)) ?? {
    poser: false,
    lever: false,
  };

  return (
    <EcranDesGels
      gels={page.gels}
      droits={droits}
      actions={{ poser: poserLeGel, lever: leverLeGel }}
      refus={refusLu(parametres.refus)}
      date={date}
      suivante={page.suivant === null ? null : `${ECRAN}?apres=${page.suivant}`}
      premiere={curseur === null ? null : ECRAN}
    />
  );
}
