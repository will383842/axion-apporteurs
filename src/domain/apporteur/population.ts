/**
 * DM-06 — la population RÉELLE des apporteurs : `isTest` exclu (REQ-CPL-020).
 *
 * Un apporteur de test n'entre dans AUCUN agrégat d'argent, ni dans le lot de paiement, ni dans la
 * déclaration annuelle, ni dans l'entonnoir, et n'apparaît jamais dans un fichier de virement.
 * Ces agrégats naissent plus tard ; la règle, elle, naît ici et une seule fois : un agrégat ne
 * filtre pas `isTest` lui-même, il part de `populationReelle()` ou de `totalCentsHorsTest()`.
 *
 * ÉCHEC FERMÉ. Une ligne dont l'apporteur est inconnu n'est ni comptée ni écartée en silence : elle
 * lève. Compter par défaut ferait entrer un apporteur de test ; écarter par défaut ferait perdre
 * de l'argent dû.
 */

export interface ApporteurDePopulation {
  readonly id: string;
  readonly isTest: boolean;
}

export interface LigneDArgent {
  readonly apporteurId: string;
  readonly montantCents: number;
}

export class ErreurPopulation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPopulation';
  }
}

/** Les apporteurs réels, dans l'ordre reçu : ceux dont `isTest` est faux, et eux seuls. */
export function populationReelle<A extends ApporteurDePopulation>(apporteurs: readonly A[]): A[] {
  return apporteurs.filter((a) => !a.isTest);
}

/** La somme en centimes des lignes des apporteurs réels. */
export function totalCentsHorsTest(
  lignes: readonly LigneDArgent[],
  apporteurs: readonly ApporteurDePopulation[]
): number {
  const parId = new Map(apporteurs.map((a) => [a.id, a]));
  let total = 0;
  for (const l of lignes) {
    const a = parId.get(l.apporteurId);
    if (a === undefined) {
      throw new ErreurPopulation(`apporteur_inconnu : la ligne cite ${l.apporteurId}`);
    }
    if (!Number.isInteger(l.montantCents)) {
      throw new ErreurPopulation(
        `montant_non_entier : ${l.montantCents} n'est pas un nombre de centimes`
      );
    }
    if (!a.isTest) total += l.montantCents;
  }
  return total;
}
