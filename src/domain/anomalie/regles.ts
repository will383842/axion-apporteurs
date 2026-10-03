/**
 * DM-12 (REQ-DM-033, REQ-DM-034, REQ-DM-043) — les règles pures des anomalies, des rattachements
 * manuels et des contestations. La base tient les mêmes règles par ses CHECK et ses déclencheurs ;
 * le domaine les nomme avant tout appel, pour un refus lisible.
 */
import { SEUILS } from '../seuils/ssot';
import { MS_PAR_JOUR } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { instantDepuisLocal, localDepuisInstant } from '../temps/paris';

/** Les types d'anomalie (glossaire, `TypeAnomalie`) : la déclaration seule, jamais le rythme. */
export type TypeAnomalie = 'sincerite' | 'auto_parrainage';
/** Les statuts d'une anomalie (glossaire, `StatutAnomalie`), confrontés à l'enum Prisma par un témoin. */
export const STATUTS_ANOMALIE = ['ouverte', 'levee', 'confirmee'] as const;
export type StatutAnomalie = (typeof STATUTS_ANOMALIE)[number];

/** Les deux moments d'une contestation que le journal trace : sa réception, puis sa réponse. */
export const ETATS_CONTESTATION = ['recue', 'repondue'] as const;

/** Les deux gestes sur un rattachement manuel que le journal trace (glossaire §4.1). */
export const GESTES_RATTACHEMENT = ['decide', 'revoque'] as const;

export class AnomalieMalFormee extends Error {
  constructor(motif: string) {
    super(`anomalie_mal_formee : ${motif}`);
    this.name = 'AnomalieMalFormee';
  }
}

export class TransitionAnomalieInterdite extends Error {
  constructor(de: StatutAnomalie, vers: StatutAnomalie) {
    super(`transition_anomalie_interdite : ${de} → ${vers}`);
    this.name = 'TransitionAnomalieInterdite';
  }
}

export class JustificationTropCourte extends Error {
  constructor(utiles: number) {
    super(
      `justification_trop_courte : ${utiles} caractères utiles sur ${JUSTIFICATION_CARACTERES_UTILES_MIN}`
    );
    this.name = 'JustificationTropCourte';
  }
}

export class LienPosterieurAuDepot extends Error {
  constructor() {
    super('lien_posterieur_au_depot');
    this.name = 'LienPosterieurAuDepot';
  }
}

/** Le score d'une anomalie : présent si et seulement si `sincerite`, entier de 0 à 100. */
export function jugerAnomalie(a: { type: TypeAnomalie; score: number | null }): void {
  if (a.type !== 'sincerite') {
    if (a.score !== null) throw new AnomalieMalFormee(`aucun score pour ${a.type}`);
    return;
  }
  if (a.score === null) throw new AnomalieMalFormee('score requis pour sincerite');
  if (!Number.isInteger(a.score) || a.score < 0 || a.score > 100) {
    throw new AnomalieMalFormee('score entier de 0 à 100');
  }
}

/** Une anomalie ne quitte `ouverte` qu'une fois, vers une valeur de clôture, sans retour. */
export function jugerTransitionAnomalie(de: StatutAnomalie, vers: StatutAnomalie): void {
  if (de !== 'ouverte' || vers === 'ouverte') throw new TransitionAnomalieInterdite(de, vers);
}

/** Le plancher d'une justification de rattachement manuel, en caractères utiles. */
export const JUSTIFICATION_CARACTERES_UTILES_MIN = 20;

/** Les caractères utiles d'un texte : tout sauf les blancs (espaces, tabulations, retours). */
export function caracteresUtiles(texte: string): number {
  return texte.replace(/\s/gu, '').length;
}

export function jugerJustification(texte: string): void {
  const utiles = caracteresUtiles(texte);
  if (utiles < JUSTIFICATION_CARACTERES_UTILES_MIN) throw new JustificationTropCourte(utiles);
}

/** Le lien de contrôle doit être établi au plus tard au dépôt de l'attribution rattachée. */
export function jugerLienAnterieur(lienEtabliAt: Date, deposeeAt: Date): void {
  if (lienEtabliAt.getTime() > deposeeAt.getTime()) throw new LienPosterieurAuDepot();
}

/**
 * L'échéance de réponse d'une contestation : `REPONSE_CONTESTATION_JOURS` jours civils après sa
 * réception, à la même heure de Paris. Dérivée, jamais stockée.
 */
export function echeanceDeReponse(recueAt: Instant): Instant {
  return instantDepuisLocal(
    localDepuisInstant(recueAt) + SEUILS.REPONSE_CONTESTATION_JOURS.valeur * MS_PAR_JOUR
  );
}
