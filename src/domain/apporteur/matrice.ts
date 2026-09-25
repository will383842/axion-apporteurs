/**
 * DM-06 — la matrice de transitions du statut d'apporteur (REQ-DM-011), sous la forme que fixe
 * `docs/CONVENTIONS.md` §2 : `from × événement → to`.
 *
 * UN COUPLE (ÉTAT, ÉVÉNEMENT) ABSENT EST REFUSÉ, JAMAIS AUTORISÉ PAR OMISSION. Pour chaque statut,
 * la matrice énumère les SEULS événements qu'il accepte et le statut d'arrivée de chacun ; tout
 * autre couple lève une erreur typée qui le NOMME (`statut × événement`), et rien n'est écrit.
 * L'événement est la CAUSE de la transition : c'est lui que le journal écrira (REQ-DM-024).
 *
 * D'OÙ VIENNENT LES FLÈCHES. Du sens de chaque statut au glossaire (§2) et des étapes du parcours
 * qu'il résume — décision de candidature (retenu, vivier, refusé), KYC, contrat, puis fin de
 * collaboration :
 *   — `candidat` : `retenir` → `retenu`, `mettre_en_vivier` → `vivier`, `refuser` → `refuse` ;
 *   — `vivier` : `retenir` → `retenu`, `refuser` → `refuse` ;
 *   — `retenu` : `ouvrir_kyc` → `kyc_en_cours` ;
 *   — `kyc_en_cours` : `valider_kyc` → `pret_a_signer` ;
 *   — `pret_a_signer` : `signer` → `signe` ;
 *   — `signe` : `suspendre` → `suspendu`, `resilier` → `resilie` ;
 *   — `suspendu` : `lever_suspension` → `signe`, `resilier` → `resilie` ;
 *   — `refuse` et `resilie` sont SANS ISSUE.
 * ⚠️ DETTE NOMMÉE : ni le glossaire §2 ni REQ-DM-011 ne prévoient de sortie depuis `kyc_en_cours`
 * ni `pret_a_signer` autre que l'avancée ; un KYC abandonné reste donc dans son statut. Aucune
 * flèche n'est inventée ici : elle s'ajoutera par la tâche qui la citera.
 * Les EFFETS de la résiliation (attributions, lignes, événements) ne sont pas ici : ce module ne
 * dit que si la transition est permise.
 *
 * LE MOTIF DE RÉSILIATION. `resilier` EXIGE un motif ; tout autre événement n'en porte aucun : un
 * motif posé hors résiliation serait une donnée sans cause.
 */
import {
  estEvenementApporteur,
  estMotifResiliation,
  estStatutApporteur,
  type EvenementApporteur,
  type MotifResiliation,
  type StatutApporteur,
} from './statut';

/** La matrice : pour chaque statut, les seuls événements acceptés et leur statut d'arrivée. */
export const TRANSITIONS_APPORTEUR: {
  readonly [S in StatutApporteur]: Readonly<Partial<Record<EvenementApporteur, StatutApporteur>>>;
} = {
  candidat: { retenir: 'retenu', mettre_en_vivier: 'vivier', refuser: 'refuse' },
  retenu: { ouvrir_kyc: 'kyc_en_cours' },
  vivier: { retenir: 'retenu', refuser: 'refuse' },
  refuse: {},
  kyc_en_cours: { valider_kyc: 'pret_a_signer' },
  pret_a_signer: { signer: 'signe' },
  signe: { suspendre: 'suspendu', resilier: 'resilie' },
  suspendu: { lever_suspension: 'signe', resilier: 'resilie' },
  resilie: {},
};

export type CodeTransition =
  | 'statut_inconnu'
  | 'evenement_inconnu'
  | 'transition_refusee'
  | 'motif_requis'
  | 'motif_inconnu'
  | 'motif_interdit';

export class ErreurTransitionApporteur extends Error {
  readonly code: CodeTransition;

  constructor(code: CodeTransition, detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurTransitionApporteur';
    this.code = code;
  }
}

/**
 * Une valeur REFUSÉE est nommée dans l'erreur, mais bornée : elle vient de l'appelant, et un
 * message qui finit au journal ne recopie pas en entier une chaîne hostile.
 */
const LONGUEUR_NOMMEE_MAX = 64;
const borne = (valeur: unknown): string => String(valeur).slice(0, LONGUEUR_NOMMEE_MAX);

export interface DemandeTransition {
  readonly de: StatutApporteur;
  readonly evenementApporteur: EvenementApporteur;
  readonly motif: MotifResiliation | null;
}

export interface StatutApresTransition {
  readonly statut: StatutApporteur;
  readonly resiliationMotif: MotifResiliation | null;
}

/**
 * Juge un couple (état, événement) et rend l'état qui en résulte. Lève `ErreurTransitionApporteur`
 * — jamais un booléen qu'un appelant pourrait oublier de lire.
 */
export function transitionner(demande: DemandeTransition): StatutApresTransition {
  // Le champ ne s'appelle pas du nom du journal : `journal:sans-pii` réserve ce mot nu à son
  // écrivain unique, et ces événements de domaine n'y écrivent rien.
  const { de, evenementApporteur: fait, motif } = demande;
  if (!estStatutApporteur(de)) throw new ErreurTransitionApporteur('statut_inconnu', borne(de));
  if (!estEvenementApporteur(fait)) {
    throw new ErreurTransitionApporteur('evenement_inconnu', borne(fait));
  }
  const vers = TRANSITIONS_APPORTEUR[de][fait];
  const couple = `${de} × ${fait}`;
  if (vers === undefined) throw new ErreurTransitionApporteur('transition_refusee', couple);
  if (fait === 'resilier') {
    if (motif === null) throw new ErreurTransitionApporteur('motif_requis', couple);
    if (!estMotifResiliation(motif)) {
      throw new ErreurTransitionApporteur('motif_inconnu', `${couple} : ${borne(motif)}`);
    }
    return { statut: vers, resiliationMotif: motif };
  }
  if (motif !== null) throw new ErreurTransitionApporteur('motif_interdit', couple);
  return { statut: vers, resiliationMotif: null };
}
