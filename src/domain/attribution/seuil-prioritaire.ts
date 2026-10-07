/**
 * CPL-T13, corrigée par SEC-56 — le seuil de vérification prioritaire (REQ-CPL-026 : il se dérive
 * de la capacité restante ; REQ-DM-010 et REQ-JUR-032 : il ne compte rien par apporteur).
 *
 * SEC-56 (décision de Williams du 2026-10-03, « non pas pour le moment ») : le PALIER quitte le
 * code. L'ordre des appels de confirmation de la Société est un ordre de travail interne, fondé
 * sur sa capacité et sur une surcharge manuelle ; aucun palier, score, taux ni seuil de dépôts
 * n'existe par apporteur. La règle HYP-D3 (`min(palierConfiance, capaciteRestante)`) n'est donc
 * plus celle du code : `palierConfiance` a disparu de l'entrée, et une entrée qui le porte encore
 * est REFUSÉE, nommée, plutôt qu'ignorée en silence.
 *
 *   — sans surcharge (`null` ou 0) : la capacité restante ;
 *   — surcharge > 0 : elle REMPLACE la capacité, au-dessus comme au-dessous (« jamais un plafond ») ;
 *   — toute valeur négative ou non entière est refusée par une levée qui nomme le champ : un seuil
 *     calculé sur une entrée fausse ne se remplace pas par une valeur approchée.
 *
 * La capacité restante se calcule depuis `src/domain/temps/capacite.ts` ; ce fichier ne la
 * recalcule pas.
 */

export interface EntreeSeuilPrioritaire {
  readonly capaciteRestante: number;
  readonly surchargeManuelle: number | null;
}

/** Les champs que la levée peut nommer : ceux de l'entrée, et le palier, refusé. */
export type ChampDuSeuil = keyof EntreeSeuilPrioritaire | 'palierConfiance';

export class ErreurSeuilPrioritaire extends Error {
  readonly champ: ChampDuSeuil;

  constructor(champ: ChampDuSeuil, valeur: unknown) {
    super(
      champ === 'palierConfiance'
        ? 'seuil_invalide : palierConfiance n’existe plus, aucun palier par apporteur (REQ-JUR-032)'
        : `seuil_invalide : ${champ} = ${String(valeur)} n'est pas un entier >= 0`
    );
    this.name = 'ErreurSeuilPrioritaire';
    this.champ = champ;
  }
}

function entierPositif(champ: keyof EntreeSeuilPrioritaire, valeur: number): number {
  if (!Number.isInteger(valeur) || valeur < 0) throw new ErreurSeuilPrioritaire(champ, valeur);
  return valeur;
}

/**
 * UNE SEULE FONCTION : le dépôt (DM-09) et la file de qualification (UX-P1-07) la consomment
 * toutes deux, aucun ne rejuge la règle.
 */
export function seuilPrioritaire(entree: EntreeSeuilPrioritaire): number {
  if ('palierConfiance' in entree) throw new ErreurSeuilPrioritaire('palierConfiance', undefined);
  const capacite = entierPositif('capaciteRestante', entree.capaciteRestante);
  const surcharge = entree.surchargeManuelle;
  if (surcharge !== null && entierPositif('surchargeManuelle', surcharge) > 0) return surcharge;
  return capacite;
}
