/**
 * CPL-T13 — l'heure LÉGALE de Paris, calculée par la règle européenne (REQ-CPL-013 ; arbitrages T2
 * et T3 du brief de la tâche).
 *
 * LA RÈGLE, ET POURQUOI ELLE EST CODÉE. Heure d'hiver UTC+1, heure d'été UTC+2 ; le passage à
 * l'heure d'été a lieu le DERNIER dimanche de mars à 01:00 UTC, le retour le DERNIER dimanche
 * d'octobre à 01:00 UTC (directive 2000/84/CE, appliquée en France depuis 1996). Elle est codée ici
 * plutôt que lue dans la base de fuseaux du moteur, parce que cette base est une entrée CACHÉE : un
 * résultat qui change avec la version du moteur n'est pas une fonction pure. Le test la confronte
 * à cette base pour chaque heure de 2026 à 2040, et autour de chaque changement de 1996 à 2099.
 *
 * LES DEUX CAS SANS RÉPONSE UNIQUE (heure légale → instant).
 *   — Printemps, 02:00-02:59 n'existe pas : l'heure est DÉCALÉE APRÈS LE SAUT, de la durée du saut
 *     (02:30 → 03:30).
 *   — Automne, 02:00-02:59 existe deux fois : la PREMIÈRE occurrence (heure d'été) est rendue.
 *
 * LES BORNES. Années civiles de Paris 1996 à 2099 : de 1995-12-31T23:00Z inclus à
 * 2099-12-31T23:00Z exclu. Hors de là, levée `hors_calendrier` qui nomme l'instant. Si l'Union
 * abolit le changement d'heure, c'est une nouvelle version de ce module, pas un correctif discret.
 *
 * « LOCAL » désigne ici l'heure légale de Paris écrite comme un nombre de millisecondes depuis
 * l'époque, comme si Paris était en UTC : une valeur de CALCUL, jamais stockée ni échangée.
 */
import {
  ANNEE_MAX,
  ANNEE_MIN,
  MS_PAR_HEURE,
  MS_PAR_JOUR,
  MS_PAR_MINUTE,
  dateDepuisJours,
  joursDeLaDate,
  joursDepuisEpoque,
  jourDeSemaine,
  type DateCivile,
} from './calendrier-civil';
import { ErreurTemps } from './erreurs';
import { verifierInstant, type Instant } from './horloge';

export interface DateHeureParis extends DateCivile {
  readonly heure: number;
  readonly minute: number;
  readonly seconde: number;
  readonly milliseconde: number;
}

const DECALAGE_HIVER = MS_PAR_HEURE;
const DECALAGE_ETE = 2 * MS_PAR_HEURE;
/** Les deux changements ont lieu à 01:00 UTC. */
const HEURE_UTC_DU_CHANGEMENT = MS_PAR_HEURE;
const MARS = 3;
const OCTOBRE = 10;

/** Premier instant de l'année ANNEE_MIN à Paris, et premier instant APRÈS l'année ANNEE_MAX. */
const PREMIER_INSTANT =
  joursDepuisEpoque({ annee: ANNEE_MIN, mois: 1, jour: 1 }) * MS_PAR_JOUR - DECALAGE_HIVER;
const FIN_DES_INSTANTS =
  joursDepuisEpoque({ annee: ANNEE_MAX + 1, mois: 1, jour: 1 }) * MS_PAR_JOUR - DECALAGE_HIVER;

/** L'instant du changement d'heure du dernier dimanche du mois (mars et octobre ont 31 jours). */
function changement(annee: number, mois: number): Instant {
  const trenteEtUn = joursDepuisEpoque({ annee, mois, jour: 31 });
  const dernierDimanche = trenteEtUn - jourDeSemaine(trenteEtUn);
  return dernierDimanche * MS_PAR_JOUR + HEURE_UTC_DU_CHANGEMENT;
}

/** Le décalage de Paris sur UTC à un instant donné. */
function decalage(instant: Instant): number {
  const { annee } = dateDepuisJours(Math.floor(instant / MS_PAR_JOUR));
  return instant >= changement(annee, MARS) && instant < changement(annee, OCTOBRE)
    ? DECALAGE_ETE
    : DECALAGE_HIVER;
}

function verifierBornes(instant: Instant): Instant {
  if (instant < PREMIER_INSTANT || instant >= FIN_DES_INSTANTS) {
    throw new ErreurTemps(
      'hors_calendrier',
      `instant ${instant} hors des années ${ANNEE_MIN}-${ANNEE_MAX} de Paris`
    );
  }
  return instant;
}

/** L'heure légale de Paris d'un instant, en millisecondes « locales ». */
export function localDepuisInstant(instant: Instant): number {
  verifierBornes(verifierInstant(instant));
  return instant + decalage(instant);
}

/**
 * L'instant d'une heure légale « locale ». Heure d'été d'abord : c'est elle qui rend la première
 * occurrence d'une heure ambiguë ; à défaut, heure d'hiver, qui décale une heure inexistante
 * après le saut.
 */
export function instantDepuisLocal(local: number): Instant {
  const enEte = local - DECALAGE_ETE;
  const instant = decalage(enEte) === DECALAGE_ETE ? enEte : local - DECALAGE_HIVER;
  return verifierBornes(instant);
}

/** L'heure légale de Paris d'un instant UTC. */
export function versParis(instant: Instant): DateHeureParis {
  const local = localDepuisInstant(instant);
  const numero = Math.floor(local / MS_PAR_JOUR);
  const dansLeJour = local - numero * MS_PAR_JOUR;
  return {
    ...dateDepuisJours(numero),
    heure: Math.floor(dansLeJour / MS_PAR_HEURE),
    minute: Math.floor((dansLeJour % MS_PAR_HEURE) / MS_PAR_MINUTE),
    seconde: Math.floor((dansLeJour % MS_PAR_MINUTE) / 1000),
    milliseconde: dansLeJour % 1000,
  };
}

function entierEntre(valeur: number, min: number, max: number): boolean {
  return Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

/** L'instant UTC d'une heure légale de Paris (voir les deux cas sans réponse unique, en tête). */
export function depuisParis(d: DateHeureParis): Instant {
  const numero = joursDeLaDate(d);
  if (
    !entierEntre(d.heure, 0, 23) ||
    !entierEntre(d.minute, 0, 59) ||
    !entierEntre(d.seconde, 0, 59) ||
    !entierEntre(d.milliseconde, 0, 999)
  ) {
    throw new ErreurTemps(
      'date_invalide',
      `${d.heure}:${d.minute}:${d.seconde}.${d.milliseconde} n'est pas une heure`
    );
  }
  return instantDepuisLocal(
    numero * MS_PAR_JOUR +
      d.heure * MS_PAR_HEURE +
      d.minute * MS_PAR_MINUTE +
      d.seconde * 1000 +
      d.milliseconde
  );
}
