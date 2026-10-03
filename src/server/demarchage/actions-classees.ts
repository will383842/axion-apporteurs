/**
 * SEC-51 (REQ-SEC-042) — la liste FERMÉE dans les deux sens : chaque action de la console (la matrice
 * des droits) et chaque tâche de fond (le registre des tâches) se déclare « démarchage »,
 * « vérification » ou « sans contact » (avis de la lentille sécurité, point 4). Le typage exige une
 * entrée par action et par tâche ; un témoin confronte les clés aux sources, dans les deux sens.
 *
 * - `demarchage` : l'action ou la tâche CONTACTE une entreprise à des fins commerciales, une à une ou
 *   en masse (export, envoi groupé, séquence différée). Elle DOIT appeler `exigerHorsReserve`, au
 *   moment de l'envoi et dans sa transaction.
 * - `verification` : l'appel de confirmation d'un dépôt ; il n'est pas du démarchage et passe.
 * - `sans_contact` : aucune prise de contact d'une entreprise.
 *
 * Aujourd'hui, aucune action ni aucune tâche ne démarche : la garde existe avant ses appelants. Toute
 * action ou tâche neuve doit être classée ici pour que la confrontation reste verte.
 */
import type { DroitConsole } from '../roles/matrice';
import type { NomDeTache } from '../taches/registre';

export const NATURES = ['demarchage', 'verification', 'sans_contact'] as const;
export type NatureDeLAction = (typeof NATURES)[number];

type CleClassee = DroitConsole | `tache:${NomDeTache}`;

export const CLASSEMENT_DES_ACTIONS: Readonly<Record<CleClassee, NatureDeLAction>> = {
  'action:voir_iban_en_clair': 'sans_contact',
  'action:approuver_lot': 'sans_contact',
  'action:exporter_pain001': 'sans_contact',
  'action:lever_gel': 'sans_contact',
  'action:suspendre_apporteur': 'sans_contact',
  'action:resilier_apporteur': 'sans_contact',
  'action:exporter_das2': 'sans_contact',
  'tache:evenements_recus': 'sans_contact',
  'tache:minimiser_candidatures': 'sans_contact',
  'tache:journal_verifier': 'sans_contact',
  'tache:contacts_purger': 'sans_contact',
  'tache:siren_refuses_purger': 'sans_contact',
  // L'annuaire public des entreprises est interrogé ; aucune entreprise n'est contactée.
  'tache:naf_completer': 'sans_contact',
  'tache:droits_contact_purger': 'sans_contact',
};

/** Les actions et tâches qui doivent appeler la garde de la réserve. */
export function naturesDeDemarchage(): string[] {
  return Object.entries(CLASSEMENT_DES_ACTIONS)
    .filter(([, nature]) => nature === 'demarchage')
    .map(([cle]) => cle);
}
