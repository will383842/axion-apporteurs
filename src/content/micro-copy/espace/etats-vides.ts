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

const RETOUR_ACCUEIL = { libelle: "Retour à l'accueil", route: '/' } as const;

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
    action: { libelle: 'Déposer une entreprise', route: '/deposer' },
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
    titre: 'Déposer une entreprise',
    phrase: "Dès que vous tapez son nom, les entreprises s'affichent sous le champ.",
    action: { libelle: 'Envoyer le dépôt', route: null },
  },
  '/d/<jeton>': {
    titre: 'Déposer une entreprise',
    phrase:
      "Ce lien sert seulement à déposer une entreprise. Dès que vous tapez son nom, les entreprises s'affichent sous le champ.",
    action: { libelle: 'Envoyer le dépôt', route: null },
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
    action: { libelle: 'Écrire à Axion-IA', route: null },
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
};
