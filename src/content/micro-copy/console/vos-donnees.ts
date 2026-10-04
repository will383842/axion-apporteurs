/**
 * « Vos données dans la console » (JUR-T61, REQ-JUR-068) : les TITRES et les PHRASES de l'écran,
 * seulement. Le contenu vient du registre de l'article 30, bloc TRT-CONSOLE, lu par
 * `src/domain/rgpd/politique-console.ts` ; aucune durée, aucun prestataire n'est écrit ici. Titres
 * d'après le brouillon de la juriste (2026-10-04). Lu par les utilisateurs de la console, avant toute
 * connexion.
 */
export const VOS_DONNEES_CONSOLE = {
  titre: 'Vos données dans la console',
  phrase:
    'Axion-IA traite quelques données vous concernant pour vous donner accès à la console d’Axion Partners. Cette page vous dit lesquelles, pourquoi, combien de temps, et quels sont vos droits. Chaque information vient du registre des traitements d’Axion-IA.',
  rubriques: {
    finalite: 'Pourquoi',
    baseLegale: 'Sur quelle base',
    donnees: 'Quelles données',
    origine: 'D’où viennent ces données',
    duree: 'Combien de temps',
    destinataires: 'Qui y a accès',
    transferts: 'Hors de l’Union européenne',
    droits: 'Vos droits',
  },
  /**
   * Art. 13 (juriste, 2026-10-04) : l'identité et les coordonnées du responsable, LUES dans
   * `config/entite.json` par `entiteContractante`, jamais retapées ; puis le caractère obligatoire,
   * mot pour mot.
   */
  responsable: {
    titre: 'Qui en est responsable',
    phrase: (d: { denomination: string; siege: string }) =>
      `${d.denomination}, ${d.siege}, est responsable du traitement de ces données.`,
    // Juriste, mot pour mot : le siège est la coordonnée ; aucune adresse électronique n'est inventée.
    contact:
      'Pour toute question sur vos données, ou pour exercer vos droits, écrivez-lui à cette adresse.',
  },
  obligatoire:
    "L'adresse électronique est nécessaire pour vous donner accès à la console : sans elle, aucun accès ne peut être ouvert.",
  // Un passage que le registre ne tranche pas encore : aucune question interne n'est lue.
  aCompleter: 'En cours de rédaction',
  // Tant qu'un passage reste en cours de rédaction, la page le dit en tête : elle n'est pas en vigueur.
  enProposition:
    'Cette page est en cours de rédaction : certains passages attendent encore une décision.',
  erreur: {
    titre: 'La page ne s’affiche pas',
    phrase: 'Cette page n’a pas pu être affichée. Réessayez un peu plus tard.',
    action: 'Réessayer',
  },
} as const;
