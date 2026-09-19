/**
 * CPL-T13 — le calendrier des jours fériés de France métropolitaine, VERSIONNÉ, et le jour ouvré
 * (REQ-CPL-013, REQ-UX-022).
 *
 * LA SOURCE. Code du travail, article L3133-1 : onze fêtes légales. Le calendrier les porte toutes,
 * chacune avec son attribut `chome` — chômé ou travaillé chez AXION IA. Un jour OUVRÉ est un jour du
 * lundi au vendredi qui n'est pas un férié chômé ; un férié qui tombe un samedi ou un dimanche ne
 * retire donc aucun jour ouvré, et rien n'est reporté.
 *
 * HORS CALENDRIER : le Vendredi saint et le 26 décembre d'Alsace-Moselle (établissement en Isère).
 *
 * PÂQUES est calculée (algorithme grégorien dit « anonyme », Meeus-Jones-Butcher) ; le lundi de
 * Pâques, l'Ascension et le lundi de Pentecôte s'en déduisent. Le test la confronte à une table
 * publiée et, pour chaque année de 1996 à 2099, à un second algorithme indépendant (Gauss).
 *
 * UN CHANGEMENT DE CALENDRIER est une nouvelle `version`, datée, jamais une retouche silencieuse :
 * les échéances déjà calculées l'ont été sous l'ancienne.
 */
import {
  DIMANCHE,
  SAMEDI,
  dateDepuisJours,
  joursDeLaDate,
  joursDepuisEpoque,
  jourDeSemaine,
  verifierAnnee,
  type DateCivile,
} from './calendrier-civil';

/**
 * LE LUNDI DE PENTECÔTE EST-IL CHÔMÉ CHEZ AXION IA ? — question posée à Will, SANS RÉPONSE au
 * 2026-09-19. Férié au calendrier, il est souvent travaillé : c'est le jour où beaucoup
 * d'entreprises placent la journée de solidarité (Code du travail, L3133-7 et suivants).
 *
 * DÉFAUT RETENU : TRAVAILLÉ (`false`). Le module calcule aussi un délai que la Société DOIT (dix
 * jours ouvrés de paiement, contrat art. 5.3) : compter chômé un jour réellement travaillé
 * reculerait ce délai d'un jour. Le défaut sûr est l'échéance la plus courte.
 *
 * La réponse de Will change CETTE ligne, et la `version` du calendrier ci-dessous — rien d'autre.
 */
export const LUNDI_DE_PENTECOTE_CHOME = false;

/** Un férié à date fixe, ou décalé d'un nombre de jours depuis le dimanche de Pâques. */
export type RegleFerie =
  { readonly mois: number; readonly jour: number } | { readonly joursApresPaques: number };

export interface JourFerie {
  /** Identifiant stable du férié, en snake_case. */
  readonly cle: string;
  readonly regle: RegleFerie;
  /** Vrai si le jour est chômé : il n'est alors pas un jour ouvré. */
  readonly chome: boolean;
}

export interface CalendrierFeries {
  /** Incrémentée à chaque changement de la liste ou d'un attribut `chome`. */
  readonly version: string;
  /** Jour d'effet de la version (AAAA-MM-JJ). */
  readonly date: string;
  readonly source: string;
  readonly jours: readonly JourFerie[];
}

/** Les onze fériés de l'article L3133-1, dans l'ordre de l'année. */
export const CALENDRIER_FERIES_FR: CalendrierFeries = {
  version: '1',
  date: '2026-09-19',
  source:
    'Code du travail, article L3133-1 (onze fêtes légales) ; attribut chômé : usage AXION IA, ' +
    'lundi de Pentecôte en attente de décision (LUNDI_DE_PENTECOTE_CHOME)',
  jours: [
    { cle: 'jour_de_l_an', regle: { mois: 1, jour: 1 }, chome: true },
    { cle: 'lundi_de_paques', regle: { joursApresPaques: 1 }, chome: true },
    { cle: 'fete_du_travail', regle: { mois: 5, jour: 1 }, chome: true },
    { cle: 'victoire_1945', regle: { mois: 5, jour: 8 }, chome: true },
    { cle: 'ascension', regle: { joursApresPaques: 39 }, chome: true },
    { cle: 'lundi_de_pentecote', regle: { joursApresPaques: 50 }, chome: LUNDI_DE_PENTECOTE_CHOME },
    { cle: 'fete_nationale', regle: { mois: 7, jour: 14 }, chome: true },
    { cle: 'assomption', regle: { mois: 8, jour: 15 }, chome: true },
    { cle: 'toussaint', regle: { mois: 11, jour: 1 }, chome: true },
    { cle: 'armistice_1918', regle: { mois: 11, jour: 11 }, chome: true },
    { cle: 'noel', regle: { mois: 12, jour: 25 }, chome: true },
  ],
};

/** Le dimanche de Pâques d'une année de 1996 à 2099 (algorithme grégorien anonyme). */
export function dateDePaques(annee: number): DateCivile {
  verifierAnnee(annee);
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { annee, mois: Math.floor(n / 31), jour: (n % 31) + 1 };
}

export interface FerieDate {
  readonly cle: string;
  readonly date: DateCivile;
  readonly chome: boolean;
}

/** Les fériés d'une année, datés, dans l'ordre du calendrier. */
export function feriesDeLAnnee(
  annee: number,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): readonly FerieDate[] {
  const paques = joursDepuisEpoque(dateDePaques(annee));
  return calendrier.jours.map(({ cle, regle, chome }) => ({
    cle,
    chome,
    date:
      'joursApresPaques' in regle
        ? dateDepuisJours(paques + regle.joursApresPaques)
        : { annee, mois: regle.mois, jour: regle.jour },
  }));
}

/** Vrai si le jour de ce numéro est ouvré : lundi à vendredi, hors férié chômé. */
export function jourOuvre(
  numero: number,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): boolean {
  const semaine = jourDeSemaine(numero);
  if (semaine === DIMANCHE || semaine === SAMEDI) return false;
  const { annee } = dateDepuisJours(numero);
  return !feriesDeLAnnee(annee, calendrier).some(
    (f) => joursDepuisEpoque(f.date) === numero && f.chome
  );
}

/** Vrai si la date est un jour ouvré ; une date inexistante ou hors bornes est refusée. */
export function estJourOuvre(
  date: DateCivile,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): boolean {
  return jourOuvre(joursDeLaDate(date), calendrier);
}
