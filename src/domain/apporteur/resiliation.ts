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

/**
 * SEC-66 — LA RÉSILIATION PAR LA SOCIÉTÉ (`ordinaire_axion`, art. 11.1), forme (b) d'A02 (#703,
 * 5983008261) sous le texte de la juriste (#703, 5982404858).
 *
 * Le jour civil de Paris d'un instant, en `AAAA-MM-JJ` : la forme d'une colonne DATE et d'un
 * `jourCivil` du journal. Le changement d'heure ne déplace pas le jour.
 */
export function jourCivilDeParis(instant: Instant): string {
  return jourCivilEnTexte(versParis(instant));
}

function jourCivilEnTexte({ annee, mois, jour }: { annee: number; mois: number; jour: number }) {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${annee}-${deux(mois)}-${deux(jour)}`;
}

/**
 * La date d'effet d'une résiliation par la Société : le jour civil de Paris de la DÉCISION, plus
 * `PREAVIS_JOURS` jours civils. La décision n'est opposable que si son courriel part CE jour-là
 * (`estUneResiliationOpposable`) : la date annoncée vaut alors l'envoi plus le préavis, comme le veut
 * la juriste.
 */
export function dateEffetDeLaResiliationParLaSociete(decision: Instant): string {
  const jour = joursDeLaDate(versParis(decision));
  return jourCivilEnTexte(dateDepuisJours(jour + SEUILS.PREAVIS_JOURS.valeur));
}

/**
 * L'opposabilité (forme (b), point 2) : le courriel de la décision est `envoye`, et le jour civil de
 * Paris de son `envoye_at` est celui de `date_reception`. Tout autre cas — courriel en échec, retenu,
 * jamais parti, ou parti un autre jour — rend la décision CADUQUE : aucune date d'effet n'est opposée
 * à l'apporteur, et aucun effet de l'art. 12 n'en découle (juriste, #703, 5983001668).
 */
export function estUneResiliationOpposable(d: {
  /** Le jour civil de la décision, `AAAA-MM-JJ`. */
  dateReception: string;
  courriels: readonly { statut: string; envoyeAt: Instant | null }[];
}): boolean {
  return d.courriels.some(
    (c) =>
      c.statut === 'envoye' &&
      c.envoyeAt !== null &&
      jourCivilDeParis(c.envoyeAt) === d.dateReception
  );
}

/**
 * La date d'effet est-elle ATTEINTE ? Le contrat prend fin le jour de la date d'effet : à partir de
 * minuit, heure de Paris, de ce jour (comparaison de jours `AAAA-MM-JJ`, lexicographique).
 */
export function dateEffetAtteinte(dateEffet: string, maintenant: Instant): boolean {
  return jourCivilDeParis(maintenant) >= dateEffet;
}
