/**
 * DM-59 (REQ-JUR-065) — la purge planifiée de la NOUVELLE VALEUR d'une rectification demandée par
 * le contact. La valeur s'efface d'ordinaire à la clôture de la demande, dans la même transaction ;
 * cette tâche est le filet : toute valeur encore présente à son échéance (un mois après la
 * réception, trois si le délai a été prolongé, `echeanceDeLaValeur`) est effacée, même sans
 * traitement, et sa date d'effacement posée.
 *
 * Idempotente : la mise à jour est conditionnée à `valeurChiffree` non nulle, et le gabarit de la
 * table refuse de réécrire `valeur_purgee_at`. Aucun événement de journal n'est écrit : rien de la
 * valeur n'en sort, ni sa forme, ni sa longueur.
 */
import type { PrismaClient } from '@prisma/client';
import { echeanceDeLaValeur } from '../../domain/droits-contact/delais';

/** Un lot de lecture : la tâche reprend au passage suivant ce qu'elle n'a pas fini. */
const LOT = 100;

export async function purgerLesValeursDesDroits(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ effacees: number }> {
  let effacees = 0;
  let apres: string | undefined;
  for (;;) {
    const lot = await prisma.demandeDroitContact.findMany({
      where: {
        valeurChiffree: { not: null },
        recueAt: { lte: maintenant },
        ...(apres === undefined ? {} : { id: { gt: apres } }),
      },
      select: { id: true, recueAt: true, prolongeeAt: true },
      orderBy: { id: 'asc' },
      take: LOT,
    });
    if (lot.length === 0) return { effacees };
    for (const d of lot) {
      const echeance = echeanceDeLaValeur(d.recueAt.getTime(), d.prolongeeAt?.getTime() ?? null);
      if (echeance > maintenant.getTime()) continue;
      const { count } = await prisma.demandeDroitContact.updateMany({
        where: { id: d.id, valeurChiffree: { not: null } },
        data: { valeurChiffree: null, valeurPurgeeAt: maintenant },
      });
      effacees += count;
    }
    if (lot.length < LOT) return { effacees };
    apres = lot[lot.length - 1]!.id;
  }
}
