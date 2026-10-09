/**
 * Les règles de la gestion des utilisateurs de la console — SEC-30 (REQ-SEC-023, REQ-DM-024).
 *
 * PURES : ni base, ni horloge, ni cadriciel. L'action de serveur les applique sous `requireRole`
 * (`action:gerer_utilisateur_console`, à step-up) ; elles ne décident que ce que leur nom dit.
 *
 *   — PERSONNE NE CHANGE SON PROPRE RÔLE, admin compris : un admin seul ne peut ni se retirer
 *     l'administration par erreur, ni se l'attribuer par un autre chemin. Le refus est nommé.
 *   — une INVITATION non activée à l'échéance est expirée : l'échéance se dérive d'`invitee_at` et
 *     du délai de `durees.ts`, jamais d'une date posée à part. Activée, elle ne vieillit plus.
 */
import type { ConsoleRole } from '@prisma/client';
import { DUREES_AUTH } from '../../auth/durees';
import { roleAutorise } from '../../roles/matrice';

export type VerdictDeChangementDeRole =
  { ok: true } | { ok: false; motif: 'auto_changement' | 'droit_absent' | 'sans_changement' };

/** Le changement du rôle de `cible` vers `vers`, demandé par `acteur`. */
export function jugerChangementDeRole(d: {
  readonly acteur: { readonly id: string; readonly role: ConsoleRole };
  readonly cible: { readonly id: string; readonly role: ConsoleRole };
  readonly vers: ConsoleRole;
}): VerdictDeChangementDeRole {
  if (!roleAutorise('action:gerer_utilisateur_console', d.acteur.role))
    return { ok: false, motif: 'droit_absent' };
  if (d.acteur.id === d.cible.id) return { ok: false, motif: 'auto_changement' };
  if (d.cible.role === d.vers) return { ok: false, motif: 'sans_changement' };
  return { ok: true };
}

/**
 * Vrai si l'invitation vaut encore : activée, ou invitée il y a MOINS que le délai d'invitation.
 * À l'échéance pile, elle est expirée (échec fermé).
 */
export function invitationOuverte(
  i: { readonly inviteeAt: Date; readonly activeeAt: Date | null },
  maintenant: Date
): boolean {
  if (i.activeeAt !== null) return true;
  return maintenant.getTime() - i.inviteeAt.getTime() < DUREES_AUTH.invitationConsoleMs.valeur;
}
