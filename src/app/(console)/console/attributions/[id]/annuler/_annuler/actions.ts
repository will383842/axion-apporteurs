'use server';
/**
 * UX-P1-63 — le geste de l'écran « Annuler une attribution confirmée ». Il pose SA question à
 * `requireRole` (`action:annuler_apres_confirmation` : l'admin seul, sous step-up) AVANT tout travail ;
 * la règle (droit relu en base, attribution verrouillée, exception fermée, anomalie confirmée de cette
 * attribution pour la fraude, transition, marqueur et notification) reste dans
 * `src/server/attribution/annuler-apres-confirmation.ts` (DM-71), dans UNE transaction.
 *
 * Un refus de rôle renvoie à la connexion (step-up) ou à l'accès refusé ; un refus de la règle revient à
 * l'écran, son motif en paramètre FERMÉ.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type VerdictDeRole } from '../../../../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../../../server/auth/lien-magique-production';
import {
  annulerApresConfirmation,
  ErreurAnnulationApresConfirmation,
} from '../../../../../../../server/attribution/annuler-apres-confirmation';
import { ErreurTransitionAttribution } from '../../../../../../../domain/attribution/machine';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Acteur = Extract<VerdictDeRole, { ok: true }>['utilisateur'];

function texte(formData: FormData, cle: string): string {
  const v = formData.get(cle);
  return typeof v === 'string' ? v : '';
}

function acteurOuRedirection(verdict: VerdictDeRole, ecran: string): Acteur {
  if (verdict.ok) return verdict.utilisateur;
  if (verdict.motif === 'releve_requis')
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  redirect('/console/acces-refuse');
}

export async function annulerLAttribution(formData: FormData): Promise<void> {
  const attributionId = texte(formData, 'attributionId');
  if (!UUID.test(attributionId)) redirect('/console');
  const ecran = `/console/attributions/${attributionId}/annuler`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:annuler_apres_confirmation', jeton, portsDeRoleConsole(d)),
    ecran
  );
  const exception = texte(formData, 'exception');
  const anomalieId = texte(formData, 'anomalieId');
  if (exception !== 'erreur_identification' && exception !== 'fraude') redirect(ecran);
  if (exception === 'fraude' && !UUID.test(anomalieId)) redirect(ecran);
  const maintenant = new Date(d.horloge.maintenant());
  let issue: 'annulee' | 'deja_annulee';
  try {
    ({ issue } = await d.prisma.$transaction((tx) =>
      annulerApresConfirmation(
        tx,
        exception === 'fraude'
          ? { attributionId, acteur, maintenant, exception, anomalieId }
          : { attributionId, acteur, maintenant, exception }
      )
    ));
  } catch (e) {
    if (e instanceof ErreurAnnulationApresConfirmation) {
      if (e.motif === 'droit_absent') redirect('/console/acces-refuse');
      redirect(`${ecran}?refus=${e.motif}`);
    }
    // Une anomalie refusée par l'écrivain (non confirmée, d'une autre attribution) : l'écran se relit.
    if (e instanceof ErreurTransitionAttribution) redirect(ecran);
    throw e;
  }
  redirect(issue === 'annulee' ? `${ecran}?fait=annulee` : `${ecran}?refus=deja_annulee`);
}
