/**
 * La purge planifiée de la trace de la liste tenue par la Société (DM-65, REQ-DM-028) — un passage du
 * lanceur.
 *
 * Une période FERMÉE dont `retire_at` plus `LISTE_NOIRE_TRACE_ANS` (`retention.ts`) est atteint est
 * EFFACÉE, par lots bornés : l'échéance pile est effacée, l'échéance moins une milliseconde gardée.
 * Une période ouverte ne s'efface jamais : la purge ne la lit pas, et la garde de la base
 * (`sirens_liste_noire_trace_garde`) la refuserait. L'échéance se juge ici, avec la SSOT, jamais en SQL.
 * Seule cette tâche efface la trace (témoin statique). Idempotente ; un lot qui n'efface rien arrête
 * la boucle.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : un effacement borné, relancé jusqu'à épuisement. */
export const LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE = 500;

/** La limite : une période retirée AU PLUS TARD à cet instant a atteint son échéance. Ans civils, UTC. */
export function limiteDesTracesDeLaListe(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCFullYear(limite.getUTCFullYear() - SEUILS.LISTE_NOIRE_TRACE_ANS.valeur);
  return limite;
}

export async function purgerLesTracesDeLaListe(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ effacees: number }> {
  const limite = limiteDesTracesDeLaListe(maintenant);
  let effacees = 0;
  for (;;) {
    const lot = await prisma.sirenListeNoireTrace.findMany({
      where: { retireAt: { not: null, lte: limite } },
      select: { id: true },
      orderBy: [{ retireAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE,
    });
    if (lot.length === 0) return { effacees };
    const { count } = await prisma.sirenListeNoireTrace.deleteMany({
      where: { id: { in: lot.map((l) => l.id) }, retireAt: { not: null, lte: limite } },
    });
    // Un lot échu qui n'est pas effacé serait relu à l'identique : on s'arrête.
    if (count === 0) return { effacees };
    effacees += count;
  }
}
