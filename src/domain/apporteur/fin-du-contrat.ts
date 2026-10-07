/**
 * DM-63 (REQ-DM-011) — les règles PURES des effets de la fin du contrat en phase 1 (art. 11 et 12).
 *
 * L'ARRIVÉE DE CHAQUE ÉTAT est DÉRIVÉE de la matrice des attributions, jamais recopiée (RM-01) : un
 * état est à traiter s'il admet l'une des deux sorties de fin de contrat. `figee` (vers
 * `figee_resiliation`) est la sortie des états AVEC commande ; `fin_de_contrat` celle des états sans
 * commande (`annulee` pour une provisoire ou une attente, `expiree` pour une définitive).
 *
 * LE DROIT D'UNE COMMANDE se rattache à la COMMANDE et à ses lignes prévues, jamais à la fenêtre de
 * l'attribution : une commande signée avant la date d'effet continue d'ouvrir droit, au fur et à
 * mesure de ses encaissements, quelle qu'en soit la date (art. 12.3) ; signée à la date d'effet ou
 * après, elle n'en ouvre aucun. La fonction ne reçoit donc NI la fenêtre de l'attribution NI la date
 * d'un encaissement : elle ne peut pas les lire.
 */
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type EtatAttribution,
} from '../attribution/machine';
import { joursDeLaDate } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { versParis } from '../temps/paris';

export type SortieDeFinDeContrat = 'figee' | 'fin_de_contrat';

/** La sortie de fin de contrat d'un état : `figee` s'il garde un droit, `fin_de_contrat` sinon, nulle s'il est final. */
export const sortieDeFinDeContrat = (e: EtatAttribution): SortieDeFinDeContrat | null =>
  TRANSITIONS_ATTRIBUTION[e].figee !== undefined
    ? 'figee'
    : TRANSITIONS_ATTRIBUTION[e].fin_de_contrat !== undefined
      ? 'fin_de_contrat'
      : null;

/** Les états que la résiliation traite : ceux qui admettent une sortie de fin de contrat. */
export const ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT: readonly EtatAttribution[] =
  ETATS_ATTRIBUTION.filter((e) => sortieDeFinDeContrat(e) !== null);

/** L'état d'arrivée d'une attribution à la fin du contrat ; un état sans sortie reste tel quel. */
export function etatApresFinDuContrat(e: EtatAttribution): EtatAttribution {
  const sortie = sortieDeFinDeContrat(e);
  return sortie === null ? e : TRANSITIONS_ATTRIBUTION[e][sortie]!;
}

/**
 * Une commande ouvre-t-elle droit à commission après la fin du contrat (art. 12.3) ? Oui si elle est
 * signée un jour civil de Paris STRICTEMENT antérieur à la date d'effet : le jour d'effet ne compte
 * pas, comme le jour de la première v4 dans la bascule des contrats.
 */
export function ouvreDroitALaCommission(commande: {
  readonly commandeSigneeAt: Instant;
  readonly dateEffet: Instant;
}): boolean {
  return (
    joursDeLaDate(versParis(commande.commandeSigneeAt)) <
    joursDeLaDate(versParis(commande.dateEffet))
  );
}
