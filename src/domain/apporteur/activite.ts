/**
 * DM-06 — `actif` et `dormant`, DÉRIVÉS par une fonction pure, JAMAIS STOCKÉS (REQ-CPL-027,
 * `docs/GLOSSAIRE.md` §2).
 *
 *   — `actif` : au moins un dépôt CONFIRMÉ (attribution passée `active`). Jamais « un dépôt », ni
 *     « inscrit ».
 *   — `dormant` : statut `signe` et PLUS de `dormanceJours` jours sans dépôt — depuis le dernier
 *     dépôt, ou depuis la signature s'il n'y en a jamais eu.
 *
 * LA DURÉE EST UN PARAMÈTRE. La source unique des seuils (`DORMANCE_JOURS`, avec sa source et sa
 * date) n'existe pas encore ; en l'attendant, la fonction la REÇOIT et n'en écrit aucune valeur
 * (RM-10). L'appelant la tire de la source unique, jamais d'un littéral.
 *
 * CE SONT DES INDICATEURS DE CONSOLE, ET RIEN D'AUTRE. AUCUN MESSAGE N'EST ENVOYÉ À UN APPORTEUR
 * EN RAISON DE SON INACTIVITÉ : c'est une interdiction de produit (REQ-CPL-027, REQ-JUR-033), pas
 * une préférence d'ergonomie. Ce module n'importe rien qui envoie, et une spec refuse tout module
 * qui importerait à la fois cette dérivation et un envoi.
 */
import type { StatutApporteur } from './statut';
import { MS_PAR_JOUR } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';

export interface ApporteurPourActivite {
  readonly statut: StatutApporteur;
  /** La signature du contrat en vigueur ; nulle tant qu'il n'y en a pas. */
  readonly signeAt: Instant | null;
}

export interface DepotPourActivite {
  readonly deposeAt: Instant;
  /** Le passage de l'attribution à `active` ; nul tant que le dépôt n'est pas confirmé. */
  readonly confirmeAt: Instant | null;
}

export interface Activite {
  readonly actif: boolean;
  readonly dormant: boolean;
}

export function activite(
  apporteur: ApporteurPourActivite,
  depots: readonly DepotPourActivite[],
  maintenant: Instant,
  dormanceJours: number
): Activite {
  if (!Number.isInteger(dormanceJours) || dormanceJours < 0) {
    throw new RangeError(`dormanceJours = ${dormanceJours} n'est pas un entier >= 0`);
  }
  const actif = depots.some((d) => d.confirmeAt !== null);
  if (apporteur.statut !== 'signe') return { actif, dormant: false };
  if (apporteur.signeAt === null) {
    throw new RangeError('signeAt manquant : un apporteur `signe` a une date de signature');
  }
  const depuis = depots.reduce((dernier, d) => Math.max(dernier, d.deposeAt), apporteur.signeAt);
  return { actif, dormant: maintenant - depuis > dormanceJours * MS_PAR_JOUR };
}
