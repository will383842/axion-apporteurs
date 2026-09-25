/**
 * CPL-T13 — les levées du module `temps`. Chacune porte un MOTIF fermé, lisible par l'appelant, et
 * un message qui nomme la valeur refusée : une échéance qu'on ne sait pas calculer ne se remplace
 * jamais par une valeur approchée.
 *
 *   — `hors_calendrier`   : l'instant ou la date sort des années 1996 à 2099 de Paris ;
 *   — `date_invalide`     : un champ d'une date ou d'une heure légale n'existe pas (30 février,
 *                           13ᵉ mois, heure 24, champ non entier) ;
 *   — `instant_invalide`  : un instant qui n'est pas un nombre entier de millisecondes ;
 *   — `duree_invalide`    : une durée négative ou non entière ;
 *   — `intervalle_inverse`: une fin antérieure à son début ;
 *   — `capacite_invalide` : une capacité par qualifieur et par jour négative ou non entière.
 */
export type MotifErreurTemps =
  | 'hors_calendrier'
  | 'date_invalide'
  | 'instant_invalide'
  | 'duree_invalide'
  | 'intervalle_inverse'
  | 'capacite_invalide';

export class ErreurTemps extends Error {
  readonly motif: MotifErreurTemps;

  constructor(motif: MotifErreurTemps, detail: string) {
    super(`${motif} : ${detail}`);
    this.name = 'ErreurTemps';
    this.motif = motif;
  }
}
