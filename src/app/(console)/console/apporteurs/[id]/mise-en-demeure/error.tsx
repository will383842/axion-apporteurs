'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'état d'erreur de la mise en demeure (UX-P1-57, REQ-UX-047) : la page dit que rien n'est parti,
 * et propose de réessayer. Aucun détail de l'erreur n'est affiché : il pourrait porter les faits.
 */
import { MISE_EN_DEMEURE_CONSOLE as T } from '../../../../../../content/micro-copy/console/mise-en-demeure';

export default function ErreurMiseEnDemeure({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>{T.erreur.titre}</h1>
      <p role="alert">{T.erreur.phrase}</p>
      <button type="button" onClick={reset}>
        {T.erreur.action}
      </button>
    </main>
  );
}
