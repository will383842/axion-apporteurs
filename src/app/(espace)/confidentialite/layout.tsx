/**
 * La mise en page racine de la politique de confidentialité (JUR-T34) : elle déclare la langue du
 * document ; son titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { CONFIDENTIALITE } from '../../../content/micro-copy/espace/vocabulaire';

export const metadata = { title: CONFIDENTIALITE.titre };

export default function MiseEnPageConfidentialite({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
