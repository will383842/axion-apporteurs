'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur des prolongations de la console (EXT-T07, REQ-UX-047) : rien n'est écrit, et un geste pour
 * réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { ErreurDesProlongations } from './_prolongations/ecran';

export default function ErreurProlongations({ reset }: { error: Error; reset: () => void }) {
  return <ErreurDesProlongations reessayer={reset} />;
}
