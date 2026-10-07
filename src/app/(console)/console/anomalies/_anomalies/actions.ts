'use server';
/**
 * UX-P1-56 — le geste de l'écran « Confirmer l'anomalie ». Il pose SA question à `requireRole`
 * (`action:confirmer_anomalie` : l'admin seul, sous step-up) AVANT tout travail ; la règle (faits jugés
 * à la saisie, droit relu en base, anomalie verrouillée, clôture chiffrée, transition de l'attribution
 * quand son état l'admet) reste dans `src/server/console/anomalies/confirmer.ts`.
 *
 * LE STEP-UP. Une session trop ancienne est refusée `releve_requis` : retour à la connexion de la
 * console, avec l'écran en suite. Tout autre refus de rôle renvoie à l'écran d'accès refusé. Un refus de
 * la RÈGLE revient à l'écran, son motif en paramètre FERMÉ : les faits ne sortent jamais vers l'adresse.
 * Ce geste ne pose AUCUN gel.
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
import { clesPii } from '../../../../../server/securite/pii';
import {
  confirmerUneAnomalie,
  ErreurConfirmationAnomalie,
} from '../../../../../server/console/anomalies/confirmer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTE = '/console/anomalies';

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

export async function confirmerLAnomalie(formData: FormData): Promise<void> {
  const anomalieId = texte(formData, 'anomalieId');
  if (!UUID.test(anomalieId)) redirect(LISTE);
  const ecran = `${LISTE}/${anomalieId}`;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:confirmer_anomalie', jeton, portsDeRoleConsole(d)),
    ecran
  );
  try {
    await confirmerUneAnomalie(
      d.prisma,
      {
        acteur,
        anomalieId,
        faits: texte(formData, 'faits'),
        maintenant: new Date(d.horloge.maintenant()),
      },
      clesPii(d.env)
    );
  } catch (e) {
    if (e instanceof ErreurConfirmationAnomalie) redirect(`${ecran}?refus=${e.motif}`);
    throw e;
  }
  redirect(`${ecran}?fait=confirmee`);
}
