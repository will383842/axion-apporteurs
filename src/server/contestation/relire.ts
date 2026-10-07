/**
 * UX-P1-51 (REQ-DM-043) — le LECTEUR UNIQUE d'une contestation pour l'espace de l'apporteur : il
 * relit SA contestation et la réponse d'Axion-IA, et rien d'autre.
 *
 * CONDITIONS DE LA SÉCURITÉ (acceptance ; #775, 6032748282) :
 *   — l'apporteur est celui de la SESSION, passé par l'appelant après la garde de l'espace ; il est
 *     dans le `where` de la seule lecture, avec l'identifiant : une contestation d'un autre apporteur et
 *     une contestation inconnue reçoivent la MÊME réponse, `indisponible` ;
 *   — une sélection EXPLICITE, jamais générique ;
 *   — le texte et la réponse se déchiffrent CHAMP PAR CHAMP, sous l'AAD de LEUR ligne et de LEUR
 *     champ : un chiffré permuté entre deux contestations, ou entre le texte et la réponse, échoue, et
 *     la contestation est `illisible` ;
 *   — une contestation purgée ne déchiffre rien : l'objet, la réception et le statut restent, et
 *     l'écran rend le texte fermé de la juriste (#619, 5987225083) ;
 *   — rien du texte ni de la réponse n'est consigné.
 *
 * L'échéance de réponse est DÉRIVÉE de la réception (`echeanceDeReponse`), jamais stockée.
 */
import type { ObjetContestation, PrismaClient } from '@prisma/client';
import { echeanceDeReponse } from '../../domain/anomalie/regles';
import { decryptPii, ErreurPii, type ClesPii } from '../securite/pii';

/** Le nom du modèle dans la donnée authentifiée des blocs chiffrés d'une contestation. */
export const MODELE_DE_LA_CONTESTATION = 'Contestation';

/** Le client du lecteur : la seule table des contestations. */
export type ClientDesContestations = Pick<PrismaClient, 'contestation'>;

/** Ce que l'écran reçoit : un état FERMÉ, jamais une ligne brute ni un identifiant d'autrui. */
export type ContestationRelue =
  | {
      readonly etat: 'repondue';
      readonly objet: ObjetContestation;
      readonly recueAt: Date;
      readonly texte: string;
      readonly reponse: string;
      readonly repondueAt: Date;
    }
  | {
      readonly etat: 'en_attente';
      readonly objet: ObjetContestation;
      readonly recueAt: Date;
      readonly texte: string;
      readonly echeance: Date;
    }
  | {
      readonly etat: 'purgee';
      readonly objet: ObjetContestation;
      readonly recueAt: Date;
      readonly repondue: boolean;
    }
  | { readonly etat: 'illisible' }
  | { readonly etat: 'indisponible' };

/** Un champ chiffré de CETTE contestation, déchiffré sous son AAD ; `null` s'il ne s'authentifie pas. */
function dechiffrer(
  champ: 'texteChiffre' | 'reponseChiffre',
  id: string,
  bloc: Uint8Array,
  cles: ClesPii
): string | null {
  try {
    return decryptPii({ modele: MODELE_DE_LA_CONTESTATION, champ, id }, bloc, cles);
  } catch (e) {
    if (e instanceof ErreurPii) return null;
    throw e;
  }
}

export async function relireLaContestation(
  client: ClientDesContestations,
  q: { contestationId: string; apporteurId: string },
  cles: ClesPii
): Promise<ContestationRelue> {
  const c = await client.contestation.findFirst({
    where: { id: q.contestationId, apporteurId: q.apporteurId },
    select: {
      objet: true,
      recueAt: true,
      texteChiffre: true,
      reponseChiffre: true,
      repondueAt: true,
      purgeeAt: true,
    },
  });
  if (c === null) return { etat: 'indisponible' };
  if (c.purgeeAt !== null)
    return { etat: 'purgee', objet: c.objet, recueAt: c.recueAt, repondue: c.repondueAt !== null };
  if (c.texteChiffre === null) return { etat: 'illisible' };
  const texte = dechiffrer('texteChiffre', q.contestationId, c.texteChiffre, cles);
  if (texte === null) return { etat: 'illisible' };
  if (c.reponseChiffre === null || c.repondueAt === null)
    return {
      etat: 'en_attente',
      objet: c.objet,
      recueAt: c.recueAt,
      texte,
      echeance: new Date(echeanceDeReponse(c.recueAt.getTime())),
    };
  const reponse = dechiffrer('reponseChiffre', q.contestationId, c.reponseChiffre, cles);
  if (reponse === null) return { etat: 'illisible' };
  return {
    etat: 'repondue',
    objet: c.objet,
    recueAt: c.recueAt,
    texte,
    reponse,
    repondueAt: c.repondueAt,
  };
}
