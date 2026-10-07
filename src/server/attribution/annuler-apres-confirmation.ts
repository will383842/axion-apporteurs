/**
 * DM-71 (REQ-JUR-007, art. 3.3 du v2) — le geste SERVEUR de l'annulation après la confirmation, pour
 * erreur d'identification de l'entreprise ou pour fraude de l'apporteur (arbitrage de la coordination,
 * #806 6039852465 ; forme d'A02, 6039768837). L'écran est à UX-P1-63.
 *
 * - LE DROIT : `action:annuler_apres_confirmation`, administrateur seul, sous step-up ; l'appelant le
 *   vérifie (`requireRole`) AVANT tout travail, et ce module le REJUGE en base dans la transaction
 *   (rôle, désactivation, validation d'un administrateur), comme la mise en demeure.
 * - LA PORTÉE : une attribution CONFIRMÉE seulement (`confirmee_at` posé) ; avant la confirmation,
 *   l'antériorité ou l'annulation par la console y suffisent.
 * - L'IDEMPOTENCE vient de l'état : `annulee` est terminal et le marqueur immuable. La même exception
 *   sur une attribution déjà annulée rend l'issue existante ; une autre est refusée, nommée.
 * - L'ÉCRITURE passe par l'écrivain unique des transitions : la transition, le marqueur et son auteur
 *   humain, l'événement, et la décision notifiée à l'apporteur (`decision_attribution`).
 */
import type { Prisma } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { transitionnerUneAttribution } from './transitionner';

type Tx = Prisma.TransactionClient;

export const DROIT = 'action:annuler_apres_confirmation';

/** Les deux exceptions de l'art. 3.3 que ce geste pose, et leur transition. */
const TRANSITION_DE_L_EXCEPTION = {
  erreur_identification: 'annulee_erreur_identification',
  fraude: 'fraude_etablie',
} as const;
export type ExceptionDuGeste = keyof typeof TRANSITION_DE_L_EXCEPTION;

export type MotifDuRefus =
  | 'droit_absent'
  | 'attribution_introuvable'
  | 'non_confirmee'
  | 'deja_annulee_autrement';

export class ErreurAnnulationApresConfirmation extends Error {
  constructor(readonly motif: MotifDuRefus) {
    super(`annulation_apres_confirmation : ${motif}`);
    this.name = 'ErreurAnnulationApresConfirmation';
  }
}

/** Le droit RELU dans la transaction : un compte inconnu, désactivé, au rôle retiré ou non validé. */
async function rejugerLeDroit(tx: Tx, acteurId: string): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteurId },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    !roleAutorise(DROIT, lu.role) ||
    (lu.role === 'admin' && lu.valideAt === null)
  ) {
    throw new ErreurAnnulationApresConfirmation('droit_absent');
  }
}

export async function annulerApresConfirmation(
  tx: Tx,
  d: {
    attributionId: string;
    exception: ExceptionDuGeste;
    acteur: { readonly id: string };
    maintenant: Date;
  },
  p: { transitionner?: typeof transitionnerUneAttribution } = {}
): Promise<{ issue: 'annulee' | 'deja_annulee' }> {
  await rejugerLeDroit(tx, d.acteur.id);
  const [l] = await tx.$queryRaw<
    { statut: string; confirmee_at: Date | null; annulation_exception: string | null }[]
  >`
    SELECT statut::text AS statut, confirmee_at, annulation_exception::text AS annulation_exception
    FROM attributions WHERE id = ${d.attributionId}::uuid FOR UPDATE`;
  if (!l) throw new ErreurAnnulationApresConfirmation('attribution_introuvable');
  if (l.statut === 'annulee') {
    if (l.annulation_exception === d.exception) return { issue: 'deja_annulee' };
    throw new ErreurAnnulationApresConfirmation('deja_annulee_autrement');
  }
  if (l.confirmee_at === null) throw new ErreurAnnulationApresConfirmation('non_confirmee');
  await (p.transitionner ?? transitionnerUneAttribution)(tx, {
    attributionId: d.attributionId,
    transition: TRANSITION_DE_L_EXCEPTION[d.exception],
    acteur: { par: 'utilisateur_console', id: d.acteur.id },
    maintenant: d.maintenant,
  });
  return { issue: 'annulee' };
}
