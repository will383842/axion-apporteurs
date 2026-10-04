/**
 * La purge planifiée des appareils connus (SEC-55, REQ-SEC-003) — un passage du lanceur (GOV-137).
 *
 * L'empreinte d'un appareil est gardée au plus la DURÉE D'UNE SESSION après sa dernière vue
 * (`DUREES_AUTH.sessionMs`, la durée que la garde applique déjà : passé ce délai, `appareil.ts` ne le
 * reconnaît plus). La ligne entière est supprimée, en UNE instruction : il n'en reste aucune trace.
 * Idempotente : une ligne supprimée n'est plus relue.
 */
import type { PrismaClient } from '@prisma/client';
import { DUREES_AUTH } from '../auth/durees';

/** La limite : un appareil vu pour la dernière fois à elle ou avant a passé son échéance. */
export function limiteDesAppareils(maintenant: Date): Date {
  return new Date(maintenant.getTime() - DUREES_AUTH.sessionMs.valeur);
}

export async function purgerLesAppareils(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ purges: number }> {
  const { count } = await prisma.appareilConnu.deleteMany({
    where: { derniereVueAt: { lte: limiteDesAppareils(maintenant) } },
  });
  return { purges: count };
}
