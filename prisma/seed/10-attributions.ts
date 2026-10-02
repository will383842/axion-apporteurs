/**
 * prisma/seed/10-attributions.ts — le module du semeur pour les attributions, les refus de dépôt et
 * les personnes déclarées (DM-07, partners/ADR-0022 point 14).
 *
 * IL NE SÈME AUCUNE LIGNE PAR DÉFAUT, ET C'EST LA BASE QUI L'IMPOSE. Une attribution d'apporteur
 * porte UNE version de grille (REQ-DM-014, CHECK `attributions_grille_de_l_apporteur`) ; or le semeur
 * n'importe aucune grille tant qu'aucune publication d'axionia n'est fixée dans le dépôt
 * (`02-grilles-commission.ts`). Fabriquer une grille ici écrirait des valeurs que seul axionia a le
 * droit d'écrire (PRESEANCE §3.4).
 *
 * `semerAttribution` est le chemin qu'un semis empruntera le jour où la grille existera : un état qui
 * n'occupe pas le SIREN par défaut, l'horloge du dépôt laissée à la base (le déclencheur écrase toute
 * valeur fournie), aucun contact — les blocs chiffrés passent par `colonnesPii`, jamais par ce module.
 */

import type { EtatAttribution, PrismaClient } from '@prisma/client';

export interface AttributionASemer {
  readonly id: string;
  readonly apporteurId: string;
  readonly grilleCommissionId: string;
  readonly siren: string;
  readonly statut: EtatAttribution;
  /** La date calendaire du contact (REQ-JUR-040). */
  readonly dateContact: Date;
}

export async function semerAttribution(
  prisma: PrismaClient,
  a: AttributionASemer
): Promise<{ id: string }> {
  return prisma.attribution.create({
    data: {
      id: a.id,
      apporteurId: a.apporteurId,
      grilleCommissionId: a.grilleCommissionId,
      siren: a.siren,
      statut: a.statut,
      canal: 'espace',
      dateContact: a.dateContact,
      verificationPrioritaire: false,
      entrepriseAVerifier: false,
      lienInteretDeclare: false,
    },
    select: { id: true },
  });
}

/** Le module par défaut du chargeur (`prisma/seed.ts`) : rien à semer sans grille — voir ci-dessus. */
export default async function semerParDefaut(): Promise<void> {
  // Rien à semer : voir ci-dessus.
}
