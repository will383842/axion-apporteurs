/**
 * UX-P1-63 — l'écran « Annuler une attribution confirmée » de la console (REQ-UX-047, REQ-SEC-023), sur
 * la maquette `docs/maquettes/annulation-apres-confirmation.html`. Composants sans état : le formulaire
 * (l'erreur d'identification, ou la fraude adossée à une anomalie confirmée), l'aperçu du motif que
 * l'apporteur recevra, la consigne de la juriste, le retour, les refus nommés, le chargement et l'erreur.
 * AUCUN TEXTE N'EST ÉCRIT ICI : ils viennent de `console/annulation-apres-confirmation.ts`, et les
 * motifs de `MOTIFS_DES_DECISIONS` (DM-71), sans être réécrits.
 */
import { ANNULATION_APRES_CONFIRMATION_CONSOLE as T } from '../../../../../../../content/micro-copy/console/annulation-apres-confirmation';
import { MOTIFS_DES_DECISIONS } from '../../../../../../../content/micro-copy/courriels/notifications';
import type { LectureDeLAnnulation } from './lecture';

/** Les refus que l'écran rend : ceux du geste, et la lecture qui l'empêche. */
export type RefusDeLAnnulation = keyof typeof T.refus;

const PHRASE_DES_FAITS = ' Faits retenus : {faits}';
/** Le motif de la fraude en aperçu, sans les faits : ils sont ceux de l'anomalie, rendus à l'envoi. */
const MOTIF_FRAUDE = MOTIFS_DES_DECISIONS.fraude_etablie.replace(PHRASE_DES_FAITS, '');

export function AnnulerLAttribution({
  lecture,
  entreprise,
  ficheHref,
  refus,
  fait,
  date,
  action,
}: {
  lecture: LectureDeLAnnulation;
  entreprise: string | null;
  ficheHref: string;
  refus: RefusDeLAnnulation | null;
  /** Le retour du geste : l'attribution est annulée. */
  fait: boolean;
  date: (d: Date) => string;
  action: (formData: FormData) => Promise<void>;
}) {
  const revenir = (
    <p>
      <a href={ficheHref}>{T.revenir}</a>
    </p>
  );
  if (fait)
    return (
      <main>
        {revenir}
        <h1>{T.titre}</h1>
        <p role="status">{T.retour}</p>
        <p>{T.consigne}</p>
      </main>
    );
  if (lecture.etat !== 'a_annuler')
    return (
      <main>
        {revenir}
        <section>
          <h2>{T.refus[lecture.etat]}</h2>
        </section>
      </main>
    );
  const a = lecture.attribution;
  const fraudeOuverte = lecture.anomalies.length > 0;
  return (
    <main>
      {revenir}
      <h1>{T.titre}</h1>
      <p>
        {entreprise ?? a.siren} · {T.confirmeeLe(date(a.confirmeeAt))}
      </p>
      <p>{T.phrase}</p>
      {refus === null ? null : <p role="alert">{T.refus[refus]}</p>}
      <form action={action}>
        <input type="hidden" name="attributionId" value={a.id} />
        <fieldset>
          <legend>{T.question}</legend>
          <label>
            <input type="radio" name="exception" value="erreur_identification" required />{' '}
            <b>{T.choixErreur}</b>
          </label>
          <p>{T.consigne}</p>
          <p>
            {T.apercu} {MOTIFS_DES_DECISIONS.annulee_erreur_identification}
          </p>
          <label>
            <input
              type="radio"
              name="exception"
              value="fraude"
              required
              disabled={!fraudeOuverte}
            />{' '}
            <b>{T.choixFraude}</b>
            <br />
            <span>{T.precisionFraude}</span>
          </label>
          {fraudeOuverte ? (
            <>
              {lecture.anomalies.map((x) => (
                <label key={x.id}>
                  <input type="radio" name="anomalieId" value={x.id} />{' '}
                  {T.anomalie(date(x.confirmeeAt))}
                </label>
              ))}
              <p>
                {T.apercu} {MOTIF_FRAUDE}
              </p>
            </>
          ) : (
            <p>{T.sansAnomalie}</p>
          )}
        </fieldset>
        <p>
          <button type="submit">{T.bouton}</button> <a href={ficheHref}>{T.revenir}</a>
        </p>
      </form>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran. */
export function ChargementDeLAnnulation() {
  return <p role="status">{T.chargement}</p>;
}

/** L'erreur : rien n'est modifié, et un geste pour réessayer ; aucun détail de l'erreur. */
export function ErreurDeLAnnulation({ reessayer }: { reessayer: () => void }) {
  const e = T.erreur;
  return (
    <main>
      <h2>{e.titre}</h2>
      <p role="alert">{e.phrase}</p>
      <p>
        <button type="button" onClick={reessayer}>
          {e.action}
        </button>
      </p>
    </main>
  );
}
