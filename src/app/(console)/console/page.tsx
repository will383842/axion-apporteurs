/**
 * `/console` — l'accueil (UX-P1-16, REQ-UX-019) : la première route LIVRÉE et permise de la liste de
 * préférence du rôle ; si aucune ne l'est encore, un état vide guidant qui dit ce qui arrive, jamais
 * un 404. Ouvert aux quatre rôles (`ecran:accueil`). Sans session admise, retour à la connexion,
 * `/console` en suite. La marque et la déconnexion sont dans le cadre (`layout.tsx`).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { ETATS_VIDES_CONSOLE } from '../../../content/micro-copy/console/etats-vides';
import { requireRole } from '../../../server/roles/require-role';
import { accueilDuRole } from '../../../server/console/navigation';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../server/auth/lien-magique-production';

// Lue à chaque requête : la page lit le cookie de session et les secrets de l'environnement,
// rien ne s'y pré-rend au build.
export const dynamic = 'force-dynamic';

export default async function PageAccueilConsole() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:accueil', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) redirect(`/console/connexion?suite=${encodeURIComponent('/console')}`);
  const accueil = accueilDuRole(verdict.utilisateur.role);
  if (accueil !== null) redirect(accueil);
  const ecran = ETATS_VIDES_CONSOLE['console-cadre'];
  return (
    <main>
      <h1>{ecran?.titre}</h1>
      <p>{ecran?.phrase}</p>
    </main>
  );
}
