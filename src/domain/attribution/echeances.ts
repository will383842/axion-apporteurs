/**
 * DM-13 (REQ-DM-004, REQ-DM-006, REQ-DM-007) — les échéances d'une attribution, sur le contrat v2.
 *
 * Ce module ne CALCULE aucune date : la machine (`machine.ts`, DM-08) pose `peremptionAt` et
 * `fenetreFinAt` à chaque transition, et le passage d'envoi pose `fenetreRedeclarationFinAt`. Il dit
 * seulement quelle transition est DUE à l'instant donné, PURE :
 *   — `perimee` (art. 3.4 al. 2) : une attribution `active` dont la péremption est atteinte. Elle
 *     court du PREMIER ÉCHANGE (première réponse de l'entreprise, quel qu'en soit le moyen) ; sans
 *     échange, `peremptionAt` est nulle et rien n'est dû ; le fait « absence d'échange imputable à la
 *     Société » (art. 3.4 al. 2), posé en console, l'écarte aussi ;
 *     Pour la PRISE EN CHARGE d'un conseiller (art. 3.5 ; arbitrage #319 6036991499), les 90 jours
 *     courent de la prise en charge, et l'exception « imputable à la Société » ne s'applique pas ;
 *   — `expiree` (art. 3.4 al. 1) : le terme de la fenêtre ouverte par la confirmation ;
 *   — `file_expiree` (art. 3.5) : le délai de redéclaration ouvert au premier rang est écoulé, ou la
 *     déclaration en attente atteint le lendemain du `FILE_EXPIRATION_MOIS`-ième mois de son
 *     enregistrement, à 0 h, heure de Paris (juriste, 6037008645).
 *   — `fin_sans_adresse_valide` (art. 3.2) : une attribution provisoire dont le message est EN ERREUR,
 *     sans adresse corrigée, `LIBERATION_SIGNALEE_JOURS` jours civils après la DÉCLARATION. Une adresse
 *     corrigée est une adresse valide : la confirmation tacite court alors, et aucune fin n'est due.
 * Les deux premières échues, la PREMIÈRE l'emporte ; à égalité, l'expiration.
 */
import type { Instant } from '../temps/horloge';
import type { EtatDemandeConfirmation } from '../confirmation/demande';
import { ajouterJoursCivilsParis } from '../temps/sla';
import { SEUILS } from '../seuils/ssot';
import { MS_PAR_JOUR, dateDepuisJours, joursDeLaDate } from '../temps/calendrier-civil';
import { depuisParis, versParis } from '../temps/paris';
import { ajouterMoisParis, type EtatAttribution, type TypePorteur } from './machine';

/** Les dates que la règle lit, posées par la machine et le passage d'envoi. */
export type EcheancesDUneAttribution = {
  readonly statut: EtatAttribution;
  readonly porteur: TypePorteur;
  /** L'horodatage serveur de la naissance : le dépôt, ou la PRISE EN CHARGE d'un conseiller. */
  readonly deposeeAt: Instant;
  /**
   * Le fait « absence d'échange imputable à la Société » (art. 3.4 al. 2), posé en console : il
   * écarte la péremption de l'apporteur, qui ne va plus qu'au terme de la fenêtre.
   */
  readonly peremptionSuspendue: boolean;
  /** L'état de la demande de confirmation ; `null` sans demande (un conseiller n'en a jamais). */
  readonly etatDeLaDemande: EtatDemandeConfirmation | null;
  readonly peremptionAt: Instant | null;
  readonly fenetreFinAt: Instant | null;
  readonly fenetreRedeclarationFinAt: Instant | null;
};

/**
 * Les états qui expirent au terme de la fenêtre. `figee_resiliation` n'y est pas : son extinction
 * suit la fin du contrat (SEC-19), pas ce passage.
 */
export const ETATS_QUI_EXPIRENT = [
  'active',
  'rdv_pris',
  'proposition',
  'signee',
  'convertie',
] as const satisfies readonly EtatAttribution[];

/** L'instant de la péremption : posé par la machine pour l'apporteur, dérivé de la prise en charge pour le conseiller. */
function peremptionDe(e: EcheancesDUneAttribution): Instant | null {
  if (e.porteur === 'conseiller') return e.deposeeAt + SEUILS.PEREMPTION_JOURS.valeur * MS_PAR_JOUR;
  return e.peremptionSuspendue ? null : e.peremptionAt;
}

const atteinte = (echeance: Instant | null, maintenant: Instant): echeance is Instant =>
  echeance !== null && maintenant >= echeance;

/** L'extinction d'une déclaration en attente : le lendemain du dernier jour de ses douze mois, à 0 h, à Paris. */
function extinctionDeLAttente(enregistreeAt: Instant): Instant {
  const fin = versParis(ajouterMoisParis(enregistreeAt, SEUILS.FILE_EXPIRATION_MOIS.valeur));
  return depuisParis({
    ...dateDepuisJours(joursDeLaDate(fin) + 1),
    heure: 0,
    minute: 0,
    seconde: 0,
    milliseconde: 0,
  });
}

/** Les transitions qu'une échéance rend dues. */
export type TransitionEchue = 'perimee' | 'expiree' | 'file_expiree' | 'fin_sans_adresse_valide';

export function transitionEchue(
  e: EcheancesDUneAttribution,
  maintenant: Instant
): TransitionEchue | null {
  if (e.statut === 'provisoire') {
    const fin = ajouterJoursCivilsParis(e.deposeeAt, SEUILS.LIBERATION_SIGNALEE_JOURS.valeur);
    return e.etatDeLaDemande === 'rebond' && maintenant >= fin ? 'fin_sans_adresse_valide' : null;
  }
  if (e.statut === 'en_attente') {
    const eteinte =
      atteinte(e.fenetreRedeclarationFinAt, maintenant) ||
      maintenant >= extinctionDeLAttente(e.deposeeAt);
    return eteinte ? 'file_expiree' : null;
  }
  if (!(ETATS_QUI_EXPIRENT as readonly EtatAttribution[]).includes(e.statut)) return null;
  const expire = atteinte(e.fenetreFinAt, maintenant);
  const peremption = peremptionDe(e);
  const perime = e.statut === 'active' && atteinte(peremption, maintenant);
  if (perime && !(expire && e.fenetreFinAt <= peremption)) return 'perimee';
  return expire ? 'expiree' : null;
}

/**
 * Les ÉCHECS FERMÉS, en faveur de l'apporteur (juriste, #319 6037008645 ; coordination) : une échéance
 * DUE qui ne s'exécute pas encore d'elle-même, parce que la règle qui pourrait la contredire n'est pas
 * encore jugeable. Il est moins grave de garder une attribution quelques jours de trop que d'en retirer
 * une à tort.
 *   — `expiree` : la prolongation de trois mois (art. 3.4 al. 3) n'est pas encore jugée ; l'expiration
 *     s'exécutera quand elle le sera.
 *   — `perimee` d'un apporteur : le fait « absence d'échange imputable à la Société » (art. 3.4 al. 2)
 *     ne peut pas encore se poser en console. La prise en charge d'un conseiller n'a pas cette
 *     exception : sa péremption s'exécute.
 */
export function executableAujourdHui(transition: TransitionEchue, porteur: TypePorteur): boolean {
  if (transition === 'expiree') return false;
  if (transition === 'perimee') return porteur === 'conseiller';
  return true;
}

/**
 * La carence UNIQUE (art. 3.2 ; arbitrage #319 6036991499) : après une fin faute d'adresse valide, le
 * même apporteur ne dépose à nouveau la même entreprise qu'à l'expiration de
 * `CARENCE_REDEPOT_APRES_LIBERATION_JOURS` jours civils de Paris. `finAt` nul : aucune carence.
 */
export function redepotPermis(finAt: Instant | null, maintenant: Instant): boolean {
  if (finAt === null) return true;
  return (
    maintenant >=
    ajouterJoursCivilsParis(finAt, SEUILS.CARENCE_REDEPOT_APRES_LIBERATION_JOURS.valeur)
  );
}

/**
 * L'art. 3.4 bis au dépôt (juriste, #319 6037169174) : après une FIN DE DURÉE de la dernière
 * attribution du même apporteur sur le même SIREN, le nouveau dépôt porte la date d'un contact
 * STRICTEMENT postérieure au jour civil de Paris du terme (prolongation comprise). Vrai : le dépôt est
 * refusé (`nouveau_contact_requis`). Un terme illisible refuse aussi (échec fermé). Une date future
 * relève de la validation commune du champ, pas de cette règle.
 */
export function nouveauContactManquant(
  derniere: { readonly finDeDuree: boolean; readonly termeAt: Instant | null },
  dateContact: string | null
): boolean {
  if (!derniere.finDeDuree) return false;
  if (derniere.termeAt === null || dateContact === null) return true;
  const { annee, mois, jour } = versParis(derniere.termeAt);
  const jourDuTerme = `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
  return !(dateContact > jourDuTerme);
}
