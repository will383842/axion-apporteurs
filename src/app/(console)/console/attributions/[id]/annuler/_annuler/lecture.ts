/**
 * UX-P1-63 — ce que l'écran « Annuler une attribution confirmée » lit, SANS verrou : l'attribution, son
 * état au regard de l'art. 3.3, et les anomalies de sincérité CONFIRMÉES de cette attribution, pour le
 * choix de la fraude. Le geste (`annulerApresConfirmation`, DM-71) rejuge tout sous le verrou.
 * Aucune donnée de personne : ni faits, ni nom ; l'entreprise et des dates.
 */
import type { PrismaClient } from '@prisma/client';

export type AnomalieConfirmee = { readonly id: string; readonly confirmeeAt: Date };

export type LectureDeLAnnulation =
  | {
      readonly etat: 'a_annuler';
      readonly attribution: {
        readonly id: string;
        readonly raisonSociale: string | null;
        readonly siren: string;
        readonly confirmeeAt: Date;
      };
      readonly anomalies: readonly AnomalieConfirmee[];
    }
  | { readonly etat: 'attribution_introuvable' | 'non_confirmee' | 'deja_annulee_autrement' };

export async function lireLAnnulation(
  prisma: Pick<PrismaClient, 'attribution' | 'anomalie'>,
  attributionId: string
): Promise<LectureDeLAnnulation> {
  const a = await prisma.attribution.findUnique({
    where: { id: attributionId },
    select: {
      statut: true,
      confirmeeAt: true,
      raisonSociale: true,
      siren: true,
      apporteurId: true,
    },
  });
  if (a === null || a.apporteurId === null) return { etat: 'attribution_introuvable' };
  // Déjà annulée : la même exception rend l'issue existante au geste ; l'écran ne la propose plus.
  if (a.statut === 'annulee') return { etat: 'deja_annulee_autrement' };
  if (a.confirmeeAt === null) return { etat: 'non_confirmee' };
  const anomalies = await prisma.anomalie.findMany({
    where: {
      attributionId,
      apporteurId: a.apporteurId,
      type: 'sincerite',
      statut: 'confirmee',
      traiteAt: { not: null },
    },
    select: { id: true, traiteAt: true },
    orderBy: [{ traiteAt: 'desc' }, { id: 'asc' }],
    take: 20,
  });
  return {
    etat: 'a_annuler',
    attribution: {
      id: attributionId,
      raisonSociale: a.raisonSociale,
      siren: a.siren,
      confirmeeAt: a.confirmeeAt,
    },
    anomalies: anomalies.flatMap((x) =>
      x.traiteAt === null ? [] : [{ id: x.id, confirmeeAt: x.traiteAt }]
    ),
  };
}
