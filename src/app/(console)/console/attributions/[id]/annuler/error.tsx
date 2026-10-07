'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur de l'annulation après confirmation (UX-P1-63, REQ-UX-047) : rien n'est modifié, et un geste
 * pour réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { ErreurDeLAnnulation } from './_annuler/ecran';

export default function ErreurAnnulation({ reset }: { error: Error; reset: () => void }) {
  return <ErreurDeLAnnulation reessayer={reset} />;
}
