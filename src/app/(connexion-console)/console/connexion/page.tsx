/**
 * SEC-29 — `/console/connexion` : la demande de lien, le code après l'envoi (`?etat=envoye`) ou
 * après un refus (`?code=`), et l'issue d'une consommation (`?issue=`). La page ne retient qu'un état
 * des listes fermées du noyau ; une issue connue l'emporte sur un refus de code, qui l'emporte sur
 * un état. `?suite=` porte l'URL demandée, et seulement si elle passe la borne de la console.
 */
import {
  ETATS_DE_CONSOMMATION,
  ETATS_DE_DEMANDE,
  ETATS_DU_CODE,
  etatLu,
  type EtatDeConsommation,
} from '../../../../server/auth/lien-magique';
import {
  changerDAdresseConsole,
  demanderUnLienDeConsole,
  verifierUnCodeDeConsole,
} from './actions';
import { destinationConsoleBornee } from './destination';
import {
  EcranCodeConsole,
  EcranConnexionConsole,
  EcranIssueConsole,
  type RefusDeCodeConsole,
} from './ecran';

type Recherche = Record<string, string | string[] | undefined>;

const REFUS_DE_CODE = ETATS_DU_CODE.filter((e): e is RefusDeCodeConsole => e !== 'ouverte');
const ISSUES_SANS_SESSION = ETATS_DE_CONSOMMATION.filter(
  (e): e is Exclude<EtatDeConsommation, 'ouverte'> => e !== 'ouverte'
);

export default async function PageConnexionConsole({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const { etat, issue, code, suite } = await searchParams;
  const issueLue = etatLu(ISSUES_SANS_SESSION, issue);
  if (issueLue !== null) return <EcranIssueConsole etat={issueLue} />;
  const suiteLue =
    typeof suite === 'string' && destinationConsoleBornee(suite) === suite ? suite : null;
  const refus = etatLu(REFUS_DE_CODE, code);
  const etatDeDemande = etatLu(ETATS_DE_DEMANDE, etat);
  if (refus !== null || etatDeDemande === 'envoye')
    return (
      <EcranCodeConsole
        refus={refus}
        verifier={verifierUnCodeDeConsole}
        changer={changerDAdresseConsole}
        suite={suiteLue}
      />
    );
  return (
    <EcranConnexionConsole etat={etatDeDemande} action={demanderUnLienDeConsole} suite={suiteLue} />
  );
}
