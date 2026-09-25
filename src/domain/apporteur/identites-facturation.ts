/**
 * DM-06 — les identités de facturation DATÉES d'un apporteur (REQ-CPL-005).
 *
 * Un apporteur peut changer de SIREN ou de régime de TVA (micro-entreprise devenue société,
 * franchise devenue assujettissement). Chaque identité vaut sur `[debutAt, finAt)` ; `finAt` nul :
 * elle vaut encore. Un relevé qui chevauche deux identités produit DEUX autofactures, chacune
 * bornée à la part de période que son identité couvre.
 *
 * ÉCHEC FERMÉ. Deux identités qui se chevauchent sont refusées — les départager serait choisir
 * qui facture. Une part de période qu'aucune identité ne couvre aussi : une autofacture sans
 * identité n'existe pas.
 *
 * `isTest` : un apporteur de test ne produit aucune autofacture (REQ-CPL-020).
 *
 * AUCUN RIB NI IBAN ICI (HYP-DM06-IBAN) : l'IBAN vit dans la pièce `rib` du KYC, et la référence à
 * cette pièce est posée par la tâche qui crée le KYC.
 */
import type { Instant } from '../temps/horloge';

/** Les deux régimes de TVA du glossaire (§4, `RegimeTva`). */
export type RegimeTva = 'assujetti' | 'franchise_293b';

export interface IdentiteFacturation {
  readonly siren: string;
  readonly regimeTva: RegimeTva;
  readonly debutAt: Instant;
  /** Exclue ; nulle tant que l'identité vaut. */
  readonly finAt: Instant | null;
}

export interface Periode {
  readonly debutAt: Instant;
  /** Exclue. */
  readonly finAt: Instant;
}

/** Une autofacture à produire : une identité, bornée à la part de période qu'elle couvre. */
export interface AutofactureAProduire extends Periode {
  readonly siren: string;
  readonly regimeTva: RegimeTva;
}

export type CodeIdentites = 'periode_invalide' | 'identites_chevauchantes' | 'periode_non_couverte';

export class ErreurIdentitesFacturation extends Error {
  readonly code: CodeIdentites;

  constructor(code: CodeIdentites, detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurIdentitesFacturation';
    this.code = code;
  }
}

const fin = (i: IdentiteFacturation): Instant => i.finAt ?? Number.POSITIVE_INFINITY;

export function autofacturesDuReleve(
  apporteur: { readonly isTest: boolean; readonly identites: readonly IdentiteFacturation[] },
  periode: Periode
): AutofactureAProduire[] {
  if (!(periode.debutAt < periode.finAt)) {
    throw new ErreurIdentitesFacturation(
      'periode_invalide',
      `${periode.debutAt} >= ${periode.finAt}`
    );
  }
  if (apporteur.isTest) return [];

  const triees = [...apporteur.identites].sort((a, b) => a.debutAt - b.debutAt);
  for (let i = 1; i < triees.length; i += 1) {
    if (triees[i]!.debutAt < fin(triees[i - 1]!)) {
      throw new ErreurIdentitesFacturation(
        'identites_chevauchantes',
        `${triees[i - 1]!.siren} et ${triees[i]!.siren}`
      );
    }
  }

  const autofactures: AutofactureAProduire[] = [];
  let curseur = periode.debutAt;
  for (const identite of triees) {
    const debut = Math.max(identite.debutAt, periode.debutAt);
    const finPart = Math.min(fin(identite), periode.finAt);
    if (debut >= finPart) continue;
    if (debut > curseur) break;
    autofactures.push({
      siren: identite.siren,
      regimeTva: identite.regimeTva,
      debutAt: debut,
      finAt: finPart,
    });
    curseur = finPart;
  }
  if (curseur < periode.finAt) {
    throw new ErreurIdentitesFacturation('periode_non_couverte', `à partir de ${curseur}`);
  }
  return autofactures;
}
