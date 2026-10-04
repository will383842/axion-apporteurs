/**
 * La suppression planifiée des notifications de l'espace (DM-61, REQ-UX-016, décision de Williams du
 * 2026-10-03) — un passage du lanceur.
 *
 * Une notification inscrite il y a PLUS de douze mois (`NOTIFICATIONS_ESPACE_CONSERVATION_MOIS`,
 * `retention.ts`) est SUPPRIMÉE : c'est une copie d'affichage, et la preuve d'un délai reste le
 * courriel envoyé (`courriels_envoyes`), que cette tâche ne touche pas, pas plus que les préférences.
 * La date lue est `cree_at`, l'inscription dans l'espace : une notification n'a pas toujours de
 * courriel (A02). Par lots bornés ; idempotente, puisqu'une ligne supprimée n'est plus relue.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : une suppression bornée, relancée jusqu'à épuisement. */
export const LOT_DE_PURGE_DES_NOTIFICATIONS = 500;

/** La limite : une notification inscrite AVANT elle a passé ses douze mois. Mois civils, en UTC. */
export function limiteDeConservationDesNotifications(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - SEUILS.NOTIFICATIONS_ESPACE_CONSERVATION_MOIS.valeur);
  return limite;
}

export async function purgerLesNotificationsDeLEspace(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ supprimees: number }> {
  const limite = limiteDeConservationDesNotifications(maintenant);
  let supprimees = 0;
  for (;;) {
    const lot = await prisma.notificationEspace.findMany({
      where: { creeAt: { lt: limite } },
      select: { id: true },
      orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_NOTIFICATIONS,
    });
    if (lot.length === 0) return { supprimees };
    const { count } = await prisma.notificationEspace.deleteMany({
      where: { id: { in: lot.map((l) => l.id) } },
    });
    // Un lot échu dont la suppression n'enlève rien serait relu à l'identique : on s'arrête, et le
    // passage suivant du lanceur le reprendra.
    if (count === 0) return { supprimees };
    supprimees += count;
  }
}
