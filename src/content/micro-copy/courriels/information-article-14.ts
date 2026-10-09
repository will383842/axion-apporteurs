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
 *                                       la v6 emploie `{dureeApresDernierContact}` pour la
 *                                       prospection (décision de Williams du 2026-10-09 : la
 *                                       durée est comptée depuis le dernier contact) ;
 *   `{prestataireEnvoi}`, `{mentionTransfert}` — la fiche `docs/tiers/zeptomail.md` ;
 *   `{baseLegale}`                    — la base légale de TRT-TIERS, lue au registre des décisions. PROPOSITION
 *                                       A07, À TRANCHER par Williams : « l'intérêt légitime d'Axion-IA à donner
 *                                       suite aux présentations qui lui sont faites, après en avoir vérifié la
 *                                       réalité (article 6, paragraphe 1, point f du RGPD) ». Une autre décision
 *                                       change le texte et sa version ;
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

/**
 * JUR-T51 : la v6 nomme l'outil de relation client d'Axion-IA, la présentation de ses prestations,
 * sa base et sa durée, et l'opposition à toute prospection (textes d'A07 du 2026-10-04, PROPOSITION À VALIDER PAR
 * WILLIAMS, NON EN VIGUEUR). Seule une personne informée en v6 ou après peut être démarchée.
 */
export const VERSION_INFORMATION_ARTICLE_14 = 'information-article-14/v6';

/**
 * Le destinataire : le contact rencontré, jamais l'apporteur (liste `COURRIELS_AU_CONTACT` de
 * `gov:lexique`). Ce n'est pas un texte du bloc : la version ne change pas.
 */
export const DESTINATAIRE = 'contact';

/** Le libellé du lien d'opposition, posé par le gabarit de l'e-mail à la fin du bloc. */
export const LIEN_OPPOSITION = {
  libelle: "Ne plus recevoir aucun message ni appel d'Axion-IA",
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
    "Nous les utilisons pour donner suite à cette présentation et reprendre contact avec vous au sujet de {entreprise}, après vous avoir demandé de confirmer cet échange. Nous les conservons aussi dans notre outil de gestion de la relation client, pour vous présenter les prestations d'Axion-IA et gérer notre relation d'affaires avec {entreprise}. Une empreinte de votre adresse et de votre numéro nous sert aussi à éviter les doublons et à respecter votre opposition.",
  baseLegale:
    "Ce traitement repose sur {baseLegale}, et, pour la présentation de nos prestations, sur l'intérêt légitime d'Axion-IA à développer ses relations d'affaires avec des professionnels, au titre de votre fonction. Vous pouvez vous y opposer à tout moment.",
  destinataires:
    "Vos coordonnées ne sont accessibles qu'aux personnes d'Axion-IA chargées de ce suivi, de la présentation de ses prestations et du suivi de ses clients, ainsi qu'à {prestataireEnvoi}, notre prestataire d'envoi de courriels, et aux prestataires techniques qui hébergent nos outils. {prenomApporteur} {nomApporteur} est informé de la suite donnée à sa présentation. Vos données ne sont ni vendues ni cédées. {mentionTransfert}",
  duree:
    "Axion-IA conserve les coordonnées de votre entreprise, ainsi que vos nom et coordonnées professionnelles, pour vous présenter ses prestations, pendant {dureeApresDernierContact} après le dernier contact. Vous pouvez à tout moment vous opposer à nos messages et appels, ou demander l'effacement de vos données ; nous les mettons à jour ou les effaçons dès que nous apprenons qu'elles ne sont plus exactes, par exemple si vous changez de fonction. Si vous indiquez n'avoir eu aucun échange avec {prenomApporteur} {nomApporteur}, votre réponse et votre nom sont conservés {dureeDementi}, pour pouvoir l'établir en cas de contestation.",
  relance: "Ce message ne sera suivi d'aucune relance au sujet de cette demande de confirmation.",
  droits:
    'Vous pouvez accéder à vos données, les faire rectifier ou effacer, en demander la limitation, et vous opposer à leur traitement, en écrivant à {adresseDroits}, ou en ligne depuis la page ouverte par le lien ci-dessous. Vous pouvez aussi introduire une réclamation auprès de la CNIL.',
  opposition:
    'Pour vous opposer dès maintenant, un clic suffit : Axion-IA ne vous écrira plus et ne vous appellera plus, ni au sujet de cette présentation, ni pour vous présenter ses prestations, ni pour aucune autre raison commerciale.',
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
