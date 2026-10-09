/**
 * JUR-T61 — la mise en page racine de « Vos données dans la console ». Ce groupe de routes est HORS
 * de la garde des rôles : la page est publique, lue avant toute connexion. Elle déclare la langue du
 * document ; son titre vient de la micro-copie.
 */
import type { ReactNode } from 'react';
import { VOS_DONNEES_CONSOLE } from '../../content/micro-copy/console/vos-donnees';

export const metadata = { title: VOS_DONNEES_CONSOLE.titre };

export default function MiseEnPageVosDonneesConsole({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
