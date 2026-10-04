/**
 * UX-P1-57 — l'écran « Mettre en demeure », composant serveur, sans script.
 *
 * Il ne décide de RIEN : il reçoit l'état lu par la page, le refus du dernier geste (code FERMÉ) et
 * l'action de serveur. Le formulaire porte l'article, pris dans la liste fermée de l'art. 11.2, et
 * les faits ; la borne et le délai sont LUS dans la SSOT. Ses états : nominal, vide (apporteur hors
 * contrat, qui renvoie à sa fiche), introuvable, refus nommé, succès ; le chargement est le repli de
 * la page, et l'accès refusé, sa redirection.
 */
import {
  MISE_EN_DEMEURE_CONSOLE as T,
  type RefusDeLaMiseEnDemeure,
} from '../../content/micro-copy/console/mise-en-demeure';
import { ARTICLES_MISE_EN_DEMEURE } from '../../domain/apporteur/resiliation';
import { FAITS_ANOMALIE_CARACTERES_MAX, SEUILS } from '../../domain/seuils/ssot';

export type EtatDeLaMiseEnDemeure = 'nominal' | 'hors_contrat' | 'introuvable';

export function ChargementDeLaMiseEnDemeure() {
  return <p role="status">{T.chargement}</p>;
}

export function EcranMiseEnDemeure({
  apporteurId,
  etat,
  action,
  refus,
  enregistree,
}: {
  apporteurId: string;
  etat: EtatDeLaMiseEnDemeure;
  action: (formData: FormData) => Promise<void>;
  refus: RefusDeLaMiseEnDemeure | null;
  enregistree: boolean;
}) {
  if (etat === 'introuvable')
    return (
      <main>
        <h1>{T.introuvable.titre}</h1>
        <p>{T.introuvable.phrase}</p>
      </main>
    );
  const retour = (
    <p>
      <a href={`/console/apporteurs/${apporteurId}`}>{T.retour}</a>
    </p>
  );
  if (etat === 'hors_contrat')
    return (
      <main>
        {retour}
        <h1>{T.horsContrat.titre}</h1>
        <p>{T.horsContrat.phrase}</p>
        <p>
          <a href={`/console/apporteurs/${apporteurId}`}>{T.horsContrat.action}</a>
        </p>
      </main>
    );
  return (
    <main>
      {retour}
      <h1>{T.titre}</h1>
      <p>{T.phrase}</p>
      {refus === null ? null : <p role="alert">{T.refus[refus]}</p>}
      {enregistree ? <p role="status">{T.enregistree}</p> : null}
      <form action={action}>
        <input type="hidden" name="apporteurId" value={apporteurId} />
        <label>
          {T.article}
          <select name="article" required>
            {ARTICLES_MISE_EN_DEMEURE.map((a) => (
              <option key={a} value={a}>
                {T.libelleArticle(a)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.faits}
          <textarea name="faits" required rows={8} aria-describedby="consigne-des-faits" />
        </label>
        <p id="consigne-des-faits">
          {T.consigne} {T.borne(FAITS_ANOMALIE_CARACTERES_MAX.valeur)}
        </p>
        <p>{T.delai(SEUILS.MISE_EN_DEMEURE_JOURS.valeur)}</p>
        <button type="submit">{T.envoyer}</button>
      </form>
    </main>
  );
}
