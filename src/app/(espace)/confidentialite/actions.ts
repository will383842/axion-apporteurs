'use server';
/**
 * L'action serveur de la politique de confidentialité (JUR-T34, REQ-JUR-025) : l'accord de
 * l'apporteur, envoyé sans script par le formulaire de la page.
 *
 * La session est relue en base (SEC-04) : sans session d'espace valide, rien n'est écrit et la
 * connexion s'ouvre. L'accord ne porte que sur la version AFFICHÉE ; si le registre a changé entre
 * l'affichage et l'envoi, rien n'est écrit et la page montre la nouvelle version. Aucun identifiant
 * n'arrive du navigateur : l'apporteur est celui de la session.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { dependancesDuProcessus } from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION, exigerSession } from '../../../server/auth/session';
import {
  ROUTE_CONFIDENTIALITE,
  accepterLaPolitique,
  lireLaPolitique,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';

const ROUTE_CONNEXION = '/connexion';

export async function accepterLaPolitiqueDeConfidentialite(formulaire: FormData): Promise<void> {
  const lue = lireLaPolitique();
  if (!lue.ok) redirect(ROUTE_CONFIDENTIALITE);
  const ports = portsDuProcessus(dependancesDuProcessus({ apres: after, env: process.env }));
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const verdict = await exigerSession(jeton, ports.session);
  if (!verdict.ok) redirect(ROUTE_CONNEXION);
  const versionVue = formulaire.get('version');
  await accepterLaPolitique(
    {
      apporteurId: verdict.session.apporteurId,
      versionVue: typeof versionVue === 'string' ? versionVue : null,
      versionCourante: lue.politique.version,
      maintenant: ports.session.maintenant(),
    },
    ports.depot
  );
  redirect(ROUTE_CONFIDENTIALITE);
}
