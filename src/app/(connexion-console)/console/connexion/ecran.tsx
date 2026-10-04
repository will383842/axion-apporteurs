/**
 * SEC-29 — les écrans de la connexion de la console : la demande (`/console/connexion`), le code
 * après l'envoi, l'arrivée du lien (`/console/connexion/<jeton>`) et l'issue d'une consommation.
 * Composants serveur, sans script client, sur le modèle de la connexion de l'espace.
 *
 * Chaque texte vient de la micro-copie : l'état vide `connexion-console` (`ETATS_VIDES_CONSOLE`) et
 * `CONNEXION_CONSOLE`. Aucun libellé n'est écrit ici. L'écran ne reçoit qu'un ÉTAT de la liste
 * fermée du noyau : il ne peut rien dire de plus que lui, qui répond de même que le compte existe
 * ou non (REQ-SEC-003).
 *
 * L'arrivée ne consomme rien à l'affichage : un lecteur de courriel qui précharge le lien ne l'use
 * pas. La consommation part du bouton de confirmation.
 */
import type { EtatVide } from '../../../../content/micro-copy/types';
import { ETATS_VIDES_CONSOLE } from '../../../../content/micro-copy/console/etats-vides';
import { CONNEXION_CONSOLE } from '../../../../content/micro-copy/console/connexion';
import { VOS_DONNEES_CONSOLE } from '../../../../content/micro-copy/console/vos-donnees';
import type {
  EtatDeConsommation,
  EtatDeDemande,
  EtatDuCode,
} from '../../../../server/auth/lien-magique';

type Action = (formData: FormData) => void | Promise<void>;

const ID_COURRIEL = 'console-courriel';
const ID_CODE = 'console-code';
/** La route de la demande : un nouveau lien ou un nouveau code se redemandent là. */
export const ROUTE_DEMANDE_CONSOLE = '/console/connexion';

function etatVide(): EtatVide {
  const ecran = ETATS_VIDES_CONSOLE['connexion-console'];
  if (ecran === undefined) throw new Error('micro-copie absente pour la connexion de la console');
  return ecran;
}

function Entete() {
  return <p>{CONNEXION_CONSOLE.marque}</p>;
}

function Statut({ texte }: { texte: string }) {
  return (
    <p role="status" aria-live="polite">
      {texte}
    </p>
  );
}

export function EcranConnexionConsole({
  etat,
  action,
  suite = null,
}: {
  etat: EtatDeDemande | null;
  action: Action;
  suite?: string | null;
}) {
  const ecran = etatVide();
  return (
    <main>
      <Entete />
      <h1>{ecran.titre}</h1>
      <p>{ecran.phrase}</p>
      {etat === null ? null : <Statut texte={CONNEXION_CONSOLE.reponses[etat]} />}
      <form action={action}>
        <label htmlFor={ID_COURRIEL}>{CONNEXION_CONSOLE.champCourriel}</label>
        <input id={ID_COURRIEL} type="email" name="courriel" autoComplete="email" required />
        <div hidden>
          <input type="text" name="site" tabIndex={-1} autoComplete="off" />
        </div>
        {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
        <button type="submit">{ecran.action.libelle}</button>
        <p>{CONNEXION_CONSOLE.aideDemande}</p>
      </form>
      <a href="/console/vos-donnees">{VOS_DONNEES_CONSOLE.titre}</a>
    </main>
  );
}

/** Les issues de refus de la vérification du code. */
export type RefusDeCodeConsole = Exclude<EtatDuCode, 'ouverte'>;

/** Un SEUL texte pour tout refus de code, un pour le débit : ceux de la juriste. */
const TEXTES_DES_REFUS: Readonly<Record<RefusDeCodeConsole, string>> = {
  code_refuse: CONNEXION_CONSOLE.code.refus,
  debit: CONNEXION_CONSOLE.code.debit,
};
export function texteDuRefusDeCodeConsole(etat: RefusDeCodeConsole): string {
  return TEXTES_DES_REFUS[etat];
}

/**
 * Le code, après l'envoi : un champ, l'action de vérification, « Changer d'adresse ». L'adresse
 * n'est jamais redemandée : son empreinte est dans le cookie d'attente de la console. Après un
 * refus, « Recevoir un nouveau code » ramène à la demande. `suite` est l'URL demandée, bornée.
 */
export function EcranCodeConsole({
  refus,
  verifier,
  changer,
  suite,
}: {
  refus: RefusDeCodeConsole | null;
  verifier: Action;
  changer: Action;
  suite: string | null;
}) {
  const t = CONNEXION_CONSOLE.code;
  return (
    <main>
      <Entete />
      <h1>{CONNEXION_CONSOLE.envoye.titre}</h1>
      {refus === null ? <Statut texte={CONNEXION_CONSOLE.envoye.phrase} /> : null}
      <form action={verifier}>
        <label htmlFor={ID_CODE}>{t.champ}</label>
        <input
          id={ID_CODE}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          aria-describedby={refus === null ? undefined : `${ID_CODE}-refus`}
        />
        {refus === null ? null : (
          <p id={`${ID_CODE}-refus`} role="alert">
            {texteDuRefusDeCodeConsole(refus)}
          </p>
        )}
        {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
        <button type="submit">{t.action}</button>
      </form>
      {refus === null ? (
        <form action={changer}>
          <button type="submit">{t.changer}</button>
        </form>
      ) : (
        <a href={ROUTE_DEMANDE_CONSOLE}>{t.nouveauCode}</a>
      )}
    </main>
  );
}

export function EcranArriveeConsole({ action }: { action: Action }) {
  return (
    <main>
      <Entete />
      <h1>{etatVide().titre}</h1>
      <form action={action}>
        <button type="submit">{CONNEXION_CONSOLE.arriveeAction}</button>
      </form>
    </main>
  );
}

/**
 * L'issue d'une consommation qui n'a pas ouvert de session (la session ouverte redirige). « Déjà
 * utilisé » a sa page (REQ-UX-048) : pourquoi, et un seul geste ; elle ne montre ni l'adresse ni le
 * nom. Un lien invalide (inconnu, expiré, annulé, autre population) ne dit que son titre et le même
 * geste : aucun texte neuf.
 */
export function EcranIssueConsole({ etat }: { etat: Exclude<EtatDeConsommation, 'ouverte'> }) {
  const t = CONNEXION_CONSOLE.dejaUtilise;
  return (
    <main>
      <Entete />
      {etat === 'deja_utilise' ? (
        <>
          <h1>{t.titre}</h1>
          <p>{t.phrase}</p>
        </>
      ) : (
        <h1>{etatVide().titre}</h1>
      )}
      <a href={ROUTE_DEMANDE_CONSOLE}>{t.action}</a>
    </main>
  );
}
