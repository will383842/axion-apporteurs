/**
 * DM-06 — la matrice de transitions du statut d'apporteur (REQ-DM-011).
 *
 * UNE TRANSITION ABSENTE EST REFUSÉE, JAMAIS AUTORISÉE PAR OMISSION. La matrice énumère, pour
 * chaque statut, les SEULS statuts qu'il peut atteindre ; tout autre couple lève une erreur typée
 * qui NOMME la transition (`de -> vers`), et rien n'est écrit.
 *
 * D'OÙ VIENNENT LES FLÈCHES. Du sens de chaque statut au glossaire (§2) et des étapes du parcours
 * qu'il résume — décision de candidature (retenu, vivier, refusé), KYC, contrat, puis fin de
 * collaboration :
 *   — `candidat` → `retenu` | `vivier` | `refuse` : la décision de candidature ;
 *   — `vivier` → `retenu` | `refuse` : la décision différée finit par se prendre ;
 *   — `retenu` → `kyc_en_cours` : la collecte des pièces s'ouvre ;
 *   — `kyc_en_cours` → `pret_a_signer` : KYC valide, contrat envoyé ;
 *   — `pret_a_signer` → `signe` : contrat signé ;
 *   — `signe` → `suspendu` | `resilie` ; `suspendu` → `signe` (levée) | `resilie` ;
 *   — `refuse` et `resilie` sont SANS ISSUE.
 * Une flèche qui manquerait s'ajoute ici, par une tâche qui la cite ; elle ne s'improvise jamais
 * chez un appelant. Les EFFETS de la résiliation (attributions, lignes, événements) ne sont pas
 * ici : ce module ne dit que si la transition est permise.
 *
 * LE MOTIF DE RÉSILIATION. Une transition vers `resilie` EXIGE un motif ; toute autre transition
 * n'en porte aucun : un motif posé hors résiliation serait une donnée sans cause.
 */
import {
  estMotifResiliation,
  estStatutApporteur,
  type MotifResiliation,
  type StatutApporteur,
} from './statut';

/** La matrice : pour chaque statut, les seuls statuts atteignables. Totale sur les neuf statuts. */
export const TRANSITIONS_APPORTEUR: {
  readonly [S in StatutApporteur]: readonly StatutApporteur[];
} = {
  candidat: ['retenu', 'vivier', 'refuse'],
  retenu: ['kyc_en_cours'],
  vivier: ['retenu', 'refuse'],
  refuse: [],
  kyc_en_cours: ['pret_a_signer'],
  pret_a_signer: ['signe'],
  signe: ['suspendu', 'resilie'],
  suspendu: ['signe', 'resilie'],
  resilie: [],
};

export type CodeTransition =
  'statut_inconnu' | 'transition_refusee' | 'motif_requis' | 'motif_interdit';

export class ErreurTransitionApporteur extends Error {
  readonly code: CodeTransition;

  constructor(code: CodeTransition, detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurTransitionApporteur';
    this.code = code;
  }
}

export interface DemandeTransition {
  readonly de: StatutApporteur;
  readonly vers: StatutApporteur;
  readonly motif: MotifResiliation | null;
}

export interface StatutApresTransition {
  readonly statut: StatutApporteur;
  readonly resiliationMotif: MotifResiliation | null;
}

/**
 * Juge une transition et rend l'état qui en résulte. Lève `ErreurTransitionApporteur` — jamais un
 * booléen qu'un appelant pourrait oublier de lire.
 */
export function transitionner(demande: DemandeTransition): StatutApresTransition {
  const { de, vers, motif } = demande;
  for (const s of [de, vers]) {
    if (!estStatutApporteur(s)) throw new ErreurTransitionApporteur('statut_inconnu', String(s));
  }
  if (!TRANSITIONS_APPORTEUR[de].includes(vers)) {
    throw new ErreurTransitionApporteur('transition_refusee', `${de} -> ${vers}`);
  }
  if (vers === 'resilie') {
    if (motif === null || !estMotifResiliation(motif)) {
      throw new ErreurTransitionApporteur('motif_requis', `${de} -> ${vers}`);
    }
    return { statut: vers, resiliationMotif: motif };
  }
  if (motif !== null) {
    throw new ErreurTransitionApporteur('motif_interdit', `${de} -> ${vers}`);
  }
  return { statut: vers, resiliationMotif: null };
}
