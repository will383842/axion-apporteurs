'use server';
/**
 * Les actions serveur de la connexion (SEC-03) : la demande de lien et sa consommation.
 *
 * Toutes deux répondent par une redirection (303 sans script) vers un ÉTAT de la liste fermée du
 * noyau : même code, même texte que le compte existe ou non. Le travail qui dépend du compte part
 * dans `after()` (Next 16) : il s'exécute une fois la réponse envoyée.
 *
 * NON FAIT ICI, ET NOMMÉ : le cookie de session `__Host-` (REQ-SEC-003) appartient à SEC-04 — la
 * session est enregistrée en base, son jeton n'est pas encore remis au navigateur ; l'envoi réel du
 * courriel appartient à INT-T10 — d'ici là, hors production le lien part au puits du notifieur
 * (`NOTIFY_SINK`), et en production l'envoi échoue en le disant.
 */
import { PrismaClient } from '@prisma/client';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { horlogeSysteme } from '../../../lib/horloge';
import { creerJournal } from '../../../lib/logger';
import { creerNotifieur } from '../../../lib/notify';
import { consommerLien, demanderLien } from '../../../server/auth/lien-magique';
import {
  empreinteReseauDeLaRequete,
  envoiParLeNotifieur,
  portsDeConsommation,
  portsDeDemande,
  type DependancesDuLien,
} from '../../../server/auth/lien-magique-production';
import { clesPii } from '../../../server/securite/pii';
import { evaluerPotDeMiel } from '../../../server/securite/pot-de-miel';

let client: PrismaClient | null = null;

function dependances(): DependancesDuLien {
  client ??= new PrismaClient();
  const journal = creerJournal();
  return {
    env: process.env,
    prisma: client,
    horloge: horlogeSysteme,
    planifier: (travail) => after(travail),
    envoi: envoiParLeNotifieur(
      creerNotifieur({
        env: process.env,
        journal,
        transports: [
          {
            nom: 'courriel',
            envoyer: async () => {
              throw new Error('envoi_courriel_non_cable : le transport réel appartient à INT-T10');
            },
          },
        ],
      })
    ),
    journal,
  };
}

const texte = (valeur: FormDataEntryValue | null): string | null =>
  typeof valeur === 'string' ? valeur : null;

export async function demanderUnLienDeConnexion(formulaire: FormData): Promise<void> {
  const etat = await demanderLien(
    {
      saisie: texte(formulaire.get('courriel')) ?? '',
      piege: evaluerPotDeMiel(texte(formulaire.get('site'))).piege,
      entetes: await headers(),
    },
    portsDeDemande(dependances())
  );
  redirect(`/connexion?etat=${etat}`);
}

export async function consommerUnLienDeConnexion(jeton: string): Promise<void> {
  const d = dependances();
  const ipHash = empreinteReseauDeLaRequete(await headers(), clesPii(d.env));
  const { etat } = await consommerLien({ jeton, ipHash }, portsDeConsommation(d));
  redirect(`/connexion/${encodeURIComponent(jeton)}?etat=${etat}`);
}
