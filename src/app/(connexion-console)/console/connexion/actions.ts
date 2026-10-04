'use server';
/**
 * SEC-29 — les actions serveur de la connexion de la console : la demande de lien, la
 * consommation du lien, la vérification du code et « Changer d'adresse ». Le MÊME parcours que
 * l'espace (`src/app/(espace)/connexion/actions.ts`), par le MÊME noyau paramétré par la population :
 * rien du mécanisme n'est recopié ici, seuls les ports et les cookies de la console sont câblés.
 *
 * Chaque issue répond par une redirection (303 sans script) vers un ÉTAT de la liste fermée du
 * noyau : même code, même texte que le compte existe, soit désactivé ou non (REQ-SEC-003). Le
 * travail qui dépend du compte part dans `after()` : il s'exécute une fois la réponse partie.
 *
 * Ce groupe de routes est HORS de la garde des rôles (avant toute session) : il ne lit rien de
 * `src/server/console/`, ni aucune donnée métier (témoin du groupe, lentille sécurité).
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import {
  consommerLienConsole,
  demanderLienConsole,
  verifierLeCodeConsole,
} from '../../../../server/auth/lien-magique';
import {
  COOKIE_DATTENTE_CONSOLE,
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  effacerUnCookie,
  empreinteDeLaSaisie,
  empreinteReseauDeLaRequete,
  portsDeConsommationConsole,
  portsDeDemandeConsole,
  portsDuCodeConsole,
} from '../../../../server/auth/lien-magique-production';
import { clesPii } from '../../../../server/securite/pii';
import { evaluerPotDeMiel } from '../../../../server/securite/pot-de-miel';
import { destinationConsoleBornee } from './destination';

const ROUTE = '/console/connexion';

const texte = (valeur: FormDataEntryValue | null): string | null =>
  typeof valeur === 'string' ? valeur : null;

/** La suite, portée seulement si elle passe la borne : une URL hors de la console ne l'est jamais. */
function avecSuite(chemin: string, suite: string | null): string {
  if (suite === null || destinationConsoleBornee(suite) !== suite) return chemin;
  return `${chemin}${chemin.includes('?') ? '&' : '?'}suite=${encodeURIComponent(suite)}`;
}

export async function demanderUnLienDeConsole(formulaire: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const saisie = texte(formulaire.get('courriel')) ?? '';
  const etat = await demanderLienConsole(
    {
      saisie,
      piege: evaluerPotDeMiel(texte(formulaire.get('site'))).piege,
      entetes: await headers(),
    },
    portsDeDemandeConsole(d)
  );
  // Le cookie d'attente du code de la CONSOLE, pour toute adresse bien formée, compte ou non.
  const empreinte = empreinteDeLaSaisie(d.env, saisie);
  if (empreinte !== null)
    (await cookies()).set(
      COOKIE_DATTENTE_CONSOLE.nom,
      empreinte,
      COOKIE_DATTENTE_CONSOLE.attributs
    );
  redirect(avecSuite(`${ROUTE}?etat=${etat}`, texte(formulaire.get('suite'))));
}

/** « Changer d'adresse » efface le cookie d'attente de la console, puis revient à la demande. */
export async function changerDAdresseConsole(): Promise<void> {
  effacerUnCookie(await cookies(), COOKIE_DATTENTE_CONSOLE);
  redirect(ROUTE);
}

/**
 * Une session de la console ouverte, par le clic ou par le code : SON cookie, posé avant la
 * redirection, puis la destination bornée à la console (repli : `/console`).
 */
async function ouvrirLaConsole(jetonSession: string, suite: string | null): Promise<never> {
  const pot = await cookies();
  pot.set(COOKIE_DE_SESSION_CONSOLE.nom, jetonSession, COOKIE_DE_SESSION_CONSOLE.attributs);
  if (pot.get(COOKIE_DATTENTE_CONSOLE.nom) !== undefined)
    effacerUnCookie(pot, COOKIE_DATTENTE_CONSOLE);
  redirect(destinationConsoleBornee(suite));
}

export async function consommerUnLienDeConsole(jeton: string): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const ipHash = empreinteReseauDeLaRequete(await headers(), clesPii(d.env));
  const resultat = await consommerLienConsole({ jeton, ipHash }, portsDeConsommationConsole(d));
  if (resultat.etat === 'ouverte') await ouvrirLaConsole(resultat.jetonSession, null);
  redirect(`${ROUTE}?issue=${resultat.etat}`);
}

/**
 * La vérification du code : une redirection par issue, sans paramètre qui distingue le compteur ou
 * le compte (REQ-SEC-062) ; la suite demandée est conservée à travers le code.
 */
export async function verifierUnCodeDeConsole(formulaire: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const pot = await cookies();
  const suite = texte(formulaire.get('suite'));
  let lienAnnule = false;
  const resultat = await verifierLeCodeConsole(
    {
      emailHash: pot.get(COOKIE_DATTENTE_CONSOLE.nom)?.value ?? null,
      code: texte(formulaire.get('code')) ?? '',
      entetes: await headers(),
    },
    portsDuCodeConsole(d, () => {
      lienAnnule = true;
    })
  );
  if (resultat.etat === 'ouverte') await ouvrirLaConsole(resultat.jetonSession, suite);
  if (lienAnnule) effacerUnCookie(pot, COOKIE_DATTENTE_CONSOLE);
  redirect(avecSuite(`${ROUTE}?code=${resultat.etat}`, suite));
}
