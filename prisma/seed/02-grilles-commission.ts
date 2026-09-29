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
