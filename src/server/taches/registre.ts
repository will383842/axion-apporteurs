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
} as const satisfies Readonly<Record<string, { req: `REQ-${string}` }>>;

export type NomDeTache = keyof typeof TACHES;

const NOMS = Object.keys(TACHES) as [NomDeTache, ...NomDeTache[]];

/** La validation à l'écriture : une clé hors du registre ne devient jamais une ligne. */
export const schemaNomDeTache = z.enum(NOMS);
