/**
 * Les ports de « Vérifier une entreprise » (SEC-16) sur la base. L'antériorité et l'état de
 * l'entreprise au registre public ont leurs propres ports, câblés à part.
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
): Pick<PortsDeVerification, 'compter' | 'surLaListe' | 'occupation' | 'journaliser'> {
  return {
    compter: compterAvantLaDecision,
    surLaListe: async (siren) =>
      (await prisma.sirenListeNoire.findUnique({ where: { siren }, select: { siren: true } })) !==
      null,
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
