'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur de « Accès de l'apporteur » (SEC-71, REQ-UX-047) : rien n'est révoqué ni envoyé, et un geste
 * pour réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { ErreurAccesApporteur } from './_acces/ecran';

export default function ErreurAcces({ reset }: { error: Error; reset: () => void }) {
  return <ErreurAccesApporteur reessayer={reset} />;
}
