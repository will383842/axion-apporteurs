/**
 * UX-P1-62 (REQ-DM-043, REQ-UX-047) — « Écrire à Axion-IA », le noyau de l'écrit de l'apporteur.
 * Textes de la juriste (#319, 6038148824), MOT POUR MOT, recopiés par script : aucun délai chiffré
 * n'est promis (le fil reste en phase 3). `{date}` et `{heure}` sont l'horodatage POSÉ PAR LA BASE à
 * l'insertion, en heure de Paris ; la confirmation ne s'affiche qu'APRÈS l'écriture réussie.
 * `{max}` vient de la SSOT (`ECRIT_CARACTERES_MAX`).
 */
import { ACTIONS_COMMUNES } from './vocabulaire';

export const ECRIRE_A_AXION_IA = {
  // Le titre de la juriste EST le libellé commun de l'action : écrit une seule fois (REQ-UX-019).
  titre: ACTIONS_COMMUNES.ecrireAAxionIA.libelle,
  consigne:
    "Votre écrit est enregistré à la date de sa réception par Axion-IA. Pour contester une décision, dites laquelle et pourquoi. N'y indiquez ni mot de passe ni coordonnées bancaires.",
  champ: 'Votre message',
  borne: '{max} caractères au plus.',
  bouton: 'Envoyer',
  enCours: 'Envoi…',
  confirmation:
    'Votre écrit a été reçu le {date} à {heure}. Axion-IA vous répond par courrier électronique ; si vous contestez une décision, la réponse est motivée et vous parvient dans les délais prévus par le contrat.',
  erreurs: {
    messageVide: "Écrivez votre message avant de l'envoyer.",
    tropLong: 'Votre message dépasse {max} caractères : raccourcissez-le.',
    envoiEnEchec: "Votre écrit n'est pas parti et rien n'est enregistré : réessayez.",
  },
  // Le chargement et le retour : ceux de la maquette validée (docs/maquettes/aide.html).
  chargement: 'Chargement…',
  retour: ACTIONS_COMMUNES.retourAccueil,
  // Revenir au formulaire après une erreur : le libellé commun de l’action.
  reessayer: ACTIONS_COMMUNES.ecrireAAxionIA.libelle,
} as const;
