/**
 * CPL-T13 — le calendrier civil grégorien, en ARITHMÉTIQUE : aucun objet du moteur, aucune base de
 * fuseaux (REQ-CPL-013 ; arbitrage T1 du brief de la tâche).
 *
 * Un jour se désigne par son NUMÉRO : le nombre de jours écoulés depuis le 1970-01-01, jour 0.
 * Conversion numéro ↔ (année, mois, jour) par les deux algorithmes de Howard Hinnant,
 * `days_from_civil` et `civil_from_days` (article « chrono-Compatible Low-Level … Algorithms »), exacts
 * sur tout le calendrier grégorien proleptique. Le 1970-01-01 était un jeudi : le jour de semaine
 * est `(numéro + 4) mod 7`, 0 = dimanche.
 *
 * LES BORNES. Le métier vit de 1996 à 2099 (année CIVILE de Paris) : la France suit la règle
 * européenne actuelle des changements d'heure depuis 1996, et aucune donnée du métier ne vit
 * au-delà de 2099. Hors de ces années, levée `hors_calendrier` — jamais une valeur approchée.
 * Le jugement de ce fichier est dans `tests/unit/domaine/temps-horloge-et-feries.spec.ts`, qui le
 * confronte au moteur pour chaque jour de 1996 à 2099.
 */
import { ErreurTemps } from './erreurs';

export interface DateCivile {
  readonly annee: number;
  /** 1 = janvier … 12 = décembre. */
  readonly mois: number;
  readonly jour: number;
}

/** Première et dernière années civiles de Paris que le module sait traiter. */
export const ANNEE_MIN = 1996;
export const ANNEE_MAX = 2099;

export const MS_PAR_MINUTE = 60_000;
export const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
export const MS_PAR_JOUR = 24 * MS_PAR_HEURE;

/** Le jour de semaine rendu par `jourDeSemaine` pour le dimanche et le samedi. */
export const DIMANCHE = 0;
export const SAMEDI = 6;

/** Numéro du jour (jours depuis le 1970-01-01) d'une date grégorienne — sans contrôle. */
export function joursDepuisEpoque({ annee, mois, jour }: DateCivile): number {
  // L'année commence au 1er mars : février, jour intercalaire compris, en est le dernier mois.
  const a = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(a / 400);
  const anneeDeLEre = a - ere * 400;
  const jourDeLAnnee = Math.floor((153 * (mois > 2 ? mois - 3 : mois + 9) + 2) / 5) + jour - 1;
  const jourDeLEre =
    anneeDeLEre * 365 + Math.floor(anneeDeLEre / 4) - Math.floor(anneeDeLEre / 100) + jourDeLAnnee;
  return ere * 146_097 + jourDeLEre - 719_468;
}

/** La date grégorienne d'un numéro de jour. */
export function dateDepuisJours(numero: number): DateCivile {
  const z = numero + 719_468;
  const ere = Math.floor(z / 146_097);
  const jourDeLEre = z - ere * 146_097;
  const anneeDeLEre = Math.floor(
    (jourDeLEre -
      Math.floor(jourDeLEre / 1_460) +
      Math.floor(jourDeLEre / 36_524) -
      Math.floor(jourDeLEre / 146_096)) /
      365
  );
  const jourDeLAnnee =
    jourDeLEre - (365 * anneeDeLEre + Math.floor(anneeDeLEre / 4) - Math.floor(anneeDeLEre / 100));
  const moisDepuisMars = Math.floor((5 * jourDeLAnnee + 2) / 153);
  const jour = jourDeLAnnee - Math.floor((153 * moisDepuisMars + 2) / 5) + 1;
  const mois = moisDepuisMars < 10 ? moisDepuisMars + 3 : moisDepuisMars - 9;
  const annee = anneeDeLEre + ere * 400 + (mois <= 2 ? 1 : 0);
  return { annee, mois, jour };
}

/** 0 = dimanche, 1 = lundi … 6 = samedi, pour un jour postérieur au 1970-01-01. */
export function jourDeSemaine(numero: number): number {
  return (numero + 4) % 7;
}

/** Refuse une année hors de 1996 à 2099 (`hors_calendrier`) ou non entière (`date_invalide`). */
export function verifierAnnee(annee: number): number {
  if (!Number.isInteger(annee)) {
    throw new ErreurTemps('date_invalide', `année ${annee} non entière`);
  }
  if (annee < ANNEE_MIN || annee > ANNEE_MAX) {
    throw new ErreurTemps('hors_calendrier', `année ${annee} hors de ${ANNEE_MIN}-${ANNEE_MAX}`);
  }
  return annee;
}

/**
 * Le numéro du jour d'une date CONTRÔLÉE : année dans les bornes, jour entier, et date réelle — un
 * 30 février, un 13ᵉ mois, un mois non entier ou un jour 0 ne reviennent pas identiques de
 * l'aller-retour, qui rend toujours un mois entier. Un jour non entier, lui, y survivrait : il est
 * refusé à part.
 */
export function joursDeLaDate(date: DateCivile): number {
  verifierAnnee(date.annee);
  const numero = joursDepuisEpoque(date);
  const retour = dateDepuisJours(numero);
  if (!Number.isInteger(date.jour) || retour.mois !== date.mois || retour.jour !== date.jour) {
    throw new ErreurTemps(
      'date_invalide',
      `${date.annee}-${date.mois}-${date.jour} n'existe pas au calendrier`
    );
  }
  return numero;
}
