/**
 * UX-P1-56 — l'écran « Anomalies » de la console : ses textes seuls, ceux de la maquette
 * `docs/maquettes/anomalies.html`. Lu par Axion-IA seul.
 *
 * Une confirmation par un humain est le seul fondement d'un gel pour fraude ; l'écran n'en pose aucun et
 * ne montre ni score, ni rang, ni seuil. Les faits décrivent ce qui s'est passé : ils ne qualifient pas
 * le geste. Chaque refus du module a sa phrase, sans donnée de personne.
 */
import type { RefusDeConfirmation } from '../../../server/console/anomalies/confirmer';

export const ANOMALIES_CONSOLE = {
  liste: {
    titre: 'Anomalies ouvertes',
    intro:
      'Les anomalies de sincérité de la déclaration, les plus anciennes d’abord. Une anomalie ouverte n’a aucun effet : seule sa confirmation par un administrateur en a un, et ce geste ne pose aucun gel.',
    colonnes: {
      nature: 'Nature',
      entreprise: 'Entreprise',
      ouverte: 'Ouverte le',
      action: 'Action',
    },
    nature: 'Sincérité de la déclaration',
    entrepriseInconnue: 'Entreprise non lisible',
    examiner: 'Examiner',
  },
  vide: {
    titre: 'Aucune anomalie ouverte',
    phrase:
      'Les anomalies s’ouvrent d’elles-mêmes, en différé, quand une déclaration le justifie. Rien n’est à examiner pour l’instant.',
    action: 'Retour à mon accueil',
  },
  confirmer: {
    retour: '← Anomalies ouvertes',
    titre: 'Confirmer l’anomalie',
    attribution: { intacte: 'attribution signée', transition: 'attribution provisoire' },
    ouverteLe: (date: string) => `ouverte le ${date}`,
    effet: {
      transition:
        'Confirmer, c’est constater que la déclaration ne remplit pas les conditions de l’article 3.7 du contrat. L’attribution en cause est invalidée, et l’apporteur reçoit la décision avec les faits retenus.',
      intacte:
        'Confirmer, c’est constater les faits. L’attribution est déjà signée : elle reste intacte, comme la commande et la commission, et aucune décision ne part ; la confirmation est consignée.',
    },
    sansGel:
      'Ce geste ne pose aucun gel. Ni score ni seuil ne le fondent : seuls les faits que vous écrivez.',
    faits: 'Les faits retenus',
    consigne:
      'Décrivez les faits sans aucun lien, sans nommer d’autre personne que l’apporteur, et sans qualifier le geste (ni « fraude », ni « anomalie », ni « sanction »).',
    borne: (max: number) => `${max} caractères au plus.`,
    confirmer: 'Confirmer l’anomalie',
    annuler: 'Annuler',
  },
  confirmee: {
    transition:
      'L’anomalie est confirmée. La décision part à l’apporteur au prochain envoi, avec les faits retenus.',
    intacte:
      'L’anomalie est confirmée, sans effet sur l’attribution, la commande ni la commission.',
  },
  refus: {
    faits_vides: 'Écrivez les faits retenus avant de confirmer.',
    faits_trop_longs:
      'Les faits dépassent la longueur admise : raccourcissez-les avant de confirmer.',
    faits_avec_lien: 'Les faits contiennent un lien : retirez-le avant de confirmer.',
    faits_avec_mot_refuse:
      'Les faits qualifient le geste : décrivez ce qui s’est passé, sans le nommer.',
    cle_invalide: 'La page a expiré : rechargez-la avant de confirmer.',
    droit_absent: 'Ce geste est réservé à un administrateur validé.',
    anomalie_inconnue: 'Cette anomalie n’existe pas, ou plus.',
    type_non_traite:
      'Seules les anomalies de sincérité de la déclaration se confirment sur cet écran. Rien n’est écrit ni envoyé.',
    deja_traitee: 'Cette anomalie a déjà été confirmée ou levée. Rien n’est écrit ni envoyé.',
  } satisfies Record<RefusDeConfirmation, string>,
  vides: {
    introuvable: { titre: 'Anomalie introuvable', phrase: 'Cette anomalie n’existe pas, ou plus.' },
    deja_traitee: {
      titre: 'Anomalie déjà traitée',
      phrase: 'Cette anomalie a déjà été confirmée ou levée. Rien n’est écrit ni envoyé.',
    },
    type_non_traite: {
      titre: 'Cette anomalie ne se confirme pas ici',
      phrase:
        'Seules les anomalies de sincérité de la déclaration se confirment sur cet écran. Rien n’est écrit ni envoyé.',
    },
    action: 'Anomalies ouvertes',
  },
  chargement: 'Chargement…',
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase:
      'La confirmation n’a pas pu être enregistrée : rien n’est écrit ni envoyé. Réessayez dans un instant.',
    action: 'Réessayer',
  },
} as const;
