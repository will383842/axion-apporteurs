'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur des notifications de l'espace (UX-P1-54, REQ-UX-047) : ce qui est sûr, et un geste pour
 * réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { EcranErreurNotifications } from './ecran';

export default function ErreurNotifications({ reset }: { error: Error; reset: () => void }) {
  return <EcranErreurNotifications reessayer={reset} />;
}
