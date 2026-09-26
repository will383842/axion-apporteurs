/**
 * `/connexion/<jeton>` — l'arrivée du lien (SEC-03). L'affichage ne consomme rien : le bouton de
 * confirmation appelle l'action, qui consomme le lien une fois et redirige vers son issue, sur
 * `/connexion`, une URL qui ne porte plus le jeton.
 */
import { consommerUnLienDeConnexion } from '../actions';
import { EcranArrivee } from '../ecran';

export default async function PageArrivee({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  return <EcranArrivee action={consommerUnLienDeConnexion.bind(null, jeton)} />;
}
