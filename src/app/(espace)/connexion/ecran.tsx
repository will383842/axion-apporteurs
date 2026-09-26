/**
 * Les écrans de la connexion (SEC-03) : la demande de lien (`/connexion`) et l'arrivée du lien
 * (`/connexion/<jeton>`). Composants serveur, sans script client.
 *
 * Chaque texte vient de la micro-copie (`ETATS_VIDES_ESPACE['/connexion']`, `CONNEXION`) : aucun
 * libellé n'est écrit ici. L'écran ne reçoit qu'un ÉTAT, de la liste fermée du noyau : il ne peut
 * rien dire de plus que le noyau, qui répond de même que le compte existe ou non (REQ-SEC-001).
 *
 * L'arrivée ne consomme rien à l'affichage : un lecteur de courriel qui précharge le lien n'use pas
 * le lien. La consommation part du bouton de confirmation.
 */
import { ETATS_VIDES_ESPACE } from '../../../content/micro-copy/espace/etats-vides';
import { CONNEXION } from '../../../content/micro-copy/espace/vocabulaire';
import type { EtatDeConsommation, EtatDeDemande } from '../../../server/auth/lien-magique';

type Action = (formData: FormData) => void | Promise<void>;

const ID_COURRIEL = 'connexion-courriel';
/** La route de la demande, reprise de la carte des écrans (docs/ESPACE-ROUTES.md). */
const ROUTE_DEMANDE = '/connexion';

const REPONSES_DE_DEMANDE: Readonly<Record<EtatDeDemande, string>> = CONNEXION.reponses;
const REPONSES_D_ARRIVEE: Readonly<Record<EtatDeConsommation, string>> = CONNEXION.arrivee.reponses;

function Statut({ texte }: { texte: string }) {
  return (
    <p role="status" aria-live="polite">
      {texte}
    </p>
  );
}

export function EcranConnexion({ etat, action }: { etat: EtatDeDemande | null; action: Action }) {
  const ecran = ETATS_VIDES_ESPACE[ROUTE_DEMANDE];
  if (ecran === undefined) throw new Error('micro-copie absente pour la route de la demande');
  return (
    <main>
      <h1>{ecran.titre}</h1>
      <p>{ecran.phrase}</p>
      {etat === null ? null : <Statut texte={REPONSES_DE_DEMANDE[etat]} />}
      <form action={action}>
        <label htmlFor={ID_COURRIEL}>{CONNEXION.champCourriel}</label>
        <input id={ID_COURRIEL} type="email" name="courriel" autoComplete="email" required />
        <div hidden>
          <input type="text" name="site" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit">{ecran.action.libelle}</button>
      </form>
    </main>
  );
}

export function EcranArrivee({
  etat,
  action,
}: {
  etat: EtatDeConsommation | null;
  action: Action;
}) {
  const t = CONNEXION.arrivee;
  return (
    <main>
      <h1>{t.titre}</h1>
      {etat === null ? (
        <>
          <p>{t.phrase}</p>
          <form action={action}>
            <button type="submit">{t.action}</button>
          </form>
        </>
      ) : (
        <Statut texte={REPONSES_D_ARRIVEE[etat]} />
      )}
      {etat === 'lien_invalide' ? <a href={ROUTE_DEMANDE}>{t.nouveauLien}</a> : null}
    </main>
  );
}
