/**
 * matrice.ts — LA matrice des droits de la console (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 *
 * UN SEUL FICHIER, CONSOMMÉ PAR TOUS. La disposition de page et chaque action de serveur de la
 * console posent la même question à `requireRole` (`./require-role`), qui la pose à cette table ; la
 * garde `securite:roles` (`scripts/gates/roles.ts`) confronte le disque à la même table. Aucun droit
 * n'est écrit ailleurs (RM-01, RM-05).
 *
 * LE DÉFAUT EST LE REFUS. Un droit ABSENT de cette table n'est ouvert à personne, `admin` compris :
 * un écran ou une action qu'on a oublié de déclarer est fermé, jamais ouvert par omission. C'est la
 * règle maison du masquage qui échoue ouvert, appliquée aux rôles.
 *
 * LA FORME D'UN DROIT : `action:<nom>` pour une action de serveur, `ecran:<nom>` pour une page ou
 * une route. Une seule table, deux genres : la garde refuse qu'une action invoque un droit d'écran,
 * et l'inverse.
 *
 * CE QUI EST DÉCLARÉ AUJOURD'HUI, ET POURQUOI SEULEMENT CELA. Les sept droits que REQ-SEC-023
 * réserve nommément, répartis selon le glossaire (`docs/GLOSSAIRE.md` §7) : l'IBAN en clair,
 * l'approbation d'un lot et le pain.001 vont à `admin` et `comptable` ; la levée de gel, la
 * suspension, la résiliation et l'export DAS2 à `admin` seul. `qualifieur` et `lecteur` n'en ont
 * aucun. La console n'a encore ni écran ni action : chacun entre ici avec la tâche qui le crée
 * (UX-P1-12 ouvre le premier écran). Tant qu'il n'y est pas, il est refusé.
 */

import { ConsoleRole } from '@prisma/client';

/** Les quatre rôles, DÉRIVÉS de l'enum du schéma — jamais une liste retapée (RM-01). */
export const ROLES_CONSOLE: readonly ConsoleRole[] = Object.values(ConsoleRole);

/**
 * Une entrée : les rôles qui ont le droit, et le STEP-UP (SEC-30, arbitrage de la sécurité). Le
 * step-up est déclaré sur CHAQUE entrée, vrai ou faux : un oubli ne vaut jamais « sans step-up ».
 * Vrai, la session doit avoir été OUVERTE depuis moins que `DUREES_AUTH.releveMs`, lu en base.
 */
export interface EntreeDeLaMatrice {
  readonly roles: readonly ConsoleRole[];
  readonly stepUp: boolean;
}

/** La table : un droit, les rôles qui l'ont, et son step-up. */
export const MATRICE_DES_ROLES = {
  // Condition 4 de la sécurité (rattrapage 96) : un export de données de personnes, et l'IBAN en
  // clair, demandent le step-up.
  'action:voir_iban_en_clair': { roles: ['admin', 'comptable'], stepUp: true },
  'action:approuver_lot': { roles: ['admin', 'comptable'], stepUp: false },
  'action:exporter_pain001': { roles: ['admin', 'comptable'], stepUp: true },
  // SEC-30 (texte de la sécurité, point 4) : la levée d'un gel est sous step-up dès maintenant.
  'action:lever_gel': { roles: ['admin'], stepUp: true },
  // SEC-15 : une décision défavorable notifiée avec ses faits (art. 3.7 al. 3), au rang de la mise en
  // demeure : sous step-up (sécurité, #794 6039195762).
  'action:suspendre_apporteur': { roles: ['admin'], stepUp: true },
  'action:resilier_apporteur': { roles: ['admin'], stepUp: true },
  'action:exporter_das2': { roles: ['admin'], stepUp: true },
  // DM-12 (REQ-DM-034, amendement A1-01) : le rattachement manuel motivé, au qualifieur (glossaire §7)
  // et à l'admin ; jamais au comptable ni au lecteur.
  'action:rattacher_manuellement': { roles: ['admin', 'qualifieur'], stepUp: false },
  // DM-12 (REQ-DM-033, cadrage de la sécurité) : déchiffrer la justification d'une anomalie, par le
  // lecteur unique ; jamais au comptable ni au lecteur.
  'action:lire_justification_anomalie': { roles: ['admin', 'qualifieur'], stepUp: false },
  // SEC-60 (REQ-SEC-058, condition de la sécurité sur SEC-58) : lire le journal des accès à la console,
  // à l'admin SEUL, jamais en attente ; la lecture se journalise elle-même
  // (`src/server/console/journal-des-acces.ts`).
  'action:lire_journal_des_acces': { roles: ['admin'], stepUp: false },
  // DM-65 (REQ-DM-028, art. 3.3 bis (b)) : ajouter un SIREN à la liste de la Société, ou l'en retirer —
  // le retrait le rend déclarable, donc ouvert à une attribution : geste à effet d'argent, à l'administrateur
  // validé seul, sous step-up (condition de la sécurité).
  'action:tenir_liste_noire': { roles: ['admin'], stepUp: true },
  // SEC-29 : l'écran `/console` minimal (le repli de la redirection, avant l'accueil du rôle
  // d'UX-P1-16) et la déconnexion, ouverts aux quatre rôles : chacun doit pouvoir arriver et partir.
  'ecran:accueil': { roles: ['admin', 'qualifieur', 'comptable', 'lecteur'], stepUp: false },
  'action:se_deconnecter': {
    roles: ['admin', 'qualifieur', 'comptable', 'lecteur'],
    stepUp: false,
  },
  // UX-P1-16 : les écrans de la PHASE 1 de la navigation (`docs/CONSOLE-ROUTES.md`), répartis selon la
  // carte ; une entrée n'apparaît que si l'écran est AUSSI livré. Les écrans des phases 2 et 3
  // entrent avec la tâche qui les livre. Un écran se lit sans step-up : le lire n'engage rien.
  'ecran:qualification': { roles: ['admin', 'qualifieur', 'lecteur'], stepUp: false },
  'ecran:apporteurs': { roles: ['admin', 'qualifieur', 'comptable'], stepUp: false },
  'ecran:attributions': { roles: ['admin', 'qualifieur', 'lecteur'], stepUp: false },
  // L'écran d'accès refusé, ouvert à tout rôle : il dit ce que le rôle permet et à qui s'adresser.
  'ecran:acces_refuse': {
    roles: ['admin', 'qualifieur', 'comptable', 'lecteur'],
    stepUp: false,
  },
  // SEC-30 : la gestion des utilisateurs de la console, à admin seul ; l'action sous step-up, son
  // écran sans (le lire n'engage rien).
  'ecran:utilisateurs_console': { roles: ['admin'], stepUp: false },
  'action:gerer_utilisateur_console': { roles: ['admin'], stepUp: true },
  // CPL-T07 : le dossier de conformité. Vérifier une pièce (jamais un RIB, vérifié à quatre yeux
  // ailleurs) à l'admin et au qualifieur ; ouvrir et valider le dossier à l'admin seul — la
  // validation mène à la signature, sous step-up (condition de la sécurité).
  'ecran:conformite_apporteur': { roles: ['admin', 'qualifieur'], stepUp: false },
  'action:verifier_piece': { roles: ['admin', 'qualifieur'], stepUp: false },
  'action:ouvrir_kyc': { roles: ['admin'], stepUp: false },
  'action:valider_kyc': { roles: ['admin'], stepUp: true },
  // CPL-T24 (REQ-UX-027, REQ-DM-027) : vérifier puis confirmer un RIB, à quatre yeux, chacun par un
  // administrateur VALIDÉ, sous step-up (condition de la sécurité).
  'action:verifier_rib': { roles: ['admin'], stepUp: true },
  // SEC-61 (conditions de la sécurité) : poser et lever un gel du journal des accès, à un admin
  // VALIDÉ, sous step-up ; la levée par un AUTRE que l'auteur et que la personne visée (CHECK).
  'action:poser_gel_journal_acces': { roles: ['admin'], stepUp: true },
  'action:lever_gel_journal_acces': { roles: ['admin'], stepUp: true },
  // UX-P1-53 (validé par la sécurité) : l'écran des gels, un seul droit pour l'onglet et la lecture,
  // à admin seul et sans step-up (lire ne change rien, chaque page se trace) ; l'administrateur
  // VALIDÉ est relu en base par la lecture elle-même.
  'ecran:gels_journal_acces': { roles: ['admin'], stepUp: false },
  // UX-P1-57 (conditions de la sécurité, #703) : la mise en demeure est un acte juridique qui ouvre la
  // voie à la résiliation sans préavis ; à l'admin seul, sous step-up. Son écran, à l'admin seul : le
  // relèvement est exigé par le geste, que l'action rejuge.
  'ecran:mise_en_demeure': { roles: ['admin'], stepUp: false },
  'action:mettre_en_demeure': { roles: ['admin'], stepUp: true },
  // UX-P1-56 (coordination, conditions de la sécurité) : confirmer une anomalie de sincérité, seul
  // fondement d'un gel pour fraude (SEC-15), à l'admin SEUL, sous step-up ; le droit est relu en base par
  // le geste. Son écran, à l'admin seul : le relèvement est exigé par le geste, que l'action rejuge.
  'ecran:anomalies': { roles: ['admin'], stepUp: false },
  'action:confirmer_anomalie': { roles: ['admin'], stepUp: true },
  // DM-71 (art. 3.3 du v2) : l'annulation après la confirmation, pour erreur d'identification ou pour
  // fraude, est un geste humain de l'administrateur, sous step-up (sécurité, rattrapage 119).
  'action:annuler_apres_confirmation': { roles: ['admin'], stepUp: true },
} as const satisfies Readonly<Record<`${'action' | 'ecran'}:${string}`, EntreeDeLaMatrice>>;

/**
 * Les rôles par droit, PROJETÉS de la table : la forme que lit la garde `securite:roles`. Une
 * projection, jamais une seconde table.
 */
export const ROLES_PAR_DROIT: Readonly<Record<string, readonly ConsoleRole[]>> = Object.fromEntries(
  Object.entries(MATRICE_DES_ROLES).map(([droit, entree]) => [droit, entree.roles])
);

/** Un droit DÉCLARÉ — le seul que le typage laisse passer à `requireRole`. */
export type DroitConsole = keyof typeof MATRICE_DES_ROLES;

/**
 * Vrai si le droit est DÉCLARÉ dans la table. Un nom hérité d'`Object.prototype` — `constructor`,
 * `toString` — ne l'est pas : l'appartenance se lit par `Object.hasOwn`, jamais par `in`.
 */
export function droitDeclare(droit: string): droit is DroitConsole {
  return Object.hasOwn(MATRICE_DES_ROLES, droit);
}

/** Vrai si le rôle a le droit. Un droit absent de la table rend faux, pour tous les rôles. */
export function roleAutorise(droit: string, role: ConsoleRole): boolean {
  if (!droitDeclare(droit)) return false;
  const roles: readonly ConsoleRole[] = MATRICE_DES_ROLES[droit].roles;
  return roles.includes(role);
}

/** SEC-30 : vrai si le droit exige le step-up. Un droit absent de la table l'exige (échec fermé). */
export function exigeLeStepUp(droit: string): boolean {
  return !droitDeclare(droit) || MATRICE_DES_ROLES[droit].stepUp;
}

/**
 * SEC-30 (quatre yeux) : vrai si le droit est ouvert aux QUATRE rôles — arriver, partir. C'est tout
 * ce qu'un admin en attente de validation garde. Un droit absent de la table : faux.
 */
export function ouvertATousLesRoles(droit: string): boolean {
  return ROLES_CONSOLE.every((role) => roleAutorise(droit, role));
}
