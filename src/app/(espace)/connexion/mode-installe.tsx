'use client';
// use-client: lit display-mode du navigateur pour l'avis du mode installé.
/**
 * UX-P1-04 — la détection du MODE INSTALLÉ : dans l'application installée, le lien de l'e-mail
 * s'ouvre dans le navigateur et non dans l'application ; l'avis met alors le code devant le lien.
 * Rendu caché par le serveur, il ne se montre qu'une fois le mode détecté dans le navigateur : sans
 * script, rien ne change, et le code reste proposé.
 */
import { useEffect, useState } from 'react';

export function AvisModeInstalle({ titre, phrase }: { titre: string; phrase: string }) {
  const [installe, setInstalle] = useState(false);
  useEffect(() => {
    const autonome =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalle(autonome);
  }, []);
  return (
    <div data-mode-installe="" hidden={!installe} role="note">
      <p>
        <strong>{titre}</strong>
      </p>
      <p>{phrase}</p>
    </div>
  );
}
