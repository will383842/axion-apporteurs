/**
 * SEC-71 — l'écran « Accès de l'apporteur » (REQ-UX-047), sur la maquette
 * `docs/maquettes/acces-apporteur.html`. Composants sans état : le formulaire à deux motifs fermés, ses
 * refus nommés, ses états vides, son chargement et son erreur. AUCUN TEXTE N'EST ÉCRIT ICI : ils
 * viennent de `console/acces-apporteur.ts`. Rien de l'ancien ni du nouvel accès n'est rendu.
 */
import { ACCES_APPORTEUR as T } from '../../../../../../../content/micro-copy/console/acces-apporteur';
import type {
  EtatDeLAcces,
  MotifDeRevocation,
  RefusDeRevocation,
} from '../../../../../../../server/console/acces-apporteur';

const FICHE = '/console';
const LISTE = '/console';

const MOTIFS = Object.keys(T.motifs) as MotifDeRevocation[];

export function EcranAccesApporteur({
  apporteurId,
  etat,
  refus,
  revoque,
  revoquer,
}: {
  apporteurId: string;
  etat: EtatDeLAcces;
  refus: RefusDeRevocation | null;
  revoque: boolean;
  revoquer: (formData: FormData) => Promise<void>;
}) {
  if (etat === 'introuvable' || etat === 'contrat_termine' || etat === 'sans_acces') {
    const v = T.vides[etat];
    return (
      <main>
        {etat !== 'introuvable' && (
          <p>
            <a href={FICHE}>{T.retour}</a>
          </p>
        )}
        <div className="vide">
          <h2>{v.titre}</h2>
          <p>{v.phrase}</p>
          <p className="rangee">
            <a className="c-bouton" href={etat === 'introuvable' ? LISTE : FICHE}>
              {v.action}
            </a>
          </p>
        </div>
      </main>
    );
  }
  return (
    <main>
      <p>
        <a href={FICHE}>{T.retour}</a>
      </p>
      <h1 className="c-titre">{T.titre}</h1>
      <p className="doux">
        {T.apporteur} · {T.statuts[etat]}
      </p>
      <form className="panneau" action={revoquer}>
        <p>{T.intro}</p>
        {refus !== null && (
          <p className="message-erreur" role="alert">
            {T.refus[refus]}
          </p>
        )}
        {revoque && (
          <p className="pastille ok" role="status">
            {T.revoque}
          </p>
        )}
        <input type="hidden" name="apporteurId" value={apporteurId} />
        <fieldset className="champ">
          <legend className="etiquette">{T.motif}</legend>
          {MOTIFS.map((m) => (
            <label className="choix" key={m}>
              <input type="radio" name="motif" value={m} required /> <b>{T.motifs[m].libelle}</b>
              <br />
              <span className="doux">{T.motifs[m].aide}</span>
            </label>
          ))}
        </fieldset>
        <p className="rangee">
          <button className="c-bouton" type="submit">
            {T.revoquer}
          </button>
          <a className="c-bouton second" href={FICHE}>
            {T.annuler}
          </a>
        </p>
      </form>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran. */
export function ChargementAccesApporteur() {
  return (
    <main>
      <p role="status" className="doux">
        {T.chargement}
      </p>
    </main>
  );
}

/** L'erreur : rien n'est révoqué ni envoyé, et un geste pour réessayer ; aucun détail de l'erreur. */
export function ErreurAccesApporteur({ reessayer }: { reessayer: () => void }) {
  const e = T.erreur;
  return (
    <main>
      <div className="vide">
        <h2>{e.titre}</h2>
        <p role="alert">{e.phrase}</p>
        <p className="rangee">
          <button type="button" className="c-bouton" onClick={reessayer}>
            {e.action}
          </button>
        </p>
      </div>
    </main>
  );
}
