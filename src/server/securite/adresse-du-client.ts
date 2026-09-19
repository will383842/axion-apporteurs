/**
 * L'adresse réseau du client, lue là où le client ne peut pas l'écrire. (SEC-10, REQ-SEC-016)
 *
 * Chaque mandataire AJOUTE à droite de `X-Forwarded-For` l'adresse de celui qui lui parle. Tout
 * ce qui est à gauche du dernier mandataire de confiance a pu être écrit par le client lui-même :
 * le premier élément, en particulier, est celui que n'importe qui choisit. L'adresse est donc
 * l'élément situé à `sautsDeConfiance` positions depuis la DROITE — jamais le premier, jamais un
 * en-tête `X-Real-IP`, que le client peut envoyer aussi.
 *
 * Une adresse illisible rend `null`, et l'appelant la traite comme une panne du compteur, sous sa
 * conduite déclarée : jamais un seau commun que toutes les requêtes illisibles partageraient.
 */

import { isIP } from 'node:net';

/**
 * Le nombre de mandataires de confiance devant l'application : celui de la plateforme de
 * déploiement, seul. Valeur À MESURER sur la topologie déployée. Si elle est trop basse, les
 * requêtes tombent sur les adresses du mandataire et l'on limite trop (échec fermé) ; trop haute,
 * on lirait une valeur écrite par le client (échec ouvert). Le défaut est pris du côté fermé.
 */
export const SAUTS_DE_CONFIANCE = 1;

export function adresseDuClient(entetes: Headers, sautsDeConfiance: number): string | null {
  const brut = entetes.get('x-forwarded-for');
  if (brut === null) return null;
  const elements = brut.split(',').map((e) => e.trim());
  // Des sauts nuls, négatifs ou fractionnaires tombent hors du tableau : `undefined`, donc `null`.
  const candidat = elements[elements.length - sautsDeConfiance];
  if (candidat === undefined || isIP(candidat) === 0) return null;
  return candidat;
}
