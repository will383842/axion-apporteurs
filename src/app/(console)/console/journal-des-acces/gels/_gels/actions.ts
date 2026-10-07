'use server';
/**
 * Les gestes de l'écran des gels du journal des accès : POSER et LEVER. Chacun pose SA question à
 * `requireRole` (`action:poser_gel_journal_acces`, `action:lever_gel_journal_acces` : admin seul, à
 * step-up) AVANT tout travail ; la règle (admin validé relu en base, quatre yeux de la levée,
 * événement chaîné) reste dans `src/server/console/gels-journal-acces.ts`.
 *
 * LE STEP-UP. Une session trop ancienne est refusée `releve_requis` : retour à la connexion de la
 * console, avec l'écran en suite. Tout autre refus de rôle renvoie à l'écran d'accès refusé ; aucun
 * motif ne part au navigateur. Un refus de la RÈGLE revient à l'écran, son motif en paramètre FERMÉ.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type VerdictDeRole } from '../../../../../../server/roles/require-role';
import { clesPii, ErreurPii } from '../../../../../../server/securite/pii';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../../server/auth/lien-magique-production';
import {
  ErreurGelJournal,
  leverUnGel,
  poserUnGel,
  type PorteeDuGel,
} from '../../../../../../server/console/gels-journal-acces';
import { lireLaSaisieDuGel, lireLeGelALever } from './saisie';

const ECRAN = '/console/journal-des-acces/gels';

type Acteur = Extract<VerdictDeRole, { ok: true }>['utilisateur'];

function acteurOuRedirection(verdict: VerdictDeRole): Acteur {
  if (verdict.ok) return verdict.utilisateur;
  if (verdict.motif === 'releve_requis')
    redirect(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
  redirect('/console/acces-refuse');
}

async function geste(travail: () => Promise<unknown>): Promise<never> {
  try {
    await travail();
  } catch (e) {
    if (e instanceof ErreurGelJournal) redirect(`${ECRAN}?refus=${e.motif}`);
    if (e instanceof ErreurPii) redirect(`${ECRAN}?refus=saisie`);
    throw e;
  }
  redirect(ECRAN);
}

export async function poserLeGel(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:poser_gel_journal_acces', jeton, portsDeRoleConsole(d))
  );
  const saisie = lireLaSaisieDuGel(formData);
  if (saisie === null) redirect(`${ECRAN}?refus=saisie`);
  const portee: PorteeDuGel =
    saisie.portee === 'utilisateur'
      ? { type: 'utilisateur', utilisateurId: saisie.identifiant }
      : { type: 'cible', cibleId: saisie.identifiant };
  await geste(() =>
    poserUnGel(
      d.prisma,
      {
        acteur,
        portee,
        motif: saisie.motif,
        reference: saisie.reference,
        depuis: saisie.depuis,
        jusquA: saisie.jusquA,
        maintenant: new Date(d.horloge.maintenant()),
      },
      clesPii(d.env)
    )
  );
}

export async function leverLeGel(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:lever_gel_journal_acces', jeton, portsDeRoleConsole(d))
  );
  const gelId = lireLeGelALever(formData);
  if (gelId === null) redirect(`${ECRAN}?refus=saisie`);
  await geste(() =>
    leverUnGel(
      d.prisma,
      { acteur, gelId, maintenant: new Date(d.horloge.maintenant()) },
      clesPii(d.env)
    )
  );
}
