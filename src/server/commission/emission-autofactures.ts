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
 * Ce module porte le PORT ; son adaptateur Prisma est `depot-autofactures-prisma.ts`, sur les tables
 * `lignes_commission`, `autofactures` et `compteurs_autofacture`. Les autofactures sont créées dans
 * l'ordre chronologique de leur émission, que `composerAutofactures` rend : la base les numérote dans
 * l'ordre de création, et la séquence doit être chronologique (REQ-ARG-018).
 * Rien du contenu d'une autofacture n'est journalisé ici (conditions de la sécurité, point 4).
 */
import {
  composerAutofactures,
  type AutofactureComposee,
  type LigneAcquise,
} from '../../domain/commission/autofacture';
import { joursDeLaDate } from '../../domain/temps/calendrier-civil';
import type { Horloge } from '../../domain/temps/horloge';
import { versParis } from '../../domain/temps/paris';

export type AutofactureACreer = AutofactureComposee & { readonly id: string };

export interface TransactionAutofactures {
  /** Un identifiant neuf d'autofacture. */
  nouvelId(): string;
  /**
   * Affecte à `autofactureId` celles des lignes `ids` dont `autofactureId` est encore nul, et rend
   * les identifiants effectivement affectés (`WHERE autofactureId IS NULL`, atomique en base). La
   * condition revérifie aussi, dans la transaction, que la ligne est toujours facturable.
   */
  affecterSiLibre(ids: readonly string[], autofactureId: string): Promise<readonly string[]>;
  creerAutofacture(af: AutofactureACreer): Promise<void>;
}

export interface DepotAutofactures {
  /** Les lignes acquises qui ne portent encore aucune autofacture. */
  lignesLibres(): Promise<readonly LigneAcquise[]>;
  transaction<T>(fn: (tx: TransactionAutofactures) => Promise<T>): Promise<T>;
}

/**
 * Le passage « tout ce qui est dû à l'instant t » (REQ-ARG-014), horloge injectée : il émet les
 * autofactures des lignes libres dont le jour d'émission (établissement ou régularisation) est
 * atteint À PARIS, et rend celles effectivement créées. Aucune autofacture n'est datée dans le futur : une ligne dont le jour
 * d'émission n'est pas encore venu reste libre pour un passage ultérieur.
 */
export async function emettreAutofactures(
  depot: DepotAutofactures,
  horloge: Horloge
): Promise<readonly AutofactureACreer[]> {
  const aujourdhui = joursDeLaDate(versParis(horloge.maintenant()));
  const lignes = await depot.lignesLibres();
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const creees: AutofactureACreer[] = [];
  for (const prevue of composerAutofactures(lignes)) {
    if (joursDeLaDate(prevue.emiseLe) > aujourdhui) continue;
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
