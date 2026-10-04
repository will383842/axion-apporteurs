/**
 * CPL-T07 — le dossier de conformité d'un apporteur, composant serveur, sans script (maquette
 * `apporteur-fiche.html`, bloc « Dossier de conformité »).
 *
 * Il ne décide de RIEN : il reçoit le dossier lu par `lireLeDossier`, les droits du rôle (jugés par la
 * matrice) et les actions de serveur. Il montre les pièces en service (une pièce écartée, par
 * remplacement ou par refus, ne s'affiche plus), leur état et leur échéance, les gestes que le rôle
 * permet, et ce qui manque pour signer. Jamais l'IBAN : le dossier ne le porte pas. Le RIB n'a pas
 * de geste ici : sa vérification est à quatre yeux, hors de cet écran (condition de la sécurité).
 * Ses quatre états : nominal, vide (aucune pièce), introuvable, et le refus d'un geste ; le
 * chargement est le repli de la page.
 */
import { CONFORMITE_CONSOLE as T } from '../../content/micro-copy/console/conformite';
import { MOTIFS_REFUS_PIECE, type TypePieceKyc } from '../../domain/kyc/pieces';
import type { MotifDuDossier, lireLeDossier } from '../../server/conformite/dossier';

type Dossier = NonNullable<Awaited<ReturnType<typeof lireLeDossier>>>;
type Action = (formData: FormData) => Promise<void>;

export interface DroitsDuDossier {
  readonly verifier: boolean;
  readonly ouvrir: boolean;
  readonly valider: boolean;
}

export function ChargementDuDossier() {
  return <p role="status">{T.chargement}</p>;
}

export function DossierDeConformite({
  apporteurId,
  dossier,
  droits,
  actions,
  refus,
  date,
}: {
  apporteurId: string;
  dossier: Dossier | null;
  droits: DroitsDuDossier;
  actions: { verifier: Action; ouvrir: Action; valider: Action };
  refus: MotifDuDossier | null;
  /** La date à l'heure de Paris, telle que l'écran l'affiche. */
  date: (d: Date) => string;
}) {
  if (dossier === null)
    return (
      <main>
        <h1>{T.introuvable.titre}</h1>
        <p>{T.introuvable.phrase}</p>
      </main>
    );
  const enService = dossier.pieces.filter((p) => p.remplaceeAt === null);
  const aVerifier = enService.filter((p) => p.statut === 'a_verifier').length;
  const libelles = (types: readonly TypePieceKyc[]) => types.map((t) => T.types[t]).join(', ');
  return (
    <main>
      <p>
        <a href={`/console/apporteurs/${apporteurId}`}>{T.retour}</a>
      </p>
      <h1>{T.titre}</h1>
      {refus === null ? null : <p role="alert">{T.refus[refus]}</p>}
      <dl>
        <dt>{T.siren}</dt>
        <dd>
          {dossier.identite === null
            ? T.sansIdentite
            : `${dossier.identite.siren} · ${T.regimeTva[dossier.identite.regimeTva]}`}
        </dd>
      </dl>
      {enService.length === 0 ? (
        <section aria-label={T.vide.titre}>
          <h2>{T.vide.titre}</h2>
          <p>{T.vide.phrase}</p>
        </section>
      ) : (
        <table>
          <caption>{T.legende(enService.length, aVerifier)}</caption>
          <thead>
            <tr>
              <th scope="col">{T.colonnes.piece}</th>
              <th scope="col">{T.colonnes.etat}</th>
              <th scope="col">{T.colonnes.action}</th>
            </tr>
          </thead>
          <tbody>
            {enService.map((p) => (
              <tr key={p.id}>
                <td data-col={T.colonnes.piece}>{T.types[p.type]}</td>
                <td data-col={T.colonnes.etat}>
                  {T.statuts[p.statut]}
                  {p.expireAt === null ? null : ` ${T.jusquau(date(p.expireAt))}`}
                </td>
                <td data-col={T.colonnes.action}>
                  {p.statut !== 'a_verifier' || !droits.verifier ? (
                    T.aucuneAction
                  ) : p.type === 'rib' ? (
                    T.ribAilleurs
                  ) : (
                    <>
                      <form action={actions.verifier}>
                        <input type="hidden" name="apporteurId" value={apporteurId} />
                        <input type="hidden" name="pieceId" value={p.id} />
                        <input type="hidden" name="decision" value="valider" />
                        <button type="submit">{T.actions.valider}</button>
                      </form>
                      <form action={actions.verifier}>
                        <input type="hidden" name="apporteurId" value={apporteurId} />
                        <input type="hidden" name="pieceId" value={p.id} />
                        <input type="hidden" name="decision" value="refuser" />
                        <label>
                          {T.actions.motif}
                          <select name="motif" required>
                            {MOTIFS_REFUS_PIECE.map((m) => (
                              <option key={m} value={m}>
                                {T.motifsRefus[m].libelle}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit">{T.actions.refuser}</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dossier.statut === 'kyc_en_cours' ? (
        <p>{dossier.manques.length === 0 ? T.complet : T.manques(libelles(dossier.manques))}</p>
      ) : null}
      {dossier.statut === 'retenu' && droits.ouvrir ? (
        <form action={actions.ouvrir}>
          <input type="hidden" name="apporteurId" value={apporteurId} />
          <button type="submit">{T.actions.ouvrir}</button>
        </form>
      ) : null}
      {dossier.statut === 'kyc_en_cours' && droits.valider && dossier.manques.length === 0 ? (
        <form action={actions.valider}>
          <input type="hidden" name="apporteurId" value={apporteurId} />
          <button type="submit">{T.actions.validerLeDossier}</button>
        </form>
      ) : null}
    </main>
  );
}
