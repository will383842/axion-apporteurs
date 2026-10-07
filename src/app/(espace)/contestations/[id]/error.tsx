'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur de « Ma contestation » (UX-P1-51, REQ-UX-047) : ce qui est sûr, et un geste pour réessayer.
 * Aucun détail de l'erreur n'est affiché : il pourrait porter le texte de la contestation.
 */
import { EcranErreurContestation } from './ecran';

export default function ErreurContestation({ reset }: { error: Error; reset: () => void }) {
  return <EcranErreurContestation reessayer={reset} />;
}
