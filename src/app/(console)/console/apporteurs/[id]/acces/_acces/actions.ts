'use server';
/**
 * SEC-71 — le geste de l'écran « Accès de l'apporteur » : RÉVOQUER et renouveler (contrat v2, art. 3.8).
 * Il pose SA question à `requireRole` (`action:revoquer_acces_apporteur` : admin seul, à step-up) AVANT
 * tout travail ; la règle (droit relu en base, statut verrouillé, une transaction, l'événement et la
 * file du renouvellement) reste dans `src/server/console/acces-apporteur.ts`.
 *
 * LE STEP-UP. Une session trop ancienne est refusée `releve_requis` : retour à la connexion de la
 * console, avec l'écran en suite. Tout autre refus de rôle renvoie à l'écran d'accès refusé ; aucun
 * motif ne part au navigateur. Un refus de la RÈGLE revient à l'écran, son motif en paramètre FERMÉ.
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
  ErreurRevocationAcces,
  estUnMotifDeRevocation,
  revoquerLAccesDUnApporteur,
} from '../../../../../../../server/console/acces-apporteur';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Acteur = Extract<VerdictDeRole, { ok: true }>['utilisateur'];

/** L'écran de l'apporteur ; un identifiant hors forme ne compose aucune adresse. */
const ecranDe = (apporteurId: string) => `/console/apporteurs/${apporteurId}/acces`;

function acteurOuRedirection(verdict: VerdictDeRole, ecran: string): Acteur {
  if (verdict.ok) return verdict.utilisateur;
  if (verdict.motif === 'releve_requis')
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  redirect('/console/acces-refuse');
}

export async function revoquerLAcces(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const brut = formData.get('apporteurId');
  const apporteurId = typeof brut === 'string' && UUID.test(brut) ? brut : null;
  const acteur = acteurOuRedirection(
    await requireRole('action:revoquer_acces_apporteur', jeton, portsDeRoleConsole(d)),
    apporteurId === null ? '/console' : ecranDe(apporteurId)
  );
  if (apporteurId === null) redirect('/console/acces-refuse');
  const ecran = ecranDe(apporteurId);
  const motif = formData.get('motif');
  if (!estUnMotifDeRevocation(motif)) redirect(`${ecran}?refus=motif_invalide`);
  try {
    await revoquerLAccesDUnApporteur(d.prisma, {
      acteur,
      apporteurId,
      motif,
      maintenant: new Date(d.horloge.maintenant()),
    });
  } catch (e) {
    if (e instanceof ErreurRevocationAcces) redirect(`${ecran}?refus=${e.motif}`);
    throw e;
  }
  redirect(`${ecran}?fait=revoque`);
}
