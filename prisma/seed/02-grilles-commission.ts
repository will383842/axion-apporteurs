/**
 * prisma/seed/02-grilles-commission.ts — le module du semeur pour la grille de commission (DM-03-P,
 * partners/ADR-0022).
 *
 * IL NE FABRIQUE AUCUNE GRILLE. La publication lui est fournie par l'appelant — celle qu'axionia a
 * émise, ou, en test, sa version pseudonymisée par le même producteur — et il la fait passer par
 * `importerGrille`, le SEUL chemin d'écriture de la table : forme fermée, empreintes confrontées,
 * version jamais réécrite. Aucune valeur de la grille n'est écrite dans ce dépôt (PRESEANCE §3.4).
 *
 * DÉTERMINISTE : l'instant d'import est fourni par l'appelant ; mêmes entrées, même ligne, et un
 * second appel est inerte (`deja_importee`).
 */

import type { PrismaClient } from '@prisma/client';
import { importerGrille, type ResultatImport } from '../../src/server/grille/import';

export async function semerGrilleCommission(
  prisma: PrismaClient,
  publication: unknown,
  importeeAt: Date
): Promise<ResultatImport> {
  return importerGrille(prisma, publication, importeeAt);
}

/**
 * Le module par défaut du chargeur (`prisma/seed.ts`) : il ne sème AUCUNE grille. Une grille ne se
 * fabrique pas ; elle vient d'une publication d'axionia, ou de sa version pseudonymisée par le même
 * producteur (RM-03), et le dépôt n'en porte aucune à ce jour. Le semeur l'importera le jour où la
 * fixture existera, par `semerGrilleCommission`, avec l'instant du contexte.
 */
export default async function semerParDefaut(): Promise<void> {
  // Rien à semer : voir ci-dessus.
}
