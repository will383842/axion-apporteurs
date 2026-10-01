/**
 * L'information de l'article 14 du RGPD, due à la personne qu'un apporteur déclare (JUR-T09,
 * REQ-JUR-009, REQ-JUR-060). UN SEUL TEXTE : il est porté par l'e-mail de confirmation adressé à
 * cette personne (W20), et le script de qualification y renvoie pour les appels
 * (`../console/script-de-qualification.ts`). Il n'est recopié nulle part ailleurs (RM-01).
 *
 * LES PARAMÈTRES. Le texte ne porte aucune valeur : `{nom}` est rempli à l'envoi, depuis sa source.
 *   `{responsable}`, `{siege}`        — `config/entite.json` (W1), jamais retapés ;
 *   `{prenomApporteur}`, `{nomApporteur}` — l'apporteur déclarant, par ses prénom et nom, jamais
 *                                       par ses coordonnées (HYP-W20-IDENTITE-APPORTEUR) ;
 *   `{entreprise}`                    — la dénomination de l'entreprise déclarée ;
 *   `{dureeSansSuite}`, `{dureeApresDernierContact}` — les durées de purge du tiers (REQ-SEC-030,
 *                                       HYP-RGPD-RETENTION), rendues en toutes lettres à l'envoi ;
 *   `{prestataireEnvoi}`, `{mentionTransfert}` — la fiche `docs/tiers/zeptomail.md` ;
 *   `{adresseDroits}`                 — l'adresse d'exercice des droits, écrite en texte : l'e-mail ne
 *                                       porte aucun lien autre que les deux réponses et l'opposition
 *                                       (REQ-JUR-060).
 * Le lien d'opposition n'est pas un paramètre du texte : c'est l'un des trois liens de l'e-mail, posé
 * par son gabarit à l'endroit `LIEN_OPPOSITION`.
 *
 * CE QUE LE TEXTE NE DIT JAMAIS. La date du contact (REQ-JUR-040). Le délai de confirmation, ni ce
 * qu'il advient de l'attribution en l'absence de réponse : rien n'est demandé à la personne, et son
 * silence ne lui est opposé en rien (REQ-JUR-060 : « il ne demande rien d'autre qu'un clic »).
 *
 * LA VERSION. Toute modification d'un texte de ce fichier change `VERSION_INFORMATION_ARTICLE_14`,
 * et l'envoi journalise la version envoyée (REQ-JUR-060, INT-T40).
 */

export const VERSION_INFORMATION_ARTICLE_14 = 'information-article-14/v1';

/** Le libellé du lien d'opposition, posé par le gabarit de l'e-mail à la fin du bloc. */
export const LIEN_OPPOSITION = {
  libelle: 'Ne plus être contacté par Axion-IA au sujet de cette présentation',
} as const;

/**
 * Le bloc d'information, dans l'ordre où l'e-mail le rend. Chaque entrée répond à une rubrique de
 * l'article 14 (paragraphes 1 et 2) ; la clé dit laquelle.
 */
export const INFORMATION_ARTICLE_14 = {
  titre: 'Vos données personnelles',
  responsable:
    '{responsable}, {siege}, est responsable du traitement de vos coordonnées professionnelles (nom, fonction, adresse électronique et téléphone) et de votre réponse à ce message.',
  source:
    "Ces coordonnées nous ont été transmises par {prenomApporteur} {nomApporteur}, apporteur d'affaires indépendant, qui nous a présenté {entreprise} et indique avoir échangé avec vous.",
  finalite:
    "Nous les utilisons pour vérifier auprès de vous que cet échange a bien eu lieu, puis, le cas échéant, pour reprendre contact avec vous au sujet de {entreprise} et des prestations d'Axion-IA. Une empreinte de votre adresse et de votre numéro nous sert aussi à éviter les doublons et à respecter votre opposition.",
  baseLegale:
    "Ce traitement repose sur notre intérêt légitime à vérifier les présentations qui nous sont faites et à y donner suite (article 6, paragraphe 1, point f du RGPD). Vous pouvez vous y opposer à tout moment.",
  destinataires:
    "Vos coordonnées ne sont accessibles qu'aux personnes d'Axion-IA chargées de ce suivi et à {prestataireEnvoi}, notre prestataire d'envoi de courriels. {prenomApporteur} {nomApporteur} est informé de la suite donnée à sa présentation. Vos données ne sont ni vendues ni cédées. {mentionTransfert}",
  duree:
    "Elles sont supprimées {dureeSansSuite} après la fin de cette présentation si elle n'aboutit pas, et {dureeApresDernierContact} après notre dernier échange si {entreprise} devient cliente.",
  relance: "Ce message ne sera suivi d'aucune relance par courriel.",
  droits:
    "Vous pouvez accéder à vos données, les faire rectifier ou effacer, en demander la limitation, et vous opposer à leur traitement, en écrivant à {adresseDroits}. Vous pouvez aussi introduire une réclamation auprès de la CNIL.",
  opposition:
    "Pour vous opposer dès maintenant, un clic suffit : Axion-IA ne vous écrira plus et ne vous appellera plus au titre de cette présentation.",
} as const;

/** L'ordre de rendu du bloc — le gabarit de l'e-mail le suit, puis pose `LIEN_OPPOSITION`. */
export const ORDRE_INFORMATION_ARTICLE_14 = [
  'titre',
  'responsable',
  'source',
  'finalite',
  'baseLegale',
  'destinataires',
  'duree',
  'relance',
  'droits',
  'opposition',
] as const satisfies readonly (keyof typeof INFORMATION_ARTICLE_14)[];
