/**
 * La purge planifiée des sessions (SEC-65, REQ-SEC-003, décision de Williams du 2026-10-04) — un
 * passage du lanceur.
 *
 * Une session de `sessions_espace` (l'espace ou la console, une seule table) dont la FIN — la plus
 * TÔT de `expire_at` et de `revoque_at`, une révocation nulle valant l'infini (juriste, #739,
 * 5985633836) — précède la limite ou l'atteint (`SESSIONS_CONSERVATION_APRES_FIN_MOIS`,
 * `retention.ts`) est SUPPRIMÉE, et son empreinte d'adresse réseau avec elle : rien ne survit de la
 * ligne. Une session révoquée prend fin à sa révocation, même si son échéance tombe plus tard. Une
 * session vivante, ni expirée ni révoquée, n'est jamais touchée : ses deux dates sont dans le futur
 * ou nulles, et la limite toujours dans le passé. Aucune table ne pointe vers une session.
 * Par lots bornés ; idempotente, puisqu'une ligne supprimée n'est plus relue.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : une suppression bornée, relancée jusqu'à épuisement. */
export const LOT_DE_PURGE_DES_SESSIONS = 500;

/** La limite : une session finie AU PLUS TARD à elle a passé sa durée. Mois civils, en UTC. */
export function limiteDesSessions(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - SEUILS.SESSIONS_CONSERVATION_APRES_FIN_MOIS.valeur);
  return limite;
}

/**
 * Les sessions échues : la plus tôt de l'expiration et de la révocation est à la limite ou avant —
 * l'expiration l'est, OU la révocation l'est. Une révocation nulle ne remplit jamais la seconde
 * branche.
 */
export function sessionsEchues(limite: Date): Prisma.SessionEspaceWhereInput {
  return { OR: [{ expireAt: { lte: limite } }, { revoqueAt: { lte: limite } }] };
}

export async function purgerLesSessions(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ supprimees: number }> {
  const echues = sessionsEchues(limiteDesSessions(maintenant));
  let supprimees = 0;
  for (;;) {
    const lot = await prisma.sessionEspace.findMany({
      where: echues,
      select: { id: true },
      orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_SESSIONS,
    });
    if (lot.length === 0) return { supprimees };
    // Le critère est rejugé à l'écriture : une ligne relue n'est supprimée que si elle est toujours échue.
    const { count } = await prisma.sessionEspace.deleteMany({
      where: { id: { in: lot.map((l) => l.id) }, ...echues },
    });
    // Un lot échu dont la suppression n'enlève rien serait relu à l'identique : on s'arrête, et le
    // passage suivant du lanceur le reprendra.
    if (count === 0) return { supprimees };
    supprimees += count;
  }
}
