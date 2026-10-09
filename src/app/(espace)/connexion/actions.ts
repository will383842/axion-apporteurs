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
 * L'APPAREIL (SEC-55, SEC-62, REQ-SEC-003) : le clic et le code lisent le cookie
 * `__Host-partners-appareil` et le passent TEL QUEL au noyau, qui juge sa forme. Un appareil inconnu
 * est avisé APRÈS la validation de la consommation, hors de toute transaction, puis confirmé par une
 * transaction courte (voie (b) de la lentille sécurité) — avant la redirection. L'action pose
 * l'identifiant que le noyau rend (le même, ou un neuf), et n'en invente aucun ; une consommation
 * refusée, ou qui ne rend pas d'appareil, n'en pose aucun.
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
import { COOKIE_D_APPAREIL, type AppareilDeLaConnexion } from '../../../server/auth/appareil';
import { consommerLien, demanderLien, verifierLeCode } from '../../../server/auth/lien-magique';
import {
  COOKIE_DATTENTE,
  dependancesDuProcessus,
  effacerLeCookieDAttente,
  empreinteDeLaSaisie,
  empreinteReseauDeLaRequete,
  portsDeConsommation,
  portsDeDemande,
  portsDuCode,
} from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION } from '../../../server/auth/session';
import { clesPii } from '../../../server/securite/pii';
import { evaluerPotDeMiel } from '../../../server/securite/pot-de-miel';
import {
  ROUTE_ISSUE_OUVERTE,
  destinationDeLOuverture,
  lireLaPolitique,
  portsDuProcessus,
} from '../../../server/rgpd/acceptation';
import { destinationBornee } from './destination';

const texte = (valeur: FormDataEntryValue | null): string | null =>
  typeof valeur === 'string' ? valeur : null;

export async function demanderUnLienDeConnexion(formulaire: FormData): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const saisie = texte(formulaire.get('courriel')) ?? '';
  const etat = await demanderLien(
    {
      saisie,
      piege: evaluerPotDeMiel(texte(formulaire.get('site'))).piege,
      entetes: await headers(),
    },
    portsDeDemande(d)
  );
  // SEC-54 : le cookie d'attente du code, pour TOUTE adresse bien formée, que le compte existe ou
  // non : même en-tête, seule l'empreinte change. Chaque demande remplace le précédent.
  const empreinte = empreinteDeLaSaisie(d.env, saisie);
  if (empreinte !== null)
    (await cookies()).set(COOKIE_DATTENTE.nom, empreinte, COOKIE_DATTENTE.attributs);
  redirect(`/connexion?etat=${etat}`);
}

/** SEC-54 : « Changer d'adresse » efface le cookie d'attente, puis revient à la demande. */
export async function changerDAdresse(): Promise<void> {
  effacerLeCookieDAttente(await cookies());
  redirect('/connexion');
}

/**
 * Une session ouverte, par le clic OU par le code (SEC-54, point 8) : le MÊME cookie, posé avant la
 * redirection, et la MÊME destination (première connexion comprise).
 */
async function ouvrirLaConnexion(
  ouverture: { jetonSession: string; appareil?: AppareilDeLaConnexion },
  d: ReturnType<typeof dependancesDuProcessus>,
  suite: string | null = null
): Promise<never> {
  const { jetonSession, appareil } = ouverture;
  const { nom, attributs } = COOKIE_DE_SESSION;
  const pot = await cookies();
  pot.set(nom, jetonSession, attributs);
  // SEC-55 : l'identifiant que le noyau rend, confirmé ou non (un avis échoué le laisse inconnu, et
  // la prochaine consommation sur lui retentera l'avis).
  if (appareil !== undefined)
    pot.set(COOKIE_D_APPAREIL.nom, appareil.identifiant, COOKIE_D_APPAREIL.attributs);
  // SEC-54 : la session ouverte, le cookie d'attente du code n'a plus d'objet. Effacé s'il existe :
  // une ouverture par le clic, sans demande sur cet appareil, n'en porte aucun.
  if (pot.get?.(COOKIE_DATTENTE.nom) !== undefined) effacerLeCookieDAttente(pot);
  const destination = await destinationDeLOuverture(
    jetonSession,
    () => lireLaPolitique(),
    () => portsDuProcessus(d),
    (motif) => d.journal.warn(motif)
  );
  // UX-P1-04 (W19) : l'issue habituelle n'est plus un cul-de-sac. Elle mène, en une action, à l'URL
  // demandée si elle est un chemin relatif de l'espace, sinon à l'accueil. La politique à accepter et
  // l'indisponibilité gardent leur route.
  redirect(destination === ROUTE_ISSUE_OUVERTE ? destinationBornee(suite) : destination);
}

export async function consommerUnLienDeConnexion(jeton: string): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const ipHash = empreinteReseauDeLaRequete(await headers(), clesPii(d.env));
  const identifiantAppareil = (await cookies()).get?.(COOKIE_D_APPAREIL.nom)?.value;
  const resultat = await consommerLien(
    { jeton, ipHash, identifiantAppareil },
    portsDeConsommation(d)
  );
  if (resultat.etat === 'ouverte') await ouvrirLaConnexion(resultat, d);
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
  const pot = await cookies();
  // L'empreinte vient du cookie d'attente, jugée par le noyau sur sa forme fermée avant tout.
  let lienAnnule = false;
  const resultat = await verifierLeCode(
    {
      emailHash: pot.get(COOKIE_DATTENTE.nom)?.value ?? null,
      code: texte(formulaire.get('code')) ?? '',
      entetes: await headers(),
      identifiantAppareil: pot.get(COOKIE_D_APPAREIL.nom)?.value,
    },
    portsDuCode(d, () => {
      lienAnnule = true;
    })
  );
  if (resultat.etat === 'ouverte')
    await ouvrirLaConnexion(resultat, d, texte(formulaire.get('suite')));
  // Le lien annulé au cinquième échec : le cookie d'attente part avec lui.
  if (lienAnnule) effacerLeCookieDAttente(pot);
  redirect(`/connexion?code=${resultat.etat}`);
}
