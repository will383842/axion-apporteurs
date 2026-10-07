/**
 * UX-P1-61 (REQ-DM-007 ; contrat v2, art. 3.4 al. 2 ; juriste #319 6037008645 et #803 6039744045 ; forme
 * d'A02 #803) — le geste administrateur « absence d'échange imputable à la Société ».
 *
 * Un administrateur pose, sur une attribution, le fait que l'absence de rendez-vous, de devis et de
 * commande TIENT à la Société, avec un motif FERMÉ (`MOTIFS_SUSPENSION_PEREMPTION`), sans texte libre. La
 * péremption faute d'échange le lit pour NE PAS expirer : l'attribution va à son seul terme.
 *
 * LE GESTE :
 *   — le droit (`action:poser_absence_imputable`, l'admin seul, sous step-up) est jugé AVANT tout travail,
 *     puis RELU dans la transaction (admin actif et validé) ;
 *   — le motif est jugé contre la liste fermée AVANT la transaction : un motif hors liste n'écrit rien ;
 *   — l'attribution est VERROUILLÉE (`FOR UPDATE`) ; le fait se pose UNE fois (`deja_pose`), et seulement
 *     sur une attribution `active` exposée à la péremption (`sans_objet` sinon) ;
 *   — UNE écriture pose l'instant, l'auteur et le motif ENSEMBLE (CHECK de 005010), et annule
 *     `peremptionAt` : la péremption ne frappe plus ; le terme (`fenetreFinAt`) n'est pas recalculé ;
 *   — l'événement `attribution_peremption_suspendue` porte l'acteur, l'instant et le motif, et rien d'autre.
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { ajouterEvenement } from '../evenement/journal';
import {
  MOTIFS_SUSPENSION_PEREMPTION,
  type MotifSuspensionPeremption,
} from '../../domain/attribution/machine';

const DROIT = 'action:poser_absence_imputable';

export type RefusDeLAbsenceImputable =
  'droit_absent' | 'motif_invalide' | 'attribution_inconnue' | 'deja_pose' | 'sans_objet';

export class ErreurAbsenceImputable extends Error {
  constructor(readonly motif: RefusDeLAbsenceImputable) {
    super(`absence_imputable : ${motif}`);
    this.name = 'ErreurAbsenceImputable';
  }
}

export interface ActeurDuGeste {
  readonly id: string;
  readonly role: ConsoleRole;
}

type Tx = Prisma.TransactionClient;

/** Le droit de l'acteur, RELU en base : admin actif et validé ; sinon refusé. */
async function exigerUnAdministrateurValide(tx: Tx, acteur: ActeurDuGeste): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(DROIT, lu.role)
  )
    throw new ErreurAbsenceImputable('droit_absent');
}

const estUnMotif = (m: unknown): m is MotifSuspensionPeremption =>
  (MOTIFS_SUSPENSION_PEREMPTION as readonly unknown[]).includes(m);

/** Pose le fait ; rend le terme de l'attribution, qu'elle atteindra désormais (lu, jamais recalculé). */
export async function poserLAbsenceImputable(
  prisma: PrismaClient,
  d: { acteur: ActeurDuGeste; attributionId: string; motif: unknown; maintenant: Date }
): Promise<{ termeAt: Date | null }> {
  if (!roleAutorise(DROIT, d.acteur.role)) throw new ErreurAbsenceImputable('droit_absent');
  if (!estUnMotif(d.motif)) throw new ErreurAbsenceImputable('motif_invalide');
  const motif = d.motif;
  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur);
    const [a] = await tx.$queryRaw<
      { statut: string; suspendue: boolean; fenetre_fin_at: Date | null }[]
    >`
      SELECT statut::text AS statut, (peremption_suspendue_at IS NOT NULL) AS suspendue,
             fenetre_fin_at
      FROM attributions WHERE id = ${d.attributionId}::uuid FOR UPDATE`;
    if (a === undefined) throw new ErreurAbsenceImputable('attribution_inconnue');
    if (a.suspendue) throw new ErreurAbsenceImputable('deja_pose');
    if (a.statut !== 'active') throw new ErreurAbsenceImputable('sans_objet');
    await tx.attribution.update({
      where: { id: d.attributionId },
      data: {
        peremptionSuspendueAt: d.maintenant,
        peremptionSuspendueParId: d.acteur.id,
        peremptionSuspendueMotif: motif,
        peremptionAt: null,
      },
    });
    await ajouterEvenement(tx, {
      type: 'attribution_peremption_suspendue',
      agregat: 'attribution',
      agregatId: d.attributionId,
      survenuAt: d.maintenant,
      charge: {
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
        suspendueAt: d.maintenant.toISOString(),
        motif,
      },
    });
    return { termeAt: a.fenetre_fin_at };
  });
}
