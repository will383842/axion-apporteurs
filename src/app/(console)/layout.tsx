/**
 * SEC-29 — la mise en page racine de la console. Chaque page et chaque action de ce groupe passe
 * par `requireRole` (garde `securite:roles`) ; la mise en page ne lit rien et ne porte aucun droit.
 */
import type { ReactNode } from 'react';
import { CONNEXION_CONSOLE } from '../../content/micro-copy/console/connexion';

export const metadata = { title: CONNEXION_CONSOLE.marque };

export default function MiseEnPageConsole({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
