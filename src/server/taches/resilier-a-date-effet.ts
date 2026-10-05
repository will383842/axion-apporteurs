/**
 * SEC-66 (REQ-JUR-015, art. 11.1 et 12) — la résiliation par la Société À SA DATE D'EFFET : un passage
 * du lanceur (forme (b) d'A02, #703, 5983008261, point 4).
 *
 * Les candidats sont les apporteurs SOUS CONTRAT qui portent une décision `resiliation` dont la date
 * d'effet est atteinte (jour civil de Paris). Pour chacun, dans SA transaction et sous le verrou de sa
 * ligne, `resilierALaDateDEffetUnApporteur` relit la décision OPPOSABLE la plus récente — son courriel
 * parti le jour de la décision — et ne résilie que si c'est elle dont la date est atteinte. Une
 * décision caduque, ou supplantée par une plus récente, ne produit rien : aucune date d'effet n'est
 * opposée sans le courriel qui fait courir le préavis (juriste, #703, 5983001668).
 *
 * Idempotente : un apporteur résilié n'est plus sous contrat, et n'est plus relu. Un refus nommé
 * (`decision_deja_citee`) est compté par son nom dans le bilan, et n'arrête pas le passage.
 */
import type { PrismaClient } from '@prisma/client';
import { STATUTS_SOUS_CONTRAT, jourCivilDeParis } from '../../domain/apporteur/resiliation';
import { ErreurResiliation, resilierALaDateDEffetUnApporteur } from '../apporteur/resiliation';

/** Le bilan du passage : les résiliés, et un compteur par refus NOMMÉ — jamais l'apporteur. */
export type BilanDesResiliations = { resilies: number } & Partial<
  Record<`refus_${ErreurResiliation['code']}`, number>
>;

export async function resilierALaDateDEffet(
  prisma: PrismaClient,
  maintenant: Date
): Promise<BilanDesResiliations> {
  const aujourdhui = new Date(`${jourCivilDeParis(maintenant.getTime())}T00:00:00.000Z`);
  const candidats = await prisma.decisionDeContrat.findMany({
    where: {
      geste: 'resiliation',
      dateEffet: { lte: aujourdhui },
      apporteur: { statut: { in: [...STATUTS_SOUS_CONTRAT] } },
    },
    select: { apporteurId: true },
    distinct: ['apporteurId'],
    orderBy: { apporteurId: 'asc' },
  });
  const bilan: BilanDesResiliations = { resilies: 0 };
  for (const { apporteurId } of candidats) {
    try {
      const fait = await prisma.$transaction((tx) =>
        resilierALaDateDEffetUnApporteur(tx, apporteurId, maintenant)
      );
      if (fait) bilan.resilies += 1;
    } catch (e) {
      // Un refus NOMMÉ (une décision déjà citée) laisse l'apporteur tel quel, sa transaction annulée,
      // et n'arrête pas le passage des autres ; toute autre erreur remonte.
      if (!(e instanceof ErreurResiliation)) throw e;
      const cle = `refus_${e.code}` as const;
      bilan[cle] = (bilan[cle] ?? 0) + 1;
    }
  }
  return bilan;
}
