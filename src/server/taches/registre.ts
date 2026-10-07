/**
 * Le registre des tâches de fond — la SOURCE UNIQUE des clés de `battements.tache` (SEC-06,
 * REQ-QA-026, exception E1 de partners/ADR-0022 point 9).
 *
 * POURQUOI UNE TABLE DE CODE ET PAS UN ENUM. Un enum Postgres en serait une seconde copie, et
 * chaque nouveau cron deviendrait une PR `schema`. La colonne est donc une chaîne bornée dont la
 * FORME est tenue par la base (`battements_tache_forme`) et dont la VALEUR est tenue ici : une tâche
 * écrit son battement sous une clé de `TACHES`, validée par `schemaNomDeTache` avant l'écriture.
 * Aucune règle métier ne branche sur cette colonne.
 *
 * Ajouter un cron = ajouter une entrée ici, avec l'exigence qui l'impose.
 */
import { z } from 'zod';

export const TACHES = {
  /** Le traitement, hors requête, des événements reçus par les webhooks (SEC-06). */
  evenements_recus: { req: 'REQ-QA-026' },
  /**
   * INT-T56 : la minimisation de fond des candidatures reçues restées non traitées au-delà de
   * `CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS` (`src/server/taches/minimiser-candidatures.ts`).
   */
  minimiser_candidatures: { req: 'REQ-JUR-029' },
  /** DM-45 — la vérification de la chaîne du journal, par ses liens de hash (`verifierChaine`). */
  journal_verifier: { req: 'REQ-DM-024' },
  /** DM-48 — la purge du contact d'une attribution à échéance (`purgerLesContacts`). */
  contacts_purger: { req: 'REQ-DM-031' },
  /** DM-53 — la purge du SIREN des dépôts refusés, douze mois après le refus. */
  siren_refuses_purger: { req: 'REQ-DM-043' },
  /**
   * DM-66 — l'effacement des projections de l'antériorité (`devis_connus`, `entreprises_connues`)
   * quand elles ne fondent plus aucun refus (`purgerLesEntreprisesConnues`).
   */
  entreprises_connues_purger: { req: 'REQ-DM-029' },
  /** DM-28 — la reprise des codes NAF nuls d'un dépôt en repli manuel (`completerLesCodesNaf`). */
  naf_completer: { req: 'REQ-DM-046' },
  /** DM-61 — la suppression des notifications de l'espace douze mois après leur inscription. */
  notifications_espace_purger: { req: 'REQ-UX-016' },
  /**
   * DM-55 — l'envoi, APRÈS le commit de la transition, du courriel des notifications de la machine
   * (`decision_attribution`, `premier_rang_libere`) ; la fenêtre de redéclaration court de l'envoi.
   */
  notifications_espace_envoyer: { req: 'REQ-UX-016' },
  /**
   * DM-25 — le rapprochement QUOTIDIEN des projections de l'antériorité avec les attributions
   * occupantes : l'antériorité établie après coup annule le dépôt (`rapprocherLesAnteriorites`).
   */
  anteriorites_rapprocher: { req: 'REQ-JUR-007' },
  /** DM-59 — l'effacement, à échéance, de la valeur d'une rectification demandée par le contact. */
  droits_contact_purger: { req: 'REQ-JUR-065' },
  /** DM-60 — l'anonymisation, cinq ans après sa clôture, de la trace d'une demande de droit du contact. */
  droits_contact_anonymiser: { req: 'REQ-JUR-065' },
  /** SEC-15 — la levée de plein droit d'une suspension, quinze jours après sa notification. */
  suspensions_lever: { req: 'REQ-SEC-019' },
  /** SEC-55 — la purge des appareils connus, une durée de session après leur dernière vue. */
  appareils_purger: { req: 'REQ-SEC-003' },
  /** SEC-58 — la purge, à échéance, du journal des accès à la console. */
  journal_acces_console_purger: { req: 'REQ-SEC-023' },
  /** SEC-65 — la suppression des sessions finies, six mois après leur fin. */
  sessions_purger: { req: 'REQ-SEC-003' },
  /** SEC-65 — l'effacement du nom et de l'adresse d'un accès désactivé de la console, cinq ans après. */
  utilisateurs_console_effacer: { req: 'REQ-JUR-068' },
  /**
   * INT-T08-P — la réconciliation quotidienne avec axion-ia : relecture de sa file depuis la plus
   * haute séquence reçue, rejeu des trous (`src/server/jobs/reconciliation.ts`).
   */
  reconciliation_axionia: { req: 'REQ-INT-013' },
  /**
   * SEC-18 — l'ouverture DIFFÉRÉE des anomalies d'auto-parrainage, sur les naissances de candidatures
   * et de pièces RIB lues au journal (`src/server/taches/ouvrir-anomalies-auto-parrainage.ts`).
   */
  auto_parrainage_ouvrir: { req: 'REQ-SEC-031' },
  /**
   * DM-62 — l'anonymisation des anomalies à leur échéance, et le NOMBRE des mesures ouvertes au-delà
   * de `MESURE_OUVERTE_ALERTE_JOURS` (`anonymiserLesAnomalies`).
   */
  anomalies_anonymiser: { req: 'REQ-DM-033' },
  /** DM-62 — le vidage du texte et de la réponse d'une contestation à son échéance. */
  contestations_purger: { req: 'REQ-DM-043' },
  /** DM-62 — la purge dédiée du démenti d'un contact, que la purge du contact excepte. */
  dementis_purger: { req: 'REQ-DM-043' },
  /** DM-70 — la purge du texte d'une décision de contrat, cinq ans après son point de départ. */
  decisions_contrat_purger: { req: 'REQ-JUR-029' },
} as const satisfies Readonly<Record<string, { req: `REQ-${string}` }>>;

export type NomDeTache = keyof typeof TACHES;

const NOMS = Object.keys(TACHES) as [NomDeTache, ...NomDeTache[]];

/** La validation à l'écriture : une clé hors du registre ne devient jamais une ligne. */
export const schemaNomDeTache = z.enum(NOMS);
