/**
 * La purge planifiée du journal des accès à la console (SEC-58) — un passage du lanceur.
 *
 * Une trace dont `survenu_at` précède la limite (`JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS`,
 * `retention.ts`, décision de Williams du 2026-10-03) est SUPPRIMÉE, par lots bornés, dans UNE
 * transaction. La table est en ajout seul : la base refuse tout DELETE hors du marqueur de la purge,
 * que cette tâche SEULE pose, en local à sa transaction (`set_config(…, true)`). Idempotente ; un lot
 * qui n'enlève rien arrête la boucle. Le gel d'une trace liée à un incident ou à un litige est une
 * tâche à part, avant la mise en service.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : une suppression bornée, relancée jusqu'à épuisement. */
export const LOT_DE_PURGE_DU_JOURNAL_DES_ACCES = 500;

/** La limite : une trace survenue AVANT elle a passé sa durée. Mois civils, en UTC. */
export function limiteDuJournalDesAcces(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - SEUILS.JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS.valeur);
  return limite;
}

export async function purgerLeJournalDesAccesConsole(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ supprimees: number }> {
  const limite = limiteDuJournalDesAcces(maintenant);
  return prisma.$transaction(async (tx) => {
    // Le marqueur, local à CETTE transaction : il ne fuit pas, et la base n'admet aucun autre DELETE.
    await tx.$executeRaw`SELECT set_config('partners.purge_journal_acces', 'on', true)`;
    let supprimees = 0;
    for (;;) {
      const lot = await tx.journalAccesConsole.findMany({
        where: { survenuAt: { lt: limite } },
        select: { id: true },
        orderBy: [{ survenuAt: 'asc' }, { id: 'asc' }],
        take: LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
      });
      if (lot.length === 0) return { supprimees };
      const { count } = await tx.journalAccesConsole.deleteMany({
        where: { id: { in: lot.map((l) => l.id) } },
      });
      // Un lot échu dont la suppression n'enlève rien serait relu à l'identique : on s'arrête.
      if (count === 0) return { supprimees };
      supprimees += count;
    }
  });
}
