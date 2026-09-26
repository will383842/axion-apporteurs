/**
 * require-role.ts — `requireRole`, la porte de chaque action et de chaque route de la console
 * (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 *
 * QUATRE RÈGLES, ET CE QUI LES TIENT.
 *  1. LE DÉFAUT EST LE REFUS : un droit absent de la matrice (`./matrice`) est refusé à tous, avant
 *     toute autre question. Le juge ne rend « passe » qu'au bout de toutes ses vérifications.
 *  2. LE RÔLE EST RELU À CHAQUE REQUÊTE, jamais mis en cookie : le cookie ne porte qu'un jeton de
 *     session ; la session, son utilisateur, son rôle et sa désactivation sont relus en base à
 *     chaque appel. Un rôle changé ou un utilisateur désactivé vaut dès la requête SUIVANTE.
 *  3. UNE SESSION DE L'ESPACE APPORTEUR N'OUVRE RIEN ICI : la console et l'espace partagent le lien
 *     magique et la table des sessions (partners/ADR-0022), mais une session sans utilisateur de la
 *     console est refusée (`hors_console`). L'espace refuse symétriquement une session de la console
 *     (`src/server/auth/session.ts`).
 *  4. Une désactivation, même datée dans le futur, refuse : le refus ne dépend pas de l'horloge.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ET AUCUN CADRICIEL ICI : horloge, secret et dépôt entrent par des
 * ports ; l'adaptateur Prisma est `depotDeSessionsConsole`.
 */

import type { ConsoleRole, PrismaClient } from '@prisma/client';
import { empreinteDeSession } from '../auth/lien-magique';
import { droitDeclare, roleAutorise, type DroitConsole } from './matrice';

/** Les motifs de refus : une liste FERMÉE. Le motif part au journal, jamais au navigateur. */
export const MOTIFS_DE_REFUS_CONSOLE = [
  'droit_absent',
  'absente',
  'inconnue',
  'cle_perimee',
  'revoquee',
  'expiree',
  'hors_console',
  'desactive',
  'role_refuse',
] as const;
export type MotifDeRefusConsole = (typeof MOTIFS_DE_REFUS_CONSOLE)[number];

/** Une ligne de `sessions_espace`, avec ce que le juge lit de son utilisateur de la console. */
export interface LigneDeSessionConsole {
  kid: string;
  expireAt: Date;
  revoqueAt: Date | null;
  utilisateurConsole: { id: string; role: ConsoleRole; desactiveAt: Date | null } | null;
}

export type VerdictDeRole =
  | { ok: true; utilisateur: { id: string; role: ConsoleRole } }
  | { ok: false; motif: MotifDeRefusConsole };

/** Une déclaration de fonction, pas une constante : évaluée à l'appel, jamais figée au chargement. */
function refus(motif: MotifDeRefusConsole): VerdictDeRole {
  return { ok: false, motif };
}

/** Le juge, pur : chaque motif dans son ordre, le premier qui s'applique l'emporte. */
export function jugerAcces(
  droit: string,
  ligne: LigneDeSessionConsole | null,
  maintenant: Date,
  kidCourant: string
): VerdictDeRole {
  if (!droitDeclare(droit)) return refus('droit_absent');
  if (ligne === null) return refus('inconnue');
  if (ligne.kid !== kidCourant) return refus('cle_perimee');
  if (ligne.revoqueAt !== null) return refus('revoquee');
  if (ligne.expireAt.getTime() <= maintenant.getTime()) return refus('expiree');
  const utilisateur = ligne.utilisateurConsole;
  if (utilisateur === null) return refus('hors_console');
  if (utilisateur.desactiveAt !== null) return refus('desactive');
  if (!roleAutorise(droit, utilisateur.role)) return refus('role_refuse');
  return { ok: true, utilisateur: { id: utilisateur.id, role: utilisateur.role } };
}

export interface DepotDeSessionsConsole {
  lire(tokenHash: string): Promise<LigneDeSessionConsole | null>;
}

export interface PortsDeRole {
  maintenant(): Date;
  depot: DepotDeSessionsConsole;
  /** Le secret des sessions (SESSION_SECRET) et son `kid` : ceux de l'espace, même table. */
  configuration: { readonly secret: string; readonly kid: string };
}

/**
 * La porte : à appeler en tête de CHAQUE action de serveur et de CHAQUE route de la console, avec
 * un droit LITTÉRAL (la garde `securite:roles` refuse tout autre forme). Le verdict se lit avant
 * tout travail ; un refus ne dit rien au navigateur de son motif.
 */
export async function requireRole(
  droit: DroitConsole,
  jeton: string | undefined,
  ports: PortsDeRole
): Promise<VerdictDeRole> {
  if (!jeton) return refus('absente');
  const ligne = await ports.depot.lire(empreinteDeSession(jeton, ports.configuration.secret));
  return jugerAcces(droit, ligne, ports.maintenant(), ports.configuration.kid);
}

/** Le dépôt en base : l'empreinte arrive CALCULÉE, aucun secret n'entre ici. */
export function depotDeSessionsConsole(prisma: PrismaClient): DepotDeSessionsConsole {
  return {
    lire(tokenHash) {
      return prisma.sessionEspace.findUnique({
        where: { tokenHash },
        select: {
          kid: true,
          expireAt: true,
          revoqueAt: true,
          utilisateurConsole: { select: { id: true, role: true, desactiveAt: true } },
        },
      });
    },
  };
}
