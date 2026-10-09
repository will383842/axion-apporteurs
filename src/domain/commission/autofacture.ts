/**
 * T-ARG-045 — contrat v2, art. 5.1 et 5.3 (REQ-ARG-015, REQ-ARG-018) : une autofacture à chaque
 * encaissement intégral, sans relevé ni seuil.
 *
 * — Établie le jour de l'encaissement intégral qui rend la commission acquise, ou, s'il tombe un jour
 *   non ouvré ou n'est constaté que plus tard, le premier jour ouvré du constat.
 * — Les commissions d'un même apporteur établies le même jour, sommes de parrainage comprises, sont
 *   regroupées en UNE autofacture ; jamais une unicité par jour : une ligne régularisée ou constatée
 *   tard a sa propre autofacture, datée de son constat.
 * — Aucun montant minimum : un centime est facturé.
 * — L'échéance tombe `VERSEMENT_PLAFOND_JOURS` jours civils (Paris) après l'émission.
 * — Une reprise ne diminue jamais l'autofacture : l'avoir s'impute sur la somme virée.
 *
 * Domaine pur : aucune I/O, aucune horloge, aucune base. Aucune donnée bancaire n'entre ici.
 */
import { SEUILS } from '../seuils/ssot';
import { dateDepuisJours, joursDeLaDate, type DateCivile } from '../temps/calendrier-civil';
import { jourOuvre } from '../temps/feries';

type Base = {
  readonly id: string;
  readonly apporteurId: string;
  readonly commissionCents: number;
  /** Le jour où l'encaissement intégral rend la commission acquise (REQ-ARG-004). */
  readonly encaissementIntegralLe: DateCivile;
  /** Le jour où la Société constate l'encaissement intégral. */
  readonly constateLe: DateCivile;
};

export type LigneAcquise =
  | (Base & {
      readonly nature: 'commande';
      readonly commandeRef: string;
      readonly prixFactureCents: number;
      readonly prixPublicCents: number;
    })
  | (Base & { readonly nature: 'parrainage' });

export const LIBELLE_PARRAINAGE = 'Parrainage (article 4.6)';

export type LigneDeDecompte =
  | {
      readonly commandeRef: string;
      readonly prixFactureCents: number;
      readonly prixPublicCents: number;
      readonly commissionCents: number;
      readonly encaissementIntegralLe: DateCivile;
    }
  | { readonly libelle: typeof LIBELLE_PARRAINAGE; readonly commissionCents: number };

export type AutofactureComposee = {
  readonly apporteurId: string;
  /** Le jour d'acquisition commun à ses lignes : la date de la prestation (REQ-ARG-018). */
  readonly acquiseLe: DateCivile;
  readonly emiseLe: DateCivile;
  readonly echeanceLe: DateCivile;
  readonly montantCents: number;
  readonly ligneIds: readonly string[];
  readonly decompte: readonly LigneDeDecompte[];
};

function centimes(v: number, quoi: string): number {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new RangeError(`autofacture : ${quoi} doit être un entier de centimes ≥ 0`);
  }
  return v;
}

/** Le premier jour ouvré à partir du plus tardif de l'encaissement intégral et de son constat. */
export function jourDEtablissement(encaissementLe: DateCivile, constateLe: DateCivile): DateCivile {
  let n = Math.max(joursDeLaDate(encaissementLe), joursDeLaDate(constateLe));
  while (!jourOuvre(n)) n += 1;
  return dateDepuisJours(n);
}

/** Art. 5.3 : l'échéance est le `VERSEMENT_PLAFOND_JOURS`-ième jour civil suivant l'émission. */
export function echeanceAutofacture(emiseLe: DateCivile): DateCivile {
  return dateDepuisJours(joursDeLaDate(emiseLe) + SEUILS.VERSEMENT_PLAFOND_JOURS.valeur);
}

/**
 * Art. 4.5 et 5.1 : l'avoir s'impute par compensation sur la somme à verser ; l'autofacture garde
 * son montant intégral, la somme virée n'est jamais négative, le reliquat passe aux sommes suivantes.
 */
export function imputerAvoirs(
  montantCents: number,
  avoirsCents: number
): { avoirImputeCents: number; sommeVireeCents: number; reliquatCents: number } {
  centimes(montantCents, 'le montant');
  centimes(avoirsCents, "l'avoir");
  const avoirImputeCents = Math.min(montantCents, avoirsCents);
  return {
    avoirImputeCents,
    sommeVireeCents: montantCents - avoirImputeCents,
    reliquatCents: avoirsCents - avoirImputeCents,
  };
}

function composerUne(
  acquiseLe: DateCivile,
  emiseLe: DateCivile,
  ls: readonly LigneAcquise[]
): AutofactureComposee {
  let total = 0n;
  let parrainage: bigint | null = null;
  const decompte: LigneDeDecompte[] = [];
  for (const l of ls) {
    total += BigInt(l.commissionCents);
    if (l.nature === 'parrainage') {
      parrainage = (parrainage ?? 0n) + BigInt(l.commissionCents);
      continue;
    }
    decompte.push({
      commandeRef: l.commandeRef,
      prixFactureCents: centimes(l.prixFactureCents, 'le prix facturé'),
      prixPublicCents: centimes(l.prixPublicCents, 'le prix public'),
      commissionCents: l.commissionCents,
      encaissementIntegralLe: l.encaissementIntegralLe,
    });
  }
  // Le parrainage : une ligne unique, sans identité du filleul, ni commande, ni somme du filleul.
  if (parrainage !== null) {
    decompte.push({ libelle: LIBELLE_PARRAINAGE, commissionCents: Number(parrainage) });
  }
  return {
    apporteurId: ls[0]!.apporteurId,
    acquiseLe,
    emiseLe,
    echeanceLe: echeanceAutofacture(emiseLe),
    montantCents: centimes(Number(total), 'le total'),
    ligneIds: ls.map((l) => l.id),
    decompte,
  };
}

/**
 * Regroupe les lignes acquises en autofactures : une par apporteur, par jour d'ACQUISITION et par
 * jour d'établissement (REQ-ARG-014). Deux jours d'acquisition ne fusionnent jamais, même établis le
 * même jour ouvré ; une ligne constatée plus tard a sa propre autofacture, datée de son constat.
 */
export function composerAutofactures(lignes: readonly LigneAcquise[]): AutofactureComposee[] {
  const groupes = new Map<
    string,
    { acquiseLe: DateCivile; emiseLe: DateCivile; lignes: LigneAcquise[] }
  >();
  for (const l of lignes) {
    centimes(l.commissionCents, 'la commission');
    const emiseLe = jourDEtablissement(l.encaissementIntegralLe, l.constateLe);
    const acquiseLe = l.encaissementIntegralLe;
    const cle = JSON.stringify([l.apporteurId, joursDeLaDate(acquiseLe), joursDeLaDate(emiseLe)]);
    const g = groupes.get(cle) ?? { acquiseLe, emiseLe, lignes: [] };
    g.lignes.push(l);
    groupes.set(cle, g);
  }
  return [...groupes.values()].map((g) => composerUne(g.acquiseLe, g.emiseLe, g.lignes));
}
