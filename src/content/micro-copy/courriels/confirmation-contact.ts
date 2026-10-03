/**
 * L'e-mail au contact rencontré (W20 : REQ-UX-061, REQ-JUR-060), ses textes seuls. L'envoi, son
 * journal et le drapeau de mise en service appartiennent à l'émetteur (INT-T40) ; le rendu (variables,
 * échappement, ligne de contexte, liens) à `src/domain/confirmation/rendu-du-courriel.ts`.
 *
 * TEXTE D'A07 DU 2026-10-02 (lot OPCO, D-OPCO-1), MOT POUR MOT : l'e-mail porte la présentation
 * d'Axion-IA, et il n'y a AUCUN second e-mail. Le ton d'ensemble est validé par Williams en séance de
 * maquettes (remarque du 2026-10-01, sans décision) : PROPOSITION jusque-là.
 *
 * RÈGLES, tenues par le rendu et ses témoins : trois liens et seulement eux (les deux réponses et
 * l'opposition) ; « récemment », jamais la date du contact (REQ-JUR-040) ; « apporteur d'affaires
 * indépendant », jamais un autre nom ; l'appel est PROPOSÉ, jamais annoncé ; le financement « peut
 * être financé […] selon votre éligibilité ». Le prénom et le nom de l'apporteur sont ceux de son
 * contrat signé, lus par l'émetteur, jamais une saisie libre.
 *
 * L'INFORMATION DE L'ART. 14 est celle de JUR-T09, importée et rendue ENTIÈRE, dans son ordre, avec
 * son lien d'opposition : aucun mot n'en est réécrit ni résumé ici.
 */
export {
  INFORMATION_ARTICLE_14,
  LIEN_OPPOSITION,
  ORDRE_INFORMATION_ARTICLE_14,
  VERSION_INFORMATION_ARTICLE_14,
} from './information-article-14';

/** Le destinataire : le contact rencontré, jamais l'apporteur (liste `COURRIELS_AU_CONTACT`). */
export const DESTINATAIRE = 'contact';

export const COURRIEL_DE_CONFIRMATION = {
  objet: '{prenomApporteur} {nomApporteur} nous a parlé de {entreprise}',
  salutation: 'Bonjour {prenomContact},',
  presentation:
    "{prenomApporteur} {nomApporteur}, apporteur d'affaires indépendant, nous indique avoir échangé avec vous récemment au sujet de {entreprise}, et pense que l'intelligence artificielle pourrait vous faire gagner du temps.",
  /** Ligne CONDITIONNELLE (ajout d'A07) : absente quand le contexte est vide. */
  contexte: 'Contexte indiqué par {prenomApporteur} : {contexte}',
  axionIa:
    'Axion-IA aide les entreprises à repérer ce qui peut être automatisé, à le mettre en place et à former leurs équipes.',
  financement:
    'Nos formations peuvent être financées par votre opérateur de compétences, selon votre éligibilité : nous vous accompagnons dans le montage du dossier.',
  question: 'Pour donner suite, pouvez-vous nous confirmer cet échange ?',
  oui: 'Oui, nous avons échangé',
  non: 'Non',
  appelPropose: 'Si vous le souhaitez, nous pourrons aussi vous appeler pour en parler.',
  /** Une personne d'Axion-IA, posée par l'émetteur depuis le registre de l'entité. */
  signature: '{prenomSignataire} {nomSignataire}',
} as const;

/** L'ordre du corps : le rendu le suit, puis rend l'information de l'art. 14 et la signature. */
export const ORDRE_DU_COURRIEL = [
  'salutation',
  'presentation',
  'contexte',
  'axionIa',
  'financement',
  'question',
  'oui',
  'non',
  'appelPropose',
] as const satisfies readonly (keyof typeof COURRIEL_DE_CONFIRMATION)[];
