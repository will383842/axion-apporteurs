/**
 * UX-P1-16 — la navigation de premier niveau de la console, composant serveur, sans script.
 *
 * Elle ne décide de RIEN : elle reçoit les entrées que `entreesDuRole` a dérivées de la matrice et
 * des écrans livrés. Sur le bureau, les entrées en ligne ; en dessous de 768 px, une barre de trois
 * entrées et « Menu », qui ouvre le reste et le compte (un `<details>`, sans script), sans
 * défilement horizontal à 320 px. Chaque cible fait au moins 44 px (REQ-UX-018). Les styles sont
 * une feuille servie par la même origine (`style-src 'self'`) : aucun style en ligne.
 */
import type { ReactNode } from 'react';
import { NAVIGATION_CONSOLE } from '../../content/micro-copy/console/navigation';
import { barreMobile, type EntreeDeLaConsole } from '../../server/console/navigation';
import styles from './navigation.module.css';

function Liens({ entrees }: { entrees: readonly EntreeDeLaConsole[] }) {
  return entrees.map((e) => (
    <li key={e.route}>
      <a className={styles.lien} href={e.route}>
        {e.libelle}
      </a>
    </li>
  ));
}

export function NavigationConsole({
  entrees,
  compte,
}: {
  entrees: readonly EntreeDeLaConsole[];
  /** Le menu du compte (la déconnexion) : dans l'en-tête sur le bureau, dans « Menu » sur mobile. */
  compte: ReactNode;
}) {
  const { visibles, dansLeMenu } = barreMobile(entrees);
  return (
    <nav aria-label={NAVIGATION_CONSOLE.etiquette} className={styles.navigation}>
      <ul className={styles.bureau}>
        <Liens entrees={entrees} />
        <li className={styles.compte}>{compte}</li>
      </ul>
      <ul className={styles.barre}>
        <Liens entrees={visibles} />
        <li>
          <details className={styles.menu}>
            <summary className={styles.lien}>{NAVIGATION_CONSOLE.menu}</summary>
            <ul>
              <Liens entrees={dansLeMenu} />
              <li>{compte}</li>
            </ul>
          </details>
        </li>
      </ul>
    </nav>
  );
}
