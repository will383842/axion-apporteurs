/**
 * L'onglet « À appeler aujourd'hui » de la file de qualification (W20, UX-P1-07, fiche UX-P1-06),
 * ses textes seuls. Textes de `docs/chantiers/W20-confirmation-par-email.md` §4, repris mot pour mot.
 * Lu par Axion-IA seul.
 *
 * Chaque ligne porte sa raison EN CLAIR. Le premier dépôt d'un apporteur et la rafale de dépôts sont
 * des critères de TRI, jamais affichés (question 6, HYP-W20-VERIFICATION) : ils n'ont pas de texte
 * ici, et c'est voulu. `{joursOuvres}` est lu dans la SSOT par l'écran, jamais retapé.
 */
export const A_APPELER = {
  onglet: "À appeler aujourd'hui",
  vide: "Personne à appeler aujourd'hui",
} as const;

/** Les raisons d'un appel, telles que la ligne les affiche. */
export const RAISONS_D_APPEL = {
  adresseWebmail: 'Adresse webmail — vérification suggérée',
  sansReponse: 'Sans réponse depuis {joursOuvres}',
  tireAuSort: 'Tiré au sort',
} as const;
