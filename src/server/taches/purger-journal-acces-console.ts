/**
 * La purge planifiée du journal des accès à la console (SEC-58) — un passage du lanceur.
 *
 * Une trace dont `survenu_at` précède la limite (`JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS`,
 * `retention.ts`, décision de Williams du 2026-10-03) est PURGÉE : l'utilisateur, la cible et
 * l'empreinte réseau passent à NULL, et `purge_at` date la purge, en UNE écriture par lot borné. La
 * ligne nue (nature, date) RESTE. La base tient le reste : le gabarit commun d'ajout seul n'admet que
 * cette purge, une fois, et le CHECK `journal_acces_console_purge_liee` refuse une purge partielle.
 * Idempotente, lue sur `purge_at` ; un lot qui n'écrit rien arrête la boucle. Le gel d'une trace liée
 * à un incident ou à un litige est une tâche à part, avant la mise en service.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : un vidage borné des identifiants, relancé jusqu'à épuisement. */
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
): Promise<{ purgees: number }> {
  const limite = limiteDuJournalDesAcces(maintenant);
  let purgees = 0;
  for (;;) {
    const lot = await prisma.journalAccesConsole.findMany({
      where: { survenuAt: { lt: limite }, purgeAt: null },
      select: { id: true },
      orderBy: [{ survenuAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
    });
    if (lot.length === 0) return { purgees };
    const { count } = await prisma.journalAccesConsole.updateMany({
      where: { id: { in: lot.map((l) => l.id) }, purgeAt: null },
      data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: maintenant },
    });
    // Un lot échu qui n'est pas purgé serait relu à l'identique : on s'arrête.
    if (count === 0) return { purgees };
    purgees += count;
  }
}
