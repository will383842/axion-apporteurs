/**
 * SEC-29 — `/console/connexion/<jeton>` : l'arrivée du lien de la console. Rien n'est consommé à
 * l'affichage (un lecteur de courriel qui précharge le lien ne l'use pas) : la consommation part du
 * bouton de confirmation, et son issue s'affiche sur `/console/connexion`, sans le jeton.
 */
import { consommerUnLienDeConsole } from '../actions';
import { EcranArriveeConsole } from '../ecran';

export default async function PageArriveeConsole({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  return <EcranArriveeConsole action={consommerUnLienDeConsole.bind(null, jeton)} />;
}
