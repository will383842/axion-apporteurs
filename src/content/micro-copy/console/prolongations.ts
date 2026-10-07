/**
 * EXT-T07 — l'écran « Prolongations à décider » de la console : ses textes seuls, ceux de la maquette
 * `docs/maquettes/prolongation.html`. Les textes du geste sont ceux de la juriste (#809, 6039962596),
 * MOT POUR MOT ; les trois motifs reprennent les définitions de l'art. 3.4 al. 3. Lu par Axion-IA seul.
 * Aucune durée n'est écrite ici : `{jours}` et les dates sont posés par l'écran.
 */
import type { RefusDeProlongation } from '../../../server/attribution/prolonger';

export const PROLONGATIONS_CONSOLE = {
  liste: {
    titre: 'Prolongations à décider',
    intro:
      'Les attributions dont le terme arrive. Sans décision au terme, l’attribution est réputée prolongée, et l’apporteur en est informé.',
    colonnes: { entreprise: 'Entreprise', terme: 'Terme', action: 'Action' },
    entrepriseInconnue: 'Entreprise non lisible',
    decider: 'Décider',
  },
  vide: {
    titre: 'Aucune prolongation à décider.',
    action: 'Retour à mon accueil',
  },
  decider: {
    titre: 'Décider de la prolongation',
    question: 'Une condition de l’article 3.4 est-elle remplie au terme ?',
    prolonger: 'Prolonger',
    constater: 'Constater',
    motifs: {
      devis_en_cours:
        'Un devis émis par Axion-IA à l’entreprise est en cours : ni signé, ni refusé, ni expiré.',
      echange_recent: (jours: string) =>
        'Axion-IA a tenu un rendez-vous ou eu un échange avec l’entreprise au cours des ' +
        jours +
        ' derniers jours.',
      financement_en_instruction:
        'Un dossier de financement de la prestation est en cours d’instruction : l’organisme financeur n’a pas encore statué.',
    },
    constat: (date: string) =>
      'Aucune condition n’est remplie : l’attribution prendra fin à son terme, le ' + date + '.',
    termeLe: (date: string) => `terme le ${date}`,
    enregistrer: 'Enregistrer la décision',
    annuler: 'Annuler',
    retour: '← Prolongations à décider',
  },
  retours: {
    prolongee: (date: string) =>
      'L’attribution est prolongée jusqu’au ' + date + ', et l’apporteur en est informé.',
    constatee: (date: string) => 'C’est constaté : l’attribution prendra fin le ' + date + '.',
  },
  refus: {
    deja_decidee: 'La prolongation de cette attribution est déjà décidée.',
    terme_passe: 'Le terme est passé : l’attribution est réputée prolongée.',
    sans_objet: 'Cette attribution n’arrive pas à son terme : rien n’est à décider.',
    attribution_inconnue: 'Cette attribution n’arrive pas à son terme : rien n’est à décider.',
    decision_invalide: 'Une condition de l’article 3.4 est-elle remplie au terme ?',
  } satisfies Record<Exclude<RefusDeProlongation, 'droit_absent'>, string>,
  chargement: 'Chargement…',
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase:
      'La décision n’a pas pu être enregistrée : rien n’est modifié. Réessayez dans un instant.',
    action: 'Réessayer',
  },
} as const;
