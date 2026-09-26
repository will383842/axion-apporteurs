/**
 * `/connexion` — la demande de lien de connexion (SEC-03, REQ-SEC-001, REQ-SEC-002), et l'issue
 * d'une consommation (`?issue=`), affichée ici pour que l'URL ne porte plus le jeton. La page ne
 * retient qu'un état de la liste fermée du noyau ; une issue connue l'emporte sur un état.
 */
import { ETATS_DE_CONSOMMATION, ETATS_DE_DEMANDE, etatLu } from '../../../server/auth/lien-magique';
import { demanderUnLienDeConnexion } from './actions';
import { EcranConnexion, EcranIssue } from './ecran';

type Recherche = Record<string, string | string[] | undefined>;

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const { etat, issue } = await searchParams;
  const issueLue = etatLu(ETATS_DE_CONSOMMATION, issue);
  if (issueLue !== null) return <EcranIssue etat={issueLue} />;
  return (
    <EcranConnexion etat={etatLu(ETATS_DE_DEMANDE, etat)} action={demanderUnLienDeConnexion} />
  );
}
