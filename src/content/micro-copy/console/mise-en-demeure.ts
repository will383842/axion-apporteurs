/**
 * La mise en demeure d'un apporteur, en console (UX-P1-57, geste minimal de la juriste, #703,
 * 5980966503 §3) : ses textes seuls. Lu par Axion-IA seul.
 *
 * Aucune durée ni aucune borne n'est écrite ici : le délai (`MISE_EN_DEMEURE_JOURS`) et la longueur
 * des faits (`FAITS_ANOMALIE_CARACTERES_MAX`) viennent de la SSOT, passés par l'écran. Le courriel
 * que l'apporteur reçoit est celui de SEC-19, dans `courriels/notifications.ts`.
 */
export const MISE_EN_DEMEURE_CONSOLE = {
  titre: 'Mettre en demeure',
  retour: '← Fiche de l’apporteur',
  phrase:
    'Une mise en demeure demande à l’apporteur d’exécuter une obligation précise de son contrat. Elle part par courriel. Sauf inexécution irrémédiable, une résiliation pour manquement n’est possible qu’après elle. Ce n’est ni un avertissement ni une mesure disciplinaire.',
  article: 'Article du contrat en cause',
  libelleArticle: (article: string) => `Article ${article}`,
  faits: 'Les faits',
  /** Condition de la sécurité : ni lien, ni nom de tiers ; le nom ne se détecte pas, la consigne le dit. */
  consigne:
    'Décrivez les faits sans aucun lien, et ne nommez aucune autre personne que l’apporteur.',
  borne: (max: number) => `${max} caractères au plus.`,
  delai: (jours: number) =>
    `Le délai de ${jours} jours court à partir de l’envoi du courriel. Une résiliation pour manquement n’est possible qu’à son expiration, et seulement si le manquement persiste.`,
  envoyer: 'Envoyer la mise en demeure',
  enregistree:
    'La mise en demeure est enregistrée. Le courriel part à l’apporteur au prochain envoi, et le délai court à partir de cet envoi.',
  chargement: 'Chargement…',
  /** La frontière d'erreur de la page : rien n'est parti, et le geste se refait ; aucun détail. */
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase:
      'La mise en demeure n’a pas pu être préparée ou enregistrée : rien n’est parti. Réessayez dans un instant.',
    action: 'Réessayer',
  },
  introuvable: {
    titre: 'Apporteur introuvable',
    phrase: 'Cet apporteur n’existe pas, ou plus. Revenez à la liste des apporteurs.',
  },
  horsContrat: {
    titre: 'Aucune mise en demeure possible',
    phrase:
      'Cet apporteur n’est pas sous contrat : une mise en demeure ne vise qu’un apporteur dont le contrat est signé. Revenez à sa fiche.',
    action: 'Retour à la fiche',
  },
  /** Les refus du geste, tels que l'écran les dit : jamais les faits saisis. */
  refus: {
    faits_vides: 'Décrivez les faits : le champ est vide.',
    faits_trop_longs: 'Les faits dépassent la longueur admise : raccourcissez-les avant d’envoyer.',
    faits_avec_lien: 'Les faits contiennent un lien : retirez-le avant d’envoyer.',
    faits_avec_mot_refuse:
      'Les faits contiennent un mot que le courriel n’admet pas : reformulez-les avant d’envoyer.',
    cle_idempotence_invalide:
      'Le formulaire n’est plus valable : rechargez la page, puis envoyez à nouveau.',
    cle_deja_employee:
      'Ce formulaire a déjà servi à un autre envoi : rechargez la page, puis envoyez à nouveau.',
    article_hors_liste: 'Choisissez l’article du contrat dans la liste.',
    statut_sans_contrat:
      'Cet apporteur n’est pas sous contrat : aucune mise en demeure ne peut partir.',
    apporteur_introuvable: 'Cet apporteur n’existe pas, ou plus.',
  },
} as const;

export type RefusDeLaMiseEnDemeure = keyof typeof MISE_EN_DEMEURE_CONSOLE.refus;
