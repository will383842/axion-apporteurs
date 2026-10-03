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
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import type { NatureDeLAction } from './actions-classees';

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

/** Le port : la lecture des faits d'un SIREN, dans la transaction de l'appelant. */
export interface PortsDeLaGarde {
  lireLesFaits(siren: string): Promise<FaitsDeReserve>;
}

/**
 * La garde à l'appel : chaque action de démarchage l'appelle, dans sa transaction, au moment de
 * l'envoi. Lève `EntrepriseReservee` ; une vérification passe sans lire l'état.
 */
export async function exigerHorsReserve(
  ports: PortsDeLaGarde,
  demande: { siren: string; nature: Exclude<NatureDeLAction, 'sans_contact'> },
  maintenant: Date
): Promise<void> {
  if (demande.nature === 'verification') return;
  let faits: FaitsDeReserve;
  try {
    faits = await ports.lireLesFaits(demande.siren);
  } catch {
    throw new EntrepriseReservee();
  }
  if (!jugerLaReserve(faits, demande.nature, maintenant).permis) throw new EntrepriseReservee();
}
