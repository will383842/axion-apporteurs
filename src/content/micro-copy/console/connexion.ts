/**
 * La connexion de la console (SEC-29, REQ-UX-048), ses textes seuls. Textes de la maquette validée
 * `docs/maquettes/connexion-console.html` (UX-P1-18), repris mot pour mot. Lu par les utilisateurs de
 * la console seuls.
 *
 * Ce qui n'est PAS retapé ici :
 *   — le titre, la phrase et le bouton de l'état vide de l'écran : ceux de `connexion-console` dans
 *     `etats-vides.ts` ;
 *   — le refus d'un code et le débit : les textes de la juriste, ceux de l'espace (`CONNEXION.code`),
 *     un seul texte pour tout refus de code, quelle que soit la population ;
 *   — les réponses qui ne disent rien du compte (limite de demandes, service indisponible, adresse
 *     hors forme) : celles de l'espace (`CONNEXION.reponses`), le même texte que le compte existe
 *     ou non (REQ-SEC-003).
 *
 * Trois écarts avec la maquette, à déclarer dans la PR : le champ du code dit « Code reçu par
 * e-mail », sans chiffre en clair (RM-10), comme l'espace ; le compte à rebours du nouvel envoi n'est
 * pas rendu (aucune exigence de SEC-29 ne le porte) ; l'arrivée du lien, que la maquette ne dessine
 * pas, ne prend que des textes existants.
 */
import { CONNEXION } from '../espace/vocabulaire';

export const CONNEXION_CONSOLE = {
  marque: 'Console Axion Partners',
  champCourriel: 'Adresse e-mail professionnelle',
  aideDemande: 'Vous recevrez un lien et un code par e‑mail.',
  envoye: {
    titre: 'Regardez vos e-mails',
    phrase: 'Saisissez le code reçu, ou cliquez sur le lien.',
  },
  code: {
    champ: CONNEXION.code.champ,
    action: 'Se connecter',
    changer: 'Changer d’adresse',
    nouveauCode: 'Recevoir un nouveau code',
    refus: CONNEXION.code.refus,
    debit: CONNEXION.code.debit,
  },
  reponses: CONNEXION.reponses,
  dejaUtilise: {
    titre: 'Ce lien a déjà servi',
    phrase: 'Un lien ne sert qu’une fois. Demandez-en un nouveau.',
    action: 'Recevoir un nouveau lien',
  },
  // L'arrivée du lien (un formulaire de confirmation, rien n'est consommé à l'affichage) : la
  // maquette ne la dessine pas. Son titre est celui de l'état vide de l'écran ; son bouton, celui de
  // l'arrivée de l'espace. Aucun texte neuf.
  arriveeAction: CONNEXION.arrivee.action,
  chargement: {
    titre: 'Connexion en cours…',
    phrase: 'Vérification du code, puis ouverture de votre page.',
  },
  erreur: {
    titre: 'La demande n’est pas partie',
    phrase: 'Le réseau n’a pas répondu. Réessayez dans un instant.',
    action: 'Réessayer',
  },
  deconnexion: 'Se déconnecter',
  /**
   * Le courriel du lien de la console (gabarit `lien_magique_console`). Textes de la juriste du
   * 2026-10-03, mot pour mot : le sujet, l'appel, et la phrase propre à la console. La phrase du code
   * est celle de l'espace, reprise telle quelle par l'émetteur.
   */
  courriel: {
    sujet: 'Votre lien de connexion à la console',
    appel: 'Ouvrir la console',
    corps:
      'Ne transférez pas ce message : le lien et le code ouvrent la console à votre nom. Si vous n’avez pas demandé à vous connecter, ignorez-le.',
  },
} as const;
