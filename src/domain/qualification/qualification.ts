/**
 * DM-09 — la Qualification, domaine pur (REQ-DM-008, REQ-CPL-024). Aucune I/O, aucune
 * horloge : les issues arrivent horodatées, la version arrive lue.
 *
 *   — REQ-DM-008 : seul `non_confirme` (le représentant indique EXPRESSÉMENT n'avoir eu aucun échange)
 *     éteint l'attribution et ouvre l'article 3.7 ; `injoignable` et `ne_se_souvient_pas` la
 *     maintiennent, sans rien imputer à personne ;
 *   — le taux de confirmation et le palier PAR APPORTEUR (REQ-DM-009, REQ-DM-010) ne sont PAS dérivés ici :
 *     la juriste les juge contraires au contrat (art. 3.2 al. 4, 3.3 bis, 3.7 al. 3), question posée à
 *     Williams (coordination, 2026-10-03) ;
 *   — le nombre d'« injoignable » d'une attribution est dérivé du compte des qualifications ;
 *   — REQ-CPL-024 : verrou optimiste, une version périmée est rejetée avec l'état courant.
 */

export type ResultatContact = 'confirme' | 'non_confirme' | 'injoignable' | 'ne_se_souvient_pas';

export type EffetDuResultat = {
  readonly attribution: 'eteinte' | 'confirmee' | 'maintenue';
  readonly article37: boolean;
};

/** L'effet d'un résultat de contact sur l'attribution qualifiée. */
export function effetDuResultat(resultat: ResultatContact): EffetDuResultat {
  switch (resultat) {
    case 'non_confirme':
      return { attribution: 'eteinte', article37: true };
    case 'confirme':
      return { attribution: 'confirmee', article37: false };
    case 'injoignable':
    case 'ne_se_souvient_pas':
      return { attribution: 'maintenue', article37: false };
  }
}

/** Le nombre de qualifications « injoignable » d'UNE attribution : dérivé, jamais stocké. */
export function injoignablesDe(issues: readonly { readonly resultat: ResultatContact }[]): number {
  return issues.filter((i) => i.resultat === 'injoignable').length;
}

export type JugementDeVersion =
  | { readonly ok: true }
  | { readonly ok: false; readonly motif: 'version_perimee'; readonly courante: number };

/** Le verrou optimiste : la version attendue doit être la version courante. */
export function jugerLaVersion(v: { attendue: number; courante: number }): JugementDeVersion {
  return v.attendue === v.courante
    ? { ok: true }
    : { ok: false, motif: 'version_perimee', courante: v.courante };
}
