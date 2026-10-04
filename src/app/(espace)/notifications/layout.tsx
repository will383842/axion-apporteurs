/**
 * La mise en page racine des notifications de l'espace (UX-P1-54) : elle déclare la langue du
 * document ; son titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { NOTIFICATIONS } from '../../../content/micro-copy/espace/notifications';

export const metadata = { title: NOTIFICATIONS.titre };

export default function MiseEnPageNotifications({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
