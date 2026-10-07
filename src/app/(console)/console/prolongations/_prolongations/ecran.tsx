/**
 * EXT-T07 — les écrans « Prolongations à décider » de la console (REQ-UX-047), sur la maquette
 * `docs/maquettes/prolongation.html`. Composants sans état : la liste, le geste (prolonger sur une des
 * trois conditions de l'art. 3.4 al. 3, ou constater qu'aucune n'est remplie) et ses refus nommés, l'état
 * vide, le chargement et l'erreur. AUCUN TEXTE N'EST ÉCRIT ICI : ils viennent de
 * `console/prolongations.ts`. Aucune durée n'est écrite : le nombre de jours de la condition (b) est lu
 * dans la SSOT, et les dates sont celles du terme.
 */
import { PROLONGATIONS_CONSOLE as T } from '../../../../../content/micro-copy/console/prolongations';
import { SEUILS } from '../../../../../domain/seuils/ssot';
import { CONDITIONS_DECIDEES } from '../../../../../domain/attribution/prolongation';
import type {
  LectureDeLaProlongation,
  RefusDeProlongation,
} from '../../../../../server/attribution/prolonger';

const LISTE = '/console/prolongations';
const ACCUEIL = '/console';

/** Une ligne de la liste : l'entreprise lisible (ou son repli) et le terme. */
export type LigneDeProlongation = {
  readonly id: string;
  readonly entreprise: string | null;
  readonly termeAt: Date;
};

const motif = (c: (typeof CONDITIONS_DECIDEES)[number]): string => {
  const m = T.decider.motifs[c];
  return typeof m === 'function' ? m(String(SEUILS.PROLONGATION_FAITS_RECENTS_JOURS.valeur)) : m;
};

/** La liste des attributions dont la décision est ouverte, ou son état vide. */
export function ListeDesProlongations({
  lignes,
  date,
}: {
  lignes: readonly LigneDeProlongation[];
  date: (d: Date) => string;
}) {
  if (lignes.length === 0)
    return (
      <main>
        <h1>{T.liste.titre}</h1>
        <section>
          <h2>{T.vide.titre}</h2>
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
            <th scope="col">{c.entreprise}</th>
            <th scope="col">{c.terme}</th>
            <th scope="col">{c.action}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td>{l.entreprise ?? T.liste.entrepriseInconnue}</td>
              <td>{date(l.termeAt)}</td>
              <td>
                <a href={`${LISTE}/${encodeURIComponent(l.id)}`}>{T.liste.decider}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

/** Le geste : le formulaire, son retour, ses refus, ou l'état qui l'empêche. */
export function DeciderDeLaProlongation({
  lecture,
  entreprise,
  refus,
  retour,
  date,
  action,
}: {
  lecture: LectureDeLaProlongation;
  entreprise: string | null;
  refus: Exclude<RefusDeProlongation, 'droit_absent'> | null;
  /** Le retour du geste : la date du terme, reculé ou inchangé. */
  retour: { readonly issue: 'prolongee' | 'constatee'; readonly terme: string } | null;
  date: (d: Date) => string;
  action: (formData: FormData) => Promise<void>;
}) {
  const lien = (
    <p>
      <a href={LISTE}>{T.decider.retour}</a>
    </p>
  );
  if (retour !== null)
    return (
      <main>
        {lien}
        <h1>{T.decider.titre}</h1>
        <p role="status">{T.retours[retour.issue](retour.terme)}</p>
      </main>
    );
  if (lecture.etat !== 'a_decider') {
    const motifDuRefus = lecture.etat === 'introuvable' ? 'attribution_inconnue' : lecture.etat;
    return (
      <main>
        {lien}
        <section>
          <h2>{T.refus[motifDuRefus]}</h2>
          <p>
            <a href={LISTE}>{T.liste.titre}</a>
          </p>
        </section>
      </main>
    );
  }
  const a = lecture.attribution;
  const terme = date(a.termeAt);
  return (
    <main>
      {lien}
      <h1>{T.decider.titre}</h1>
      <p>
        {entreprise ?? T.liste.entrepriseInconnue} · {T.decider.termeLe(terme)}
      </p>
      {refus === null ? null : <p role="alert">{T.refus[refus]}</p>}
      <form action={action}>
        <input type="hidden" name="attributionId" value={a.id} />
        <fieldset>
          <legend>{T.decider.question}</legend>
          {CONDITIONS_DECIDEES.map((c) => (
            <label key={c}>
              <input type="radio" name="decision" value={c} required /> <b>{T.decider.prolonger}</b>
              <br />
              <span>{motif(c)}</span>
            </label>
          ))}
          <label>
            <input type="radio" name="decision" value="constater" required />{' '}
            <b>{T.decider.constater}</b>
            <br />
            <span>{T.decider.constat(terme)}</span>
          </label>
        </fieldset>
        <p>
          <button type="submit">{T.decider.enregistrer}</button>{' '}
          <a href={LISTE}>{T.decider.annuler}</a>
        </p>
      </form>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran. */
export function ChargementDesProlongations() {
  return <p role="status">{T.chargement}</p>;
}

/** L'erreur : rien n'est écrit, et un geste pour réessayer ; aucun détail de l'erreur. */
export function ErreurDesProlongations({ reessayer }: { reessayer: () => void }) {
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
