/**
 * L'état vide de chaque écran de l'espace (REQ-UX-019) — un titre, une phrase, une action
 * principale. Une clé par route de `docs/ESPACE-ROUTES.md`, la carte unique : la garde
 * `ux-exhaustivite` relit la carte et refuse un écran sans état vide, comme un état vide sans écran.
 *
 * Lu par l'apporteur : jugé par `gov:lexique` à la portée la plus stricte, commentaires compris.
 * Base : les maquettes validées, corrigées par la relecture juridique du 2026-09-19 (« former ses
 * salariés » ; « vous pouvez taper son nom » plutôt qu'un impératif ; « chaque étape s'affiche »
 * plutôt que « vous suivez » ; sur « Mes commissions » vide, le retour à l'accueil passe devant le
 * dépôt, pour ne pas lier l'absence de commission à un appel au volume).
 *
 * « Mes entreprises » vide mène au premier dépôt (REQ-UX-019, famille `premier_depot_non_guide`).
 */
import { TERMES_CANONIQUES } from '../../../domain/lexique/lexique-interdit';
import type { EtatVide } from '../types';
import { ACTIONS_COMMUNES, CONTESTATION } from './vocabulaire';
import { ECRIRE_A_AXION_IA } from './aide';

const RETOUR_ACCUEIL = ACTIONS_COMMUNES.retourAccueil;

export const ETATS_VIDES_ESPACE: Readonly<Record<string, EtatVide>> = {
  '/': {
    titre: 'Bienvenue dans votre espace',
    phrase:
      "Quand vous rencontrez une entreprise qui pourrait former ses salariés, vous pouvez taper son nom ci-dessous. Vous vérifiez qu'elle est libre, vous dites qui vous avez rencontré, et Axion-IA l'appelle. Si elle passe commande pendant la durée de votre droit à commission, une commission vous revient au fil des paiements.",
    action: { libelle: 'Vérifier', route: '/entreprise?q=' },
  },
  '/mes-entreprises': {
    titre: 'Vos entreprises apparaîtront ici',
    phrase:
      "Quand vous déposez une entreprise, chaque étape s'affiche ici : l'appel d'Axion-IA, le rendez-vous, la signature.",
    action: ACTIONS_COMMUNES.deposerUneEntreprise,
  },
  '/mes-commissions': {
    titre: 'Pas encore de commission',
    phrase:
      "Elles apparaissent ici quand une entreprise que vous avez déposée signe, puis à chaque paiement. Vous verrez alors ce qui vous revient, quand, et d'où vient chaque montant.",
    action: RETOUR_ACCUEIL,
  },
  '/plus': {
    titre: 'Le reste de votre espace',
    phrase:
      "Vos documents, votre conformité, votre profil, les ressources et l'aide se trouvent ici.",
    action: RETOUR_ACCUEIL,
  },
  '/entreprise?q=': {
    titre: 'Aucune entreprise trouvée',
    phrase:
      'Pour « {recherche} ». Vous pouvez essayer avec moins de mots, ou seulement le nom. Vous pouvez aussi donner son nom, sa ville et son code postal : Axion-IA la retrouvera.',
    action: { libelle: "Je ne trouve pas l'entreprise", route: '/deposer' },
  },
  '/deposer': {
    titre: ACTIONS_COMMUNES.deposerUneEntreprise.libelle,
    phrase: "Dès que vous tapez son nom, les entreprises s'affichent sous le champ.",
    action: ACTIONS_COMMUNES.envoyerLeDepot,
  },
  '/d/<jeton>': {
    titre: ACTIONS_COMMUNES.deposerUneEntreprise.libelle,
    phrase:
      "Ce lien sert seulement à déposer une entreprise. Dès que vous tapez son nom, les entreprises s'affichent sous le champ.",
    action: ACTIONS_COMMUNES.envoyerLeDepot,
  },
  '/documents': {
    titre: 'Aucun document pour le moment',
    phrase: `Votre contrat, chaque ${TERMES_CANONIQUES.documentMensuel}, chaque ${TERMES_CANONIQUES.documentLegal} et le ${TERMES_CANONIQUES.documentAnnuel} apparaîtront ici.`,
    action: RETOUR_ACCUEIL,
  },
  '/filleuls': {
    titre: 'Pas encore de montant de parrainage',
    phrase:
      "Si vous le souhaitez, vous pouvez partager votre lien de parrainage. Le montant qui vous en revient s'affichera ici, mois par mois.",
    action: { libelle: 'Partager mon lien de parrainage', route: null },
  },
  '/conformite': {
    titre: 'Aucune pièce déposée',
    phrase:
      'Chaque pièce s’affiche ici avec son état, et ce qu’elle change pour vos versements. Vous pouvez les envoyer quand vous le souhaitez.',
    action: { libelle: 'Envoyer une pièce', route: null },
  },
  '/profil': {
    titre: 'Votre profil',
    phrase:
      'Votre adresse électronique, votre RIB et vos préférences de notification se règlent ici.',
    action: { libelle: 'Modifier mon profil', route: null },
  },
  '/activite': {
    titre: 'Rien à afficher pour le moment',
    phrase: "Vos entreprises déposées et vos commissions s'afficheront ici, en chiffres simples.",
    action: RETOUR_ACCUEIL,
  },
  '/ressources': {
    titre: 'Aucune ressource pour le moment',
    phrase: 'Des documents mis à votre disposition, à consulter librement, apparaîtront ici.',
    action: RETOUR_ACCUEIL,
  },
  // UX-P1-62 : le premier écrit. L'ancien texte promettait un délai chiffré ; la juriste le REMPLACE
  // (#319, 6038148824) : aucun délai n'est promis, la consigne de l'écran tient lieu d'état vide.
  '/aide': {
    titre: ECRIRE_A_AXION_IA.titre,
    phrase: ECRIRE_A_AXION_IA.consigne,
    action: { libelle: ECRIRE_A_AXION_IA.bouton, route: null },
  },
  '/connexion': {
    titre: 'Se connecter',
    phrase:
      'Votre adresse électronique suffit : si elle est connue, un lien de connexion vous est envoyé.',
    action: { libelle: 'Recevoir un lien de connexion', route: null },
  },
  '/connexion/<jeton>': {
    titre: 'Ce lien a déjà servi',
    phrase: 'Un lien de connexion ne sert qu’une fois. Un nouveau lien peut vous être envoyé.',
    action: { libelle: "M'envoyer un nouveau lien", route: null },
  },
  // UX-P1-45 : les états vides des écrans trouvés sans maquette, repris de leur maquette.
  '/mes-entreprises/<id>': {
    titre: 'Aucun échange noté',
    phrase: 'Rien n’est attendu ici : les étapes d’Axion-IA s’affichent dans la frise.',
    action: { libelle: 'Noter un échange', route: null },
  },
  '/profil/personnes': {
    titre: 'Personne n’agit pour vous',
    phrase:
      'Si quelqu’un rencontre des entreprises pour vous, vous pouvez le déclarer ici. Seules vos propres rencontres et celles des personnes déclarées permettent de réserver une entreprise pour vous.',
    action: { libelle: 'Déclarer une personne', route: null },
  },
  '/mon-contrat': {
    titre: 'Votre contrat est en préparation',
    phrase:
      'Il est préparé quand vos pièces sont vérifiées. Vous le lirez ici avant de le signer ; rien n’est à faire d’ici là.',
    action: { libelle: 'Voir mes vérifications', route: '/conformite' },
  },
  // UX-P1-51 : une contestation qui n'est pas (ou plus) la sienne ; le geste suivant, ses entreprises.
  '/contestations/[id]': {
    titre: CONTESTATION.indisponible.titre,
    phrase: CONTESTATION.indisponible.phrase,
    action: CONTESTATION.indisponible.action,
  },
  '/notifications': {
    titre: 'Aucune notification',
    phrase:
      'Les nouvelles de vos entreprises apparaîtront ici. Rien n’est à consulter régulièrement : les avis importants arrivent aussi par e-mail.',
    action: RETOUR_ACCUEIL,
  },
  // JUR-T34 : la politique se lit dans le registre ; vide, c'est qu'aucun destinataire n'y est nommé.
  '/confidentialite': {
    titre: 'Aucun destinataire nommé',
    phrase:
      'Le registre des traitements ne nomme encore aucun prestataire ni organisme qui reçoive vos données.',
    action: RETOUR_ACCUEIL,
  },
  // UX-P1-40 (W20) : la page du contact ; vide, c'est un lien inconnu ou expiré — un seul texte, sans oracle.
  '/confirmer/<jeton>': {
    titre: 'Ce lien n’est plus valable',
    phrase:
      'Il a peut-être déjà servi, ou il est trop ancien. Axion-IA reste joignable par écrit si besoin.',
    action: { libelle: 'Contacter Axion-IA', route: null },
  },
};
