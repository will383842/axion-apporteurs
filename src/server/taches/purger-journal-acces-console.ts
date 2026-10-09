/**
 * La purge planifiée du journal des accès à la console (SEC-58) — un passage du lanceur.
 *
 * Une trace dont `survenu_at` précède la limite (`JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS`,
 * `retention.ts`, décision de Williams du 2026-10-03) est PURGÉE : l'utilisateur, la cible et
 * l'empreinte réseau passent à NULL, et `purge_at` date la purge, en UNE écriture par lot borné. La
 * ligne nue (nature, date) RESTE. La base tient le reste : le gabarit commun d'ajout seul n'admet que
 * cette purge, une fois, et le CHECK `journal_acces_console_purge_liee` refuse une purge partielle.
 * Idempotente, lue sur `purge_at` ; un lot qui n'écrit rien arrête la boucle.
 *
 * LES GELS (SEC-61) : une trace COUVERTE par un gel OUVERT (même portée, utilisateur ou cible, survenue
 * à partir de `depuis` et jusqu'à `jusqu_a` inclus quand il est posé) est EXCLUE dès la lecture du lot :
 * un lot ne bute jamais sur elle, et le filet de la base (`journal_acces_console_gel_respecte`, même
 * définition) refuse de toute façon de la purger. Une trace survenue après `jusqu_a` n'est pas couverte.
 * Après la levée, la purge suivante la vide comme les autres. Puis les gels LEVÉS dont aucune ligne
 * protégée, couverte et survenue jusqu'à la levée, ne reste à purger sont supprimés, par lots bornés :
 * leur durée est finie, et ils portent des identifiants d'employés. La garde dédiée refuse d'effacer un
 * gel ouvert, ou levé avec des lignes protégées à purger.
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

/** Les traces échues, NON gelées : le lot suivant de la purge, dans l'ordre du temps. */
function lotEchu(prisma: PrismaClient, limite: Date) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT j."id" FROM "journal_acces_console" j
    WHERE j."survenu_at" < ${limite} AND j."purge_at" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "journal_acces_console_gels" g
        WHERE g."leve_at" IS NULL
          AND j."survenu_at" >= g."depuis" AND (g."jusqu_a" IS NULL OR j."survenu_at" <= g."jusqu_a")
          AND (g."utilisateur_vise_id" = j."utilisateur_console_id" OR g."cible_id" = j."cible_id"))
    ORDER BY j."survenu_at" ASC, j."id" ASC
    LIMIT ${LOT_DE_PURGE_DU_JOURNAL_DES_ACCES}`;
}

/**
 * Les gels LEVÉS dont aucune ligne protégée ne reste à purger, par lot borné : couverte, et survenue
 * jusqu'à la levée. Une ligne neuve de la même portée, écrite après la levée, ne retient pas le gel.
 */
function gelsEpuises(prisma: PrismaClient) {
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT g."id" FROM "journal_acces_console_gels" g
    WHERE g."leve_at" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "journal_acces_console" j
      WHERE j."purge_at" IS NULL
        AND j."survenu_at" >= g."depuis" AND (g."jusqu_a" IS NULL OR j."survenu_at" <= g."jusqu_a")
        AND j."survenu_at" <= g."leve_at"
        AND (j."utilisateur_console_id" = g."utilisateur_vise_id" OR j."cible_id" = g."cible_id"))
    ORDER BY g."leve_at" ASC, g."id" ASC
    LIMIT ${LOT_DE_PURGE_DU_JOURNAL_DES_ACCES}`;
}

export async function purgerLeJournalDesAccesConsole(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ purgees: number; gelsSupprimes: number }> {
  const limite = limiteDuJournalDesAcces(maintenant);
  let purgees = 0;
  for (;;) {
    const lot = await lotEchu(prisma, limite);
    if (lot.length === 0) break;
    const { count } = await prisma.journalAccesConsole.updateMany({
      where: { id: { in: lot.map((l) => l.id) }, purgeAt: null },
      data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: maintenant },
    });
    // Un lot échu qui n'est pas purgé serait relu à l'identique : on s'arrête.
    if (count === 0) break;
    purgees += count;
  }
  let gelsSupprimes = 0;
  for (;;) {
    const lot = await gelsEpuises(prisma);
    if (lot.length === 0) return { purgees, gelsSupprimes };
    // La garde dédiée rejuge chaque gel : levé, et plus aucune ligne couverte à purger.
    const { count } = await prisma.journalAccesConsoleGel.deleteMany({
      where: { id: { in: lot.map((g) => g.id) }, leveAt: { not: null } },
    });
    if (count === 0) return { purgees, gelsSupprimes };
    gelsSupprimes += count;
  }
}
