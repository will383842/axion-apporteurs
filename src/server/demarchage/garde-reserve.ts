/**
 * SEC-51 (REQ-SEC-042) — la GARDE UNIQUE de la réserve : la console ne démarche aucune entreprise
 * réservée par un apporteur (contrat art. 3.5 al. 4, HYP-W19-NON-EXPLOITATION).
 *
 * Une entreprise est réservée :
 * - dans les `RESERVE_APRES_ACTE_APPORTEUR_JOURS` jours qui suivent un ACTE d'apporteur (une
 *   vérification, une déclaration refusée ou en attente), sauf si l'acte est EXEMPTÉ (entreprise déjà
 *   connue de la Société au sens de l'art. 3.3, ou occupée à la date de l'acte) ;
 * - pendant le délai de confirmation d'un dépôt (« aucun démarchage pendant le délai de
 *   confirmation »).
 * La VÉRIFICATION (l'appel de confirmation) n'est pas du démarchage : elle passe, sans même lire
 * l'état.
 *
 * Le refus est NON RÉVÉLATEUR : un code fixe, `entreprise_reservee`, identique pour toutes les causes,
 * sans l'apporteur, sans la cause, sans la date de fin. ÉCHEC FERMÉ : un état illisible refuse, sous
 * le même code. Les faits sont lus par un PORT, que l'appelant lie à SA transaction (sous verrou de
 * l'attribution) : la garde se rejuge au moment de l'envoi, jamais seulement à la mise en file.
 */
import type { MotifRefusDepot, Prisma, ResultatVerification } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import type { CleDeLAction, NatureDeLAction } from './actions-classees';

export const CODE_ENTREPRISE_RESERVEE = 'entreprise_reservee';

export class EntrepriseReservee extends Error {
  readonly code = CODE_ENTREPRISE_RESERVEE;
  constructor() {
    super(CODE_ENTREPRISE_RESERVEE);
    this.name = 'EntrepriseReservee';
  }
}

/** Les faits d'une entreprise, lus par le port : les actes d'apporteur, et la confirmation en cours. */
export type FaitsDeReserve = {
  actes: readonly { at: Date; exempte: boolean }[];
  confirmationEnCours: boolean;
};

/** Le jugement pur : une action d'une nature, sur des faits, à un instant. */
export function jugerLaReserve(
  faits: FaitsDeReserve,
  nature: Exclude<NatureDeLAction, 'sans_contact'>,
  maintenant: Date
): { permis: true } | { permis: false; code: typeof CODE_ENTREPRISE_RESERVEE } {
  if (nature === 'verification') return { permis: true };
  const duree = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur * MS_PAR_JOUR;
  const acteEnCours = faits.actes.some(
    (a) => !a.exempte && maintenant.getTime() < a.at.getTime() + duree
  );
  if (acteEnCours || faits.confirmationEnCours) {
    return { permis: false, code: CODE_ENTREPRISE_RESERVEE };
  }
  return { permis: true };
}

/**
 * Ce que la garde écrit au journal d'un refus : les identifiants SEULS (l'entreprise visée et l'action
 * de la liste fermée), jamais la cause, l'apporteur ni la date de fin (REQ-SEC-042). Comme
 * `acces_espace_refuse` : un signal, pas une cause.
 */
export interface RefusDeReserve {
  signal: 'demarchage_refuse';
  code: typeof CODE_ENTREPRISE_RESERVEE;
  siren: string;
  action: CleDeLAction;
}

/**
 * Le port : la lecture des faits d'un SIREN, dans la transaction de l'appelant, et la ligne de journal
 * d'un refus. Un journal qui échoue ne change jamais le verdict.
 */
export interface PortsDeLaGarde {
  lireLesFaits(siren: string): Promise<FaitsDeReserve>;
  journaliser?(ligne: RefusDeReserve): void | Promise<void>;
}

/**
 * La garde à l'appel : chaque action de démarchage l'appelle, dans sa transaction, au moment de
 * l'envoi. Lève `EntrepriseReservee` ; une vérification passe sans lire l'état. Un refus, de quelque
 * cause qu'il soit, s'écrit au journal sous les identifiants seuls.
 */
export async function exigerHorsReserve(
  ports: PortsDeLaGarde,
  demande: {
    siren: string;
    action: CleDeLAction;
    nature: Exclude<NatureDeLAction, 'sans_contact'>;
  },
  maintenant: Date
): Promise<void> {
  if (demande.nature === 'verification') return;
  let reservee: boolean;
  try {
    const faits = await ports.lireLesFaits(demande.siren);
    reservee = !jugerLaReserve(faits, demande.nature, maintenant).permis;
  } catch {
    reservee = true;
  }
  if (!reservee) return;
  try {
    await ports.journaliser?.({
      signal: 'demarchage_refuse',
      code: CODE_ENTREPRISE_RESERVEE,
      siren: demande.siren,
      action: demande.action,
    });
  } catch {
    // Le refus ne dépend pas de son journal.
  }
  throw new EntrepriseReservee();
}

// ── le port de production ────────────────────────────────────────────────────────────────────────

/**
 * La clé du verrou du SIREN que le dépôt prend lui-même (`verrou-du-depot.siren.<siren>`,
 * `src/server/depot/deposer.ts`) : la garde et le dépôt se sérialisent sur ce SIREN, donc un acte qui
 * naît entre la lecture et l'envoi est vu, ou l'envoi précède l'acte. Un témoin confronte les deux
 * sources.
 */
export const cleDuVerrouDuSiren = (siren: string): string => `verrou-du-depot.siren.${siren}`;

/** Les résultats d'une vérification qui n'ouvrent PAS de réserve : l'entreprise est déjà connue de la Société, ou occupée. */
const VERIFICATION_EXEMPTEE: ReadonlySet<ResultatVerification> = new Set([
  'suivie',
  'cliente',
  'liste_noire',
]);

/** Les motifs d'un dépôt refusé qui n'ouvrent PAS de réserve : antériorité de la Société, ou entreprise occupée. */
const REFUS_EXEMPTE: ReadonlySet<MotifRefusDepot> = new Set([
  'anteriorite_client',
  'anteriorite_devis',
  'file_complete',
]);

/** Les états de la demande de confirmation qui tiennent le délai de confirmation. */
const CONFIRMATION_EN_COURS = ['planifiee', 'envoyee'] as const;

/**
 * Le port de PRODUCTION, lié à la transaction de l'appelant : il prend le verrou du SIREN, puis lit les
 * actes de l'apporteur sur l'entreprise — une vérification, un dépôt refusé, un dépôt en attente — avec
 * leur exemption, et la demande de confirmation en cours. L'appelant ne fournit que sa transaction : la
 * définition de la réserve ne se recopie nulle part.
 */
export function portSousVerrou(
  tx: Prisma.TransactionClient,
  journaliser?: PortsDeLaGarde['journaliser']
): PortsDeLaGarde {
  return {
    journaliser,
    async lireLesFaits(siren) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cleDuVerrouDuSiren(siren)}, 0))`;
      const [verifications, refuses, enAttente, confirmations] = await Promise.all([
        tx.verification.findMany({
          where: { siren, apporteurId: { not: null } },
          select: { resultat: true, verifieeAt: true },
        }),
        tx.depotRefuse.findMany({ where: { siren }, select: { motif: true, refuseAt: true } }),
        tx.attribution.findMany({
          where: { siren, apporteurId: { not: null }, statut: 'en_attente' },
          select: { deposeeAt: true },
        }),
        tx.attribution.count({
          where: {
            siren,
            apporteurId: { not: null },
            demandeConfirmation: { etat: { in: [...CONFIRMATION_EN_COURS] } },
          },
        }),
      ]);
      return {
        actes: [
          ...verifications.map((v) => ({
            at: v.verifieeAt,
            exempte: VERIFICATION_EXEMPTEE.has(v.resultat),
          })),
          ...refuses.map((r) => ({ at: r.refuseAt, exempte: REFUS_EXEMPTE.has(r.motif) })),
          ...enAttente.map((a) => ({ at: a.deposeeAt, exempte: false })),
        ],
        confirmationEnCours: confirmations > 0,
      };
    },
  };
}
