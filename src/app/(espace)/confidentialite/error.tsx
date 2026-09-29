'use client';
/**
 * Les états d'erreur et hors ligne de la politique de confidentialité (JUR-T34). Le cadriciel exige
 * un composant client pour la frontière d'erreur : il distingue l'appareil hors ligne d'une erreur
 * du serveur, et propose de réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { useSyncExternalStore } from 'react';
import { CONFIDENTIALITE } from '../../../content/micro-copy/espace/vocabulaire';

function abonner(rappel: () => void): () => void {
  window.addEventListener('online', rappel);
  window.addEventListener('offline', rappel);
  return () => {
    window.removeEventListener('online', rappel);
    window.removeEventListener('offline', rappel);
  };
}

export default function ErreurConfidentialite({ reset }: { error: Error; reset: () => void }) {
  const enLigne = useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true
  );
  const t = enLigne ? CONFIDENTIALITE.erreur : CONFIDENTIALITE.horsLigne;
  return (
    <main>
      <h1>{t.titre}</h1>
      <p role="alert">{t.phrase}</p>
      <button type="button" onClick={reset} style={{ minHeight: '3rem', fontSize: '1.125rem' }}>
        {CONFIDENTIALITE.erreur.action}
      </button>
    </main>
  );
}
