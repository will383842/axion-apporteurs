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
  /**
   * Les trois courriels de SEC-30 : textes de la juriste versés aux rattrapages 96 et 98, MOT POUR MOT. Les
   * durées vivent dans la SSOT, jamais en clair ; les dates sont à l'heure de Paris.
   */
  courriels: {
    /**
     * `admin_cree` — à TOUS les administrateurs actifs, auteur compris. Il NOMME la personne créée :
     * c'est le signal d'un abus (décision de la juriste, art. 5.1.c). Aucune autre donnée.
     */
    adminCree: {
      sujet: 'Un nouvel administrateur a été créé dans la console',
      // Arbitrage de la juriste (2026-10-04, au 97) : {identiteCree} et {identiteAuteur} valent
      // « Prénom Nom (adresse) » quand le nom existe, l'adresse seule sinon ; le mot que le GLOSSAIRE
      // interdit (§ des synonymes) devient « n'a aucun droit d'administrateur ».
      corps: (d: {
        identiteCree: string;
        identiteAuteur: string;
        dateHeure: string;
        secondAdministrateur: boolean;
      }) =>
        `${d.identiteCree} a reçu le rôle d'administrateur de la console d'Axion Partners. Ce compte a été créé par ${d.identiteAuteur}, le ${d.dateHeure}.` +
        (d.secondAdministrateur
          ? " Ce compte n'a aucun droit d'administrateur tant qu'un autre administrateur que son auteur ne l'a pas validé. Si vous n'attendiez pas ce compte, ne le validez pas, et désactivez-le depuis la console (Utilisateurs)."
          : '') +
        " Si vous ne reconnaissez pas cette création, prévenez aussitôt la direction d'Axion-IA : un administrateur a accès aux données des apporteurs et des contacts.",
      appel: 'Utilisateurs',
    },
    /**
     * `admin_reactive` — texte de la juriste versé au rattrapage 98, MOT POUR MOT. À TOUS les
     * administrateurs actifs, auteur compris : un administrateur réactivé repart en attente.
     * {identiteReactive} et {identiteAuteur} valent « Prénom Nom (adresse) », ou l'adresse seule à
     * défaut de nom ; la date est à l'heure de Paris. Aucune autre donnée.
     */
    adminReactive: {
      sujet: 'Un administrateur de la console a été réactivé',
      corps: (d: { identiteReactive: string; identiteAuteur: string; dateHeure: string }) =>
        `Le compte d'administrateur de ${d.identiteReactive} a été réactivé dans la console d'Axion Partners par ${d.identiteAuteur}, le ${d.dateHeure}. Ce compte n'a aucun droit d'administrateur tant qu'un autre administrateur que son auteur ne l'a pas validé. Si vous n'attendiez pas cette réactivation, ne la validez pas, et désactivez de nouveau le compte depuis la console (Utilisateurs). Si vous ne reconnaissez pas ce geste, prévenez aussitôt la direction d'Axion-IA : un administrateur a accès aux données des apporteurs et des contacts.`,
      appel: 'Utilisateurs',
    },
    /**
     * `invitation_console` — AUCUN lien de connexion : `adresseConnexion` est l'adresse de
     * `/console/connexion`, sans aucun jeton. Ni l'identité de l'administrateur qui invite, ni
     * d'autres rôles, ni aucune donnée d'apporteur.
     */
    invitation: {
      sujet: "Votre accès à la console d'Axion Partners",
      // JUR-T62 (textes finaux de la juriste, 4b731fb) : la page « Vos données dans la console » est
      // publiée ; la phrase revient, MOT POUR MOT, information individuelle préalable (art. L.1222-4).
      corps: (d: {
        libelleRole: string;
        adresseConnexion: string;
        dateExpiration: string;
        adressePolitique: string;
      }) =>
        `Axion-IA vous a ouvert un accès à la console d'Axion Partners, avec le rôle ${d.libelleRole}. Pour vous connecter, ouvrez ${d.adresseConnexion} et saisissez cette adresse e-mail : vous recevrez un lien et un code de connexion. Cette invitation expire le ${d.dateExpiration} ; passé ce délai, demandez une nouvelle invitation. Si vous n'attendiez pas ce message, ignorez-le. La façon dont Axion-IA traite vos données de connexion, dont le journal de vos accès, est décrite dans ${d.adressePolitique}.`,
      appel: 'Se connecter',
    },
  },
} as const;
