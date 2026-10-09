/**
 * DM-63 (REQ-DM-011) — les règles PURES des effets de la fin du contrat en phase 1 (art. 11 et 12).
 *
 * L'ARRIVÉE DE CHAQUE ÉTAT est DÉRIVÉE de la matrice des attributions, jamais recopiée (RM-01) : un
 * état est à traiter s'il admet l'une des deux sorties de fin de contrat. `figee` (vers
 * `figee_resiliation`) est la sortie des états AVEC commande ; `fin_de_contrat` celle des états sans
 * commande (`annulee` pour une provisoire ou une attente, `expiree` pour une définitive).
 *
 * LE DROIT D'UNE COMMANDE se rattache à la COMMANDE et à ses lignes prévues, jamais à la fenêtre de
 * l'attribution : une commande signée avant l'instant de fin continue d'ouvrir droit, au fur et à
 * mesure de ses encaissements, quelle qu'en soit la date (art. 12.3) ; signée à l'instant de fin ou
 * après, elle n'en ouvre aucun. La fonction ne reçoit donc NI la fenêtre de l'attribution NI la date
 * d'un encaissement : elle ne peut pas les lire.
 */
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type EtatAttribution,
  type TransitionAttribution,
} from '../attribution/machine';
import { dateDepuisJours, joursDeLaDate } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { depuisParis, versParis } from '../temps/paris';

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
 * L'INSTANT de la fin d'un contrat résilié AVEC préavis (art. 11.1 et 11.1 bis) : minuit, heure de
 * Paris, qui SUIT le jour d'effet. Le contrat court tout le jour d'effet, à toute heure ; un changement
 * d'heure ne déplace pas le jour. Pour une fin SANS préavis (art. 11.2, 12.5), la fin est l'instant du
 * passage à `resilie` : l'appelant la donne telle quelle, sans passer par ici.
 */
export function finDuContratAvecPreavis(jourDEffet: Instant): Instant {
  const lendemain = dateDepuisJours(joursDeLaDate(versParis(jourDEffet)) + 1);
  return depuisParis({ ...lendemain, heure: 0, minute: 0, seconde: 0, milliseconde: 0 });
}

/**
 * Une commande ouvre-t-elle droit à commission après la fin du contrat (art. 11.1 bis et 12.3) ? Oui
 * si et seulement si elle est signée AVANT l'instant de fin ; à cet instant ou après, non. Les deux
 * bornes sont des INSTANTS, jamais des jours. Une signature connue au jour seulement est posée à minuit
 * de Paris de ce jour, par l'appelant.
 */
export function ouvreDroitALaCommission(commande: {
  readonly commandeSigneeAt: Instant;
  readonly finDuContrat: Instant;
}): boolean {
  return commande.commandeSigneeAt < commande.finDuContrat;
}

/**
 * DM-73, voie (b) d'A02 (juriste, #824, 6043135877 ; coordination, 6043156854) : une commande signée
 * AVANT la fin mais reçue APRÈS l'annulation de l'attribution ne la fait pas revenir (art. 12.1). Le
 * droit, rattaché à la commande (art. 12.3), ne reste ouvert que si l'attribution est sortie par la FIN
 * DU CONTRAT, jamais par l'antériorité, le démenti ou la fraude (art. 3.3, 3.7). La borne d'instant est
 * celle d'`ouvreDroitALaCommission`, jamais recalculée. Condition 1 de la juriste : l'entreprise était
 * occupée par cette attribution à la date de la signature (`occupeeDepuis`, son dépôt).
 */
export function laCommandeTardiveOuvreDroit(commande: {
  readonly commandeSigneeAt: Instant;
  readonly finDuContrat: Instant;
  readonly occupeeDepuis: Instant;
  readonly sortie: TransitionAttribution;
}): boolean {
  return (
    commande.sortie === 'fin_de_contrat' &&
    commande.occupeeDepuis <= commande.commandeSigneeAt &&
    ouvreDroitALaCommission(commande)
  );
}

/**
 * DM-73 : l'instant de fin du contrat, vu d'une attribution sortie par la fin du contrat. C'est
 * l'instant de sa sortie au journal, borné par la fin avec préavis (`finDuContratAvecPreavis`, source
 * unique) quand la résiliation porte un jour d'effet : un passage planifié qui court après minuit ne
 * prolonge pas le contrat.
 */
export function finDuContratDeLaSortie(sortie: {
  readonly sortieAt: Instant;
  readonly jourDEffet: Instant | null;
}): Instant {
  return sortie.jourDEffet === null
    ? sortie.sortieAt
    : Math.min(sortie.sortieAt, finDuContratAvecPreavis(sortie.jourDEffet));
}

/** Une occupation d'une entreprise, telle que la chaîne des commissions la lit. */
export interface OccupationDeLEntreprise {
  readonly attributionId: string;
  readonly occupeeDepuis: Instant;
  /** Nulle tant que l'attribution occupe sans être sortie par la fin du contrat. */
  readonly sortie: TransitionAttribution | null;
  /** L'instant de fin du contrat, pour une sortie `figee` ou `fin_de_contrat` ; nul sinon. */
  readonly finDuContrat: Instant | null;
}

/**
 * DM-73, condition 3 de la juriste (art. 4.4) : la commande appartient à l'attribution qui occupait
 * l'entreprise à la date de sa SIGNATURE, et à elle seule — jamais à un occupant arrivé après. Une
 * attribution sortie par la fin du contrat (`figee` ou `fin_de_contrat`) ne la reçoit que signée avant
 * la fin ; une autre sortie (antériorité, démenti, fraude, péremption…) n'en reçoit aucune. Rend
 * l'identifiant, ou nul si aucune attribution n'y a droit.
 */
export function attributionDeLaCommande(
  commandeSigneeAt: Instant,
  occupations: readonly OccupationDeLEntreprise[]
): string | null {
  const ayantDroit = occupations.filter((o) => {
    if (o.occupeeDepuis > commandeSigneeAt) return false;
    if (o.sortie === null) return true;
    if (o.finDuContrat === null) return false;
    return laCommandeTardiveOuvreDroit({
      commandeSigneeAt,
      finDuContrat: o.finDuContrat,
      occupeeDepuis: o.occupeeDepuis,
      // `figee` garde le droit des commandes signées avant la fin, comme `fin_de_contrat` (art. 12.3).
      sortie: o.sortie === 'figee' ? 'fin_de_contrat' : o.sortie,
    });
  });
  return ayantDroit.length === 1 ? ayantDroit[0]!.attributionId : null;
}
