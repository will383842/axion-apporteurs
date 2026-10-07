'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur.
/**
 * L'erreur de « Écrire à Axion-IA » (UX-P1-62, REQ-UX-047) : rien n'est parti, et un geste pour revenir
 * au formulaire. Aucun détail de l'erreur n'est affiché : il pourrait porter le texte saisi.
 */
import { EcranErreurAide } from './ecran';

export default function ErreurAide({ reset }: { error: Error; reset: () => void }) {
  return <EcranErreurAide reessayer={reset} />;
}
