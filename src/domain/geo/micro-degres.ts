/**
 * EXT-T08 — les coordonnées du siège en MICRO-DEGRÉS entiers (REQ-EXT-015), fonction pure.
 *
 * Le tiers rend `siege.latitude` et `siege.longitude` en WGS84, sous forme de CHAÎNES décimales
 * (vérification V2, A1-10 : aucune projection à faire). La base les garde en entiers de
 * micro-degrés (`latitude_microdeg`, `longitude_microdeg`, CHECK `attributions_coordonnees`).
 *
 * LA CONVERSION SE FAIT SUR LA CHAÎNE, jamais sur un flottant : la partie entière et les six premiers
 * chiffres de la partie décimale donnent l'entier, le septième l'arrondit au plus proche (une demie
 * s'éloigne de zéro). Une forme douteuse (exposant, virgule, espace, signe plus, chiffres manquants)
 * n'est pas devinée : elle rend NUL. Une valeur hors bornes aussi.
 */

/** Micro-degrés d'un degré : l'unité de la base. */
const MICRO_DEGRES_PAR_DEGRE = 1_000_000;
const CHIFFRES_DU_MICRO_DEGRE = 6;

/** Bornes en degrés, comprises. */
export const BORNE_LATITUDE = 90;
export const BORNE_LONGITUDE = 180;

/** Un signe moins facultatif, un à trois chiffres, puis, s'il y a un point, au moins un chiffre. */
const FORME = /^(-?)(\d{1,3})(?:\.(\d+))?$/;

export function versMicroDegres(
  texte: string | null | undefined,
  borneDegres: number
): number | null {
  if (texte === null || texte === undefined) return null;
  const m = FORME.exec(texte);
  if (!m) return null;
  const [, signe, entier, decimales = ''] = m;
  // La borne se juge sur la valeur EXACTE, avant l'arrondi : 90.0000001 n'est pas une latitude.
  const auDela =
    Number(entier) > borneDegres || (Number(entier) === borneDegres && /[1-9]/.test(decimales));
  if (auDela) return null;
  // Sous la borne, l'arrondi atteint au plus la borne elle-même (89.9999995 → 90 000 000) : il
  // n'existe pas de second contrôle à faire après lui.
  const six = decimales.slice(0, CHIFFRES_DU_MICRO_DEGRE).padEnd(CHIFFRES_DU_MICRO_DEGRE, '0');
  const arrondi = Number(decimales.charAt(CHIFFRES_DU_MICRO_DEGRE) || '0') >= 5 ? 1 : 0;
  const absolu = Number(entier) * MICRO_DEGRES_PAR_DEGRE + Number(six) + arrondi;
  return signe === '-' && absolu !== 0 ? -absolu : absolu;
}

export interface CoordonneesDuSiege {
  readonly latitudeMicrodeg: number | null;
  readonly longitudeMicrodeg: number | null;
}

/** La paire, ou rien : une seule coordonnée lisible ne donne aucune coordonnée (CHECK de la base). */
export function coordonneesDuSiege(
  latitude: string | null | undefined,
  longitude: string | null | undefined
): CoordonneesDuSiege {
  const lat = versMicroDegres(latitude, BORNE_LATITUDE);
  const lon = versMicroDegres(longitude, BORNE_LONGITUDE);
  return lat === null || lon === null
    ? { latitudeMicrodeg: null, longitudeMicrodeg: null }
    : { latitudeMicrodeg: lat, longitudeMicrodeg: lon };
}
