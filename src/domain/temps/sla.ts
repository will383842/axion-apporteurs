/**
 * CPL-T13 — le SLA en heures ouvrées : une seule unité, une seule paire de fonctions (REQ-UX-022,
 * REQ-UX-028).
 *
 * L'UNITÉ. Une « heure ouvrée » est une heure civile de Paris écoulée pendant un jour ouvré
 * (`feries.ts`), sans plage horaire : les 48 h ouvrées du SLA de qualification et les « 2 jours
 * ouvrés » de réponse du fil Aide sont la MÊME durée, calculée par la MÊME fonction
 * (`echeanceOuvree(debut, 48)`). Vendredi 15 h + 48 h ouvrées = mardi 15 h.
 *
 * LE DÉPART. Un départ hors jour ouvré compte à partir du début (0 h) du jour ouvré suivant.
 *
 * L'ÉCHÉANCE est EXCLUSIVE : c'est le premier instant où la durée ouvrée écoulée depuis le départ
 * atteint la durée demandée — l'intervalle [départ, échéance) en contient exactement la durée.
 * Vendredi 0 h + 24 h ouvrées = samedi 0 h.
 *
 * LES CHANGEMENTS D'HEURE tombent un dimanche, jamais un jour ouvré : dans un jour ouvré, l'heure
 * de Paris et l'heure écoulée avancent ensemble, et aucune échéance ne tombe dans une heure
 * inexistante ni dans une heure ambiguë. Le test le vérifie sur 1996-2099, il ne le suppose pas.
 */
import { MS_PAR_HEURE, MS_PAR_JOUR } from './calendrier-civil';
import { ErreurTemps } from './erreurs';
import { CALENDRIER_FERIES_FR, jourOuvre, type CalendrierFeries } from './feries';
import type { Instant } from './horloge';
import { instantDepuisLocal, localDepuisInstant } from './paris';

/** Le premier instant où `heures` heures ouvrées se sont écoulées depuis `debut`. */
export function echeanceOuvree(
  debut: Instant,
  heures: number,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): Instant {
  if (!Number.isInteger(heures) || heures < 0) {
    throw new ErreurTemps('duree_invalide', `${heures} h n'est pas un nombre entier d'heures >= 0`);
  }
  const local = localDepuisInstant(debut);
  let numero = Math.floor(local / MS_PAR_JOUR);
  let position = local - numero * MS_PAR_JOUR;
  let reste = heures * MS_PAR_HEURE;
  for (;;) {
    if (jourOuvre(numero, calendrier)) {
      const disponible = MS_PAR_JOUR - position;
      if (reste <= disponible) return instantDepuisLocal(numero * MS_PAR_JOUR + position + reste);
      reste -= disponible;
    }
    numero += 1;
    position = 0;
  }
}

/** Les heures ouvrées écoulées dans [debut, fin), fraction d'heure comprise. */
export function heuresOuvreesEcoulees(
  debut: Instant,
  fin: Instant,
  calendrier: CalendrierFeries = CALENDRIER_FERIES_FR
): number {
  if (fin < debut) {
    throw new ErreurTemps('intervalle_inverse', `fin ${fin} antérieure au début ${debut}`);
  }
  const a = localDepuisInstant(debut);
  const b = localDepuisInstant(fin);
  let total = 0;
  for (let numero = Math.floor(a / MS_PAR_JOUR); numero * MS_PAR_JOUR < b; numero++) {
    if (jourOuvre(numero, calendrier)) {
      total += Math.min(b, (numero + 1) * MS_PAR_JOUR) - Math.max(a, numero * MS_PAR_JOUR);
    }
  }
  return total / MS_PAR_HEURE;
}
