/**
 * prisma/seed/13-candidatures.ts — le module du semeur pour les décisions de candidature (CPL-T06,
 * REQ-CPL-006 ; cadrage de l'architecte du 2026-09-26, partners/ADR-0022).
 *
 * IL NE SÈME AUCUNE LIGNE PAR DÉFAUT. Une décision porte sur un apporteur, et aucun module du semeur
 * n'en crée : un apporteur naît d'une candidature reçue d'axion-ia, par la réception, avec son
 * snapshot et ses blocs chiffrés. En fabriquer un ici écrirait ce que seule la réception a le droit
 * d'écrire.
 *
 * `semerDecisionCandidature` est le chemin qu'un semis empruntera le jour où un apporteur de
 * démonstration existera : la décision est RENDUE par le domaine (`deciderCandidature`), jamais
 * écrite à la main, et elle est inscrite avec le statut qui la suit et le changement de statut au
 * journal chaîné (par son écrivain unique), dans une transaction. La table
 * est en ajout seul : un second semis de la même décision est une seconde ligne, d'où le contrôle
 * d'existence de l'appelant.
 */

import type { PrismaClient, StatutApporteur } from '@prisma/client';
import {
  deciderCandidature,
  type ResultatDecisionCandidature,
} from '../../src/domain/candidature/decision';
import { ajouterEvenement } from '../../src/server/evenement/journal';

export interface DecisionASemer {
  readonly apporteurId: string;
  readonly statutActuel: StatutApporteur;
  readonly resultat: ResultatDecisionCandidature;
  readonly justification: string;
  readonly webinaireSuivi: boolean | null;
  readonly auteurId: string;
  readonly decideeAt: Date;
}

export async function semerDecisionCandidature(
  prisma: PrismaClient,
  d: DecisionASemer
): Promise<{ id: string }> {
  const r = deciderCandidature(d);
  return prisma.$transaction(async (tx) => {
    const ligne = await tx.decisionCandidature.create({
      data: { apporteurId: d.apporteurId, ...r.decision },
      select: { id: true },
    });
    await tx.apporteur.update({ where: { id: d.apporteurId }, data: { statut: r.statut } });
    await ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: d.apporteurId,
      survenuAt: d.decideeAt,
      charge: r.chargeStatut,
    });
    return ligne;
  });
}

/** Le module par défaut du chargeur (`prisma/seed.ts`) : rien à semer sans apporteur — voir ci-dessus. */
export default async function semerParDefaut(): Promise<void> {
  // Rien à semer : voir ci-dessus.
}
