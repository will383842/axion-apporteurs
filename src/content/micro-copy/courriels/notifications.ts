/**
 * Les textes des notifications de l'apporteur — UX-P1-10 (REQ-UX-016, REQ-JUR-039). Textes d'A07 du
 * 2026-10-02, repris MOT POUR MOT.
 *
 * Pour chaque clé de la table (`src/server/notifications/table-ssot.ts`) : un TITRE, UN appel à
 * l'action, et, quand le contrat l'exige, la phrase de corps qu'il impose et que la tâche émettrice
 * reprend telle quelle. Les variables sont entre accolades et remplies par l'émetteur.
 *
 * Aucun texte n'est une instruction, une relance d'activité, ni une menace (charte relationnelle,
 * REQ-JUR-012, REQ-JUR-039) : une notification INFORME, et l'appel à l'action est une possibilité.
 */
import { MENTION_DU_REFUS } from '../espace/issues-depot';

export type TexteDeNotification = {
  readonly titre: string;
  readonly appel: string;
  /** La phrase que le contrat exige dans le corps, ou `null`. */
  readonly corps: string | null;
};

export const TEXTES_DES_NOTIFICATIONS = {
  lien_magique: {
    titre: 'Votre lien de connexion à votre espace',
    appel: 'Ouvrir mon espace',
    corps: null,
  },
  depot_injoignable_j5: {
    titre: "{entreprise} : la confirmation de l'échange est en cours",
    appel: 'Voir Mes entreprises',
    corps:
      "Axion-IA n'a pas encore pu joindre {contact}. Votre dépôt garde son heure d'enregistrement.",
  },
  attribution_liberee: {
    titre: '{entreprise} : réservation terminée',
    appel: 'Voir Mes entreprises',
    corps: null,
  },
  decision_attribution: {
    titre: '{entreprise} : une décision concerne votre dépôt',
    appel: 'Contester cette décision par écrit',
    // {delaiReponse} : le délai de la SSOT (contrat art. 3.3 et 5.6), posé par l'envoi, jamais retapé.
    corps:
      '{motif}. Vous pouvez contester cette décision par écrit ; Axion-IA vous répond de façon motivée dans les {delaiReponse}.',
  },
  premier_rang_libere: {
    titre: "{entreprise} : vous pouvez la déposer à nouveau jusqu'au {dateLimite}",
    appel: 'Déposer à nouveau cette entreprise',
    corps:
      "Votre dépôt était le premier en attente. Sans nouveau dépôt d'ici le {dateLimite}, votre dépôt en attente est effacé.",
  },
  refus_declaration: {
    titre: '{entreprise} : dépôt non enregistré — {categorie}',
    appel: 'Contester ce refus par écrit',
    // La mention de l'espace, DÉRIVÉE (RM-01) : « n'est pas un manquement » reprend la fin de
    // l'art. 3.3 bis (avis d'A07 du 2026-10-02).
    corps: `{categorie} : {motif}. ${MENTION_DU_REFUS}`,
  },
  suspension_declarations: {
    titre: "Vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA",
    appel: 'Lire le courrier et répondre',
    corps:
      "{faits}. Cette suspension prend fin au plus tard le {dateLevee}. Rien ne change pour vos entreprises en cours, ni pour vos commissions, ni pour l'accès à votre espace.",
  },
  rappel_rc_pro: {
    titre: "Votre attestation d'assurance arrive à échéance le {dateEcheance}",
    appel: 'Déposer la nouvelle attestation',
    corps: null,
  },
  rattachement_decide: {
    titre: '{entreprise} : décision de rattachement',
    appel: 'Voir Mes entreprises',
    corps: '{decision}. Motif : {motif}.',
  },
} as const satisfies Readonly<Record<string, TexteDeNotification>>;

export type CleDeNotification = keyof typeof TEXTES_DES_NOTIFICATIONS;

/**
 * Le corps d'`attribution_liberee`, choisi par la CAUSE de la fin (textes d'A07 du 2026-10-02, mot
 * pour mot ; titre et appel inchangés). Une demande vérifiée libérée ouvre une carence de redépôt
 * (art. 3.2 al. 6), seule conséquence de la libération ; une péremption ou une fin de durée
 * (art. 3.4) n'en ouvre aucune. `{dateRedepot}` est fourni par l'émettrice.
 */
export const CORPS_DE_LA_LIBERATION = {
  demande_verifiee:
    "Ce dépôt a pris fin sans confirmation de l'échange. Vous pourrez déposer à nouveau cette entreprise à partir du {dateRedepot}. Cette fin n'emporte aucune autre conséquence pour vous.",
  peremption_ou_fin_de_duree:
    'Cette entreprise est de nouveau disponible, y compris pour un nouveau dépôt de votre part.',
} as const;

export type CauseDeLiberation = keyof typeof CORPS_DE_LA_LIBERATION;

/**
 * SEC-54 — les deux phrases qui encadrent le code à six chiffres, dans le MÊME courriel que le lien
 * (`lien_magique`). Le code est une seconde forme du lien : il ne sert qu'une fois et ne vaut pas plus
 * longtemps que lui. Le code lui-même n'est pas un paramètre de texte : l'envoi le pose seul, sur sa
 * ligne, entre les deux phrases.
 */
export const CODE_DU_COURRIEL_DE_CONNEXION = {
  avant: 'Vous pouvez aussi saisir ce code sur la page de connexion :',
  apres: 'Il ne sert qu’une fois, et pas plus longtemps que le lien.',
} as const;
