/**
 * `/connexion` — la demande de lien de connexion (SEC-03, REQ-SEC-001, REQ-SEC-002), l'issue d'une
 * consommation (`?issue=`), affichée ici pour que l'URL ne porte plus le jeton, et le code à six
 * chiffres (UX-P1-04) : après l'envoi (`?etat=envoye`) ou après un refus (`?code=`). La page ne retient
 * qu'un état des listes fermées du noyau ; une issue connue l'emporte sur un refus de code, qui
 * l'emporte sur un état. `?suite=` porte l'URL demandée, bornée au retour de la connexion.
 */
import {
  ETATS_DE_CONSOMMATION,
  ETATS_DE_DEMANDE,
  ETATS_DU_CODE,
  etatLu,
} from '../../../server/auth/lien-magique';
import { CONNEXION } from '../../../content/micro-copy/espace/vocabulaire';
import { changerDAdresse, demanderUnLienDeConnexion, verifierUnCodeDeConnexion } from './actions';
import { destinationBornee } from './destination';
import { EcranCode, EcranConnexion, EcranIssue, type RefusDeCode } from './ecran';

type Recherche = Record<string, string | string[] | undefined>;

const REFUS_DE_CODE = ETATS_DU_CODE.filter((e): e is RefusDeCode => e !== 'ouverte');

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const { etat, issue, code, suite } = await searchParams;
  const issueLue = etatLu(ETATS_DE_CONSOMMATION, issue);
  if (issueLue !== null) return <EcranIssue etat={issueLue} />;
  // La suite n'est portée que si elle passe la borne : une URL hors de l'espace ne l'est même pas.
  const suiteLue = typeof suite === 'string' && destinationBornee(suite) === suite ? suite : null;
  const refus = etatLu(REFUS_DE_CODE, code);
  const etatDeDemande = etatLu(ETATS_DE_DEMANDE, etat);
  if (refus !== null || etatDeDemande === 'envoye')
    return (
      <EcranCode
        refus={refus}
        verifier={verifierUnCodeDeConnexion}
        changer={changerDAdresse}
        suite={suiteLue}
        intro={refus === null ? CONNEXION.reponses.envoye : undefined}
      />
    );
  return <EcranConnexion etat={etatDeDemande} action={demanderUnLienDeConnexion} />;
}
