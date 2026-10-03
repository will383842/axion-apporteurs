/**
 * Les écrans de la connexion (SEC-03) : la demande de lien (`/connexion`), la confirmation à
 * l'arrivée du lien (`/connexion/<jeton>`) et l'issue de la consommation. Composants serveur,
 * sans script client.
 *
 * Chaque texte vient de la micro-copie : les états vides de `/connexion` et de
 * `/connexion/<jeton>` (`ETATS_VIDES_ESPACE`), et `CONNEXION` pour ce qu'aucun état vide ne porte.
 * Aucun libellé n'est écrit ici. L'écran ne reçoit qu'un ÉTAT de la liste fermée du noyau : il ne
 * peut rien dire de plus que le noyau, qui répond de même que le compte existe ou non (REQ-SEC-001).
 *
 * L'arrivée ne consomme rien à l'affichage : un lecteur de courriel qui précharge le lien n'use pas
 * le lien. La consommation part du bouton de confirmation, et son issue s'affiche sur `/connexion`,
 * une URL qui ne porte plus le jeton.
 */
import type { EtatVide } from '../../../content/micro-copy/types';
import { ETATS_VIDES_ESPACE } from '../../../content/micro-copy/espace/etats-vides';
import { CONNEXION } from '../../../content/micro-copy/espace/vocabulaire';
import type {
  EtatDeConsommation,
  EtatDeDemande,
  EtatDuCode,
} from '../../../server/auth/lien-magique';
import { AvisModeInstalle } from './mode-installe';

type Action = (formData: FormData) => void | Promise<void>;

const ID_COURRIEL = 'connexion-courriel';
const ID_CODE = 'connexion-code';
/** Les routes de la carte des écrans (docs/ESPACE-ROUTES.md) dont l'état vide est lu ici. */
const ROUTE_DEMANDE = '/connexion';
const ROUTE_ARRIVEE = '/connexion/<jeton>';

const REPONSES_DE_DEMANDE: Readonly<Record<EtatDeDemande, string>> = CONNEXION.reponses;

function etatVide(route: string): EtatVide {
  const ecran = ETATS_VIDES_ESPACE[route];
  if (ecran === undefined) throw new Error(`micro-copie absente pour la route ${route}`);
  return ecran;
}

function Statut({ texte }: { texte: string }) {
  return (
    <p role="status" aria-live="polite">
      {texte}
    </p>
  );
}

export function EcranConnexion({ etat, action }: { etat: EtatDeDemande | null; action: Action }) {
  const ecran = etatVide(ROUTE_DEMANDE);
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

export function EcranArrivee({ action }: { action: Action }) {
  const t = CONNEXION.arrivee;
  return (
    <main>
      <h1>{t.titre}</h1>
      <p>{t.phrase}</p>
      <form action={action}>
        <button type="submit">{t.action}</button>
      </form>
    </main>
  );
}

/** Les issues de refus de la vérification du code. */
export type RefusDeCode = Exclude<EtatDuCode, 'ouverte'>;

/**
 * UX-P1-04 — le texte de chaque refus de code : les textes de la juriste, un SEUL pour tout refus de
 * code (faux, inconnu, expiré, épuisé, consommé, mal formé), un pour le débit.
 */
const TEXTES_DES_REFUS: Readonly<Record<RefusDeCode, string>> = {
  code_refuse: CONNEXION.code.refus,
  debit: CONNEXION.code.debit,
};
export function texteDuRefusDeCode(etat: RefusDeCode): string {
  return TEXTES_DES_REFUS[etat];
}

/**
 * UX-P1-04 — l'écran du code, après l'envoi : un champ, l'action de vérification, et « Changer
 * d'adresse ». L'adresse n'est jamais redemandée : son empreinte est dans le cookie d'attente
 * (SEC-54). `suite` est l'URL demandée, bornée au retour de la connexion.
 */
export function EcranCode({
  refus,
  verifier,
  changer,
  suite,
  intro,
}: {
  refus: RefusDeCode | null;
  verifier: Action;
  changer: Action;
  suite: string | null;
  intro?: string;
}) {
  const t = CONNEXION.code;
  return (
    <main>
      <h1>{etatVide(ROUTE_DEMANDE).titre}</h1>
      {intro === undefined ? null : <Statut texte={intro} />}
      <AvisModeInstalle titre={t.installee.titre} phrase={t.installee.phrase} />
      {refus === null ? null : <p role="alert">{texteDuRefusDeCode(refus)}</p>}
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
          aria-describedby={`${ID_CODE}-aide`}
        />
        <p id={`${ID_CODE}-aide`}>{t.aide}</p>
        {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
        <button type="submit">{t.action}</button>
      </form>
      <form action={changer}>
        <button type="submit">{t.changer}</button>
      </form>
    </main>
  );
}

export function EcranIssue({ etat }: { etat: EtatDeConsommation }) {
  if (etat === 'deja_utilise') {
    const t = CONNEXION.dejaUtilise;
    return (
      <main>
        <h1>{t.titre}</h1>
        <p>{t.phrase}</p>
        <a href={ROUTE_DEMANDE}>{t.action}</a>
      </main>
    );
  }
  if (etat === 'ouverte') {
    return (
      <main>
        <h1>{CONNEXION.arrivee.titre}</h1>
        <Statut texte={CONNEXION.arrivee.ouverte} />
      </main>
    );
  }
  const ecran = etatVide(ROUTE_ARRIVEE);
  return (
    <main>
      <h1>{ecran.titre}</h1>
      <Statut texte={ecran.phrase} />
      <a href={ROUTE_DEMANDE}>{ecran.action.libelle}</a>
    </main>
  );
}
