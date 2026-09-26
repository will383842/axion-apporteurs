/**
 * Le disjoncteur du tiers de recherche d'entreprises — INT-T09 (REQ-QA-028, REQ-INT-020).
 *
 * TROIS ÉTATS. `ferme` : les appels partent. `ouvert` : aucun appel ne part, le parcours bascule en
 * saisie manuelle sans toucher au réseau. `demi_ouvert` : l'échéance est passée, UN seul essai
 * part ; réussi, le disjoncteur se referme, manqué, il se rouvre.
 *
 * CE QUI L'OUVRE.
 *   — Un refus pour excès (429) l'ouvre AUSSITÔT, jusqu'à l'échéance que donne `Retry-After`
 *     (REQ-INT-020 : « respect de Retry-After ») ; sans en-tête lisible, pour la pause par défaut.
 *     Insister contre un tiers qui a demandé d'attendre, c'est se faire couper plus longtemps.
 *   — Des échecs consécutifs (délai dépassé, erreur serveur, réponse illisible) l'ouvrent au seuil.
 *
 * L'HEURE EST REÇUE, jamais lue : chaque méthode prend l'instant (CPL-T13).
 *
 * L'ÉTAT EST CELUI DU PROCESSUS. Deux instances ont deux disjoncteurs ; chacune apprend la panne à
 * ses propres dépens, en au plus `seuil` appels. Il est VISIBLE par `etat()` — c'est ce que la
 * console affichera (REQ-INT-020 : « l'état ouvert est visible en console ») ; la page de console
 * elle-même appartient à sa tâche.
 */
import { PARAMETRES } from './parametres';

export type EtatDuDisjoncteur = 'ferme' | 'ouvert' | 'demi_ouvert';

/** Les pannes du tiers qui comptent pour le disjoncteur. */
export type MotifDePanneDuTiers =
  'refus_exces' | 'delai_depasse' | 'erreur_serveur' | 'reponse_illisible';

export interface VueDuDisjoncteur {
  readonly etat: EtatDuDisjoncteur;
  readonly echecsConsecutifs: number;
  /** L'instant (ms UTC) où un essai sera de nouveau permis ; `null` si fermé. */
  readonly repriseAt: number | null;
  readonly dernierMotif: MotifDePanneDuTiers | null;
}

export interface Disjoncteur {
  /** Un appel peut-il partir maintenant ? En demi-ouvert, `true` une seule fois. */
  autoriser(maintenant: number): boolean;
  reussite(): void;
  /** L'essai permis n'est pas parti (refusé en amont, par le débit) : il est rendu, sans échec. */
  abandonner(): void;
  echec(maintenant: number, motif: MotifDePanneDuTiers, retryAfterMs: number | null): void;
  vue(maintenant: number): VueDuDisjoncteur;
}

export interface ReglageDuDisjoncteur {
  readonly seuilEchecs: number;
  readonly pauseMs: number;
}

export function creerDisjoncteur(
  reglage: ReglageDuDisjoncteur = {
    seuilEchecs: PARAMETRES.disjoncteurSeuilEchecs.valeur,
    pauseMs: PARAMETRES.disjoncteurPauseMs.valeur,
  }
): Disjoncteur {
  let echecs = 0;
  let repriseAt: number | null = null;
  let essaiEnCours = false;
  let dernierMotif: MotifDePanneDuTiers | null = null;

  const etat = (maintenant: number): EtatDuDisjoncteur => {
    if (repriseAt === null) return 'ferme';
    return maintenant < repriseAt ? 'ouvert' : 'demi_ouvert';
  };

  return {
    autoriser(maintenant) {
      const e = etat(maintenant);
      if (e === 'ferme') return true;
      if (e === 'ouvert' || essaiEnCours) return false;
      essaiEnCours = true;
      return true;
    },
    reussite() {
      echecs = 0;
      repriseAt = null;
      essaiEnCours = false;
      dernierMotif = null;
    },
    abandonner() {
      essaiEnCours = false;
    },
    echec(maintenant, motif, retryAfterMs) {
      const demiOuvert = essaiEnCours;
      echecs += 1;
      essaiEnCours = false;
      dernierMotif = motif;
      if (motif === 'refus_exces') {
        repriseAt = maintenant + (retryAfterMs ?? reglage.pauseMs);
      } else if (demiOuvert || echecs >= reglage.seuilEchecs) {
        repriseAt = maintenant + reglage.pauseMs;
      }
    },
    vue(maintenant) {
      return { etat: etat(maintenant), echecsConsecutifs: echecs, repriseAt, dernierMotif };
    },
  };
}
