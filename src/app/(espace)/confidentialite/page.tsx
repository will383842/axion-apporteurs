/**
 * `/confidentialite` — la politique de confidentialité de l'espace (JUR-T34, REQ-JUR-025).
 *
 * La page LIT le registre de l'article 30 à chaque affichage : une valeur changée au registre
 * change la page sans toucher la page. Elle n'écrit aucune durée ni aucun prestataire — le témoin
 * `valeursRetapees` confronte ce source au registre. Lisible sans session ; avec une session
 * d'espace dont la politique reste à accepter, elle montre le formulaire d'accord.
 */
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { dependancesDuProcessus } from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION } from '../../../server/auth/session';
import {
  etatDeLaRequete,
  lireLaPolitique,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';
import { accepterLaPolitiqueDeConfidentialite } from './actions';
import { EcranConfidentialite, EcranErreurConfidentialite } from './ecran';

export default async function PageConfidentialite() {
  const lue = lireLaPolitique();
  if (!lue.ok) return <EcranErreurConfidentialite />;
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const etat =
    jeton === undefined
      ? 'sans_session'
      : await etatDeLaRequete(
          jeton,
          lue.politique.version,
          portsDuProcessus(dependancesDuProcessus({ apres: after, env: process.env }))
        );
  return (
    <EcranConfidentialite
      politique={lue.politique}
      etat={etat}
      action={accepterLaPolitiqueDeConfidentialite}
    />
  );
}
