'use server';
/**
 * L'action serveur de « Écrire à Axion-IA » (UX-P1-62, REQ-DM-043, REQ-SEC-016) : l'envoi d'un écrit.
 *
 * La session pour le segment `aide` est le PREMIER acte (SEC-43) ; l'apporteur est celui de la
 * session, jamais une entrée du formulaire, et l'écrit passe par la couche de cloisonnement. Le texte
 * est jugé AVANT tout débit : un message vide ou trop long n'écrit rien et ne compte rien. Le débit
 * `ecrit:` compte la session, puis l'apporteur ; un refus, une panne du registre ou un échec de
 * l'écriture rendent le MÊME état « envoi en échec », qui ne dit pas lequel a joué. La confirmation
 * porte la date et l'heure POSÉES PAR LA BASE (juriste, 6038148824), jamais celles du serveur.
 */
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { forApporteur } from '../../../server/acces/for-apporteur';
import { portsDeLaGarde as portsDeLAcceptation } from '../../../server/auth/garde-espace';
import { dependancesDuProcessus } from '../../../server/auth/lien-magique-production';
import { COOKIE_DE_SESSION, actionEspace } from '../../../server/auth/session';
import {
  ErreurEcrit,
  dateDeLaReception,
  heureDeLaReception,
  jugerLEcrit,
  recevoirUnEcrit,
} from '../../../server/ecrit/recevoir';
import { portsDuProcessus } from '../../../server/rgpd/acceptation';
import { limiter, sujetDepuisEmpreinte } from '../../../server/securite/rate-limit';
import { clesPii } from '../../../server/securite/pii';
import type { EtatDeLEnvoi } from './etat';

const ROUTE_CONNEXION = '/connexion';

/** Le sujet d'un compteur : l'empreinte de l'identifiant, jamais l'identifiant lui-même. */
const empreinte = (espace: string, id: string) =>
  sujetDepuisEmpreinte(createHash('sha256').update(`${espace}:${id}`).digest('hex'));

export async function envoyerUnEcrit(
  _avant: EtatDeLEnvoi,
  formulaire: FormData
): Promise<EtatDeLEnvoi> {
  const texte = formulaire.get('message');
  const cle = formulaire.get('cle');
  if (typeof texte !== 'string' || typeof cle !== 'string') return { etat: 'echec', texte: '' };
  try {
    jugerLEcrit(texte);
  } catch (e) {
    if (e instanceof ErreurEcrit && (e.motif === 'message_vide' || e.motif === 'trop_long'))
      return { etat: e.motif, texte };
    return { etat: 'echec', texte };
  }
  const jeton = (await cookies()).get(COOKIE_DE_SESSION.nom)?.value;
  const dependances = dependancesDuProcessus({ apres: after, env: process.env });
  const session = portsDuProcessus(dependances).session;
  const ports = { ...session, acceptation: portsDeLAcceptation(dependances.prisma) };
  const issue = await actionEspace('aide', jeton, ports, async (s) => {
    const maintenantMs = session.maintenant().getTime();
    try {
      if (!(await limiter('ecrit:session', empreinte('session', s.id), maintenantMs)).autorise)
        return null;
      if (
        !(await limiter('ecrit:apporteur', empreinte('apporteur', s.apporteurId), maintenantMs))
          .autorise
      )
        return null;
      return await recevoirUnEcrit(
        forApporteur(dependances.prisma, s.apporteurId),
        { texte, cleIdempotence: cle },
        clesPii(process.env)
      );
    } catch {
      return null;
    }
  });
  if (!issue.ok) redirect(ROUTE_CONNEXION);
  if (issue.valeur === null) return { etat: 'echec', texte };
  const { recuAt } = issue.valeur;
  return { etat: 'recu', date: dateDeLaReception(recuAt), heure: heureDeLaReception(recuAt) };
}
