/**
 * La purge planifiée du SIREN des dépôts refusés (DM-53, REQ-DM-043, HYP-A02-RETENTION,
 * partners/ADR-0030) — un passage du lanceur (GOV-137).
 *
 * Douze mois après le refus (`DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS`, `retention.ts`), le SIREN passe à
 * NULL et `siren_purge_at` date la purge, en une seule instruction. La ligne RESTE comme trace du
 * refus (apporteur, motif, canal, date). Idempotente, lue sur `siren_purge_at` : une ligne purgée
 * n'est ni relue ni réécrite. La base tient le reste : la date est liée au SIREN (CHECK), le gabarit
 * d'ajout seul n'admet que la purge vers NULL et l'écriture unique de la date.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La limite : un refus antérieur ou égal à elle a passé ses douze mois. Mois civils, en UTC. */
export function limiteDePurgeDuSiren(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - SEUILS.DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS.valeur);
  return limite;
}

export async function purgerLesSirenRefuses(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ purges: number }> {
  const { count } = await prisma.depotRefuse.updateMany({
    where: { refuseAt: { lte: limiteDePurgeDuSiren(maintenant) }, sirenPurgeAt: null },
    data: { siren: null, sirenPurgeAt: maintenant },
  });
  return { purges: count };
}
