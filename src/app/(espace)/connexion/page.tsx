/**
 * `/connexion` — la demande de lien de connexion (SEC-03, REQ-SEC-001, REQ-SEC-002). La page lit
 * `?etat=` et n'en retient qu'un état de la liste fermée du noyau.
 */
import { ETATS_DE_DEMANDE, etatLu } from '../../../server/auth/lien-magique';
import { demanderUnLienDeConnexion } from './actions';
import { EcranConnexion } from './ecran';

type Recherche = Record<string, string | string[] | undefined>;

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const { etat } = await searchParams;
  return (
    <EcranConnexion etat={etatLu(ETATS_DE_DEMANDE, etat)} action={demanderUnLienDeConnexion} />
  );
}
