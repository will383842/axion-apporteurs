/**
 * Le code NAF au dépôt (REQ-DM-046, HYP-W15-SECTEUR) — ce qui se décide sans base ni réseau.
 *
 * LE CODE EST CELUI QUE REND LE TIERS, ET RIEN D'AUTRE. Au dépôt, l'attribution porte
 * `activite_principale` de la fiche de l'entreprise (REQ-INT-021) — jamais le code NAF 2025 que le
 * tiers rend aussi, et que REQ-INT-021 n'énumère pas. Un dépôt en repli manuel n'a pas de fiche : son
 * code est NUL, jamais deviné, jamais saisi par l'apporteur. Une valeur hors forme reste nulle : on
 * ne tronque ni ne corrige ce que le tiers a rendu.
 *
 * LA FORME : la nomenclature NAF rév. 2 seule (REQ-DM-046), `NN.NNL` — la MÊME que le CHECK
 * `attributions_code_naf_forme` de la base (DM-07). Le tiers rend encore, pour d'anciennes
 * entreprises, des codes d'une nomenclature antérieure (`74.4B`, `59.08`, relevés dans les fixtures
 * enregistrées) : ils ne sont ni traduits ni devinés, le code reste NUL (« non renseigné »).
 */
const FORME_CODE_NAF = /^\d{2}\.\d{2}[A-Z]$/;

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
