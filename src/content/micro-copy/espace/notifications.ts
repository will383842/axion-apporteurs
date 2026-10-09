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
  /**
   * UX-P1-58 — juriste (#619, 5984284097), MOT POUR MOT : pour le seul motif `anomalie_confirmee`,
   * quand ses faits sont purgés, cette phrase remplace « Faits retenus : {faits} » dans le motif. Sans
   * point final, comme le gabarit. Le SERVEUR la pose ; l'écran ne la recompose jamais.
   */
  faitsNonConserves:
    "Faits retenus : leur détail n'est plus conservé, sa durée de conservation ayant pris fin",
  chargement: 'Chargement…',
  erreur: {
    titre: 'Les notifications n’ont pas pu être chargées',
    phrase: 'Rien n’est perdu : elles s’afficheront au prochain essai.',
    action: 'Réessayer',
  },
} as const;

/**
 * Les textes FERMÉS d'une décision du contrat dont le texte saisi est purgé (`textePurgeAt` posé) :
 * juriste, #752, 5986987052, MOT POUR MOT. La notification reste dans la liste ; le serveur rend ces
 * textes, l'écran ne recompose rien. `{article}` et `{dateEffet}` viennent de la ligne nue de la
 * décision, qui reste.
 */
export const DECISIONS_PURGEES = {
  /** Le corps ENTIER de la mise en demeure, remplacé ; le titre est inchangé. */
  mise_en_demeure:
    "Axion-IA vous a adressé une mise en demeure au titre de l'article {article} du contrat. Le détail des faits n'est plus conservé, sa durée de conservation ayant pris fin. Cette mise en demeure n'est ni un avertissement ni une mesure disciplinaire, et elle ne constitue pas un antécédent.",
  /** Le seul paragraphe de résiliation qui porte un texte saisi ; le paragraphe commun suit. */
  manquement_grave:
    "Axion-IA a résilié votre contrat d'apporteur sans préavis, par une décision motivée, en application de l'article 11.2 ; le détail du motif n'est plus conservé, sa durée de conservation ayant pris fin. Le contrat a pris fin le {dateEffet}.",
  /**
   * SEC-15 : le corps ENTIER d'une suspension aux faits purgés (juriste, #794, 6036374348 ;
   * vocabulaire rectifié sur #474, 6036797355 : « déposer », jamais « déclarer », GLOSSAIRE §6) ; le titre
   * est inchangé. Les deux dates se lisent sur la ligne nue et au journal, jamais dans le texte purgé.
   */
  suspension:
    "Axion-IA a suspendu l'enregistrement de vos nouveaux dépôts du {dateDebut} au {dateFin}, le temps d'une vérification, au titre de l'article 3.7 du contrat. Le détail des faits n'est plus conservé, sa durée de conservation ayant pris fin. Cette suspension n'a eu d'effet ni sur les entreprises que vous avez déposées, ni sur vos commandes, ni sur vos commissions, et elle ne constitue pas un antécédent.",
} as const;
