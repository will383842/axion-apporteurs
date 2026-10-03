'use server';
/**
 * Les actions serveur de la connexion (SEC-03) : la demande de lien et sa consommation.
 *
 * Toutes deux répondent par une redirection (303 sans script) vers un ÉTAT de la liste fermée du
 * noyau : même code, même texte que le compte existe ou non. Le travail qui dépend du compte part
 * dans `after()` (Next 16) : il s'exécute une fois la réponse envoyée, jamais avant. L'issue d'une
 * consommation s'affiche sur `/connexion?issue=` : l'URL de destination ne porte plus le jeton.
 *
 * Une consommation qui ouvre la session remet son jeton au navigateur dans le cookie `__Host-` de
 * SEC-04 (REQ-SEC-003, `COOKIE_DE_SESSION`), AVANT la redirection ; un lien invalide n'en pose aucun.
 *
 * PREMIÈRE CONNEXION (JUR-T34, REQ-JUR-025) : une session ouverte dont l'apporteur n'a pas accepté la
 * version courante de la politique de confidentialité mène à `/confidentialite` au lieu de l'issue
 * habituelle. Une politique ou une base illisibles ne bloquent pas la connexion
 * (`destinationDeLOuverture`).
 *
 * NON FAIT ICI, ET NOMMÉ : l'envoi réel du courriel appartient à INT-T10 (voir
 * `dependancesDuProcessus`).
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { consommerLien, demanderLien, verifierLeCode } from '../../../server/auth/lien-magique';
import {
  dependancesDuProcessus,
  empreinteReseauDeLaRequete,
  portsDeConsommation,
  portsDeDemande,
  portsDuCode,
} from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION } from '../../../server/auth/session';
import { clesPii } from '../../../server/securite/pii';
import { evaluerPotDeMiel } from '../../../server/securite/pot-de-miel';
import {
  destinationDeLOuverture,
  lireLaPolitique,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';

const texte = (valeur: FormDataEntryValue | null): string | null =>
  typeof valeur === 'string' ? valeur : null;

export async function demanderUnLienDeConnexion(formulaire: FormData): Promise<void> {
  const etat = await demanderLien(
    {
      saisie: texte(formulaire.get('courriel')) ?? '',
      piege: evaluerPotDeMiel(texte(formulaire.get('site'))).piege,
      entetes: await headers(),
    },
    portsDeDemande(dependancesDuProcessus({ apres: after, env: process.env }))
  );
  redirect(`/connexion?etat=${etat}`);
}

/**
 * Une session ouverte, par le clic OU par le code (SEC-54, point 8) : le MÊME cookie, posé avant la
 * redirection, et la MÊME destination (première connexion comprise).
 */
async function ouvrirLaConnexion(
  jetonSession: string,
  d: ReturnType<typeof dependancesDuProcessus>
): Promise<never> {
  const { nom, attributs } = COOKIE_DE_SESSION;
  (await cookies()).set(nom, jetonSession, attributs);
  redirect(
    await destinationDeLOuverture(
      jetonSession,
      () => lireLaPolitique(),
      () => portsDuProcessus(d),
      (motif) => d.journal.warn(motif)
    )
  );
}

export async function consommerUnLienDeConnexion(jeton: string): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const ipHash = empreinteReseauDeLaRequete(await headers(), clesPii(d.env));
  const resultat = await consommerLien({ jeton, ipHash }, portsDeConsommation(d));
  if (resultat.etat === 'ouverte') await ouvrirLaConnexion(resultat.jetonSession, d);
  redirect(`/connexion?issue=${resultat.etat}`);
}

/**
 * SEC-54 — la vérification du code à six chiffres. Une redirection 303 par issue, et une seule par
 * issue (lentille sécurité, 2026-10-03) : `?code=code_refuse` pour TOUT refus de code, `?code=debit`
 * pour TOUT refus de débit (compteur réseau, compteur d'adresse, limiteur en panne), sans autre
 * paramètre ni rien qui distingue le compteur ou le compte. Le statut 429 est celui d'une route ;
 * une action serveur répond par cette redirection unique (REQ-SEC-002, amendement au rattrapage 87).
 */
export async function verifierUnCodeDeConnexion(formulaire: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const resultat = await verifierLeCode(
    {
      saisie: texte(formulaire.get('courriel')) ?? '',
      code: texte(formulaire.get('code')) ?? '',
      entetes: await headers(),
    },
    portsDuCode(d)
  );
  if (resultat.etat === 'ouverte') await ouvrirLaConnexion(resultat.jetonSession, d);
  redirect(`/connexion?code=${resultat.etat}`);
}
