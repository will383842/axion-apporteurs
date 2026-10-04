/**
 * SEC-30 — les dates de l'administration des utilisateurs, à l'heure LÉGALE de Paris, par la règle du
 * dépôt (`versParis`), jamais par la base de fuseaux du moteur. Lues par l'écran et par les courriels.
 */
import { versParis } from '../../../domain/temps/paris';

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const deux = (n: number) => String(n).padStart(2, '0');

/** « 4 octobre » */
export function jourDeParis(d: Date): string {
  const p = versParis(d.getTime());
  return `${p.jour} ${MOIS[p.mois - 1]}`;
}

/** « 4 octobre, 10:15 » */
export function jourEtHeureDeParis(d: Date): string {
  const p = versParis(d.getTime());
  return `${jourDeParis(d)}, ${deux(p.heure)}:${deux(p.minute)}`;
}

/** « 4 octobre 2026 à 10:15 », pour un courriel, qui se lit hors de son contexte. */
export function dateEtHeureCompletesDeParis(d: Date): string {
  const p = versParis(d.getTime());
  return `${jourDeParis(d)} ${p.annee} à ${deux(p.heure)}:${deux(p.minute)}`;
}
