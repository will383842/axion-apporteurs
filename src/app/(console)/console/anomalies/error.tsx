'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur des anomalies de la console (UX-P1-56, REQ-UX-047) : rien n'est écrit ni envoyé, et un geste
 * pour réessayer. Aucun détail de l'erreur n'est affiché : il pourrait porter les faits.
 */
import { ErreurDesAnomalies } from './_anomalies/ecran';

export default function ErreurAnomalies({ reset }: { error: Error; reset: () => void }) {
  return <ErreurDesAnomalies reessayer={reset} />;
}
