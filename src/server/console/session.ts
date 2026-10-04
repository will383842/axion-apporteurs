'use server';
/**
 * SEC-29 — la déconnexion de la console, ouverte aux quatre rôles (`action:se_deconnecter`). La
 * session est révoquée en base, puis son cookie est effacé par le même en-tête que sa pose ; une
 * session déjà refusée (expirée, inactive, révoquée) n'a plus rien à révoquer, son cookie s'efface
 * quand même. Retour à la connexion de la console.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole } from '../roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  effacerUnCookie,
  portsDeRoleConsole,
  revoquerSessionConsole,
} from '../auth/lien-magique-production';

export async function seDeconnecter(): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const pot = await cookies();
  const jeton = pot.get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('action:se_deconnecter', jeton, portsDeRoleConsole(d));
  if (verdict.ok && jeton !== undefined) await revoquerSessionConsole(d, jeton);
  effacerUnCookie(pot, COOKIE_DE_SESSION_CONSOLE);
  redirect('/console/connexion');
}
