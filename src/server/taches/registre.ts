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
  /** DM-28 — la reprise des codes NAF nuls d'un dépôt en repli manuel (`completerLesCodesNaf`). */
  naf_completer: { req: 'REQ-DM-046' },
  /** DM-59 — l'effacement, à échéance, de la valeur d'une rectification demandée par le contact. */
  droits_contact_purger: { req: 'REQ-JUR-065' },
} as const satisfies Readonly<Record<string, { req: `REQ-${string}` }>>;

export type NomDeTache = keyof typeof TACHES;

const NOMS = Object.keys(TACHES) as [NomDeTache, ...NomDeTache[]];

/** La validation à l'écriture : une clé hors du registre ne devient jamais une ligne. */
export const schemaNomDeTache = z.enum(NOMS);
