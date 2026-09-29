/**
 * L'état de chargement de la politique de confidentialité (JUR-T34) : un texte de la micro-copie,
 * annoncé aux lecteurs d'écran.
 */
import { CONFIDENTIALITE } from '../../../content/micro-copy/espace/vocabulaire';

export default function ChargementConfidentialite() {
  return (
    <main>
      <p role="status" aria-live="polite">
        {CONFIDENTIALITE.chargement}
      </p>
    </main>
  );
}
