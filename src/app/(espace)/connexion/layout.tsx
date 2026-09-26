/**
 * La mise en page racine de la connexion (SEC-03) : la première page rendue de Partners. Elle
 * déclare la langue du document ; son titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { ETATS_VIDES_ESPACE } from '../../../content/micro-copy/espace/etats-vides';

export const metadata = { title: ETATS_VIDES_ESPACE['/connexion']?.titre };

export default function MiseEnPageConnexion({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
