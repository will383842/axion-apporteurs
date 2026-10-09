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

/** La clé d'une action de la liste fermée : un droit de la matrice ou une tâche du registre. */
export type CleDeLAction = DroitConsole | `tache:${NomDeTache}`;
type CleClassee = CleDeLAction;

export const CLASSEMENT_DES_ACTIONS: Readonly<Record<CleClassee, NatureDeLAction>> = {
  'action:voir_iban_en_clair': 'sans_contact',
  'action:approuver_lot': 'sans_contact',
  'action:exporter_pain001': 'sans_contact',
  'action:lever_gel': 'sans_contact',
  'action:suspendre_apporteur': 'sans_contact',
  'action:resilier_apporteur': 'sans_contact',
  'action:exporter_das2': 'sans_contact',
  // UX-P1-57 : la mise en demeure est un acte du contrat envers l'apporteur, pas une prise de contact
  // commerciale d'une entreprise.
  'ecran:mise_en_demeure': 'sans_contact',
  // CPL-T24 : la vérification d'un RIB à quatre yeux concerne le compte de l'apporteur, pas une entreprise.
  'action:verifier_rib': 'sans_contact',
  'action:mettre_en_demeure': 'sans_contact',
  'action:rattacher_manuellement': 'sans_contact',
  'action:lire_justification_anomalie': 'sans_contact',
  'action:lire_journal_des_acces': 'sans_contact',
  'ecran:accueil': 'sans_contact',
  'action:se_deconnecter': 'sans_contact',
  'ecran:qualification': 'sans_contact',
  'ecran:apporteurs': 'sans_contact',
  'ecran:attributions': 'sans_contact',
  'ecran:acces_refuse': 'sans_contact',
  'ecran:utilisateurs_console': 'sans_contact',
  'action:gerer_utilisateur_console': 'sans_contact',
  'ecran:conformite_apporteur': 'sans_contact',
  'action:verifier_piece': 'sans_contact',
  'action:ouvrir_kyc': 'sans_contact',
  'action:valider_kyc': 'sans_contact',
  'action:poser_gel_journal_acces': 'sans_contact',
  'action:lever_gel_journal_acces': 'sans_contact',
  'ecran:gels_journal_acces': 'sans_contact',
  'tache:evenements_recus': 'sans_contact',
  'tache:minimiser_candidatures': 'sans_contact',
  'tache:journal_verifier': 'sans_contact',
  'tache:contacts_purger': 'sans_contact',
  'tache:siren_refuses_purger': 'sans_contact',
  'tache:entreprises_connues_purger': 'sans_contact',
  // L'annuaire public des entreprises est interrogé ; aucune entreprise n'est contactée.
  'tache:naf_completer': 'sans_contact',
  'tache:notifications_espace_purger': 'sans_contact',
  'tache:notifications_espace_envoyer': 'sans_contact',
  'tache:anteriorites_rapprocher': 'sans_contact',
  'tache:droits_contact_purger': 'sans_contact',
  'tache:droits_contact_anonymiser': 'sans_contact',
  'tache:appareils_purger': 'sans_contact',
  'tache:journal_acces_console_purger': 'sans_contact',
  'tache:sessions_purger': 'sans_contact',
  'tache:utilisateurs_console_effacer': 'sans_contact',
  'tache:reconciliation_axionia': 'sans_contact',
  'tache:auto_parrainage_ouvrir': 'sans_contact',
  'tache:anomalies_anonymiser': 'sans_contact',
  'tache:contestations_purger': 'sans_contact',
  'tache:dementis_purger': 'sans_contact',
  // DM-70 : la purge du texte d'une décision de contrat n'est une prise de contact avec personne.
  'tache:decisions_contrat_purger': 'sans_contact',
  // SEC-66 : la résiliation par la Société à sa date d'effet ne contacte aucune entreprise.
  'tache:resiliations_a_date_effet': 'sans_contact',
  // DM-65 : tenir la liste des organismes (ajouter, retirer un SIREN) est un geste d'administration de la
  // Société ; la liste ne porte que des organismes, et aucune entreprise n'est contactée.
  'action:tenir_liste_noire': 'sans_contact',
  // DM-65 : la purge des périodes fermées de la trace de la liste efface des lignes, sans contacter personne.
  'tache:traces_liste_noire_purger': 'sans_contact',
  // SEC-14 : l'ouverture d'un signalement de sincérité est un passage interne, qui ne contacte aucune entreprise.
  'tache:sincerite_ouvrir': 'sans_contact',
  // SEC-15 (confirmé par la sécurité) : la levée de plein droit d'une suspension échue est un passage
  // interne ; aucune entreprise n'est contactée.
  'tache:suspensions_lever': 'sans_contact',
  // DM-71 (sécurité) : une décision notifiée à l'apporteur, et aucune entreprise n'est contactée.
  'action:annuler_apres_confirmation': 'sans_contact',
  // JUR-T64 (confirmé par la sécurité) : ouvrir et clore un litige sur une décision de contrat est une mesure
  // de conservation interne ; ni l'apporteur ni aucune entreprise ne sont contactés.
  'action:ouvrir_litige_decision': 'sans_contact',
  'action:clore_litige_decision': 'sans_contact',
  // UX-P1-56 : confirmer une anomalie de sincérité est un geste interne sur un dépôt, pas une prise de
  // contact d'une entreprise.
  'ecran:anomalies': 'sans_contact',
  'action:confirmer_anomalie': 'sans_contact',
};

/** Les actions et tâches qui doivent appeler la garde de la réserve. */
export function naturesDeDemarchage(
  classement: Readonly<Record<string, NatureDeLAction>> = CLASSEMENT_DES_ACTIONS
): string[] {
  return Object.entries(classement)
    .filter(([, nature]) => nature === 'demarchage')
    .map(([cle]) => cle);
}
