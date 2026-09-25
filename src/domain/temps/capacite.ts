/**
 * CPL-T13 — la capacité RÉELLE de qualification sur une période (REQ-CPL-026 : « jours ouvrés ×
 * qualifieurs disponibles, calendrier d'absence »).
 *
 * capacité = Σ, sur chaque jour OUVRÉ de la période (bornes comprises), du nombre de qualifieurs
 * non absents ce jour-là, multiplié par la capacité par qualifieur et par jour.
 *
 * Les périodes et les absences sont des dates civiles de Paris, BORNES COMPRISES (« du 1er au
 * 31 mai »). Deux absences d'un même qualifieur qui se chevauchent ne le retirent qu'une fois. Ce
 * module fournit la capacité ; le seuil de vérification prioritaire qui s'en dérive est
 * `src/domain/attribution/seuil-prioritaire.ts`.
 */
import { joursDeLaDate, type DateCivile } from './calendrier-civil';
import { ErreurTemps } from './erreurs';
import { CALENDRIER_FERIES_FR, jourOuvre, type CalendrierFeries } from './feries';

export interface Absence {
  readonly du: DateCivile;
  readonly au: DateCivile;
}

export interface Qualifieur {
  readonly absences: readonly Absence[];
}

export interface PeriodeDeCapacite {
  readonly du: DateCivile;
  readonly au: DateCivile;
  readonly qualifieurs: readonly Qualifieur[];
  readonly capaciteParQualifieurEtParJour: number;
}

/** Les numéros de jour [premier, dernier] d'un intervalle de dates, bornes comprises. */
function intervalle({ du, au }: Absence): [number, number] {
  const premier = joursDeLaDate(du);
  const dernier = joursDeLaDate(au);
  if (dernier < premier) {
    throw new ErreurTemps(
      'intervalle_inverse',
      `${au.annee}-${au.mois}-${au.jour} antérieur à ${du.annee}-${du.mois}-${du.jour}`
    );
  }
  return [premier, dernier];
}

export function capaciteSurPeriode(
  periode: PeriodeDeCapacite,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): number {
  const parJour = periode.capaciteParQualifieurEtParJour;
  if (!Number.isInteger(parJour) || parJour < 0) {
    throw new ErreurTemps('capacite_invalide', `${parJour} n'est pas un entier >= 0`);
  }
  const [premier, dernier] = intervalle(periode);
  const absences = periode.qualifieurs.map((q) => q.absences.map(intervalle));
  let total = 0;
  for (let numero = premier; numero <= dernier; numero++) {
    if (jourOuvre(numero, calendrier)) {
      const presents = absences.filter(
        (liste) => !liste.some(([du, au]) => numero >= du && numero <= au)
      ).length;
      total += presents * parJour;
    }
  }
  return total;
}
