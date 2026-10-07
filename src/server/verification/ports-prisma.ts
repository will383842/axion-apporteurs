/**
 * Les ports de « Vérifier une entreprise » (SEC-16) sur la base. L'état de l'entreprise au registre
 * public a son port (`registre-public.ts`). L'antériorité se lit sur les projections locales
 * (`anterioriteDe`), sans réseau ; la liste de la Société, sur `sirens_liste_noire`. Les deux
 * causes restent DISTINCTES au journal : l'antériorité ne compte ici que les origines client et devis.
 */
import type { PrismaClient } from '@prisma/client';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import { horlogeSysteme } from '../../lib/horloge';
import { anterioriteDe } from '../entreprise-connue/projection';
import { derniereFinSurLeSiren } from '../evenement/journal';
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
): Pick<
  PortsDeVerification,
  | 'compter'
  | 'anteriorite'
  | 'surLaListe'
  | 'occupation'
  | 'derniereFin'
  | 'maintenant'
  | 'journaliser'
> {
  return {
    compter: compterAvantLaDecision,
    anteriorite: async (siren) => {
      const a = await anterioriteDe(prisma, siren, new Date(horlogeSysteme.maintenant()));
      return a.connue && a.origine !== 'financeur';
    },
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
    // EXT-T06 : la dernière fin, par le lecteur RÉSERVÉ du journal ; une date ou null, rien d'autre.
    derniereFin: (siren) => derniereFinSurLeSiren(prisma, siren),
    maintenant: () => new Date(horlogeSysteme.maintenant()),
    journaliser: async (l) => {
      await prisma.verification.create({ data: l });
    },
  };
}
