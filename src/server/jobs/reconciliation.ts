/**
 * La tâche quotidienne de réconciliation avec axion-ia — INT-T08-P (REQ-INT-013, REQ-QA-026).
 *
 * Le lanceur joue chaque tâche inscrite à chaque minute ; celle-ci n'est DUE qu'une fois par jour
 * civil UTC. Elle lit l'instant de son dernier succès (son battement) : réussie aujourd'hui, elle
 * rend `{ differee: 1 }` sans rien appeler ; sinon, elle joue le passage et rend ses compteurs, que
 * le battement porte même quand tout va bien. Un passage qui échoue n'écrit pas de succès : la
 * minute suivante le retente, sous le verrou du lanceur. Le jour se compare sur la date UTC, jamais
 * par une durée : un passage manqué la veille ne décale pas celui du lendemain.
 */
import type { CompteursDeReconciliation } from '../integrations/axionia/reconciliation';

/** Le jour civil UTC d'un instant. */
const jourUtc = (d: Date): string => d.toISOString().slice(0, 10);

export function passageQuotidien(d: {
  readonly dernierSucces: () => Promise<Date | null>;
  readonly maintenant: () => Date;
  readonly reconcilier: () => Promise<CompteursDeReconciliation>;
}): () => Promise<CompteursDeReconciliation | { differee: number }> {
  return async () => {
    const dernier = await d.dernierSucces();
    if (dernier !== null && jourUtc(dernier) === jourUtc(d.maintenant())) return { differee: 1 };
    return d.reconcilier();
  };
}
