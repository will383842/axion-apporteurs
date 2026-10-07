/**
 * SEC-71 — l'écran « Accès de l'apporteur », en console : ses textes seuls, ceux de la maquette
 * `docs/maquettes/acces-apporteur.html`. Lu par Axion-IA seul.
 *
 * Révoquer, c'est renouveler (contrat v2, art. 3.8 ; juriste, #474, 6034003544) : l'écran ne dit ni
 * sanction ni suspension. Deux motifs fermés ; chaque refus du module a sa phrase, sans donnée de
 * personne. Rien de l'ancien ni du nouvel accès n'apparaît à l'écran.
 */
import type { MotifDeRevocation, RefusDeRevocation } from '../../../server/console/acces-apporteur';

export const ACCES_APPORTEUR = {
  titre: 'Révoquer et renouveler l’accès',
  retour: '← Fiche de l’apporteur',
  apporteur: 'Apporteur',
  statuts: {
    sous_contrat: 'contrat signé',
    avant_signature: 'dossier d’inscription en cours',
  },
  intro:
    'Toutes les sessions de l’apporteur sont fermées, ses appareils oubliés, et ses liens de connexion et de dépôt en cours annulés. Un nouvel accès lui part par courriel, suivi d’un avis. Les entreprises qu’il a déclarées et ses commissions ne sont pas touchées. Ce n’est ni une sanction ni une suspension.',
  motif: 'Motif',
  motifs: {
    signalement_apporteur: {
      libelle: 'Signalement de l’apporteur',
      aide: 'L’apporteur signale un usage de son accès qu’il n’a pas autorisé. La révocation est due, sans délai.',
    },
    securite: {
      libelle: 'Motif de sécurité',
      aide: 'Axion-IA révoque l’accès pour un motif de sécurité.',
    },
  } satisfies Record<MotifDeRevocation, { libelle: string; aide: string }>,
  revoquer: 'Révoquer et renouveler l’accès',
  annuler: 'Annuler',
  revoque:
    'L’accès est révoqué. Le nouvel accès part à l’apporteur au prochain envoi, puis l’avis.',
  refus: {
    motif_invalide: 'Choisissez l’un des deux motifs avant de révoquer.',
    droit_absent: 'Ce geste est réservé à un administrateur validé.',
    apporteur_inconnu: 'Cet apporteur n’existe pas, ou plus.',
    contrat_termine:
      'Le contrat de cet apporteur a pris fin, et son accès à l’espace avec lui. Rien n’est révoqué ni envoyé.',
    sans_acces: 'Cet apporteur n’a jamais eu d’accès à l’espace. Rien n’est révoqué ni envoyé.',
  } satisfies Record<RefusDeRevocation, string>,
  vides: {
    contrat_termine: {
      titre: 'Aucun accès à révoquer',
      phrase:
        'Le contrat de cet apporteur a pris fin, et son accès à l’espace avec lui. Rien n’est révoqué ni envoyé.',
      action: 'Retour à la fiche',
    },
    sans_acces: {
      titre: 'Aucun accès à révoquer',
      phrase: 'Cet apporteur n’a jamais eu d’accès à l’espace. Rien n’est révoqué ni envoyé.',
      action: 'Retour à la fiche',
    },
    introuvable: {
      titre: 'Apporteur introuvable',
      phrase: 'Cet apporteur n’existe pas, ou plus. Revenez à la liste des apporteurs.',
      action: 'Liste des apporteurs',
    },
  },
  chargement: 'Chargement…',
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase:
      'La révocation n’a pas pu être enregistrée : rien n’est révoqué ni envoyé. Réessayez dans un instant.',
    action: 'Réessayer',
  },
} as const;
