/**
 * Le vocabulaire de l'espace — les FORMULES qu'un écran emploie pour dire une chose que le
 * contrat encadre. Une formule s'écrit ici une fois ; un écran la lit, il ne la réécrit pas.
 *
 * Lu par l'apporteur : jugé par `gov:lexique` à la portée la plus stricte, commentaires compris.
 *
 * Source : la relecture juridique des maquettes du 2026-09-19 et les décisions de l'orchestrateur
 * qui l'appliquent, prises le même jour. Chaque formule remplace une tournure des maquettes :
 *   — la date de fin d'un droit se dit par ce droit, jamais par le mot du schéma, et jamais en
 *     disant l'entreprise « suivie » ou « à votre nom » — deux tournures qui attachent une
 *     clientèle à la personne ;
 *   — une entreprise d'un autre apporteur est « déjà réservée pour un autre apporteur » ;
 *   — une issue sans rendez-vous est « Sans suite » ;
 *   — la suspension des dépôts se dit « le temps d'un échange avec Axion-IA » (REQ-JUR-031) ;
 *   — l'assurance professionnelle manquante ne change rien aux versements (REQ-DM-027) ;
 *   — une reprise se dit « Reprise » ;
 *   — avant le paiement, on dit « Règlement attendu de … », jamais « Payé par … » ;
 *   — la limite de vérification se dit sans aucun nombre restant ;
 *   — avant la signature, l'espace n'ouvre que deux entrées, « Ma conformité » et « Mon contrat ».
 *
 * Les seuils sont des paramètres `{…}` : leur valeur vient de sa source unique (RM-10).
 */

import type { ActionEcran } from '../types';

/**
 * Une formule s'écrit en minuscule quand elle entre au milieu d'une phrase ; `enTete` lui rend sa
 * capitale quand elle l'ouvre. Ainsi la formule reste UNE chaîne, quelle que soit sa place.
 */
export const enTete = (formule: string): string =>
  formule.charAt(0).toLocaleUpperCase('fr') + formule.slice(1);

/** Ce que dit le courrier de suspension — la fin de phrase que deux textes partagent. */
const RAISON_DU_COURRIER = 'en donne la raison et vous dit comment nous répondre.';

export const FORMULES = {
  droitACommissionJusquau:
    "Votre droit à commission sur cette entreprise court jusqu'au {dateFin}.",
  dejaReservee: 'déjà réservée pour un autre apporteur',
  finDuDroit: 'si ce droit prend fin',
  sansSuite: 'Sans suite',
  depotsSuspendus: "vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA",
  courrierDeSuspension: `Le courrier électronique du {dateCourrier} ${RAISON_DU_COURRIER}`,
  raisonDuCourrier: RAISON_DU_COURRIER,
  assuranceManquante: 'rien ne change pour vos versements',
  reprise: 'Reprise',
  reglementAttenduDeLEntreprise: "Règlement attendu de l'entreprise",
  reglementAttenduDeLOpco: "Règlement attendu de l'OPCO de l'entreprise",
  limiteDeVerification:
    'La vérification est limitée à {limiteParJour} par jour, pour protéger les informations des entreprises. Le dépôt, lui, reste ouvert.',
  contratPret:
    'Votre contrat est prêt. Une fois signé, vous pourrez, si vous le souhaitez, déposer des entreprises.',
  pieceManquanteAvantContrat: 'Il manque une pièce pour préparer votre contrat',
  releveParCourrierElectronique:
    'Chaque relevé vous est envoyé par courrier électronique ; il indique les mentions à reporter sur votre facture.',
  numeroDEntreprise: "numéro d'entreprise",
  rienAFaire: 'Rien à faire de votre côté',
} as const;

/**
 * Les actions que plusieurs écrans partagent : leur libellé s'écrit ICI, une fois. Un écran qui
 * mène ailleurs avec le même libellé reprend l'action et ne change que sa route.
 */
export const ACTIONS_COMMUNES = {
  retourAccueil: { libelle: "Retour à l'accueil", route: '/' },
  envoyerLeDepot: { libelle: 'Envoyer le dépôt', route: null },
  deposerUneEntreprise: { libelle: 'Déposer une entreprise', route: '/deposer' },
  ecrireAAxionIA: { libelle: 'Écrire à Axion-IA', route: '/aide' },
} as const satisfies Readonly<Record<string, ActionEcran>>;

/** Les deux seules entrées de l'espace avant la signature du contrat. */
export const NAVIGATION_AVANT_SIGNATURE = ['Ma conformité', 'Mon contrat'] as const;

/**
 * La connexion à l'espace par lien de connexion (SEC-03). Une réponse à la demande ne dit JAMAIS si
 * l'adresse est connue : le même texte part que le compte existe ou non (REQ-SEC-001) ; la limite
 * de demandes s'explique sans rien révéler du compte (REQ-SEC-002). Le titre, la phrase et le
 * bouton de la demande sont ceux de l'état de `/connexion`, et l'écran d'un lien qui ne vaut plus
 * est celui de `/connexion/<jeton>` (`etats-vides.ts`) : ils ne sont pas réécrits ici. Seuls
 * vivent ici les textes qu'aucun état vide ne porte : la confirmation et le lien utilisé.
 */
export const CONNEXION = {
  champCourriel: 'Adresse électronique',
  reponses: {
    envoye:
      'Si cette adresse est connue, un lien de connexion vient de lui être envoyé. Il ne sert qu’une fois et expire rapidement.',
    suspendu:
      'Trop de demandes de lien ont été faites récemment. Pour votre sécurité, réessayez un peu plus tard.',
    indisponible:
      'Votre demande n’a pas pu être traitée pour le moment. Réessayez un peu plus tard.',
    adresse_invalide:
      'Cette adresse électronique n’a pas la forme attendue. Vérifiez-la, puis réessayez.',
  },
  arrivee: {
    titre: 'Ouvrir votre espace',
    phrase: 'Confirmez pour utiliser votre lien de connexion sur cet appareil.',
    action: 'Utiliser mon lien',
    ouverte: 'Votre lien de connexion a bien été utilisé.',
  },
  courriel: {
    sujet: 'Votre lien de connexion à votre espace',
    corps:
      'Voici votre lien de connexion. Il ne sert qu’une fois et expire rapidement. Si vous n’avez rien demandé, ignorez ce message.',
  },
} as const;
