/**
 * Le code NAF au dépôt (REQ-DM-046, HYP-W15-SECTEUR) — ce qui se décide sans base ni réseau.
 *
 * LE CODE EST CELUI QUE REND LE TIERS, ET RIEN D'AUTRE. Au dépôt, l'attribution porte
 * `activite_principale` de la fiche de l'entreprise (REQ-INT-021) — jamais le code NAF 2025 que le
 * tiers rend aussi, et que REQ-INT-021 n'énumère pas. Un dépôt en repli manuel n'a pas de fiche : son
 * code est NUL, jamais deviné, jamais saisi par l'apporteur. Une valeur hors forme reste nulle : on
 * ne tronque ni ne corrige ce que le tiers a rendu.
 *
 * LA FORME : deux chiffres, un point, puis un à trois chiffres ou lettres majuscules — six caractères
 * au plus, la largeur de la colonne. Elle couvre la nomenclature NAF rév. 2 (`70.10Z`) et les
 * nomenclatures plus anciennes que le tiers rend encore pour d'anciennes entreprises (`74.4B`,
 * `59.08`, relevés dans les fixtures enregistrées) : ce sont des codes rendus, gardés tels quels.
 */
const FORME_CODE_NAF = /^\d{2}\.[0-9A-Z]{1,3}$/;

/** Ce que le dépôt lit de l'entreprise : sa seule activité principale, ou rien (repli manuel). */
export type SourceDuCodeNaf = { readonly activite_principale: string | null } | null;

/** Le code NAF à stocker au dépôt : celui du tiers s'il a la forme, sinon nul. */
export function codeNafDuDepot(source: SourceDuCodeNaf): string | null {
  const code = source?.activite_principale ?? null;
  return code !== null && FORME_CODE_NAF.test(code) ? code : null;
}

/**
 * Le code à ÉCRIRE par la reprise, ou `null` s'il n'y a rien à écrire : un code déjà présent n'est
 * jamais écrasé, et un code nul n'est complété que par ce que le tiers a rendu.
 */
export function codeNafACompleter(existant: string | null, rendu: SourceDuCodeNaf): string | null {
  return existant !== null ? null : codeNafDuDepot(rendu);
}
