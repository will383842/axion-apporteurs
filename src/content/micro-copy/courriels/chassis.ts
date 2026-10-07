/**
 * UX-P1-64 — les textes du CHÂSSIS des courriels de Partners, recopiés du gabarit commun d'axion-ia
 * (`src/lib/email/templates/_layout.tsx`, lu en lecture seule ; exigence de Williams, #786 6039806330).
 * Seuls les textes du châssis vivent ici ; ceux de chaque courriel restent dans leur module.
 *
 * Les textes marqués « axion-ia » sont ceux du gabarit commun, mot pour mot : un apporteur ou une
 * entreprise qui reçoit un courriel d'axion-ia.com puis un courriel de Partners doit reconnaître la
 * même maison. Tous sont relus par la juriste (#819, 6042302938). Le lien d'opposition de la famille B
 * est SON libellé, celui de l'information de l'art. 14 (`LIEN_OPPOSITION`), pour n'avoir qu'une phrase.
 */
export const CHASSIS_DES_COURRIELS = {
  /** Partners : la ligne sous le logo (juriste, #819 6042302938 : « réseau » est interne). */
  accroche: "Le programme des apporteurs d'Axion-IA",
  /** axion-ia : le texte de remplacement du logo. */
  logoAlt: 'Axion-IA',
  /** axion-ia : le repli du bouton en texte brut (référentiel §3.8). */
  repliDuBouton: 'Le bouton ne fonctionne pas ? Copiez cette adresse :',
  /** axion-ia : la soupape de réponse, familles B et C (référentiel §4.3). */
  soupape:
    "Une question ? Répondez simplement à cet e-mail — il arrive directement chez nous, et c'est un humain qui lit.",
  /** axion-ia : le pied réduit de la famille A (référentiel §6.3). */
  envoiAutomatique:
    'Cet e-mail vous a été envoyé automatiquement suite à une action sur votre compte.',
  pasALOrigine: "Vous n'êtes pas à l'origine de cette demande ? Écrivez-nous :",
  /** axion-ia : le contact du pied complet. */
  contact: 'Contact :',
  droits: 'Tous droits réservés.',
  /** axion-ia (`legal-footer.ts`) : le rôle de la signature ; le nom se lit au registre de l'entité. */
  signatureRole: 'Fondateur & CEO · Axion-IA',
  /** axion-ia (`legal-footer.ts`) : l'adresse de contact du pied légal. */
  adresseDeContact: 'contact@axion-ia.com',
} as const;
