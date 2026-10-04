'use server';
/**
 * SEC-30 — les actions de l'écran « Utilisateurs de la console ». Chacune pose SA question à
 * `requireRole` (`action:gerer_utilisateur_console`, admin seul, à step-up) AVANT tout travail ; le
 * geste lui-même est dans `administration.ts`, avec son événement dans la même transaction.
 *
 * LE STEP-UP. Une session ouverte depuis le délai de relèvement ou plus est refusée
 * `releve_requis` : retour à la connexion de la console (« Confirmer mon identité » est le parcours
 * de SEC-29, mêmes compteurs, même réponse indistincte), avec l'écran en suite. Tout autre refus
 * renvoie à l'accueil de la console (l'écran d'accès refusé arrive avec UX-P1-16) ; aucun motif ne
 * part au navigateur.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type { ConsoleRole } from '@prisma/client';
import { requireRole, type VerdictDeRole } from '../../roles/require-role';
import { ROLES_CONSOLE } from '../../roles/matrice';
import { clesPii } from '../../securite/pii';
import {
  COOKIE_DE_SESSION_CONSOLE,
  configurationDuLien,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../auth/lien-magique-production';
import {
  changerLeRole,
  desactiver,
  ErreurAdministrationConsole,
  inviter,
  reactiver,
  relancer,
  validerLAdministrateur,
} from './administration';

const ECRAN = '/console/utilisateurs';

type Acteur = Extract<VerdictDeRole, { ok: true }>['utilisateur'];

/** Le verdict, lu en tête ; un refus ne revient jamais (redirection). */
function acteurOuRedirection(verdict: VerdictDeRole): Acteur {
  if (verdict.ok) return verdict.utilisateur;
  if (verdict.motif === 'releve_requis')
    redirect(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
  redirect('/console');
}

function texte(formData: FormData, cle: string): string {
  const v = formData.get(cle);
  return typeof v === 'string' ? v : '';
}

function role(formData: FormData): ConsoleRole | null {
  const v = texte(formData, 'role');
  return (ROLES_CONSOLE as readonly string[]).includes(v) ? (v as ConsoleRole) : null;
}

/** Un geste refusé par la règle revient à l'écran, son motif en paramètre FERMÉ ; le reste remonte. */
async function geste(travail: () => Promise<void>): Promise<never> {
  try {
    await travail();
  } catch (e) {
    if (e instanceof ErreurAdministrationConsole) redirect(`${ECRAN}?refus=${e.motif}`);
    throw e;
  }
  redirect(ECRAN);
}

export async function inviterUnePersonne(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  const vers = role(formData);
  const email = texte(formData, 'email').trim();
  if (vers === null || email === '') redirect(`${ECRAN}?refus=saisie`);
  await geste(async () => {
    const { courriels } = await inviter(d.prisma, {
      acteur,
      email,
      role: vers,
      cles: clesPii(d.env),
      maintenant: new Date(d.horloge.maintenant()),
      // L'adresse de la connexion, SANS jeton : l'invitation ne porte aucun lien de connexion.
      adresseConnexion: `${configurationDuLien(d.env).urlPublique}/console/connexion`,
    });
    // Les courriels partent APRÈS la réponse, un par destinataire ; un échec d'envoi ne défait pas
    // l'invitation, déjà écrite et journalisée.
    d.planifier(async () => {
      for (const c of courriels) await d.envoi.envoyer(c);
    });
  });
}

export async function changerLeRoleDe(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  const vers = role(formData);
  if (vers === null) redirect(`${ECRAN}?refus=saisie`);
  await geste(async () => {
    const { courriels } = await changerLeRole(d.prisma, {
      acteur,
      cibleId: texte(formData, 'cibleId'),
      vers,
      maintenant: new Date(d.horloge.maintenant()),
      cles: clesPii(d.env),
    });
    d.planifier(async () => {
      for (const c of courriels) await d.envoi.envoyer(c);
    });
  });
}

export async function desactiverLeCompte(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  await geste(() =>
    desactiver(d.prisma, {
      acteur,
      cibleId: texte(formData, 'cibleId'),
      maintenant: new Date(d.horloge.maintenant()),
    })
  );
}

export async function reactiverLeCompte(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  await geste(async () => {
    const { courriels } = await reactiver(d.prisma, {
      acteur,
      cibleId: texte(formData, 'cibleId'),
      maintenant: new Date(d.horloge.maintenant()),
      cles: clesPii(d.env),
    });
    d.planifier(async () => {
      for (const c of courriels) await d.envoi.envoyer(c);
    });
  });
}

export async function relancerLInvitation(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  await geste(() =>
    relancer(d.prisma, {
      acteur,
      cibleId: texte(formData, 'cibleId'),
      maintenant: new Date(d.horloge.maintenant()),
    })
  );
}

export async function validerUnAdministrateur(formData: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const acteur = acteurOuRedirection(
    await requireRole('action:gerer_utilisateur_console', jeton, portsDeRoleConsole(d))
  );
  await geste(() =>
    validerLAdministrateur(d.prisma, {
      acteur,
      cibleId: texte(formData, 'cibleId'),
      maintenant: new Date(d.horloge.maintenant()),
    })
  );
}
