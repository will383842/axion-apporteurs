/**
 * L'adresse réseau du client, lue là où le client ne peut pas l'écrire. (SEC-10, REQ-SEC-016)
 *
 * Chaque mandataire AJOUTE à droite de `X-Forwarded-For` l'adresse de celui qui lui parle. Tout
 * ce qui est à gauche du dernier mandataire de confiance a pu être écrit par le client lui-même :
 * le premier élément, en particulier, est celui que n'importe qui choisit. L'adresse est donc
 * l'élément situé à `sautsDeConfiance` positions depuis la DROITE — jamais le premier, jamais un
 * en-tête `X-Real-IP`, que le client peut envoyer aussi.
 *
 * CE QUI EST RENDU EST UN SUJET, PAS UNE ÉCRITURE. Une même machine ne doit pas valoir plusieurs
 * sujets : l'IPv4 mappée en IPv6 est rendue comme l'IPv4, et une IPv6 est rendue sous une forme
 * canonique (minuscules, zéros compressés) et REGROUPÉE par /64 — un client qui détient un /64
 * choisit librement les 64 bits bas de son adresse, et chacun serait sinon un compteur neuf.
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

/** Les 64 bits hauts d'une IPv6 : quatre mots de 16 bits. */
const MOTS_DU_PREFIXE = 4;

/** Les huit mots de 16 bits d'une IPv6 déjà reconnue par `isIP`, IPv4 terminale comprise. */
function motsIpv6(adresse: string): number[] | null {
  const demi = adresse.split('::');
  const lire = (partie: string): number[] =>
    partie === ''
      ? []
      : partie.split(':').flatMap((m) => {
          if (!m.includes('.')) return [parseInt(m, 16)];
          const [a = 0, b = 0, c = 0, d = 0] = m.split('.').map(Number);
          return [a * 256 + b, c * 256 + d];
        });
  const gauche = lire(demi[0] ?? '');
  const droite = demi.length === 2 ? lire(demi[1] ?? '') : [];
  const manquants = 8 - gauche.length - droite.length;
  const mots =
    demi.length === 2 ? [...gauche, ...Array<number>(manquants).fill(0), ...droite] : gauche;
  return mots.length === 8 && mots.every((m) => Number.isInteger(m) && m >= 0 && m <= 0xffff)
    ? mots
    : null;
}

/** RFC 5952 : minuscules, sans zéro de tête, la plus longue suite d'au moins deux zéros en `::`. */
function ecrireIpv6(mots: readonly number[]): string {
  let debut = -1;
  let longueur = 0;
  for (let i = 0; i < mots.length; i++) {
    let j = i;
    while (j < mots.length && mots[j] === 0) j++;
    if (j - i > longueur && j - i >= 2) {
      debut = i;
      longueur = j - i;
    }
    if (j > i) i = j - 1;
  }
  const hex = mots.map((m) => m.toString(16));
  if (debut < 0) return hex.join(':');
  return `${hex.slice(0, debut).join(':')}::${hex.slice(debut + longueur).join(':')}`;
}

function sujetIpv6(adresse: string): string | null {
  if (adresse.includes('%')) return null;
  const mots = motsIpv6(adresse.toLowerCase());
  if (mots === null) return null;
  const [, , , , , marque = -1, haut = 0, bas = 0] = mots;
  if (mots.slice(0, 5).every((m) => m === 0) && marque === 0xffff) {
    return [haut >> 8, haut & 0xff, bas >> 8, bas & 0xff].join('.');
  }
  const prefixe = [...mots.slice(0, MOTS_DU_PREFIXE), 0, 0, 0, 0];
  return `${ecrireIpv6(prefixe)}/64`;
}

export function adresseDuClient(entetes: Headers, sautsDeConfiance: number): string | null {
  const brut = entetes.get('x-forwarded-for');
  if (brut === null) return null;
  const elements = brut.split(',').map((e) => e.trim());
  // Des sauts nuls, négatifs ou fractionnaires tombent hors du tableau : `undefined`, donc `null`.
  const candidat = elements[elements.length - sautsDeConfiance];
  if (candidat === undefined) return null;
  const version = isIP(candidat);
  if (version === 4) return candidat;
  return version === 6 ? sujetIpv6(candidat) : null;
}
