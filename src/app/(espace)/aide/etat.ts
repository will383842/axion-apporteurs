/**
 * L'état de l'envoi d'un écrit (UX-P1-62) : ce que l'action rend au formulaire. Le texte saisi revient
 * à son seul auteur après un refus, pour qu'il ne le perde pas ; la confirmation ne porte que la date et
 * l'heure de la réception, posées par la base.
 */
export type EtatDeLEnvoi =
  | { etat: 'saisie' }
  | { etat: 'message_vide' | 'trop_long' | 'echec'; texte: string }
  | { etat: 'recu'; date: string; heure: string };

export const ETAT_INITIAL: EtatDeLEnvoi = { etat: 'saisie' };
