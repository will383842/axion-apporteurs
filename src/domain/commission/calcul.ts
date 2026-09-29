/**
 * Le calcul d'une commission et son prorata entier — DM-04 (REQ-DM-015, REQ-DM-017, REQ-ARG-004,
 * REQ-ARG-007, REQ-ARG-017, REQ-DM-040 ; avenant A01 du 2026-09-29).
 *
 * LE BARÈME EST CHOISI UNE SEULE FOIS, ET PAS ICI. La ligne de devis arrive avec le `commissionId`
 * que le producteur (axionia) a résolu depuis l'activité et les journées. Refaire ce choix dans
 * Partners en ferait une seconde source (RM-01) : `activite` et `jours` sont reçus, jamais lus pour
 * choisir un barème. Le montant, lui, est lu dans la VERSION de grille importée, jamais retapé.
 *
 * AUCUN CAS NE REND ZÉRO, AUCUN CAS NE LÈVE (REQ-DM-015). Zéro est un montant ; l'absence de barème
 * n'en est pas un. Une ligne sans barème, `scale`, ou hors domaine rend le blocage `a_qualifier`
 * (libellé apporteur « Prestation hors grille de commissions », REQ-ARG-017) ; au-delà du plafond,
 * `commission_sup_ht`, que seule une décision journalisée lève (REQ-ARG-007).
 *
 * LE FORFAIT SE COMPTE UNE FOIS PAR COMMANDE (correction du 2026-09-03) : `jours` n'entre dans
 * aucune multiplication de ce fichier.
 *
 * TOUT EN ENTIERS. Un pourcentage est en points de base ; le produit passe par `BigInt` pour ne
 * jamais quitter les entiers exacts, et l'arrondi au demi-centime supérieur est écrit en entiers.
 *
 * Domaine pur : aucune I/O, aucune horloge, aucune base.
 */
import { BPS_MAX, type ContenuGrille } from './grille';
import { PARAMETRES } from '../seuils/ssot';

export type EntreeCalcul = {
  /** La version de grille IMPORTÉE sous laquelle la ligne est calculée. */
  readonly grille: ContenuGrille;
  /** Résolu par le producteur ; nul si aucun barème ne vise la ligne. */
  readonly commissionId: string | null;
  /** Reçus du producteur ; ne choisissent JAMAIS le barème (avenant A01). */
  readonly activite: string | null;
  readonly jours: number | null;
  readonly montantHtCents: number;
};

/** Les deux motifs de `MotifBlocage` que ce calcul peut poser (REQ-ARG-017). */
export type MotifBlocageCalcul = 'a_qualifier' | 'commission_sup_ht';

export type VerdictCommission =
  | { readonly statut: 'calculee'; readonly commissionId: string; readonly montantCents: number }
  | {
      readonly statut: 'bloquee';
      readonly commissionId: string | null;
      readonly motifBlocage: 'a_qualifier';
    }
  | {
      /**
       * Au-delà du plafond, la ligne est bloquée, mais son montant est ÉTABLI et porté : REQ-ARG-017
       * (A-5) veut qu'elle soit payée à ce montant, l'écart éventuel se corrigeant par ajustement.
       * Le jeter obligerait le versement à le recalculer — une seconde source.
       */
      readonly statut: 'bloquee';
      readonly commissionId: string;
      readonly motifBlocage: 'commission_sup_ht';
      readonly montantCents: number;
    };

const bloquee = (commissionId: string | null): VerdictCommission => ({
  statut: 'bloquee',
  commissionId,
  motifBlocage: 'a_qualifier',
});

/** round(taux × HT / 100 %), au demi-centime supérieur, en entiers exacts (HT ≥ 0). */
function pourcentage(tauxBps: number, montantHtCents: number): number {
  const base = BigInt(BPS_MAX);
  return Number((2n * BigInt(tauxBps) * BigInt(montantHtCents) + base) / (2n * base));
}

export function calculerCommission(e: EntreeCalcul): VerdictCommission {
  const { commissionId, montantHtCents } = e;
  if (commissionId === null) return bloquee(null);
  if (!Number.isSafeInteger(montantHtCents) || montantHtCents < 0) {
    return bloquee(commissionId);
  }
  const ligne = e.grille.commissions.find((c) => c.commissionId === commissionId);
  if (ligne === undefined) return bloquee(commissionId);

  let montantCents: number;
  if (ligne.kind === 'flat' && ligne.montantCents !== null) {
    montantCents = ligne.montantCents; // une fois par commande : `jours` n'y entre pas
  } else if (ligne.kind === 'percent' && ligne.tauxBps !== null) {
    montantCents = pourcentage(ligne.tauxBps, montantHtCents);
  } else {
    return bloquee(commissionId);
  }

  // Plafond : montant > plafond × HT, comparé en entiers exacts.
  const plafond = BigInt(PARAMETRES.PLAFOND_COMMISSION_BPS.valeur);
  if (BigInt(montantCents) * BigInt(BPS_MAX) > plafond * BigInt(montantHtCents)) {
    return { statut: 'bloquee', commissionId, motifBlocage: 'commission_sup_ht', montantCents };
  }
  return { statut: 'calculee', commissionId, montantCents };
}

/**
 * Les parts acquises, une par encaissement, dans l'ordre reçu (REQ-ARG-004, REQ-DM-017) :
 * part_i = ⌊ commission × min(cumul TTC_i, TTC net) / TTC net ⌋ − Σ parts précédentes.
 * Numérateur et dénominateur sont TOUS DEUX TTC. Le cumul est borné au TTC net : un trop-perçu
 * n'acquiert rien au-delà de la commission. La formule est cumulative : l'état final ne dépend pas
 * de l'ordre des encaissements, et le dernier absorbe le reliquat d'arrondi par construction.
 * Entrées entières positives exigées : sinon, `RangeError` — un prorata sur une donnée fausse
 * n'a pas de valeur par défaut.
 */
export function partsDuProrata(
  commissionTotaleCents: number,
  factureTtcNetCents: number,
  encaissementsTtcCents: readonly number[]
): number[] {
  const entierPositif = (n: number) => Number.isSafeInteger(n) && n > 0;
  if (!Number.isSafeInteger(commissionTotaleCents) || commissionTotaleCents < 0) {
    throw new RangeError('prorata : la commission totale doit être un entier de centimes ≥ 0');
  }
  if (!entierPositif(factureTtcNetCents)) {
    throw new RangeError('prorata : le TTC net de la facture doit être un entier de centimes > 0');
  }
  const total = BigInt(commissionTotaleCents);
  const net = BigInt(factureTtcNetCents);
  let cumul = 0n;
  let acquis = 0n;
  return encaissementsTtcCents.map((e, i) => {
    if (!entierPositif(e)) {
      throw new RangeError(`prorata : l'encaissement ${i} doit être un entier de centimes > 0`);
    }
    cumul += BigInt(e);
    const borne = cumul < net ? cumul : net;
    const part = (total * borne) / net - acquis;
    acquis += part;
    return Number(part);
  });
}
