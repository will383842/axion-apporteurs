/**
 * Le calcul d'une commission et son acquisition au paiement intégral — DM-04, T-ARG-044 (REQ-DM-015, REQ-DM-017, REQ-ARG-004,
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
import type { DateCivile } from '../temps/calendrier-civil';

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
 * T-ARG-044 (contrat v2, art. 4.0, 4.2 et 4.3) — l'ACQUISITION AU PAIEMENT INTÉGRAL. La commission est
 * acquise lorsque la Société a encaissé l'intégralité du prix facturé au titre de la commande, NET DES
 * AVOIRS, tous payeurs confondus (le client, un opérateur de compétences ou tout autre financeur) ;
 * jamais à la signature, jamais à la facture. AUCUNE part n'est due au titre d'un paiement partiel :
 * le prorata est retiré. La date est celle du crédit effectif des fonds qui SOLDE la commande.
 *
 * LES AVOIRS SONT DATÉS (A15, #815 ; juriste, #815 6041629550) : le fait générateur est un ÉTAT, jugé
 * à chaque date sur les avoirs ÉMIS à cette date, sans lecture rétroactive. La date d'acquisition est
 * le premier jour, crédits et avoirs confondus, où le cumul encaissé atteint le prix moins les avoirs
 * connus ce jour-là ; un crédit et un avoir du même jour se comptent ensemble.
 *
 * TOUT EN ENTIERS : le cumul et le prix se comparent en `BigInt`, exactement ; un centime manquant
 * ne rend rien acquis. Un encaissement NUL n'ajoute rien ; un montant négatif ou non entier, un avoir
 * négatif ou un prix net nul ou négatif LÈVENT, nommés : une donnée fausse n'a pas de valeur par défaut.
 *
 * Ce que ce domaine NE fait PAS (limite nommée, conditions 1 et 2 de la sécurité) : il ne lit aucune
 * source. Le registre des lignes de commission, qui n'existe pas encore, devra ne cumuler que des
 * encaissements reçus par le canal signé, et juger l'acquisition sous le verrou de la commande, une
 * seule fois.
 */
export type Payeur = 'client' | 'opco' | 'autre_financeur';

export type EncaissementRecu = {
  readonly montantCents: number;
  readonly payeur: Payeur;
  /** Le jour du crédit effectif des fonds (art. 4.0). */
  readonly creditLe: DateCivile;
};

/** Un avoir émis sur la facture de la commande, et son jour d'émission. */
export type AvoirEmis = {
  readonly montantCents: number;
  readonly le: DateCivile;
};

export type Acquisition =
  { readonly acquise: false } | { readonly acquise: true; readonly le: DateCivile };

const entierPositifOuNul = (v: number) => Number.isSafeInteger(v) && v >= 0;
const ordreDuJour = (d: DateCivile) => d.annee * 10_000 + d.mois * 100 + d.jour;

export function acquisitionAuPaiementIntegral(
  commande: { readonly prixFactureCents: number; readonly avoirs: readonly AvoirEmis[] },
  encaissements: readonly EncaissementRecu[]
): Acquisition {
  if (!entierPositifOuNul(commande.prixFactureCents)) {
    throw new RangeError('acquisition : le prix facturé doit être un entier de centimes ≥ 0');
  }
  let totalAvoirs = 0n;
  commande.avoirs.forEach((a, i) => {
    if (!entierPositifOuNul(a.montantCents)) {
      throw new RangeError(`acquisition : l'avoir ${i} doit être un entier de centimes ≥ 0`);
    }
    totalAvoirs += BigInt(a.montantCents);
  });
  if (BigInt(commande.prixFactureCents) - totalAvoirs <= 0n) {
    throw new RangeError('acquisition : le prix net des avoirs doit être > 0');
  }
  encaissements.forEach((e, i) => {
    if (!entierPositifOuNul(e.montantCents)) {
      throw new RangeError(`acquisition : l'encaissement ${i} doit être un entier de centimes ≥ 0`);
    }
  });
  // Les jours où l'état change, dans l'ordre : chaque jour, ses crédits ET ses avoirs, ensemble.
  const jours = new Map<number, { le: DateCivile; credits: bigint; avoirs: bigint }>();
  const jour = (le: DateCivile) => {
    const k = ordreDuJour(le);
    const j = jours.get(k) ?? { le, credits: 0n, avoirs: 0n };
    jours.set(k, j);
    return j;
  };
  for (const e of encaissements) jour(e.creditLe).credits += BigInt(e.montantCents);
  for (const a of commande.avoirs) jour(a.le).avoirs += BigInt(a.montantCents);
  let cumul = 0n;
  let net = BigInt(commande.prixFactureCents);
  for (const k of [...jours.keys()].sort((a, b) => a - b)) {
    const j = jours.get(k)!;
    cumul += j.credits;
    net -= j.avoirs;
    if (cumul >= net) return { acquise: true, le: j.le };
  }
  return { acquise: false };
}
