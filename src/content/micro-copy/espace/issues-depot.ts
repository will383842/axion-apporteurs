/**
 * Les textes des issues d'un dépôt (REQ-UX-002) — lus par l'apporteur, donc jugés par
 * `gov:lexique` à la portée la plus stricte : ce fichier, commentaires compris, n'emploie aucun
 * mot du lexique interdit.
 *
 * Base : la maquette validée `docs/maquettes/deposer.html`, corrigée par la relecture juridique des
 * maquettes du 2026-09-19 (pas de « suivre » pour une entreprise ; appel préalable sans aucune
 * conséquence en cas de non-réponse ; suspension « le temps d'un échange avec Axion-IA »), et par
 * REQ-UX-002 pour le libellé unique des deux antériorités.
 *
 * Un refus ne porte AUCUN paramètre : il ne dit ni qui ni quand (REQ-SEC-022). La phrase « aucune
 * autre conséquence » et le lien de contestation écrite (REQ-DM-043) sont écrits UNE fois et
 * dérivés pour chaque refus par `issueRendue`.
 */
import {
  HORODATAGE_DE_L_ISSUE,
  estUnRefus,
  type Horodatage,
  type IssueDepot,
} from '../../../domain/depot/issue-depot';
import type { ActionEcran, TexteIssue } from '../types';
import { ACTIONS_COMMUNES, FORMULES, enTete } from './vocabulaire';

/** Ce que l'issue dit de l'heure retenue — la phrase de `a_la_reception` est celle de REQ-UX-013. */
export const MENTIONS_HORODATAGE: { readonly [H in Horodatage]: string } = {
  a_votre_nom: 'Enregistré à votre nom le {dateEnregistrement}.',
  rien_a_votre_nom: "Rien n'est enregistré à votre nom.",
  a_la_reception:
    "Enregistré sur votre téléphone — l'heure retenue est celle de la réception par Axion-IA.",
};

export const MENTION_DU_REFUS =
  "Ce refus n'a aucune autre conséquence pour vous et n'est pas un manquement.";

/**
 * Le lien de contestation écrite (REQ-DM-043). Sa route n'est pas encore déclarée dans
 * `docs/ESPACE-ROUTES.md` : elle sera posée avec la contestation elle-même (DM-25).
 */
export const CONTESTATION_ECRITE: ActionEcran = {
  libelle: 'Contester ce refus par écrit',
  route: null,
};

const DEPOSER_UNE_AUTRE: ActionEcran = {
  libelle: 'Déposer une autre entreprise',
  route: '/deposer',
};
const VOIR_MES_ENTREPRISES: ActionEcran = {
  libelle: 'Voir Mes entreprises',
  route: '/mes-entreprises',
};
const RETOUR_ACCUEIL: ActionEcran = ACTIONS_COMMUNES.retourAccueil;

/** Les deux antériorités partagent UN libellé (REQ-UX-002) : l'apporteur ne sait pas laquelle. */
const DEJA_CONNUE: TexteIssue = {
  pastille: 'Pas enregistré',
  titre: 'Pas enregistré : entreprise déjà connue de la Société',
  pourquoi:
    'Axion-IA était déjà en relation avec cette entreprise avant votre dépôt (contrat, article 3.3).',
  quoiFaire: 'Rien à faire.',
  actionPrincipale: RETOUR_ACCUEIL,
  actionSecondaire: DEPOSER_UNE_AUTRE,
};

export const TEXTES_DES_ISSUES: { readonly [I in IssueDepot]: TexteIssue } = {
  enregistree: {
    pastille: 'Enregistré',
    titre: "C'est enregistré à votre nom",
    pourquoi: "Cette entreprise n'était réservée pour aucun autre apporteur.",
    quoiFaire: `Axion-IA appelle {contact} avant le {dateAppel}. ${FORMULES.rienAFaire} : chaque étape s'affiche dans Mes entreprises.`,
    actionPrincipale: DEPOSER_UNE_AUTRE,
    actionSecondaire: VOIR_MES_ENTREPRISES,
  },
  prioritaire: {
    pastille: 'Enregistré',
    titre: "C'est enregistré à votre nom",
    pourquoi:
      "Axion-IA souhaite échanger avec vous avant d'appeler l'entreprise. Cela ne dit rien de votre dépôt.",
    quoiFaire:
      "Axion-IA essaiera de vous joindre d'ici le {dateAppel}. Si vous n'êtes pas disponible, rien ne change : votre dépôt garde son heure d'enregistrement et continue normalement.",
    actionPrincipale: DEPOSER_UNE_AUTRE,
    actionSecondaire: VOIR_MES_ENTREPRISES,
  },
  en_attente: {
    pastille: 'En attente',
    titre: 'Enregistré en attente',
    pourquoi: `Cette entreprise est ${FORMULES.dejaReservee}. Votre dépôt attend, avec son heure d’envoi.`,
    quoiFaire: `${enTete(FORMULES.finDuDroit)}, votre dépôt prend la suite, à l'heure où vous l'avez envoyé. ${FORMULES.rienAFaire} : vous serez prévenu.`,
    actionPrincipale: DEPOSER_UNE_AUTRE,
    actionSecondaire: VOIR_MES_ENTREPRISES,
  },
  file_complete: {
    pastille: 'Pas enregistré',
    titre: "Pas enregistré : l'attente est complète",
    pourquoi: `Cette entreprise est ${FORMULES.dejaReservee}, et l'attente prévue par le contrat est complète (article 3.3 bis).`,
    quoiFaire: 'Rien à faire. Vous pourrez la vérifier à nouveau plus tard.',
    actionPrincipale: RETOUR_ACCUEIL,
    actionSecondaire: DEPOSER_UNE_AUTRE,
  },
  anteriorite_client: DEJA_CONNUE,
  anteriorite_devis: DEJA_CONNUE,
  etablissement_cesse: {
    pastille: 'Pas enregistré',
    titre: 'Pas enregistré : cet établissement est fermé',
    pourquoi:
      'Le registre public des entreprises indique que cet établissement a cessé son activité (contrat, article 3.3 bis).',
    quoiFaire:
      "Si l'entreprise a déménagé, sa nouvelle adresse est un autre établissement : vous pouvez le chercher.",
    actionPrincipale: RETOUR_ACCUEIL,
    actionSecondaire: { libelle: 'Chercher un autre établissement', route: '/entreprise?q=' },
  },
  entreprise_hors_perimetre: {
    pastille: 'Pas enregistré',
    titre: 'Pas enregistré : cette structure est hors du contrat',
    pourquoi:
      'Le contrat met à part les administrations, les organismes qui financent la formation et les organismes de formation qui travaillent avec Axion-IA (article 3.3 bis).',
    quoiFaire: 'Rien à faire. La liste des structures mises à part peut être consultée.',
    actionPrincipale: RETOUR_ACCUEIL,
    actionSecondaire: { libelle: 'Voir la liste des structures mises à part', route: null },
  },
  opposition_demarchage: {
    pastille: 'Pas enregistré',
    titre: "Pas enregistré : l'entreprise ne souhaite pas être sollicitée",
    pourquoi:
      'Cette entreprise a demandé à ne pas recevoir de sollicitations (contrat, article 3.3 bis).',
    quoiFaire: 'Rien à faire.',
    actionPrincipale: RETOUR_ACCUEIL,
    actionSecondaire: DEPOSER_UNE_AUTRE,
  },
  gele: {
    pastille: 'Pas enregistré',
    titre: `Pas enregistré : ${FORMULES.depotsSuspendus}`,
    pourquoi: `Vos nouveaux dépôts sont suspendus depuis le {dateSuspension}. Le courrier électronique reçu ce jour-là ${FORMULES.raisonDuCourrier}`,
    quoiFaire:
      'Vous pouvez répondre à ce courrier, ou écrire à Axion-IA. Vos entreprises déjà déposées ne changent pas.',
    actionPrincipale: ACTIONS_COMMUNES.ecrireAAxionIA,
    actionSecondaire: RETOUR_ACCUEIL,
  },
  captcha: {
    pastille: 'En attente',
    titre: 'Encore une petite vérification',
    pourquoi:
      "Pour protéger le service des envois automatiques, nous vérifions que c'est bien vous.",
    quoiFaire: 'Votre saisie est gardée : rien à retaper.',
    actionPrincipale: ACTIONS_COMMUNES.envoyerLeDepot,
    actionSecondaire: null,
  },
  brouillon_hors_ligne: {
    pastille: 'En attente',
    titre: 'Enregistré sur votre téléphone',
    pourquoi: 'Pas de réseau.',
    quoiFaire:
      "Il part tout seul dès le retour du réseau ; le téléphone de {contact} vous sera alors demandé. S'il n'est pas parti le {dateEffacement}, il s'efface de ce téléphone.",
    actionPrincipale: RETOUR_ACCUEIL,
    actionSecondaire: null,
  },
};

/** Une issue telle qu'un écran l'affiche : son texte, sa mention d'horodatage, et le refus s'il y a lieu. */
export type IssueRendue = TexteIssue & {
  readonly horodatage: string;
  readonly refus: { readonly mention: string; readonly contestation: ActionEcran } | null;
};

/** Le SEUL chemin par lequel un écran obtient le texte d'une issue. */
export function issueRendue(issue: IssueDepot): IssueRendue {
  return {
    ...TEXTES_DES_ISSUES[issue],
    horodatage: MENTIONS_HORODATAGE[HORODATAGE_DE_L_ISSUE[issue]],
    refus: estUnRefus(issue)
      ? { mention: MENTION_DU_REFUS, contestation: CONTESTATION_ECRITE }
      : null,
  };
}
