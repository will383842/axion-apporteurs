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
  dejaReservee: 'déjà réservée',
  finDuDroit: 'si cette réservation prend fin',
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
/**
 * EXT-T06 (REQ-EXT-006) — le signal « Déjà déclarée par le passé » de la vérification d'une entreprise
 * disponible : texte FIXE de la juriste (#474, 6036611999), MOT POUR MOT, sans porteur, date, durée,
 * nombre ni issue. Il ne s'affiche qu'avec l'état « disponible ».
 */
export const DEJA_DECLAREE = {
  titre: 'Déjà déclarée par le passé',
  phrase:
    "Cette entreprise a déjà fait l'objet d'une déclaration, aujourd'hui terminée. Elle est disponible : vous pouvez la déclarer.",
} as const;

export const ACTIONS_COMMUNES = {
  retourAccueil: { libelle: "Retour à l'accueil", route: '/' },
  envoyerLeDepot: { libelle: 'Envoyer le dépôt', route: null },
  deposerUneEntreprise: { libelle: 'Déposer une entreprise', route: '/deposer' },
  ecrireAAxionIA: { libelle: 'Écrire à Axion-IA', route: '/aide' },
  // Le retour à ses entreprises : l'issue d'un dépôt (UX-P1-02) et « Ma contestation » (UX-P1-51).
  voirMesEntreprises: { libelle: 'Voir Mes entreprises', route: '/mes-entreprises' },
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
  /**
   * UX-P1-04 — le code à six chiffres, saisi après l'envoi (maquette `connexion.html`, validée le
   * 2026-10-03). Les deux refus sont les textes de la juriste, MOT POUR MOT (rattrapage 88) : un SEUL
   * texte pour tout refus de code, et le débit sans durée en dur.
   */
  code: {
    // Le nombre de chiffres n'est pas écrit ici (RM-10) : le champ le borne, la garde le refuse en clair.
    champ: 'Code reçu par e-mail',
    aide: 'Le code sert si le lien s’ouvre sur un autre appareil.',
    action: 'Me connecter',
    changer: 'Changer d’adresse',
    refus: 'Ce code n’est pas valable. Demandez un nouveau lien de connexion.',
    debit: 'Trop d’essais. Réessayez dans quelques minutes.',
    installee: {
      titre: 'Vous utilisez l’application installée',
      phrase:
        'Le lien de l’e-mail s’ouvre dans le navigateur, pas dans l’application. Tapez plutôt le code reçu par e-mail ici.',
    },
  },
  /**
   * UX-P1-04 — un lien déjà consommé, distinct d'un lien invalide (maquette « Lien déjà utilisé »).
   * Le titre et l'action sont ceux de l'état vide de `/connexion/<jeton>` (`etats-vides.ts`), non
   * réécrits ; seule la phrase, qui dit POURQUOI le lien ne sert qu'une fois, vit ici.
   */
  dejaUtilise: {
    phrase:
      'Un lien de connexion ne sert qu’une fois : c’est ce qui protège votre espace si l’e-mail est transféré.',
  },
  courriel: {
    sujet: 'Votre lien de connexion à votre espace',
    corps:
      'Voici votre lien de connexion. Il ne sert qu’une fois et expire rapidement. Si vous n’avez rien demandé, ignorez ce message.',
  },
} as const;

/**
 * La politique de confidentialité de l'espace (JUR-T34, REQ-JUR-025). Seuls les TITRES et les
 * phrases de l'écran vivent ici : le contenu de la politique — durées, destinataires, base légale —
 * se lit dans le registre des traitements à l'affichage, il ne s'écrit nulle part ailleurs. Ce que
 * le registre n'a pas encore tranché s'affiche « À compléter », avec la question posée.
 * L'état vide de l'écran (aucun destinataire nommé) est celui de `/confidentialite`
 * (`etats-vides.ts`).
 */
export const CONFIDENTIALITE = {
  titre: 'Vos données personnelles',
  phrase:
    'Ce que la Société fait de vos données, combien de temps elle les garde, à qui elle les confie, et vos droits. Chaque information vient du registre des traitements de la Société.',
  rubriques: {
    finalite: 'Pourquoi vos données sont utilisées',
    baseLegale: 'Ce qui autorise leur utilisation',
    duree: 'Combien de temps elles sont gardées',
    destinataires: 'Qui peut les consulter',
    transferts: 'Si elles sont envoyées à l’étranger',
    droits: 'Vos droits, et comment les exercer',
  },
  tiers: {
    titre: 'Les prestataires et organismes qui reçoivent vos données',
    qualite: 'À quel titre',
    donnees: 'Ce qui leur est confié',
    localisation: 'Où elles sont traitées',
  },
  // JUR-T36 : un passage que le registre ne tranche pas encore. Aucune question interne n'est lue.
  aCompleter: 'En cours de rédaction',
  accord: {
    phrase: 'Votre espace s’ouvre une fois cette politique acceptée.',
    action: 'J’accepte cette politique',
  },
  acceptee: 'Vous avez accepté cette politique.',
  // JUR-T57 : la politique porte encore un passage en cours de rédaction ; elle n'est pas proposée à l'accord.
  nonPubliable:
    'Cette politique est encore en cours de rédaction. Vous pourrez l’accepter dès qu’elle sera complète.',
  chargement: 'Chargement de la politique de confidentialité…',
  erreur: {
    titre: 'La politique ne s’affiche pas',
    phrase: 'La politique de confidentialité n’a pas pu être affichée. Réessayez un peu plus tard.',
    action: 'Réessayer',
  },
  horsLigne: {
    titre: 'Vous êtes hors ligne',
    phrase: 'La politique de confidentialité s’affichera dès le retour du réseau.',
  },
} as const;

/**
 * UX-P1-51 (REQ-DM-043) — « Ma contestation » : l'apporteur relit SA contestation et la réponse
 * d'Axion-IA (maquette `contestation.html`, validée par Williams le 2026-10-07, #319, 6032238671).
 * L'interface dit « Axion-IA », jamais « la Société » (juriste, #761, 5988000399). Les textes de la
 * juriste sont MOT POUR MOT : la réponse et l'attente (5988000399), le contenu purgé (#619,
 * 5987225083), que le serveur choisit et que l'écran ne recompose jamais. Le délai vient de la SSOT.
 */
export const CONTESTATION = {
  titre: 'Ma contestation',
  retour: '← Mes entreprises',
  objets: {
    refus_depot: 'Refus d’un dépôt',
    annulation_attribution: 'Annulation d’un dépôt',
    demande_rattachement: 'Demande de rattachement',
  },
  votreEcrit: 'Votre écrit, reçu le {date}',
  // Juriste, #761, 5988000399, MOT POUR MOT.
  reponse: 'Réponse d’Axion-IA, le {date}',
  attente: {
    titre: 'La réponse n’est pas encore arrivée',
    // Juriste, #761, 5988000399, MOT POUR MOT.
    phrase:
      'Axion-IA vous répond de façon motivée dans les {delaiReponse} qui suivent la réception de votre écrit, au plus tard le {dateLimite}.',
    action: ACTIONS_COMMUNES.voirMesEntreprises,
  },
  contestationRecue: 'Contestation reçue le {date}',
  statut: { repondue: 'réponse donnée', enAttente: 'en attente de réponse' },
  // Juriste, #619, 5987225083, MOT POUR MOT : le texte d'une contestation dont le contenu est purgé.
  purgee:
    "Le texte de cette contestation et la réponse d'Axion-IA ne sont plus conservés, leur durée de conservation ayant pris fin.",
  indisponible: {
    titre: 'Cette contestation n’est pas disponible',
    phrase: 'Vos contestations se retrouvent depuis Mes entreprises.',
    action: ACTIONS_COMMUNES.voirMesEntreprises,
  },
  chargement: 'Chargement…',
  erreur: {
    titre: 'Votre contestation ne s’affiche pas',
    phrase: 'Rien n’est perdu : elle s’affichera au prochain essai.',
    action: 'Réessayer',
  },
} as const;
