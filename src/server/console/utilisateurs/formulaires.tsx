/**
 * SEC-30 — les deux formulaires que REQ-UX-047 mesure sur l'écran des utilisateurs : inviter (champ
 * de l'adresse, choix du rôle, envoi) et désactiver (un bouton). Sans état ni lecture : l'action
 * arrive en propriété, ce qui permet au témoin de compter les interactions sur le rendu, sans base.
 * Rangés ici et non sous `src/app/(console)/`, où la garde `securite:roles` n'admet que pages et
 * actions jugées : Next servirait tout autre fichier du routage.
 */
import type { ConsoleRole } from '@prisma/client';
import { UTILISATEURS_CONSOLE as T } from '../../../content/micro-copy/console/utilisateurs';
import { ROLES_CONSOLE } from '../../roles/matrice';

type Action = (formData: FormData) => Promise<void>;

/** Inviter : l'adresse, le rôle (chacun expliqué en une phrase), l'envoi. */
export function FormulaireDInvitation({ action }: { action: Action }) {
  return (
    <form action={action}>
      <label>
        {T.invitation.champCourriel}
        <input type="email" name="email" required autoComplete="off" />
      </label>
      <fieldset>
        <legend>{T.invitation.champRole}</legend>
        {ROLES_CONSOLE.map((r: ConsoleRole) => (
          <label key={r}>
            <input type="radio" name="role" value={r} required /> {r} — {T.roles[r]}
          </label>
        ))}
      </fieldset>
      <p>{T.invitation.roleChangeable}</p>
      <button type="submit">{T.invitation.envoyer}</button>
    </form>
  );
}

/** Désactiver un autre compte : un bouton ; le step-up est jugé par l'action. */
export function FormulaireDeDesactivation({
  action,
  cibleId,
}: {
  action: Action;
  cibleId: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="cibleId" value={cibleId} />
      <button type="submit">{T.actions.desactiver}</button>
    </form>
  );
}
