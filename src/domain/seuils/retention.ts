/**
 * Les durées de CONSERVATION — un SOUS-MODULE de la SSOT (partners/ADR-0022 §12 ; condition d'A02 au
 * rattrapage 53). Chaque durée a la forme `Seuil` (valeur, unité, source, renvois, date de
 * vérification) ; `SEUILS` (`ssot.ts`) les ÉTALE, l'accès reste unique (`SEUILS.X`) et la garde
 * `ssot:seuils` les juge comme les autres. Une durée vit ICI ou dans `ssot.ts`, jamais aux deux
 * endroits.
 *
 * HYP-RGPD-RETENTION : valeurs PROVISOIRES, à confirmer par Williams (il n'y a pas de DPO sur le
 * projet, décision du 2026-09-03) ; un test HYP rougit si l'une change sans décision datée.
 */
import type { Seuil } from './ssot';

const LE = '2026-10-02';

export const DUREES_DE_RETENTION = {
  /** REQ-SEC-030 : le contact d'une attribution libérée (invalidée, perdue, expirée, périmée). */
  CONTACT_PURGE_APRES_LIBERATION_JOURS: {
    valeur: 90,
    unite: 'jours',
    source: 'REQ-SEC-030, HYP-RGPD-RETENTION (valeur provisoire, à confirmer par Williams)',
    renvois: [],
    verifieLe: LE,
  },
  /** REQ-SEC-030 : le contact d'une attribution convertie, compté depuis le dernier contact. */
  CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS: {
    valeur: 1095,
    unite: 'jours',
    source: 'REQ-SEC-030, HYP-RGPD-RETENTION (valeur provisoire, à confirmer par Williams)',
    renvois: [],
    verifieLe: LE,
  },
  // La minimisation de fond (tâche `minimiser_candidatures`) : une candidature reçue restée non
  // traitée au-delà de ce délai perd `reponsesJson` de sa charge conservée. PLAFOND PROVISOIRE :
  // jamais plus long sans décision de Williams.
  CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS: {
    valeur: 30,
    unite: 'jours',
    source:
      'HYP-RGPD-RETENTION, proposition de la lentille sécurité, 2026-10-02 (minimisation des candidatures, REQ-JUR-029) — plafond provisoire, à confirmer par Williams',
    renvois: [],
    verifieLe: '2026-10-02',
  },
  /** DM-53 (REQ-DM-043) : le SIREN d'un dépôt refusé, effacé douze mois après le refus. */
  DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'REQ-DM-043, HYP-A02-RETENTION (durée de conservation de depots_refuses)',
    renvois: [],
    verifieLe: '2026-10-02',
  },
  /**
   * DM-59 (REQ-JUR-065) : le délai de réponse à une demande de droit du contact, compté de sa
   * réception. La nouvelle valeur d'une rectification ne survit pas au-delà, même sans traitement.
   */
  DROITS_CONTACT_DELAI_REPONSE_MOIS: {
    valeur: 1,
    unite: 'mois',
    source: 'RGPD art. 12.3 (délai de réponse, compté de la réception de la demande), REQ-JUR-065',
    renvois: [],
    verifieLe: '2026-10-02',
  },
  /**
   * DM-59 (REQ-JUR-065) : la prolongation du délai de réponse, posée dans le premier mois ; la
   * valeur d'une rectification survit alors jusqu'à trois mois après la réception.
   */
  DROITS_CONTACT_PROLONGATION_MOIS: {
    valeur: 2,
    unite: 'mois',
    source:
      'RGPD art. 12.3 (prolongation du délai de réponse), REQ-JUR-065, précision d’A07 du 2026-10-02',
    renvois: [],
    verifieLe: '2026-10-02',
  },
  /**
   * DM-60 (REQ-JUR-065) : la trace d'une demande de droit du contact (droit, donnée visée, issue,
   * dates, sans valeur), conservée comme preuve du traitement, puis ANONYMISÉE : son lien à
   * l'attribution est vidé. Comptée de la clôture de la demande, ou de sa réception si elle n'a
   * jamais été close.
   */
  DROITS_CONTACT_TRACE_ANS: {
    valeur: 5,
    unite: 'ans',
    source:
      'Décision de Williams du 2026-10-03 (trace des demandes de droits du contact), code civil art. 2224 (prescription quinquennale, texte non encore confronté), REQ-JUR-065',
    renvois: [],
    verifieLe: '2026-10-03',
  },
  /**
   * DM-62 (REQ-DM-033) : une anomalie LEVÉE sans suite est anonymisée à ce délai de sa levée
   * (`traite_at`). Elle n'est jamais gelée.
   */
  ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS: {
    valeur: 2,
    unite: 'mois',
    source: 'REQ-DM-033, décision de Williams du 2026-10-03 (DM-62), texte de la juriste',
    renvois: [],
    verifieLe: '2026-10-03',
  },
  /**
   * DM-62 (REQ-DM-033) : une anomalie CONFIRMÉE est anonymisée à ce délai de la fin de la mesure
   * qu'elle a fondée (`mesure_terminee_at`), ou dès la levée d'un gel pour litige si elle vient
   * plus tard ; jamais tant que la fin de la mesure n'est pas posée.
   */
  ANOMALIE_CONFIRMEE_ANONYMISEE_APRES_ANS: {
    valeur: 5,
    unite: 'ans',
    source: 'REQ-DM-033, décision de Williams du 2026-10-03 (DM-62), texte de la juriste',
    renvois: [],
    verifieLe: '2026-10-03',
  },
  /**
   * DM-62 (REQ-DM-043) : le texte et la réponse d'une contestation sont vidés à ce délai de la
   * réponse, à défaut de la réception, ou dès la levée d'un gel pour litige si elle vient plus tard.
   */
  CONTESTATION_TEXTES_VIDES_APRES_ANS: {
    valeur: 5,
    unite: 'ans',
    source: 'REQ-DM-043, décision de Williams du 2026-10-03 (DM-62), texte de la juriste',
    renvois: [],
    verifieLe: '2026-10-03',
  },
  /**
   * DM-62 (REQ-DM-043) : le démenti exprès d'un contact (`non_confirme`, contrat art. 3.7), gardé
   * chiffré au-delà de la purge du contact, est vidé à ce délai de la qualification (`cree_at`,
   * forme d'A02).
   */
  DEMENTI_CONTACT_VIDE_APRES_ANS: {
    valeur: 5,
    unite: 'ans',
    source:
      'REQ-DM-043, décision de Williams du 2026-10-03 (démenti d’un contact), forme d’A02 (DM-62)',
    renvois: [],
    verifieLe: '2026-10-03',
  },
  /**
   * SEC-58 : le journal des accès à la console (connexions, lectures de coordonnées), purgé à
   * l'échéance. Le gel d'une ligne liée à un incident ou à un litige est une tâche à part.
   */
  JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source:
      'décision de Williams du 2026-10-03, après l’avis de la juriste (journalisation des accès)',
    renvois: [],
    verifieLe: '2026-10-03',
  },
} as const satisfies Record<string, Seuil>;
