/**
 * matrice.ts — LA matrice des droits de la console (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 *
 * UN SEUL FICHIER, CONSOMMÉ PAR TOUS. La disposition de page et chaque action de serveur de la
 * console posent la même question à `requireRole` (`./require-role`), qui la pose à cette table ; la
 * garde `securite:roles` (`scripts/gates/roles.ts`) confronte le disque à la même table. Aucun droit
 * n'est écrit ailleurs (RM-01, RM-05).
 *
 * LE DÉFAUT EST LE REFUS. Un droit ABSENT de cette table n'est ouvert à personne, `admin` compris :
 * un écran ou une action qu'on a oublié de déclarer est fermé, jamais ouvert par omission. C'est la
 * règle maison du masquage qui échoue ouvert, appliquée aux rôles.
 *
 * LA FORME D'UN DROIT : `action:<nom>` pour une action de serveur, `ecran:<nom>` pour une page ou
 * une route. Une seule table, deux genres : la garde refuse qu'une action invoque un droit d'écran,
 * et l'inverse.
 *
 * CE QUI EST DÉCLARÉ AUJOURD'HUI, ET POURQUOI SEULEMENT CELA. Les sept droits que REQ-SEC-023
 * réserve nommément, répartis selon le glossaire (`docs/GLOSSAIRE.md` §7) : l'IBAN en clair,
 * l'approbation d'un lot et le pain.001 vont à `admin` et `comptable` ; la levée de gel, la
 * suspension, la résiliation et l'export DAS2 à `admin` seul. `qualifieur` et `lecteur` n'en ont
 * aucun. La console n'a encore ni écran ni action : chacun entre ici avec la tâche qui le crée
 * (UX-P1-12 ouvre le premier écran). Tant qu'il n'y est pas, il est refusé.
 */

import { ConsoleRole } from '@prisma/client';

/** Les quatre rôles, DÉRIVÉS de l'enum du schéma — jamais une liste retapée (RM-01). */
export const ROLES_CONSOLE: readonly ConsoleRole[] = Object.values(ConsoleRole);

/** La table : un droit, les rôles qui l'ont. */
export const MATRICE_DES_ROLES = {
  'action:voir_iban_en_clair': ['admin', 'comptable'],
  'action:approuver_lot': ['admin', 'comptable'],
  'action:exporter_pain001': ['admin', 'comptable'],
  'action:lever_gel': ['admin'],
  'action:suspendre_apporteur': ['admin'],
  'action:resilier_apporteur': ['admin'],
  'action:exporter_das2': ['admin'],
  // DM-12 (REQ-DM-034, amendement A1-01) : le rattachement manuel motivé, au qualifieur (glossaire §7)
  // et à l'admin ; jamais au comptable ni au lecteur.
  'action:rattacher_manuellement': ['admin', 'qualifieur'],
} as const satisfies Readonly<Record<`${'action' | 'ecran'}:${string}`, readonly ConsoleRole[]>>;

/** Un droit DÉCLARÉ — le seul que le typage laisse passer à `requireRole`. */
export type DroitConsole = keyof typeof MATRICE_DES_ROLES;

/**
 * Vrai si le droit est DÉCLARÉ dans la table. Un nom hérité d'`Object.prototype` — `constructor`,
 * `toString` — ne l'est pas : l'appartenance se lit par `Object.hasOwn`, jamais par `in`.
 */
export function droitDeclare(droit: string): droit is DroitConsole {
  return Object.hasOwn(MATRICE_DES_ROLES, droit);
}

/** Vrai si le rôle a le droit. Un droit absent de la table rend faux, pour tous les rôles. */
export function roleAutorise(droit: string, role: ConsoleRole): boolean {
  if (!droitDeclare(droit)) return false;
  const roles: readonly ConsoleRole[] = MATRICE_DES_ROLES[droit];
  return roles.includes(role);
}
