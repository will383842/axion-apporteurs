/**
 * La tâche quotidienne de réconciliation avec axion-ia — INT-T08-P (REQ-QA-026 ; le job de REQ-INT-013).
 *
 * Le lanceur joue chaque tâche inscrite à chaque minute ; celle-ci n'est DUE qu'une fois par jour
 * civil UTC. Elle lit l'instant de son dernier succès (son battement) : réussie aujourd'hui, elle
 * n'appelle rien et REPORTE les compteurs que le battement porte, marqués `differee: 1` ; sinon,
 * elle joue le passage et rend ses compteurs, que le battement porte même quand tout va bien. Le
 * report tient les `event_id` manquants au battement tout le jour (REQ-INT-013) : chaque succès
 * REMPLACE la colonne des compteurs, et une minute différée qui ne rendrait que `{ differee: 1 }`
 * les effacerait à la minute suivante. Un passage qui échoue n'écrit pas de succès : la minute
 * suivante le retente, sous le verrou du lanceur. Le jour se compare sur la date UTC, jamais par une
 * durée : un passage manqué la veille ne décale pas celui du lendemain.
 */
import type { CompteursDeReconciliation } from '../integrations/axionia/reconciliation';

/** Le jour civil UTC d'un instant. */
const jourUtc = (d: Date): string => d.toISOString().slice(0, 10);

/** Les compteurs lus au battement, s'ils forment un objet ; rien sinon (premier passage, colonne nulle). */
const objetOuRien = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {};

export function passageQuotidien(d: {
  readonly dernierSucces: () => Promise<Date | null>;
  /** Les compteurs que porte le battement de la tâche : ceux du passage du jour, une fois joué. */
  readonly derniersCompteurs: () => Promise<unknown>;
  readonly maintenant: () => Date;
  readonly reconcilier: () => Promise<CompteursDeReconciliation>;
}): () => Promise<CompteursDeReconciliation | Record<string, unknown>> {
  return async () => {
    const dernier = await d.dernierSucces();
    if (dernier !== null && jourUtc(dernier) === jourUtc(d.maintenant()))
      return { ...objetOuRien(await d.derniersCompteurs()), differee: 1 };
    return d.reconcilier();
  };
}
