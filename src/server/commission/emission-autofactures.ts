/**
 * T-ARG-045 — l'émission des autofactures (REQ-ARG-018) : idempotente, et une ligne de commission
 * n'entre que dans UNE autofacture.
 *
 * La garantie n'est pas une lecture préalable — deux passages concurrents liraient les mêmes lignes
 * libres — mais l'AFFECTATION CONDITIONNELLE, dans la transaction d'émission :
 * `UPDATE … SET autofactureId = :id WHERE id IN (…) AND autofactureId IS NULL RETURNING id`.
 * Seules les lignes effectivement affectées entrent dans l'autofacture, recomposée sur elles ; si
 * aucune ne l'est, rien n'est créé. Un passage rejoué ou concurrent ne crée donc pas de seconde
 * autofacture pour une même ligne.
 *
 * Le registre des lignes de commission et la table des autofactures n'existent pas encore (tâches
 * `schema` à venir) : ce module ne porte que le PORT, que leur adaptateur Prisma devra honorer.
 * Rien du contenu d'une autofacture n'est journalisé ici (conditions de la sécurité, point 4).
 */
import {
  composerAutofactures,
  type AutofactureComposee,
  type LigneAcquise,
} from '../../domain/commission/autofacture';

export type AutofactureACreer = AutofactureComposee & { readonly id: string };

export interface TransactionAutofactures {
  /** Un identifiant neuf d'autofacture. */
  nouvelId(): string;
  /**
   * Affecte à `autofactureId` celles des lignes `ids` dont `autofactureId` est encore nul, et rend
   * les identifiants effectivement affectés (`WHERE autofactureId IS NULL`, atomique en base).
   */
  affecterSiLibre(ids: readonly string[], autofactureId: string): Promise<readonly string[]>;
  creerAutofacture(af: AutofactureACreer): Promise<void>;
}

export interface DepotAutofactures {
  /** Les lignes acquises qui ne portent encore aucune autofacture. */
  lignesLibres(): Promise<readonly LigneAcquise[]>;
  transaction<T>(fn: (tx: TransactionAutofactures) => Promise<T>): Promise<T>;
}

/** Émet les autofactures des lignes libres ; rend celles effectivement créées. */
export async function emettreAutofactures(
  depot: DepotAutofactures
): Promise<readonly AutofactureACreer[]> {
  const lignes = await depot.lignesLibres();
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const creees: AutofactureACreer[] = [];
  for (const prevue of composerAutofactures(lignes)) {
    const af = await depot.transaction(async (tx) => {
      const id = tx.nouvelId();
      const affectees = new Set(await tx.affecterSiLibre(prevue.ligneIds, id));
      if (affectees.size === 0) return null;
      const retenues = prevue.ligneIds.filter((i) => affectees.has(i)).map((i) => parId.get(i)!);
      const [composee] = composerAutofactures(retenues);
      const aCreer: AutofactureACreer = { ...composee!, id };
      await tx.creerAutofacture(aCreer);
      return aCreer;
    });
    if (af) creees.push(af);
  }
  return creees;
}
