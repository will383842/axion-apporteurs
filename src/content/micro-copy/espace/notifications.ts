/**
 * L'écran des notifications de l'espace apporteur (UX-P1-54, REQ-UX-016, REQ-UX-047), sur la maquette
 * `docs/maquettes/notifications.html`.
 *
 * Les textes DES notifications ne sont pas ici : ce sont les textes canoniques de la table
 * (`courriels/notifications.ts`), rendus par le lecteur serveur. L'état vide est celui de
 * `ETATS_VIDES_ESPACE['/notifications']`. Aucun état de lecture n'est écrit : la liste ne fait courir
 * aucun délai, et elle le dit.
 */
export const NOTIFICATIONS = {
  titre: 'Notifications',
  aucunDelai:
    'Les avis qui font courir un délai vous sont toujours envoyés par e-mail ; cette liste n’en fait courir aucun.',
  chargement: 'Chargement…',
  erreur: {
    titre: 'Les notifications n’ont pas pu être chargées',
    phrase: 'Rien n’est perdu : elles s’afficheront au prochain essai.',
    action: 'Réessayer',
  },
} as const;
