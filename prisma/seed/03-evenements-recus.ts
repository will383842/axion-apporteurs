/**
 * Le module du semeur de SEC-06 (partners/ADR-0022, point 14 : `prisma/seed.ts` exécute les modules
 * de `prisma/seed/` dans l'ordre de leur préfixe, chacun livré par la tâche qui crée sa table).
 *
 * Ce qu'il sème : une ligne de `battements` par tâche du registre, SANS date. Une base de préversion
 * montre ainsi chaque tâche « jamais passée » au lieu de n'en montrer aucune — un battement absent
 * et un battement jamais écrit ne se distinguent pas autrement. Aucun événement reçu n'est semé :
 * la table est en ajout seul, et un événement se reçoit, il ne se fabrique pas (RM-03).
 * Idempotent : relancé, il n'écrit rien de plus.
 */
import type { PrismaClient } from '@prisma/client';
import { TACHES, schemaNomDeTache } from '../../src/server/taches/registre';

export default async function semerEvenementsRecus(prisma: PrismaClient): Promise<void> {
  for (const cle of Object.keys(TACHES)) {
    const tache = schemaNomDeTache.parse(cle);
    await prisma.battement.upsert({ where: { tache }, create: { tache }, update: {} });
  }
}
