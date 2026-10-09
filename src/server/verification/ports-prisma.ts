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
import { limiter } from '../securite/rate-limit';
import type { PortsDeVerification } from './verifier';

/**
 * SEC-72 (REQ-SEC-021) — les compteurs de la vérification, au registre, par leurs noms LITTÉRAUX
 * (garde `securite:rate-famille`). Leurs plafonds sont HORS DÉPÔT, dans le secret des plafonds (`rate-limit.ts`) :
 * absents, illisibles ou incohérents, chaque compteur REFUSE — « aucun chiffre » ne devient jamais
 * « pas de limite ». L'identité est comptée sur la rafale d'abord, puis sur la fenêtre longue : une
 * rafale refusée n'use pas la fenêtre longue. Le port ne rend qu'un booléen : ni motif, ni fenêtre,
 * ni reste — le refus est le même pour les trois.
 */
export const compterAuRegistre: PortsDeVerification['compter'] = async (quoi, sujet) => {
  const maintenant = horlogeSysteme.maintenant();
  if (quoi === 'ip') {
    return { autorise: (await limiter('verif:ip-jour', sujet, maintenant)).autorise };
  }
  if (!(await limiter('verif:identite-court', sujet, maintenant)).autorise) {
    return { autorise: false };
  }
  return { autorise: (await limiter('verif:identite-jour', sujet, maintenant)).autorise };
};

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
    compter: compterAuRegistre,
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
