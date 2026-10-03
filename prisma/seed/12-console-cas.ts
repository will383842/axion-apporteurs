/**
 * prisma/seed/12-console-cas.ts — le module du semeur pour les cas de la console (DM-12,
 * partners/ADR-0022) : une anomalie, et une contestation dont le texte est chiffré pour SA ligne.
 *
 * DÉTERMINISTE : les identifiants, les instants et les textes sont fournis par l'appelant, jamais
 * tirés ici ; mêmes entrées, mêmes lignes (hors l'IV du chiffrement, neuf à chaque appel). Le texte
 * passe par `colonnesPii`, lié à la ligne (modèle `Contestation`) ; aucun clair n'est écrit. Le score
 * n'existe que pour la sincérité, comme la base l'exige.
 */

import type { ObjetContestation, PrismaClient, TypeAnomalie } from '@prisma/client';
import { colonnesPii, type ClesPii } from '../../src/server/securite/pii';
import { MODELE_DE_LA_JUSTIFICATION } from '../../src/server/anomalie/justification';

/** Le nom du modèle dans la donnée authentifiée du bloc chiffré d'une contestation. */
export const MODELE_CONTESTATION = 'Contestation';
/** Le nom du modèle d'une anomalie, repris du lecteur unique de sa justification : une seule source. */
export const MODELE_ANOMALIE = MODELE_DE_LA_JUSTIFICATION;

export interface AnomalieASemer {
  id: string;
  type: TypeAnomalie;
  score: number | null;
  apporteurId: string;
  attributionId: string | null;
  ouverteAt: Date;
}

export async function semerAnomalie(
  prisma: PrismaClient,
  a: AnomalieASemer
): Promise<{ id: string }> {
  return prisma.anomalie.create({
    data: {
      id: a.id,
      type: a.type,
      score: a.score,
      apporteurId: a.apporteurId,
      attributionId: a.attributionId,
      ouverteAt: a.ouverteAt,
    },
    select: { id: true },
  });
}

export interface ContestationASemer {
  id: string;
  apporteurId: string;
  objet: ObjetContestation;
  depotRefuseId: string | null;
  attributionId: string | null;
  texte: string;
  recueAt: Date;
  cles: ClesPii;
}

export async function semerContestation(
  prisma: PrismaClient,
  c: ContestationASemer
): Promise<{ id: string }> {
  const { texteChiffre } = colonnesPii(
    { modele: MODELE_CONTESTATION, id: c.id },
    { texte: c.texte },
    c.cles
  );
  if (!texteChiffre) throw new Error('texte de contestation absent');
  return prisma.contestation.create({
    data: {
      id: c.id,
      apporteurId: c.apporteurId,
      objet: c.objet,
      depotRefuseId: c.depotRefuseId,
      attributionId: c.attributionId,
      texteChiffre: Buffer.from(texteChiffre),
      recueAt: c.recueAt,
    },
    select: { id: true },
  });
}
