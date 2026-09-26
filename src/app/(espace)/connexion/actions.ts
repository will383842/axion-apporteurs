'use server';
/**
 * Les actions serveur de la connexion (SEC-03) : la demande de lien et sa consommation.
 *
 * Toutes deux répondent par une redirection (303 sans script) vers un ÉTAT de la liste fermée du
 * noyau : même code, même texte que le compte existe ou non. Le travail qui dépend du compte part
 * dans `after()` (Next 16) : il s'exécute une fois la réponse envoyée, jamais avant. L'issue d'une
 * consommation s'affiche sur `/connexion?issue=` : l'URL de destination ne porte plus le jeton.
 *
 * NON FAIT ICI, ET NOMMÉ : le cookie de session `__Host-` (REQ-SEC-003) appartient à SEC-04 — la
 * session est enregistrée en base, son jeton n'est pas encore remis au navigateur ; l'envoi réel du
 * courriel appartient à INT-T10 (voir `dependancesDuProcessus`).
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { consommerLien, demanderLien } from '../../../server/auth/lien-magique';
import {
  dependancesDuProcessus,
  empreinteReseauDeLaRequete,
  portsDeConsommation,
  portsDeDemande,
} from '../../../server/auth/lien-magique-production';
import { clesPii } from '../../../server/securite/pii';
import { evaluerPotDeMiel } from '../../../server/securite/pot-de-miel';

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

export async function consommerUnLienDeConnexion(jeton: string): Promise<void> {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const ipHash = empreinteReseauDeLaRequete(await headers(), clesPii(d.env));
  const { etat } = await consommerLien({ jeton, ipHash }, portsDeConsommation(d));
  redirect(`/connexion?issue=${etat}`);
}
