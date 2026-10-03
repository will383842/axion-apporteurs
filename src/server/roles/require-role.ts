/**
 * require-role.ts — `requireRole`, la porte de chaque action et de chaque route de la console
 * (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 *
 * QUATRE RÈGLES, ET CE QUI LES TIENT.
 *  1. LE DÉFAUT EST LE REFUS : un droit absent de la matrice (`./matrice`) est refusé à tous. Seule
 *     l'absence de jeton est refusée avant lui (`absente`, sans lire la base) ; dans le juge, le
 *     droit est la première question, avant la session. Le juge ne rend « passe » qu'au bout de
 *     toutes ses vérifications.
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
import { DUREES_AUTH } from '../auth/durees';
import { empreinteDeSessionConsole } from '../auth/lien-magique';
import {
  droitDeclare,
  exigeLeStepUp,
  ouvertATousLesRoles,
  roleAutorise,
  type DroitConsole,
} from './matrice';

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
  // SEC-29 : la session de la console sans activité depuis plus que l'inactivité de `durees.ts`.
  'inactive',
  // SEC-30 : la session est d'une version antérieure à celle de son utilisateur (rôle changé,
  // désactivation) : toutes ses sessions tombent ensemble.
  'version_perimee',
  // SEC-30 : un droit à step-up, sur une session ouverte depuis le délai de relèvement ou plus.
  'releve_requis',
  // SEC-30 (quatre yeux) : un admin non validé par un autre admin n'a aucun droit d'administrateur.
  'admin_en_attente',
] as const;
export type MotifDeRefusConsole = (typeof MOTIFS_DE_REFUS_CONSOLE)[number];

/** Une ligne de `sessions_espace`, avec ce que le juge lit de son utilisateur de la console. */
export interface LigneDeSessionConsole {
  kid: string;
  expireAt: Date;
  revoqueAt: Date | null;
  /**
   * SEC-29 : la dernière vue, posée à l'ouverture et touchée au passage. Nulle (ou absente) vaut
   * une session jamais vue : refusée comme inactive, en échec fermé.
   */
  derniereVueAt?: Date | null;
  /** SEC-30 : l'ouverture de la session, lue en base, jamais dans le cookie : elle tient le step-up. */
  creeAt: Date;
  /** SEC-30 : la version de l'utilisateur COPIÉE à l'ouverture de la session. */
  sessionVersion: number;
  utilisateurConsole: {
    id: string;
    role: ConsoleRole;
    desactiveAt: Date | null;
    /** SEC-30 : incrémentée à chaque changement de rôle ou désactivation. */
    sessionVersion: number;
    /** SEC-30 (quatre yeux) : nulle sur un admin, l'admin est EN ATTENTE de validation. */
    valideAt: Date | null;
  } | null;
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
  if (ligne.sessionVersion !== utilisateur.sessionVersion) return refus('version_perimee');
  if (!vueRecemment(ligne.derniereVueAt, maintenant)) return refus('inactive');
  if (!roleAutorise(droit, utilisateur.role)) return refus('role_refuse');
  if (utilisateur.role === 'admin' && utilisateur.valideAt === null && !ouvertATousLesRoles(droit))
    return refus('admin_en_attente');
  if (exigeLeStepUp(droit) && !ouverteRecemment(ligne.creeAt, maintenant))
    return refus('releve_requis');
  return { ok: true, utilisateur: { id: utilisateur.id, role: utilisateur.role } };
}

/** SEC-30 : ouverte il y a MOINS que le délai de relèvement (REQ-SEC-004). */
function ouverteRecemment(creeAt: Date, maintenant: Date): boolean {
  return maintenant.getTime() - creeAt.getTime() < DUREES_AUTH.releveMs.valeur;
}

/** SEC-29 : vue il y a MOINS que l'inactivité de la console. Jamais vue : non. */
function vueRecemment(derniereVueAt: Date | null | undefined, maintenant: Date): boolean {
  return (
    derniereVueAt != null &&
    maintenant.getTime() - derniereVueAt.getTime() < DUREES_AUTH.inactiviteConsoleMs.valeur
  );
}

/**
 * SEC-29 (lentille sécurité, condition d) : la dernière vue n'est réécrite que si elle date d'au
 * moins `toucheVueConsoleMs`. Une lecture de la console ne devient pas une écriture à chaque requête.
 */
export function doitToucherLaVue(
  derniereVueAt: Date | null | undefined,
  maintenant: Date
): boolean {
  return (
    derniereVueAt == null ||
    maintenant.getTime() - derniereVueAt.getTime() >= DUREES_AUTH.toucheVueConsoleMs.valeur
  );
}

export interface DepotDeSessionsConsole {
  lire(tokenHash: string): Promise<LigneDeSessionConsole | null>;
  /** SEC-29 : pose la dernière vue de la session. Absent : la vue n'est pas touchée (échec fermé). */
  toucher?(tokenHash: string, maintenant: Date): Promise<void>;
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
  // SEC-29 : l'empreinte d'une session de la console est sous SON domaine, jamais celui de l'espace.
  const tokenHash = empreinteDeSessionConsole(jeton, ports.configuration.secret);
  const ligne = await ports.depot.lire(tokenHash);
  const maintenant = ports.maintenant();
  const verdict = jugerAcces(droit, ligne, maintenant, ports.configuration.kid);
  if (verdict.ok && doitToucherLaVue(ligne?.derniereVueAt, maintenant)) {
    await ports.depot.toucher?.(tokenHash, maintenant);
  }
  return verdict;
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
          derniereVueAt: true,
          creeAt: true,
          sessionVersion: true,
          utilisateurConsole: {
            select: {
              id: true,
              role: true,
              desactiveAt: true,
              sessionVersion: true,
              valideAt: true,
            },
          },
        },
      });
    },
    async toucher(tokenHash, maintenant) {
      // Une écriture conditionnelle : deux requêtes concurrentes n'écrivent qu'une fois par période.
      const avant = new Date(maintenant.getTime() - DUREES_AUTH.toucheVueConsoleMs.valeur);
      await prisma.sessionEspace.updateMany({
        where: {
          tokenHash,
          utilisateurConsoleId: { not: null },
          OR: [{ derniereVueAt: null }, { derniereVueAt: { lte: avant } }],
        },
        data: { derniereVueAt: maintenant },
      });
    },
  };
}
