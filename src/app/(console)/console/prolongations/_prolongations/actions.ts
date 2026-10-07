'use server';
/**
 * EXT-T07 — le geste de l'écran « Décider de la prolongation ». Il pose SA question à `requireRole`
 * (`action:decider_prolongation` : l'admin seul, sous step-up) AVANT tout travail ; la règle (droit relu
 * en base, attribution verrouillée, décision ouverte dans la liste seulement, garde de la base) reste dans
 * `src/server/attribution/prolonger.ts`.
 *
 * LE STEP-UP. Une session trop ancienne est refusée `releve_requis` : retour à la connexion de la
 * console, avec l'écran en suite. Tout autre refus de rôle renvoie à l'écran d'accès refusé. Un refus de
 * la RÈGLE revient à l'écran, son motif en paramètre FERMÉ. Le retour ne porte que l'issue : la page
 * relit le terme en base.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type VerdictDeRole } from '../../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../server/auth/lien-magique-production';
import {
  deciderDeLaProlongation,
  ErreurProlongation,
} from '../../../../../server/attribution/prolonger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTE = '/console/prolongations';

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

export async function deciderLaProlongation(formData: FormData): Promise<void> {
  const attributionId = texte(formData, 'attributionId');
  if (!UUID.test(attributionId)) redirect(LISTE);
  const ecran = `${LISTE}/${attributionId}`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:decider_prolongation', jeton, portsDeRoleConsole(d)),
    ecran
  );
  const decision = texte(formData, 'decision');
  try {
    await deciderDeLaProlongation(d.prisma, {
      acteur,
      attributionId,
      decision,
      maintenant: new Date(d.horloge.maintenant()),
    });
  } catch (e) {
    if (e instanceof ErreurProlongation) {
      if (e.motif === 'droit_absent') redirect('/console/acces-refuse');
      redirect(`${ecran}?refus=${e.motif}`);
    }
    throw e;
  }
  const issue = decision === 'constater' ? 'constatee' : 'prolongee';
  redirect(`${ecran}?fait=${issue}`);
}
