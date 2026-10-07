/**
 * `/console/apporteurs/[id]/acces` — révoquer et renouveler l'accès d'un apporteur (SEC-71, contrat v2,
 * art. 3.8 ; REQ-UX-047). L'écran n'est ouvert qu'à l'administrateur (`ecran:acces_apporteur`) ; le
 * geste est une action à step-up, son droit relu en base (`_acces/actions.ts`). La page ne lit que le
 * STATUT de l'apporteur, pour choisir son état ; aucune autre donnée. Textes :
 * `console/acces-apporteur.ts`.
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
import {
  etatDeLAcces,
  type RefusDeRevocation,
} from '../../../../../../server/console/acces-apporteur';
import { ACCES_APPORTEUR as T } from '../../../../../../content/micro-copy/console/acces-apporteur';
import { EcranAccesApporteur } from './_acces/ecran';
import { revoquerLAcces } from './_acces/actions';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS_DE_ROLE: readonly MotifDeRefusConsole[] = [
  'droit_absent',
  'role_refuse',
  'admin_en_attente',
];

/** Un refus reçu en paramètre n'est rendu que s'il est l'un des motifs connus. */
function refusLu(valeur: unknown): RefusDeRevocation | null {
  return typeof valeur === 'string' && Object.hasOwn(T.refus, valeur)
    ? (valeur as RefusDeRevocation)
    : null;
}

export default async function PageAccesApporteur(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const parametres = await props.searchParams;
  const ecran = `/console/apporteurs/${UUID.test(id) ? id : ''}/acces`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:acces_apporteur', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) {
    // Un rôle qui n'a pas l'écran voit l'accès refusé ; une session absente ou tombée, la connexion.
    if (REFUS_DE_ROLE.includes(verdict.motif)) redirect('/console/acces-refuse');
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  }
  const etat = UUID.test(id) ? await etatDeLAcces(d.prisma, id) : 'introuvable';
  return (
    <EcranAccesApporteur
      apporteurId={id}
      etat={etat}
      refus={refusLu(parametres.refus)}
      revoque={parametres.fait === 'revoque'}
      revoquer={revoquerLAcces}
    />
  );
}
