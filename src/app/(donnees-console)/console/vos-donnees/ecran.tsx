/**
 * Les écrans de « Vos données dans la console » (JUR-T61, REQ-JUR-068). Composants serveur, sans
 * script client : la page, et son état d'erreur.
 *
 * AUCUN CONTENU N'EST ÉCRIT ICI. Chaque rubrique arrive du registre de l'article 30, bloc TRT-CONSOLE,
 * extraite par `src/domain/rgpd/politique-console.ts` ; les titres et les phrases viennent de la
 * micro-copie (`VOS_DONNEES_CONSOLE`). Un manque déclaré au registre s'affiche en cours de rédaction,
 * SANS la question interne posée à l'arbitre.
 */
import type { Segment } from '../../../../domain/rgpd/politique';
import {
  estPubliableConsole,
  type PolitiqueConsole,
} from '../../../../domain/rgpd/politique-console';
import { entiteContractante, estSentinelle } from '../../../../config/entite';
import { VOS_DONNEES_CONSOLE as T } from '../../../../content/micro-copy/console/vos-donnees';

/** La route de cette page, publique : lue avant toute connexion. */
const ROUTE = '/console/vos-donnees';

function Contenu({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'texte' ? (
          <p key={i}>{s.texte}</p>
        ) : (
          <p key={i}>
            <strong>{T.aCompleter}</strong>
          </p>
        )
      )}
    </>
  );
}

/** L'identité du responsable, lue dans le registre de l'entité ; `null` tant qu'elle n'y est pas. */
type Responsable = { readonly denomination: string; readonly siege: string } | null;

/** Le responsable du traitement, lu dans `config/entite.json` (RM-01) ; `null` sur une sentinelle. */
function responsableDuTraitement(): Responsable {
  const { denomination, siege } = entiteContractante();
  return estSentinelle(denomination) || estSentinelle(siege) ? null : { denomination, siege };
}

export function EcranVosDonneesConsole({ politique }: { politique: PolitiqueConsole }) {
  const responsable = responsableDuTraitement();
  const publiable = estPubliableConsole(politique) && responsable !== null;
  return (
    <main>
      <h1>{T.titre}</h1>
      <p>{T.phrase}</p>
      {publiable ? null : <p role="status">{T.enProposition}</p>}
      <section>
        <h2>{T.responsable.titre}</h2>
        {responsable === null ? (
          <p>
            <strong>{T.aCompleter}</strong>
          </p>
        ) : (
          <>
            <p>{T.responsable.phrase(responsable)}</p>
            <p>{T.responsable.contact}</p>
          </>
        )}
      </section>
      {politique.rubriques.map((r) => (
        <section key={r.cle}>
          <h2>{T.rubriques[r.cle]}</h2>
          <Contenu segments={r.contenu} />
        </section>
      ))}
      <p>{T.obligatoire}</p>
    </main>
  );
}

/** L'état d'erreur : le registre ne se lit pas. Le motif part au journal, jamais à l'écran. */
export function EcranErreurVosDonneesConsole() {
  return (
    <main>
      <h1>{T.erreur.titre}</h1>
      <p role="alert">{T.erreur.phrase}</p>
      <a href={ROUTE}>{T.erreur.action}</a>
    </main>
  );
}
