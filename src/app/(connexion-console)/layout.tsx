/**
 * SEC-29 — la mise en page racine de la connexion de la console. Ce groupe de routes est HORS de la
 * garde des rôles, parce qu'il précède toute session : il ne porte que la connexion (témoin du
 * groupe). Elle déclare la langue du document ; son titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { ETATS_VIDES_CONSOLE } from '../../content/micro-copy/console/etats-vides';

export const metadata = { title: ETATS_VIDES_CONSOLE['connexion-console']?.titre };

export default function MiseEnPageConnexionConsole({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
