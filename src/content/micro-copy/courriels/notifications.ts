/**
 * Les textes des notifications de l'apporteur — UX-P1-10 (REQ-UX-016, REQ-JUR-039). Textes d'A07 du
 * 2026-10-02, repris MOT POUR MOT.
 *
 * Pour chaque clé de la table (`src/server/notifications/table-ssot.ts`) : un TITRE, UN appel à
 * l'action, et, quand le contrat l'exige, UNE phrase de corps obligatoire que la tâche émettrice
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
    titre: '{entreprise} : ce dépôt a pris fin',
    appel: 'Voir Mes entreprises',
    corps: null,
  },
  decision_attribution: {
    titre: '{entreprise} : une décision concerne votre dépôt',
    appel: 'Contester cette décision par écrit',
    corps:
      '{motif}. Vous pouvez contester cette décision par écrit ; Axion-IA vous répond de façon motivée dans les quinze jours.',
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
