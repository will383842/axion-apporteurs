/**
 * La fin de la fenêtre de redéclaration du premier rang (DM-55, REQ-DM-004, art. 3.5 al. 2) — la
 * règle PURE.
 *
 * FOND (juriste) : la fenêtre court de l'ENVOI EFFECTIF de l'information, et finit à la fin du jour
 * civil, heure de Paris, de (envoi + `FILE_FENETRE_REDECLARATION_JOURS`) ; le changement d'heure ne
 * déplace pas le jour, et il n'y a pas de report au jour ouvré (CPC art. 642 par analogie, C. civ.
 * art. 1190). FORME (A02) : la borne stockée est EXCLUSIVE — minuit du jour civil qui SUIT —, et
 * toute comparaison est stricte : la fenêtre est ouverte si `maintenant < fin`. Le jour affiché est
 * celui de (fin − 1 ms), soit envoi + 15 jours.
 */
import { SEUILS } from '../seuils/ssot';
import { dateDepuisJours, joursDeLaDate, type DateCivile } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { depuisParis, versParis } from '../temps/paris';

/** La borne EXCLUSIVE : minuit, heure de Paris, du jour qui suit (envoi + la durée de la SSOT). */
export function finDeLaFenetreDeRedeclaration(envoyeAt: Instant): Instant {
  const jourDeLEnvoi = joursDeLaDate(versParis(envoyeAt));
  const lendemain = dateDepuisJours(
    jourDeLEnvoi + SEUILS.FILE_FENETRE_REDECLARATION_JOURS.valeur + 1
  );
  return depuisParis({ ...lendemain, heure: 0, minute: 0, seconde: 0, milliseconde: 0 });
}

/** La fenêtre est ouverte strictement avant sa borne. */
export function fenetreOuverte(maintenant: Instant, fin: Instant): boolean {
  return maintenant < fin;
}

/** Le dernier jour de la fenêtre, à Paris : celui de (fin − 1 ms). */
export function jourLimiteDeLaFenetre(fin: Instant): DateCivile {
  const { annee, mois, jour } = versParis(fin - 1);
  return { annee, mois, jour };
}
