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
  pageDeLaConsolePubliable,
  type PageDeLaConsole,
} from '../../../../domain/rgpd/politique-console';
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

export function EcranVosDonneesConsole({ page }: { page: PageDeLaConsole }) {
  return (
    <main>
      <h1>{T.titre}</h1>
      <p>{T.phrase}</p>
      {pageDeLaConsolePubliable(page) ? null : <p role="status">{T.enProposition}</p>}
      {page.rubriques.map((r) => (
        <section key={r.cle}>
          <h2>{T.rubriques[r.cle]}</h2>
          <Contenu segments={r.contenu} />
        </section>
      ))}
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
