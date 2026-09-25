/**
 * CPL-T13 — le seuil de vérification prioritaire, règle HYP-D3 (`docs/DECISIONS.md` ;
 * REQ-CPL-026 : le seuil de vérification prioritaire se dérive de la capacité restante).
 *
 * HYP-D3, mot à mot : « `seuilPrioritaire = min(palierConfiance, capaciteRestante)` ;
 * `surchargeManuelle > 0` remplace le min ; une seule fonction pure ; jamais un plafond ».
 *
 *   — sans surcharge (`null` ou 0) : le plus petit du palier de confiance et de la capacité
 *     restante ;
 *   — surcharge > 0 : elle REMPLACE le min, même supérieure au palier — elle n'est pas bornée par
 *     lui (« jamais un plafond ») ;
 *   — toute valeur négative ou non entière est refusée par une levée qui nomme le champ : un seuil
 *     calculé sur une entrée fausse ne se remplace pas par une valeur approchée.
 *
 * La capacité restante se calcule depuis `src/domain/temps/capacite.ts` ; ce fichier ne la
 * recalcule pas.
 */

export interface EntreeSeuilPrioritaire {
  readonly palierConfiance: number;
  readonly capaciteRestante: number;
  readonly surchargeManuelle: number | null;
}

export type ChampDuSeuil = keyof EntreeSeuilPrioritaire;

export class ErreurSeuilPrioritaire extends Error {
  readonly champ: ChampDuSeuil;

  constructor(champ: ChampDuSeuil, valeur: number) {
    super(`seuil_invalide : ${champ} = ${valeur} n'est pas un entier >= 0`);
    this.name = 'ErreurSeuilPrioritaire';
    this.champ = champ;
  }
}

function entierPositif(champ: ChampDuSeuil, valeur: number): number {
  if (!Number.isInteger(valeur) || valeur < 0) throw new ErreurSeuilPrioritaire(champ, valeur);
  return valeur;
}

/**
 * UNE SEULE FONCTION : le dépôt (DM-09) et la file de qualification (UX-P1-07) la consomment
 * toutes deux, aucun ne rejuge la règle.
 */
export function seuilPrioritaire(entree: EntreeSeuilPrioritaire): number {
  const palier = entierPositif('palierConfiance', entree.palierConfiance);
  const capacite = entierPositif('capaciteRestante', entree.capaciteRestante);
  const surcharge = entree.surchargeManuelle;
  if (surcharge !== null && entierPositif('surchargeManuelle', surcharge) > 0) return surcharge;
  return Math.min(palier, capacite);
}
