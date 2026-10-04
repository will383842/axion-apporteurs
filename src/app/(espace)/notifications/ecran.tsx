/**
 * Les écrans des notifications de l'espace apporteur (UX-P1-54, REQ-UX-016, REQ-UX-047), sur la
 * maquette `docs/maquettes/notifications.html`. Composants sans état : la liste, son chargement, son
 * erreur.
 *
 * AUCUN TEXTE N'EST ÉCRIT ICI. Les textes des notifications arrivent DÉJÀ RÉSOLUS du lecteur serveur :
 * ce sont les textes canoniques de la table des notifications. Les mots de l'écran viennent de la
 * micro-copie (`NOTIFICATIONS`, et l'état vide de `/notifications`).
 *
 * AUCUN ÉTAT DE LECTURE (arbitrage de la coordination du 2026-10-04) : la liste ne dit ni « lue » ni
 * « non lue », n'écrit rien à l'ouverture, et dit qu'elle ne fait courir aucun délai — seul le
 * courriel en fait courir un (REQ-UX-016).
 */
import type { EtatVide } from '../../../content/micro-copy/types';
import { ETATS_VIDES_ESPACE } from '../../../content/micro-copy/espace/etats-vides';
import { NOTIFICATIONS } from '../../../content/micro-copy/espace/notifications';
// Mobile d'abord, par une feuille de la même origine : un style en ligne serait refusé par la CSP.
import styles from './notifications.module.css';
import type { NotificationDeLEspace } from '../../../server/notifications/notifications-de-l-espace';

export type { NotificationDeLEspace };

/** La route de la carte des écrans (docs/ESPACE-ROUTES.md) dont l'état vide est lu ici. */
const ROUTE = '/notifications';

function etatVide(): EtatVide {
  const ecran = ETATS_VIDES_ESPACE[ROUTE];
  if (ecran === undefined) throw new Error(`micro-copie absente pour la route ${ROUTE}`);
  return ecran;
}

function Carte({ n }: { n: NotificationDeLEspace }) {
  const contenu = (
    <>
      <p className={styles.titre}>{n.titre}</p>
      {n.corps !== null && <p>{n.corps}</p>}
      <p className={styles.doux}>{n.quand}</p>
    </>
  );
  // Une notification qui a une route s'ouvre d'UN geste ; sans route, elle se lit sur place.
  return n.route === null ? (
    <div className={styles.carte}>{contenu}</div>
  ) : (
    <a className={styles.carte} href={n.route}>
      {contenu}
    </a>
  );
}

/** La liste, ou l'état vide et son geste suivant. */
export function EcranNotifications({
  notifications,
}: {
  notifications: readonly NotificationDeLEspace[];
}) {
  if (notifications.length === 0) {
    const vide = etatVide();
    return (
      <main className={styles.page}>
        <h1>{NOTIFICATIONS.titre}</h1>
        <section className={styles.carte}>
          <h2>{vide.titre}</h2>
          <p>{vide.phrase}</p>
          {vide.action.route !== null && (
            <a className={styles.bouton} href={vide.action.route}>
              {vide.action.libelle}
            </a>
          )}
        </section>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <h1>{NOTIFICATIONS.titre}</h1>
      <ul className={styles.liste}>
        {notifications.map((n) => (
          <li key={n.id}>
            <Carte n={n} />
          </li>
        ))}
      </ul>
      <p className={styles.doux}>{NOTIFICATIONS.aucunDelai}</p>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran, hauteur réservée par la feuille. */
export function EcranChargementNotifications() {
  return (
    <main className={styles.page}>
      <h1>{NOTIFICATIONS.titre}</h1>
      <p role="status" aria-live="polite">
        {NOTIFICATIONS.chargement}
      </p>
      <div className={styles.squelette} />
      <div className={styles.squelette} />
    </main>
  );
}

/** L'erreur : ce qui est sûr, et un geste pour réessayer. */
export function EcranErreurNotifications({ reessayer }: { reessayer: () => void }) {
  const e = NOTIFICATIONS.erreur;
  return (
    <main className={styles.page}>
      <h1>{NOTIFICATIONS.titre}</h1>
      <section role="alert" className={styles.carte}>
        <h2>{e.titre}</h2>
        <p>{e.phrase}</p>
        <button type="button" className={styles.bouton} onClick={reessayer}>
          {e.action}
        </button>
      </section>
    </main>
  );
}
