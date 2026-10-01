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
import { ACTIONS_COMMUNES } from './vocabulaire';

const RETOUR_ACCUEIL = ACTIONS_COMMUNES.retourAccueil;

export const ETATS_VIDES_ESPACE: Readonly<Record<string, EtatVide>> = {
  '/': {
    titre: 'Bienvenue dans votre espace',
    phrase:
      "Quand vous rencontrez une entreprise qui pourrait former ses salariés, vous pouvez taper son nom ci-dessous. Vous vérifiez qu'elle est libre, vous dites qui vous avez rencontré, et Axion-IA l'appelle. Si elle signe, vous touchez une commission.",
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
      "Elles apparaissent ici quand une entreprise que vous avez déposée signe, puis quand elle paie. Vous verrez alors ce que vous touchez, quand, et d'où vient chaque montant.",
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
  '/aide': {
    titre: 'Aucune conversation',
    phrase:
      'Vous pouvez écrire à Axion-IA quand vous le souhaitez. Axion-IA vous répond sous {delaiDeReponse}.',
    action: { ...ACTIONS_COMMUNES.ecrireAAxionIA, route: null },
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
    phrase: 'Rien n’est attendu ici : vous suivez les étapes d’Axion-IA dans la frise.',
    action: { libelle: 'Noter un échange', route: null },
  },
  '/profil/personnes': {
    titre: 'Personne n’agit pour vous',
    phrase:
      'Si quelqu’un rencontre des entreprises pour vous, déclarez-le ici : il sera proposé au moment du dépôt.',
    action: { libelle: 'Déclarer une personne', route: null },
  },
  '/mon-contrat': {
    titre: 'Votre contrat est en préparation',
    phrase:
      'Il est préparé quand vos pièces sont vérifiées. Vous le lirez ici avant de le signer ; rien n’est à faire d’ici là.',
    action: { libelle: 'Voir mes vérifications', route: '/conformite' },
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
};
