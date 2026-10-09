/**
 * L'effacement planifié des accès désactivés de la console (SEC-65, REQ-JUR-068, décision de Williams
 * du 2026-10-04) — un passage du lanceur.
 *
 * Un utilisateur de la console désactivé à la limite ou avant
 * (`UTILISATEUR_CONSOLE_DESACTIVE_EFFACE_APRES_ANS`, `retention.ts`) perd, DANS LA MÊME ÉCRITURE, son
 * nom chiffré, son adresse chiffrée ET l'empreinte de l'adresse : une empreinte ne survit jamais à la
 * donnée qu'elle désigne. L'identifiant et le rôle restent, sans donnée de personne ; le journal des
 * accès et le journal chaîné qui le citent ne sont pas touchés. La base l'admet sur un compte
 * désactivé seulement (CHECK `utilisateurs_console_adresse_si_actif`) ; l'empreinte vidée, la même
 * adresse peut être invitée de nouveau, et crée un compte neuf, sans lien avec l'ancien.
 *
 * Un compte actif n'est jamais touché, ni un compte réactivé : le critère, rejugé à l'écriture, exige
 * `desactive_at`. Par lots bornés ; idempotente, puisqu'un compte effacé n'est plus relu.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La taille d'un lot : un effacement borné, relancé jusqu'à épuisement. */
export const LOT_D_EFFACEMENT_DES_COMPTES = 500;

/** La limite : un compte désactivé AU PLUS TARD à elle a passé sa durée. Années civiles, en UTC. */
export function limiteDesComptesDesactives(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCFullYear(
    limite.getUTCFullYear() - SEUILS.UTILISATEUR_CONSOLE_DESACTIVE_EFFACE_APRES_ANS.valeur
  );
  return limite;
}

/**
 * Les comptes échus : désactivés à la limite ou avant, et portant encore une donnée de personne. Le
 * « non nul » s'écrit `NOT: { colonne: null }` : une colonne chiffrée ne reçoit, hors de `pii.ts`, que
 * `null`, `true` ou `false` (`securite:schema-pii`).
 */
export function comptesEchus(limite: Date): Prisma.UtilisateurConsoleWhereInput {
  return {
    desactiveAt: { lte: limite },
    OR: [
      { NOT: { nomChiffre: null } },
      { NOT: { emailChiffre: null } },
      { NOT: { emailHash: null } },
    ],
  };
}

export async function effacerLesComptesDesactives(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ effaces: number }> {
  const echus = comptesEchus(limiteDesComptesDesactives(maintenant));
  let effaces = 0;
  for (;;) {
    const lot = await prisma.utilisateurConsole.findMany({
      where: echus,
      select: { id: true },
      orderBy: [{ desactiveAt: 'asc' }, { id: 'asc' }],
      take: LOT_D_EFFACEMENT_DES_COMPTES,
    });
    if (lot.length === 0) return { effaces };
    const { count } = await prisma.utilisateurConsole.updateMany({
      where: { id: { in: lot.map((l) => l.id) }, ...echus },
      data: { nomChiffre: null, emailChiffre: null, emailHash: null },
    });
    // Un lot échu que l'écriture n'efface pas serait relu à l'identique : on s'arrête, et le passage
    // suivant du lanceur le reprendra.
    if (count === 0) return { effaces };
    effaces += count;
  }
}
