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

export const FORMULES = {
  droitACommissionJusquau:
    "Votre droit à commission sur cette entreprise court jusqu'au {dateFin}.",
  dejaReservee: 'Déjà réservée pour un autre apporteur',
  finDuDroit: 'si ce droit prend fin',
  sansSuite: 'Sans suite',
  depotsSuspendus: "Vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA.",
  courrierDeSuspension:
    'Le courrier électronique du {dateCourrier} en donne la raison et vous dit comment nous répondre.',
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
  rienAFaire: 'Rien à faire de votre côté.',
} as const;

/** Les deux seules entrées de l'espace avant la signature du contrat. */
export const NAVIGATION_AVANT_SIGNATURE = ['Ma conformité', 'Mon contrat'] as const;
