/**
 * La mise en page racine de « Ma contestation » (UX-P1-51) : elle déclare la langue du document ; son
 * titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { CONTESTATION } from '../../../../content/micro-copy/espace/vocabulaire';

export const metadata = { title: CONTESTATION.titre };

export default function MiseEnPageContestation({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
