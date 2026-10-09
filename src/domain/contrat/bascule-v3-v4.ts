/**
 * La fenêtre de bascule du contrat d'événements, de la v3 à la v4 (INT-T76-P ; forme d'A02, #737) —
 * la règle PURE.
 *
 * Une enveloppe v3 reste TRAITÉE tant que la fenêtre est ouverte, et s'inscrit `held` après : jamais
 * un refus (REQ-ARG-003), et un `held` se rejoue contre les `$defs` de SA version, sans perte. Le
 * point de départ est un FAIT, pas une date saisie : la réception du PREMIER événement v4 accepté.
 * Avant lui, axion-ia n'a pas basculé, la v3 est la norme, et la fenêtre n'est pas ouverte : un
 * déploiement décalé des deux côtés ne la ferme jamais trop tôt.
 *
 * LA BORNE est celle de la fenêtre de redéclaration (même forme d'A02) : EXCLUSIVE, au minuit de Paris
 * du jour qui suit (jour de la première v4 + `BASCULE_CONTRAT_V3_V4_JOURS`) ; le changement d'heure
 * ne déplace pas le jour, et la comparaison est stricte.
 */
import { SEUILS } from '../seuils/ssot';
import { dateDepuisJours, joursDeLaDate } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { depuisParis, versParis } from '../temps/paris';

/** La borne EXCLUSIVE : minuit, heure de Paris, du jour qui suit (première v4 + la durée). */
export function finDeLaBasculeV3V4(premiereV4At: Instant): Instant {
  const jour = joursDeLaDate(versParis(premiereV4At));
  const lendemain = dateDepuisJours(jour + SEUILS.BASCULE_CONTRAT_V3_V4_JOURS.valeur + 1);
  return depuisParis({ ...lendemain, heure: 0, minute: 0, seconde: 0, milliseconde: 0 });
}

/**
 * Vrai si une enveloppe v3 est encore TRAITÉE : aucune v4 n'a encore été acceptée, ou la fenêtre
 * ouverte par la première ne s'est pas refermée.
 */
export function v3EncoreTraitee(premiereV4At: Instant | null, maintenant: Instant): boolean {
  return premiereV4At === null || maintenant < finDeLaBasculeV3V4(premiereV4At);
}
