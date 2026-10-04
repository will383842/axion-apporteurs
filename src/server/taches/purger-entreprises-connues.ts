/**
 * La purge des projections de l'antériorité (DM-66, REQ-DM-029, REQ-DM-028) — un passage du lanceur.
 *
 * Les durées sont celles de la juriste au registre de l'article 30 : une ligne est gardée TANT
 * QU'ELLE PEUT FONDER UN REFUS (art. 3.3), puis effacée. Elles se lisent donc dans la règle elle-même
 * — les fenêtres `ANTERIORITE_CLIENT_MOIS` et `ANTERIORITE_DEVIS_MOIS` de la SSOT et
 * `estEntierementFacture` —, jamais recopiées :
 *   — `devis_connus` : effacé quand il n'est plus « signé et pas entièrement facturé » ET que son
 *     émission est sortie de la fenêtre des devis ;
 *   — `entreprises_connues`, origine client : effacée quand la dernière prestation est sortie de la
 *     fenêtre cliente ; origine devis : retirée quand plus aucun devis ne la rend connue, sinon
 *     recalée sur les devis qui restent. L'origine financeur n'est pas une projection : la liste de
 *     la Société est tenue ailleurs, et rien ici ne la touche.
 * Bornes comprises, comme la règle : une ligne pile à la limite fonde encore un refus. Mois civils à
 * Paris. La projection RECALCULE depuis les événements : une ligne effacée qu'un nouvel événement
 * fait revivre sera rejugée au passage suivant.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { ajouterMoisParis } from '../../domain/attribution/machine';
import { estEntierementFacture } from '../../domain/entreprise-connue/anteriorite';
import { verrouillerLesSirens } from '../entreprise-connue/projection';

/** Les devis candidats sont relus par lots bornés, en avançant sur la référence. */
export const LOT_DE_PURGE_DES_ENTREPRISES_CONNUES = 500;

const limite = (maintenant: Date, mois: number) =>
  new Date(ajouterMoisParis(maintenant.getTime(), -mois));

export async function purgerLesEntreprisesConnues(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ devis: number; clients: number; devisOrigine: number }> {
  const limiteDevis = limite(maintenant, SEUILS.ANTERIORITE_DEVIS_MOIS.valeur);
  const limiteClient = limite(maintenant, SEUILS.ANTERIORITE_CLIENT_MOIS.valeur);

  // 1. Les devis sortis de la fenêtre, et qui ne restent pas « signés et ouverts ».
  let devis = 0;
  const sirensTouches = new Set<string>();
  let apres = '';
  for (;;) {
    const lot = await prisma.devisConnu.findMany({
      where: { emisAt: { lt: limiteDevis }, devisRef: { gt: apres } },
      orderBy: { devisRef: 'asc' },
      take: LOT_DE_PURGE_DES_ENTREPRISES_CONNUES,
    });
    if (lot.length === 0) break;
    apres = lot.at(-1)!.devisRef;
    const effaces = lot.filter((d) => d.signeAt === null || estEntierementFacture(d));
    if (effaces.length > 0) {
      const { count } = await prisma.devisConnu.deleteMany({
        where: { devisRef: { in: effaces.map((d) => d.devisRef) } },
      });
      devis += count;
      for (const d of effaces) sirensTouches.add(d.siren);
    }
  }

  // 2. Les clients dont la dernière prestation est sortie de la fenêtre.
  const { count: clients } = await prisma.entrepriseConnue.deleteMany({
    where: { origine: 'client', dernierContactAt: { lt: limiteClient } },
  });

  // 3. L'origine devis des entreprises touchées : retirée, ou recalée sur ce qui reste.
  let devisOrigine = 0;
  // Une transaction par SIREN, sous le MÊME verrou que la projection (DM-66, lentille sécurité) : la
  // purge attend une projection en cours sur ce SIREN, et relit les devis restants APRÈS elle.
  for (const siren of sirensTouches) {
    devisOrigine += await prisma.$transaction(async (tx) => {
      await verrouillerLesSirens(tx, [siren]);
      const restants = await tx.devisConnu.findMany({ where: { siren } });
      if (restants.length === 0) {
        const { count } = await tx.entrepriseConnue.deleteMany({
          where: { siren, origine: 'devis' },
        });
        return count;
      }
      const temps = restants.flatMap((d) =>
        d.signeAt === null ? [d.emisAt.getTime()] : [d.emisAt.getTime(), d.signeAt.getTime()]
      );
      await tx.entrepriseConnue.updateMany({
        where: { siren, origine: 'devis' },
        data: {
          connueDepuisAt: new Date(Math.min(...temps)),
          dernierContactAt: new Date(Math.max(...temps)),
        },
      });
      return 0;
    });
  }

  return { devis, clients, devisOrigine };
}
