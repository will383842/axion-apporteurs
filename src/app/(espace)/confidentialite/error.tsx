'use client';
// use-client: Next impose un composant client pour la frontiere d'erreur, et navigator.onLine ne se lit que dans le navigateur.
/**
 * Les états d'erreur et hors ligne de la politique de confidentialité (JUR-T34). Le cadriciel exige
 * un composant client pour la frontière d'erreur : il distingue l'appareil hors ligne d'une erreur
 * du serveur, et propose de réessayer. Aucun détail de l'erreur n'est affiché.
 */
import { useSyncExternalStore } from 'react';
import { CONFIDENTIALITE } from '../../../content/micro-copy/espace/vocabulaire';
// SEC-46 : la cible de 48 px vient d'une feuille de la même origine, qu'admet style-src 'self' ;
// un style en ligne était refusé par la CSP, et le bouton perdait sa cible.
import styles from './confidentialite.module.css';

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
      <button type="button" onClick={reset} className={styles.bouton}>
        {CONFIDENTIALITE.erreur.action}
      </button>
    </main>
  );
}
