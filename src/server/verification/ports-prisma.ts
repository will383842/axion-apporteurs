/**
 * Les ports de « Vérifier une entreprise » (SEC-16) sur la base. L'état de l'entreprise au registre
 * public a son port (`registre-public.ts`) ; l'antériorité et la liste de la Société se lisent sur
 * les projections de DM-10-P, câblées avec elles.
 */
import type { PrismaClient } from '@prisma/client';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import type { PortsDeVerification } from './verifier';

/**
 * Les compteurs de la vérification, tant qu'ils ne sont pas au registre : REFUS (rattrapage 96).
 * Aucun chiffre n'est posé avant la décision de Williams, et « aucun chiffre » ne devient jamais
 * « pas de limite ». Le jour où `verif:identite` et `verif:ip` entrent au registre, ce port appelle
 * `limiter` par leurs noms LITTÉRAUX (garde `securite:rate-famille`).
 */
export const compterAvantLaDecision: PortsDeVerification['compter'] = async () => ({
  autorise: false,
});

export function portsDeLaBase(
  prisma: PrismaClient
): Pick<PortsDeVerification, 'compter' | 'occupation' | 'journaliser'> {
  return {
    compter: compterAvantLaDecision,
    // Tout occupant compte, quel qu'en soit le porteur : un apporteur ou un conseiller (W19).
    occupation: async (siren) => {
      const [occupants, enFile] = await Promise.all([
        prisma.attribution.count({ where: { siren, statut: { in: [...ETATS_OCCUPANTS] } } }),
        prisma.attribution.count({ where: { siren, statut: 'en_attente' } }),
      ]);
      return { occupee: occupants > 0, enFile };
    },
    journaliser: async (l) => {
      await prisma.verification.create({ data: l });
    },
  };
}
