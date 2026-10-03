/**
 * DM-09 — la Qualification, domaine pur (REQ-DM-008, REQ-DM-009, REQ-CPL-024). Aucune I/O, aucune
 * horloge : les issues arrivent horodatées, la version arrive lue.
 *
 *   — REQ-DM-008 : seul `non_confirme` (le représentant indique EXPRESSÉMENT n'avoir eu aucun échange)
 *     éteint l'attribution et ouvre l'article 3.7 ; `injoignable` et `ne_se_souvient_pas` la
 *     maintiennent, sans rien imputer à personne ;
 *   — REQ-DM-009 : le taux de confirmation se dérive des `FENETRE_DU_TAUX` dernières issues DÉCISIVES
 *     d'APPORTEURS (W19 : une prise en charge par la Société n'y entre pas) ; une confirmation par clic
 *     du contact (DM-41) compte comme `confirme`, un « Non » confirmé comme `non_confirme` — l'appelant
 *     les verse sous ces résultats. Aucun compteur n'est stocké. La table taux → palier n'est écrite
 *     nulle part : elle n'est PAS dérivée ici (question ouverte, issue de DM-09) ;
 *   — le nombre d'« injoignable » d'une attribution est dérivé du compte des qualifications ;
 *   — REQ-CPL-024 : verrou optimiste, une version périmée est rejetée avec l'état courant.
 */

export type ResultatContact = 'confirme' | 'non_confirme' | 'injoignable' | 'ne_se_souvient_pas';

/** Une issue retenue pour le taux : son résultat, son horodatage (ms UTC), la nature du porteur. */
export type IssueRetenue = {
  readonly resultat: ResultatContact;
  readonly a: number;
  readonly porteur: 'apporteur' | 'societe';
};

export type EffetDuResultat = {
  readonly attribution: 'eteinte' | 'confirmee' | 'maintenue';
  readonly article37: boolean;
};

/** La fenêtre glissante du taux de confirmation (REQ-DM-009, texte de l'exigence). */
export const FENETRE_DU_TAUX = 10;

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

/**
 * Le taux de confirmation : la part de `confirme` parmi les `FENETRE_DU_TAUX` dernières issues
 * décisives d'apporteurs. `null` s'il n'y en a aucune : pas de taux, jamais un zéro inventé.
 */
export function tauxDeConfirmation(issues: readonly IssueRetenue[]): number | null {
  const fenetre = issues
    .filter((i) => i.porteur === 'apporteur')
    .filter((i) => i.resultat === 'confirme' || i.resultat === 'non_confirme')
    .slice()
    .sort((x, y) => y.a - x.a)
    .slice(0, FENETRE_DU_TAUX);
  if (fenetre.length === 0) return null;
  return fenetre.filter((i) => i.resultat === 'confirme').length / fenetre.length;
}

/** Le nombre de qualifications « injoignable » d'une attribution : dérivé, jamais stocké. */
export function injoignablesDe(issues: readonly Pick<IssueRetenue, 'resultat'>[]): number {
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
