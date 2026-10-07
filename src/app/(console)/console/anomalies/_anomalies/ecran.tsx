/**
 * UX-P1-56 — les écrans « Anomalies » de la console (REQ-UX-047), sur la maquette
 * `docs/maquettes/anomalies.html`. Composants sans état : la liste des ouvertes, la confirmation et ses
 * refus nommés, les états vides, le chargement et l'erreur. AUCUN TEXTE N'EST ÉCRIT ICI : ils viennent
 * de `console/anomalies.ts`. Ni score, ni rang, ni seuil ; aucun gel.
 */
import { ANOMALIES_CONSOLE as T } from '../../../../../content/micro-copy/console/anomalies';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../../../../domain/seuils/ssot';
import type {
  AnomalieAConfirmer,
  AnomalieALaConsole,
  RefusDeConfirmation,
} from '../../../../../server/console/anomalies/confirmer';

const LISTE = '/console/anomalies';
const ACCUEIL = '/console';

/** La liste des anomalies de sincérité ouvertes, ou son état vide. */
export function ListeDesAnomalies({
  anomalies,
  date,
}: {
  anomalies: readonly AnomalieALaConsole[];
  date: (d: Date) => string;
}) {
  if (anomalies.length === 0)
    return (
      <main>
        <h1>{T.liste.titre}</h1>
        <section>
          <h2>{T.vide.titre}</h2>
          <p>{T.vide.phrase}</p>
          <p>
            <a href={ACCUEIL}>{T.vide.action}</a>
          </p>
        </section>
      </main>
    );
  const c = T.liste.colonnes;
  return (
    <main>
      <h1>{T.liste.titre}</h1>
      <p>{T.liste.intro}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{c.nature}</th>
            <th scope="col">{c.entreprise}</th>
            <th scope="col">{c.ouverte}</th>
            <th scope="col">{c.action}</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.map((a) => (
            <tr key={a.id}>
              <td>{T.liste.nature}</td>
              <td>{a.entreprise ?? T.liste.entrepriseInconnue}</td>
              <td>{date(a.ouverteAt)}</td>
              <td>
                <a href={`${LISTE}/${encodeURIComponent(a.id)}`}>{T.liste.examiner}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

/** La confirmation d'une anomalie : le formulaire, son retour, ses refus, ou l'état qui l'empêche. */
export function ConfirmerLAnomalie({
  lecture,
  refus,
  fait,
  cleIdempotence,
  date,
  action,
}: {
  lecture: AnomalieAConfirmer;
  refus: RefusDeConfirmation | null;
  /** Le retour du geste : la transition a eu lieu, ou l'attribution est restée intacte. */
  fait: 'transition' | 'intacte' | null;
  cleIdempotence: string;
  date: (d: Date) => string;
  action: (formData: FormData) => Promise<void>;
}) {
  const retour = (
    <p>
      <a href={LISTE}>{T.confirmer.retour}</a>
    </p>
  );
  if (fait !== null)
    return (
      <main>
        {retour}
        <h1>{T.confirmer.titre}</h1>
        <p role="status">{T.confirmee[fait]}</p>
      </main>
    );
  if (lecture.etat !== 'a_confirmer') {
    const v = T.vides[lecture.etat];
    return (
      <main>
        {retour}
        <section>
          <h2>{v.titre}</h2>
          <p>{v.phrase}</p>
          <p>
            <a href={LISTE}>{T.vides.action}</a>
          </p>
        </section>
      </main>
    );
  }
  const a = lecture.anomalie;
  const intacte = a.attributionIntacte;
  return (
    <main>
      {retour}
      <h1>{T.confirmer.titre}</h1>
      <p>
        {T.liste.nature} · {a.entreprise ?? T.liste.entrepriseInconnue} ·{' '}
        {intacte ? T.confirmer.attribution.intacte : T.confirmer.attribution.transition} ·{' '}
        {T.confirmer.ouverteLe(date(a.ouverteAt))}
      </p>
      <p>
        {intacte ? T.confirmer.effet.intacte : T.confirmer.effet.transition} {T.confirmer.sansGel}
      </p>
      {refus === null ? null : <p role="alert">{T.refus[refus]}</p>}
      <form action={action}>
        <input type="hidden" name="anomalieId" value={a.id} />
        <input type="hidden" name="cleIdempotence" value={cleIdempotence} />
        <label>
          {T.confirmer.faits}
          <textarea name="faits" required rows={8} aria-describedby="consigne-des-faits" />
        </label>
        <p id="consigne-des-faits">
          {T.confirmer.consigne} {T.confirmer.borne(FAITS_ANOMALIE_CARACTERES_MAX.valeur)}
        </p>
        <p>
          <button type="submit">{T.confirmer.confirmer}</button>{' '}
          <a href={LISTE}>{T.confirmer.annuler}</a>
        </p>
      </form>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran. */
export function ChargementDesAnomalies() {
  return <p role="status">{T.chargement}</p>;
}

/** L'erreur : rien n'est écrit ni envoyé, et un geste pour réessayer ; aucun détail de l'erreur. */
export function ErreurDesAnomalies({ reessayer }: { reessayer: () => void }) {
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
