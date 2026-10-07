/**
 * La mise en page racine de « Écrire à Axion-IA » (UX-P1-62) : elle déclare la langue du document ; son
 * titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { ECRIRE_A_AXION_IA } from '../../../content/micro-copy/espace/aide';

export const metadata = { title: ECRIRE_A_AXION_IA.titre };

export default function MiseEnPageAide({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
