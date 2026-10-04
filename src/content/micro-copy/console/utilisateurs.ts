/**
 * Les utilisateurs de la console (SEC-30, REQ-UX-048, REQ-UX-047, REQ-SEC-023), leurs textes seuls.
 * Textes de la maquette `docs/maquettes/utilisateurs-console.html` (UX-P1-18), repris mot pour mot.
 * Lu par les administrateurs de la console seuls.
 *
 * LA PHRASE DE CHAQUE RÔLE dit en une phrase ce qu'il voit et ce qu'il ne voit jamais : elle DÉRIVE du
 * glossaire (`docs/GLOSSAIRE.md` §7), elle ne le remplace pas.
 *
 * Écarts avec la maquette, à déclarer dans la PR :
 *   — la confirmation d'une désactivation ne nomme pas le nombre de chiffres du code (RM-10), comme
 *     la connexion ;
 *   — l'état d'un administrateur EN ATTENTE de validation (quatre yeux, HYP-W19-QUATRE-YEUX) et son
 *     bouton « Valider » n'y sont pas dessinés : leurs textes sont neufs, courts, et attendent la
 *     validation de la maquette ;
 *   — la date d'échéance d'une invitation se rend au fuseau de l'affichage.
 */
export const UTILISATEURS_CONSOLE = {
  titre: 'Utilisateurs de la console',
  inviter: 'Inviter une personne',
  compte: (n: number) => `Personnes ayant accès à la console : ${n}`,
  colonnes: {
    personne: 'Personne',
    role: 'Rôle',
    etat: 'État',
    derniereConnexion: 'Dernière connexion',
    actions: 'Actions',
  },
  vous: '(vous)',
  sonPropreCompte: 'Votre propre compte : un autre administrateur le modifie',
  etats: {
    actif: 'Actif',
    desactive: 'Désactivé',
    invite: (echeance: string) => `Invitation envoyée · expire le ${echeance}`,
    invitationExpiree: 'Invitation expirée',
    enAttente: 'Administrateur en attente de validation',
  },
  jamaisConnecte: '—',
  actions: {
    changerRole: 'Changer le rôle',
    desactiver: 'Désactiver',
    reactiver: 'Réactiver',
    renvoyer: 'Renvoyer l’invitation',
    valider: 'Valider l’administrateur',
  },
  /** Le nom de la personne, ajouté au libellé lu par un lecteur d'écran. */
  pourQui: {
    changerRole: (nom: string) => `de ${nom}`,
    renvoyer: (nom: string) => `à ${nom}`,
  },
  invitation: {
    titre: 'Inviter une personne',
    champCourriel: 'Adresse e-mail professionnelle',
    champRole: 'Rôle',
    roleChangeable: 'Le rôle pourra être changé ensuite.',
    envoyer: 'Envoyer l’invitation',
    annuler: 'Annuler',
  },
  /** GLOSSAIRE §7, en une phrase par rôle : ce qu'il voit, ce qu'il ne voit jamais. */
  roles: {
    admin:
      'Tout, y compris les gestes sensibles : lever un gel, suspendre, exporter les cumuls annuels. Chaque geste sensible est journalisé.',
    qualifieur:
      'La file et la fiche de qualification, le rattachement motivé. Jamais l’argent ni les coordonnées bancaires.',
    comptable:
      'Les lots, relevés, autofactures, rapprochements et exports comptables. Jamais la qualification.',
    lecteur:
      'La consultation des écrans de pilotage, sans facturation ni coordonnées. Aucune écriture.',
  },
  desactivation: {
    question: (nom: string) => `Désactiver ${nom} ?`,
    phrase: 'Sa session se ferme tout de suite. Vous pourrez réactiver le compte plus tard.',
    code: 'Pour confirmer, le code que vous venez de recevoir',
    confirmer: 'Désactiver',
    garder: 'Garder le compte',
    faite: {
      titre: (nom: string) => `Le compte de ${nom} est désactivé`,
      phrase: 'Sa session est fermée. Le geste est inscrit au journal, avec votre nom et l’heure.',
    },
    erreur: {
      titre: 'La désactivation n’a pas été enregistrée',
      phrase: 'Le compte est toujours actif. Réessayez.',
      action: 'Recommencer',
    },
  },
  sonPropreRole: {
    titre: 'Votre propre rôle ne se change pas ici',
    phrase: 'Seul un autre administrateur peut changer votre rôle.',
  },
  vide: {
    titre: 'Personne d’autre n’utilise la console',
    phrase: 'Invitez une personne et choisissez son rôle.',
    action: 'Inviter une personne',
  },
  chargement: 'Chargement des utilisateurs…',
} as const;
