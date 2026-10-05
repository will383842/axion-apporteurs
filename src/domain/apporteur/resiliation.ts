/**
 * SEC-19 (REQ-JUR-006, REQ-DM-011) — les règles PURES de la fin du contrat d'apporteur.
 *
 * LA MISE EN DEMEURE (art. 11.2, forme d'A02 sur #703). Elle vise un article d'une liste FERMÉE, les
 * seuls que l'art. 11.2 nomme. C'est un fait daté, PAS un antécédent : aucune règle ne compte les
 * mises en demeure ; la résiliation pour manquement ne lit que celle de l'article en cause.
 */
import { SEUILS } from '../seuils/ssot';
import { dateDepuisJours, joursDeLaDate } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { depuisParis, versParis } from '../temps/paris';

/** Les seuls articles que vise l'art. 11.2 : la liste FERMÉE de la juriste (#703, 5980966503). */
export const ARTICLES_MISE_EN_DEMEURE = ['3.7', '6', '7', '8', '9', '23'] as const;
export type ArticleMiseEnDemeure = (typeof ARTICLES_MISE_EN_DEMEURE)[number];

/** Les statuts liés par un contrat : seuls eux reçoivent une mise en demeure. */
export const STATUTS_SOUS_CONTRAT = ['signe', 'suspendu'] as const;

/** Le prédicat « sous contrat » : l'écran le lit AVANT la saisie, le serveur le rejuge sous le verrou. */
export function estSousContrat(statut: string | null): boolean {
  return (STATUTS_SOUS_CONTRAT as readonly (string | null)[]).includes(statut);
}

/**
 * L'échéance de la mise en demeure, borne EXCLUSIVE (forme d'A02, comme la fenêtre de DM-55) :
 * minuit, heure de Paris, du jour civil qui suit (envoi effectif + `MISE_EN_DEMEURE_JOURS`). Le
 * changement d'heure ne déplace pas le jour. L'envoi est `courriels_envoyes.envoye_at`.
 */
export function echeanceDeLaMiseEnDemeure(envoyeAt: Instant): Instant {
  const jourDeLEnvoi = joursDeLaDate(versParis(envoyeAt));
  const lendemain = dateDepuisJours(jourDeLEnvoi + SEUILS.MISE_EN_DEMEURE_JOURS.valeur + 1);
  return depuisParis({ ...lendemain, heure: 0, minute: 0, seconde: 0, milliseconde: 0 });
}

/**
 * La résiliation pour manquement grave (art. 11.2) : admise s'il existe, POUR L'ARTICLE EN CAUSE, une
 * mise en demeure dont le courriel est envoyé et dont l'échéance est DÉPASSÉE (refusée pile à
 * l'échéance, A02) ; ou si l'inexécution est irrémédiable, cochée et motivée par la décision. On
 * cherche UNE mise en demeure échue ; on n'en compte jamais.
 */
export function jugerLaResiliationPourManquement(demande: {
  /** Les `envoye_at` des mises en demeure de l'article en cause ; nul si le courriel n'est pas parti. */
  envoisDeLArticle: readonly (Instant | null)[];
  maintenant: Instant;
  inexecutionIrremediable: boolean;
}): { ok: true } | { ok: false; motif: 'mise_en_demeure_requise' } {
  if (demande.inexecutionIrremediable) return { ok: true };
  const echue = demande.envoisDeLArticle.some(
    (envoi) => envoi !== null && demande.maintenant > echeanceDeLaMiseEnDemeure(envoi)
  );
  return echue ? { ok: true } : { ok: false, motif: 'mise_en_demeure_requise' };
}
