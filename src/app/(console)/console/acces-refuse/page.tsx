/**
 * `/console/acces-refuse` — l'accès refusé (UX-P1-16, point 4) : la page demandée n'est pas ouverte au
 * rôle. Elle dit ce que l'utilisateur peut faire (revenir à son accueil, qui reste ouvert) et à qui
 * s'adresser (un administrateur change le rôle). Ouverte à tout rôle (`ecran:acces_refuse`) ; sans
 * session admise, retour à la connexion.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { ETATS_VIDES_CONSOLE } from '../../../../content/micro-copy/console/etats-vides';
import { requireRole } from '../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../server/auth/lien-magique-production';

// Lue à chaque requête : elle lit le cookie de session et les secrets de l'environnement,
// rien ne s'y pré-rend au build.
export const dynamic = 'force-dynamic';

export default async function PageAccesRefuse() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:acces_refuse', jeton, portsDeRoleConsole(d));
  if (!verdict.ok) redirect('/console/connexion');
  const ecran = ETATS_VIDES_CONSOLE['acces-refuse'];
  return (
    <main>
      <h1>{ecran?.titre}</h1>
      <p>{ecran?.phrase}</p>
      <a href="/console">{ecran?.action.libelle}</a>
    </main>
  );
}
