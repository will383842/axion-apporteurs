/**
 * UX-P1-16 — le cadre de chaque page de la console : la marque, qui ramène à l'accueil, la
 * navigation DÉRIVÉE des droits du rôle et des écrans livrés, et la déconnexion. La mise en page ne
 * décide d'aucun accès : chaque page pose sa propre question à `requireRole`. Elle lit le rôle pour
 * dériver la navigation ; sans session admise, l'en-tête n'a ni entrée ni compte.
 */
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { CONNEXION_CONSOLE } from '../../../content/micro-copy/console/connexion';
import { NavigationConsole } from '../../../components/console/navigation';
import { requireRole } from '../../../server/roles/require-role';
import { entreesDuRole } from '../../../server/console/navigation';
import { seDeconnecter } from '../../../server/console/session';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../server/auth/lien-magique-production';

// Lue à chaque requête : elle lit le cookie de session et les secrets de l'environnement,
// rien ne s'y pré-rend au build.
export const dynamic = 'force-dynamic';

export default async function CadreDeLaConsole({ children }: { children: ReactNode }) {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:accueil', jeton, portsDeRoleConsole(d));
  return (
    <>
      <header>
        <a href="/console">{CONNEXION_CONSOLE.marque}</a>
        {verdict.ok ? (
          <NavigationConsole
            entrees={entreesDuRole(verdict.utilisateur.role)}
            compte={
              <form action={seDeconnecter}>
                <button type="submit">{CONNEXION_CONSOLE.deconnexion}</button>
              </form>
            }
          />
        ) : null}
      </header>
      {children}
    </>
  );
}
