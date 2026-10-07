/**
 * UX-P1-63 — l'écran « Annuler une attribution confirmée » de la console (contrat v2, art. 3.3 ; geste
 * serveur de DM-71) : ses textes seuls, ceux de la maquette `docs/maquettes/annulation-apres-confirmation.html`,
 * MOT POUR MOT de la juriste (#816, 6041426984). Les motifs notifiés à l'apporteur ne sont pas ici : ce
 * sont ceux de `MOTIFS_DES_DECISIONS`, montrés en aperçu sans être réécrits. Lu par Axion-IA seul.
 */
export const ANNULATION_APRES_CONFIRMATION_CONSOLE = {
  lien: 'Annuler cette attribution (article 3.3)',
  titre: 'Annuler une attribution confirmée',
  phrase:
    'Après la confirmation, l’attribution ne peut être annulée que pour une erreur d’identification de l’entreprise ou une fraude de l’apporteur (contrat, article 3.3). Les commandes signées et les commissions acquises avant l’annulation restent dues.',
  question: 'Pour quelle raison ?',
  choixErreur: 'Erreur d’identification de l’entreprise',
  consigne:
    'Si l’apporteur conteste cette annulation, votre réponse motivée nomme l’erreur précise (l’établissement, le numéro ou l’entité en cause).',
  choixFraude: 'Fraude de l’apporteur, établie par une anomalie confirmée',
  precisionFraude:
    'Seule la fabrication de la déclaration, une entreprise que l’apporteur n’a ni rencontrée ni jointe, est une fraude. Une déclaration seulement automatisée ne l’est pas : elle peut fonder une suspension, pas une annulation.',
  sansAnomalie:
    'Aucune anomalie confirmée sur cette attribution : la fraude ne peut pas être retenue.',
  apercu: 'L’apporteur recevra :',
  bouton: 'Annuler l’attribution',
  retour: 'L’attribution est annulée, et l’apporteur en est informé.',
  confirmeeLe: (date: string) => `confirmée le ${date}`,
  anomalie: (date: string) => `Anomalie de sincérité, confirmée le ${date}`,
  revenir: 'Revenir à la fiche',
  refus: {
    non_confirmee: 'Cette attribution n’est pas confirmée : cette annulation ne s’applique pas.',
    deja_annulee_autrement: 'Cette attribution est déjà annulée pour une autre raison.',
    deja_annulee: 'Cette attribution est déjà annulée pour cette raison : rien n’a changé.',
    attribution_introuvable: 'Cette attribution est introuvable.',
  },
  chargement: 'Chargement…',
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase:
      'L’annulation n’a pas pu être enregistrée : rien n’est modifié. Réessayez dans un instant.',
    action: 'Réessayer',
  },
} as const;
