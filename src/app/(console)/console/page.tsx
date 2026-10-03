/**
 * SEC-29 — `/console` : le repli de la redirection après la connexion, minimal tant que l'accueil
 * du rôle (UX-P1-16) n'existe pas. Un titre, une phrase, et la déconnexion ; ouvert aux quatre rôles
 * (`ecran:accueil`). Sans session admise, retour à la connexion, `/console` en suite.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { ETATS_VIDES_CONSOLE } from '../../../content/micro-copy/console/etats-vides';
import { CONNEXION_CONSOLE } from '../../../content/micro-copy/console/connexion';
import { requireRole } from '../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../server/auth/lien-magique-production';
import { seDeconnecter } from '../../../server/console/session';

export default async function PageAccueilConsole() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:accueil', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) redirect(`/console/connexion?suite=${encodeURIComponent('/console')}`);
  const ecran = ETATS_VIDES_CONSOLE['console-cadre'];
  return (
    <main>
      <p>{CONNEXION_CONSOLE.marque}</p>
      <h1>{ecran?.titre}</h1>
      <p>{ecran?.phrase}</p>
      <form action={seDeconnecter}>
        <button type="submit">{CONNEXION_CONSOLE.deconnexion}</button>
      </form>
    </main>
  );
}
