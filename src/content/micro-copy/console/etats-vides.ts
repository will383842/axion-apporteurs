/**
 * L'état vide de chaque écran de la console (REQ-UX-019) — un titre, une phrase, une action
 * principale. Lu par Axion-IA seul : `gov:lexique` le juge à la portée du dépôt (REQ-GOV-017).
 *
 * LA LISTE DES ÉCRANS. Aucune carte des routes de la console n'existe encore : la seule liste
 * DÉCLARÉE est la section « Console » de `docs/maquettes/VALIDATION.md`, et la clé est le nom de
 * la maquette. Quand la matrice écran × rôle de SEC-17 (REQ-SEC-023) sera livrée, c'est d'elle que
 * la garde `ux-exhaustivite` dérivera les écrans de la console — et chacun lui devra un état vide.
 *
 * Base : les maquettes `file-qualification.html`, `lot-paiement.html`, et celles du cadre de la
 * console (UX-P1-18) : `console-cadre.html`, `connexion-console.html`, `acces-refuse.html`,
 * `utilisateurs-console.html`. Le vocabulaire des motifs
 * de blocage est celui du glossaire (« bloqué »), jamais celui de la paie.
 */
import type { EtatVide } from '../types';
import { MISE_EN_DEMEURE_CONSOLE } from './mise-en-demeure';
import { ANNULATION_APRES_CONFIRMATION_CONSOLE } from './annulation-apres-confirmation';

export const ETATS_VIDES_CONSOLE: Readonly<Record<string, EtatVide>> = {
  'file-qualification': {
    titre: 'Aucun dépôt à qualifier',
    phrase:
      'Les nouveaux dépôts arrivent ici, triés automatiquement. Les contestations en attente sont dans Contestations.',
    action: { libelle: 'Ouvrir les contestations', route: null },
  },
  'lot-paiement': {
    titre: 'Aucun relevé à payer ce mois-ci',
    phrase:
      'Les soldes du mois sont sous le seuil de versement, ou bloqués par un motif : ils seront repris au prochain lot.',
    action: { libelle: 'Voir les relevés bloqués', route: null },
  },
  'console-cadre': {
    titre: "Votre console s'ouvre bientôt",
    phrase:
      "Aucun écran de votre rôle n'est encore en service : la liste des apporteurs arrive la première, puis les lots de paiement avec les premiers versements. Rien n'est à faire d'ici là.",
    action: { libelle: 'Voir ce que permet votre rôle', route: null },
  },
  'acces-refuse': {
    titre: "Cette page n'est pas ouverte à votre rôle",
    phrase:
      'Si vous en avez besoin, un administrateur peut changer votre rôle. Votre accueil reste ouvert.',
    action: { libelle: 'Retour à mon accueil', route: null },
  },
  'connexion-console': {
    titre: 'Se connecter à la console',
    phrase: 'Un lien et un code vous sont envoyés par e-mail. Aucun mot de passe.',
    action: { libelle: 'Recevoir mon lien', route: null },
  },
  'utilisateurs-console': {
    titre: "Personne d'autre n'utilise la console",
    phrase:
      'Invitez la personne qui qualifiera les dépôts, ou celle qui tiendra les lots : c’est vous qui fixez son rôle.',
    action: { libelle: 'Inviter une personne', route: null },
  },
  'fiche-qualification': {
    titre: "Ce dépôt n'est plus à qualifier",
    phrase:
      'Le contact a répondu par e-mail, ou le dépôt a été qualifié. Les autres attendent dans la file.',
    action: { libelle: 'Revenir à la file', route: null },
  },
  apporteurs: {
    titre: 'Aucun apporteur pour l’instant',
    phrase: 'Les candidatures retenues apparaissent ici, avec leur dossier de conformité.',
    action: { libelle: 'Voir les candidatures', route: null },
  },
  'apporteur-fiche': {
    titre: 'Pas encore de dossier',
    phrase:
      'La candidature attend une décision ; le dossier de conformité s’ouvre quand elle est retenue.',
    action: { libelle: 'Décider de la candidature', route: null },
  },
  'attributions-contrats': {
    titre: 'Aucune attribution avec ces filtres',
    phrase: 'Aucune entreprise ne correspond à ces filtres.',
    action: { libelle: 'Effacer les filtres', route: null },
  },
  'fiche-prospect': {
    titre: 'Aucun échange noté',
    phrase: 'Rien n’est attendu ici : noter un échange est utile, jamais exigé.',
    action: { libelle: 'Ajouter un échange', route: null },
  },
  'grille-console': {
    titre: 'Aucune grille pour cet apporteur',
    phrase:
      'Partez d’un modèle : chaque ligne est pré-remplie avec la grille publiée, vous n’ajustez que ce qui diffère.',
    action: { libelle: 'Partir d’un modèle', route: null },
  },
  'saisie-manuelle-console': {
    titre: 'Une candidature reçue hors du site ?',
    phrase: 'Saisissez-la ici : elle suit ensuite le même parcours que les autres.',
    action: { libelle: 'Saisir une candidature', route: null },
  },
  // UX-P1-57 : l'apporteur hors contrat, qui ne reçoit pas de mise en demeure ; textes de l'écran.
  'mise-en-demeure': {
    titre: MISE_EN_DEMEURE_CONSOLE.horsContrat.titre,
    phrase: MISE_EN_DEMEURE_CONSOLE.horsContrat.phrase,
    action: { libelle: MISE_EN_DEMEURE_CONSOLE.horsContrat.action, route: null },
  },
  // UX-P1-63 : l'attribution introuvable ; textes de l'écran (juriste), le geste suivant est la fiche.
  'annulation-apres-confirmation': {
    titre: ANNULATION_APRES_CONFIRMATION_CONSOLE.refus.attribution_introuvable,
    phrase: ANNULATION_APRES_CONFIRMATION_CONSOLE.phrase,
    action: { libelle: ANNULATION_APRES_CONFIRMATION_CONSOLE.revenir, route: null },
  },
};
