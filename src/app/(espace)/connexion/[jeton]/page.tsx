/**
 * `/connexion/<jeton>` — l'arrivée du lien (SEC-03). L'affichage ne consomme rien : le bouton de
 * confirmation appelle l'action, qui consomme le lien une fois et redirige vers son issue.
 */
import { ETATS_DE_CONSOMMATION, etatLu } from '../../../../server/auth/lien-magique';
import { consommerUnLienDeConnexion } from '../actions';
import { EcranArrivee } from '../ecran';

type Recherche = Record<string, string | string[] | undefined>;

export default async function PageArrivee({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<Recherche>;
}) {
  const { jeton } = await params;
  const { etat } = await searchParams;
  return (
    <EcranArrivee
      etat={etatLu(ETATS_DE_CONSOMMATION, etat)}
      action={consommerUnLienDeConnexion.bind(null, jeton)}
    />
  );
}
