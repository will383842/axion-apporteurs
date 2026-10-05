/**
 * L'écran des gels du journal des accès, en composant PUR : il rend ce qu'on lui donne, sans lire ni
 * la session ni la base. La page lit le droit (relu en base) et la liste, puis l'appelle ; les gestes
 * sont les actions serveur de `actions.ts`, qui reposent chacune leur question.
 *
 * Le formulaire de pose et le bouton de levée n'existent que si le droit les ouvre. Un gel levé n'a
 * plus de bouton. L'écran ne montre ni l'auteur ni la personne visée : la portée, son type seul.
 */
import type { MotifGelJournal } from '@prisma/client';
import { GELS_JOURNAL_ACCES as T } from '../../../../../content/micro-copy/console/gels-journal-acces';
import type {
  DroitsSurLesGels,
  MotifDuGel,
} from '../../../../../server/console/gels-journal-acces';

/** Un gel tel que l'écran l'affiche : aucun identifiant de personne ni de cible. */
export interface GelAffiche {
  readonly id: string;
  readonly motif: MotifGelJournal;
  readonly reference: string;
  readonly portee: 'utilisateur' | 'cible';
  readonly depuis: Date;
  readonly jusquA: Date | null;
  readonly poseAt: Date;
  readonly leveAt: Date | null;
}

type Action = (formData: FormData) => Promise<void>;

export function EcranDesGels(p: {
  gels: readonly GelAffiche[];
  droits: DroitsSurLesGels;
  actions: { poser: Action; lever: Action };
  /** Le refus du dernier geste, ou `saisie` pour une saisie hors forme. */
  refus: MotifDuGel | 'saisie' | null;
  /** La date d'un instant, en jour de Paris. */
  date: (d: Date) => string;
  /** Le lien vers la page suivante, s'il en reste une. */
  suivante?: string | null;
  /** Le lien vers la première page, quand on n'y est pas. */
  premiere?: string | null;
}) {
  const { gels, droits, actions, refus, date } = p;
  return (
    <main>
      <h1>{T.titre}</h1>
      <p>{T.intro}</p>

      {refus !== null ? <p role="alert">{refus === 'saisie' ? T.saisie : T.refus[refus]}</p> : null}

      {droits.poser ? (
        <section aria-labelledby="poser">
          <h2 id="poser">{T.poser.titre}</h2>
          <form action={actions.poser}>
            <label>
              {T.poser.motif}
              <select name="motif" required>
                {(Object.keys(T.motifs) as MotifGelJournal[]).map((m) => (
                  <option key={m} value={m}>
                    {T.motifs[m]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {T.poser.reference}
              <input name="reference" required aria-describedby="aide-reference" />
            </label>
            <p id="aide-reference">{T.poser.aideReference}</p>
            <label>
              {T.poser.portee}
              <select name="portee" required>
                <option value="utilisateur">{T.portees.utilisateur}</option>
                <option value="cible">{T.portees.cible}</option>
              </select>
            </label>
            <label>
              {T.poser.identifiant}
              <input name="identifiant" required />
            </label>
            <label>
              {T.poser.depuis}
              <input type="date" name="depuis" required />
            </label>
            <label>
              {T.poser.jusquA}
              <input type="date" name="jusquA" />
            </label>
            <button type="submit">{T.poser.envoyer}</button>
          </form>
        </section>
      ) : null}

      {gels.length === 0 ? (
        <section aria-labelledby="vide">
          <h2 id="vide">{T.vide.titre}</h2>
          <p>{T.vide.phrase}</p>
        </section>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{T.colonnes.motif}</th>
              <th scope="col">{T.colonnes.reference}</th>
              <th scope="col">{T.colonnes.portee}</th>
              <th scope="col">{T.colonnes.periode}</th>
              <th scope="col">{T.colonnes.pose}</th>
              <th scope="col">{T.colonnes.etat}</th>
              {droits.lever ? <th scope="col">{T.colonnes.action}</th> : null}
            </tr>
          </thead>
          <tbody>
            {gels.map((g) => (
              <tr key={g.id}>
                <td>{T.motifs[g.motif]}</td>
                <td>{g.reference}</td>
                <td>{T.portees[g.portee]}</td>
                <td>{T.periode(date(g.depuis), g.jusquA === null ? null : date(g.jusquA))}</td>
                <td>{date(g.poseAt)}</td>
                <td>{g.leveAt === null ? T.etats.ouvert : T.etats.leve(date(g.leveAt))}</td>
                {droits.lever ? (
                  <td>
                    {g.leveAt === null ? (
                      <form action={actions.lever}>
                        <input type="hidden" name="gelId" value={g.id} />
                        <button type="submit">{T.actions.lever}</button>
                      </form>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {p.premiere ? <a href={p.premiere}>{T.pages.premiere}</a> : null}
      {p.suivante ? <a href={p.suivante}>{T.pages.suivante}</a> : null}
    </main>
  );
}
