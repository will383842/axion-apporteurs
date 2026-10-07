/**
 * `/console/utilisateurs` — l'administration des utilisateurs de la console (SEC-30, REQ-UX-048,
 * REQ-SEC-023). Admin seul (`ecran:utilisateurs_console`, sans step-up : lire n'engage rien) ; chaque
 * geste est une action à step-up (`actions.ts`). Textes : `console/utilisateurs.ts`, d'après la
 * maquette `utilisateurs-console.html`.
 *
 * Ce que l'écran montre de chaque personne : son adresse (déchiffrée pour l'admin seul), son rôle, son
 * état (actif, désactivé, invité et son échéance, administrateur en attente) et sa dernière connexion.
 * Son propre compte n'a aucun geste : un autre administrateur le modifie.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type { ConsoleRole } from '@prisma/client';
import { UTILISATEURS_CONSOLE as T } from '../../../../content/micro-copy/console/utilisateurs';
import { requireRole } from '../../../../server/roles/require-role';
import { ROLES_CONSOLE } from '../../../../server/roles/matrice';
import { clesPii } from '../../../../server/securite/pii';
import { identiteDeLUtilisateurConsole } from '../../../../server/auth/lien-magique-depot';
import { DUREES_AUTH } from '../../../../server/auth/durees';
import { droitsDuLecteurSurLesGels } from '../../../../server/console/gels-journal-acces';
import { invitationOuverte } from '../../../../server/console/utilisateurs/regles';
import { jourDeParis, jourEtHeureDeParis } from '../../../../server/console/utilisateurs/dates';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../server/auth/lien-magique-production';
import {
  changerLeRoleDe,
  desactiverLeCompte,
  inviterUnePersonne,
  reactiverLeCompte,
  relancerLInvitation,
  validerUnAdministrateur,
} from '../../../../server/console/utilisateurs/actions';
import {
  FormulaireDeDesactivation,
  FormulaireDInvitation,
} from '../../../../server/console/utilisateurs/formulaires';

// Lue à chaque requête : la page lit le cookie de session et la base.
export const dynamic = 'force-dynamic';

export default async function PageUtilisateursConsole() {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:utilisateurs_console', jeton, portsDeRoleConsole(d));
  if (!verdict.ok)
    redirect(`/console/connexion?suite=${encodeURIComponent('/console/utilisateurs')}`);
  const moi = verdict.utilisateur.id;
  const maintenant = new Date(d.horloge.maintenant());
  const cles = clesPii(d.env);

  const lignes = await d.prisma.utilisateurConsole.findMany({
    orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      role: true,
      emailChiffre: true,
      nomChiffre: true,
      desactiveAt: true,
      inviteeAt: true,
      activeeAt: true,
      valideAt: true,
      sessionsEspace: { orderBy: { creeAt: 'desc' }, take: 1, select: { creeAt: true } },
    },
  });

  // Le déchiffrement vit hors de la console (SEC-58) : dans le module d'authentification.
  const adresse = (l: {
    id: string;
    nomChiffre: Uint8Array | null;
    emailChiffre: Uint8Array | null;
  }) => identiteDeLUtilisateurConsole(l, cles).adresse ?? '';

  const etat = (l: (typeof lignes)[number]) => {
    if (l.desactiveAt !== null) return T.etats.desactive;
    if (l.activeeAt === null && l.inviteeAt !== null)
      return invitationOuverte({ inviteeAt: l.inviteeAt, activeeAt: null }, maintenant)
        ? T.etats.invite(
            jourDeParis(new Date(l.inviteeAt.getTime() + DUREES_AUTH.invitationConsoleMs.valeur))
          )
        : T.etats.invitationExpiree;
    if (l.role === 'admin' && l.valideAt === null) return T.etats.enAttente;
    return T.etats.actif;
  };

  const autres = lignes.filter((l) => l.id !== moi);
  // Le lien vers les gels : sous le droit RELU de l'écran des gels (un admin validé, actif).
  const gels = (await droitsDuLecteurSurLesGels(d.prisma, moi)) !== null;

  return (
    <main>
      <h1>{T.titre}</h1>
      {gels ? (
        <p>
          <a href="/console/journal-des-acces/gels">{T.liens.gels}</a>
        </p>
      ) : null}
      <section aria-labelledby="inviter">
        <h2 id="inviter">{T.invitation.titre}</h2>
        <FormulaireDInvitation action={inviterUnePersonne} />
      </section>

      {autres.length === 0 ? (
        <section aria-labelledby="vide">
          <h2 id="vide">{T.vide.titre}</h2>
          <p>{T.vide.phrase}</p>
        </section>
      ) : null}

      <p>{T.compte(lignes.length)}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{T.colonnes.personne}</th>
            <th scope="col">{T.colonnes.role}</th>
            <th scope="col">{T.colonnes.etat}</th>
            <th scope="col">{T.colonnes.derniereConnexion}</th>
            <th scope="col">{T.colonnes.actions}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const derniere = l.sessionsEspace[0]?.creeAt;
            const courriel = adresse(l);
            return (
              <tr key={l.id}>
                <td>
                  {courriel} {l.id === moi ? T.vous : null}
                </td>
                <td>{l.role}</td>
                <td>{etat(l)}</td>
                <td>{derniere ? jourEtHeureDeParis(derniere) : T.jamaisConnecte}</td>
                <td>
                  {l.id === moi ? (
                    T.sonPropreCompte
                  ) : l.desactiveAt !== null ? (
                    <form action={reactiverLeCompte}>
                      <input type="hidden" name="cibleId" value={l.id} />
                      <button type="submit">{T.actions.reactiver}</button>
                    </form>
                  ) : l.activeeAt === null ? (
                    <form action={relancerLInvitation}>
                      <input type="hidden" name="cibleId" value={l.id} />
                      <button
                        type="submit"
                        aria-label={`${T.actions.renvoyer} ${T.pourQui.renvoyer(courriel)}`}
                      >
                        {T.actions.renvoyer}
                      </button>
                    </form>
                  ) : (
                    <>
                      <form action={changerLeRoleDe}>
                        <input type="hidden" name="cibleId" value={l.id} />
                        <select
                          name="role"
                          defaultValue={l.role}
                          aria-label={`${T.actions.changerRole} ${T.pourQui.changerRole(courriel)}`}
                        >
                          {ROLES_CONSOLE.map((r: ConsoleRole) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button type="submit">{T.actions.changerRole}</button>
                      </form>
                      {l.role === 'admin' && l.valideAt === null ? (
                        <form action={validerUnAdministrateur}>
                          <input type="hidden" name="cibleId" value={l.id} />
                          <button type="submit">{T.actions.valider}</button>
                        </form>
                      ) : null}
                      <FormulaireDeDesactivation action={desactiverLeCompte} cibleId={l.id} />
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
