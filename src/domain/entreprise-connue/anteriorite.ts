/**
 * L'antériorité d'une entreprise (DM-10-P, REQ-DM-029, contrat art. 3.3) — la règle PURE, évaluée
 * localement, sans appel réseau, sur les faits projetés depuis les événements d'axionia.
 *
 * Une entreprise est connue de la Société, à une date donnée, si elle est :
 *   — inscrite sur la liste tenue par la Société (origine `financeur`, REQ-DM-028) ;
 *   — cliente au titre d'une prestation facturée au cours des `ANTERIORITE_CLIENT_MOIS` derniers mois ;
 *   — signataire d'un devis qui n'est pas entièrement facturé, quelle que soit sa date (JUR-T42) ;
 *   — destinataire d'un devis émis il y a moins de `ANTERIORITE_DEVIS_MOIS` mois.
 * Les fenêtres sont lues dans la SSOT, en mois civils UTC, bornes comprises.
 */
import { SEUILS } from '../seuils/ssot';

/** L'origine d'une entreprise connue : les valeurs du glossaire (`OrigineEntrepriseConnue`). */
export type OrigineEntrepriseConnue = 'client' | 'devis' | 'financeur';

/** Un devis d'axionia, tel que projeté (`devis_connus`). */
export type DevisConnu = {
  emisAt: Date;
  signeAt: Date | null;
  montantTotalHtCents: number;
  /** La somme HT des factures non annulées qui en procèdent, avoirs déduits. */
  factureHtCents: number;
};

/** Les faits projetés d'une entreprise, par son SIREN. */
export type FaitsDUneEntreprise = {
  /** La date de la dernière facture non annulée, ou `null` si aucune. */
  derniereFactureAt: Date | null;
  devis: readonly DevisConnu[];
  /** Inscrite sur la liste tenue par la Société. */
  financeur: boolean;
};

export type Anteriorite =
  | { connue: false }
  | { connue: true; origine: 'financeur'; depuis: null }
  | { connue: true; origine: 'client' | 'devis'; depuis: Date };

/** La date `mois` mois civils avant `maintenant`, en UTC. */
function moisAvant(maintenant: Date, mois: number): Date {
  const d = new Date(maintenant.getTime());
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d;
}

/** « Entièrement facturé » : le facturé HT, avoirs déduits, atteint le montant HT du devis (B-11). */
export function estEntierementFacture(d: DevisConnu): boolean {
  return d.factureHtCents >= d.montantTotalHtCents;
}

/**
 * Le facturé HT d'un devis : la somme des factures NON annulées qui en procèdent, moins les avoirs
 * émis sur elles. Un avoir est déduit quel que soit le signe sous lequel il est transmis.
 */
export function factureHtDuDevis(
  factures: readonly { montantHtCents: number; annulee: boolean }[],
  avoirs: readonly { montantHtCents: number }[]
): number {
  const facture = factures.filter((f) => !f.annulee).reduce((s, f) => s + f.montantHtCents, 0);
  return avoirs.reduce((s, a) => s - Math.abs(a.montantHtCents), facture);
}

/** L'antériorité d'une entreprise à la date `maintenant`. */
export function evaluerAnteriorite(faits: FaitsDUneEntreprise, maintenant: Date): Anteriorite {
  if (faits.financeur) return { connue: true, origine: 'financeur', depuis: null };

  const limiteClient = moisAvant(maintenant, SEUILS.ANTERIORITE_CLIENT_MOIS.valeur);
  if (faits.derniereFactureAt !== null && faits.derniereFactureAt >= limiteClient) {
    return { connue: true, origine: 'client', depuis: faits.derniereFactureAt };
  }

  // Un devis signé et pas entièrement facturé, quelle que soit sa date : le plus ancien fait foi.
  const signesOuverts = faits.devis
    .filter((d) => d.signeAt !== null && !estEntierementFacture(d))
    .map((d) => d.signeAt as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  if (signesOuverts.length > 0) {
    return { connue: true, origine: 'devis', depuis: signesOuverts[0]! };
  }

  const limiteDevis = moisAvant(maintenant, SEUILS.ANTERIORITE_DEVIS_MOIS.valeur);
  const emisRecents = faits.devis
    .filter((d) => d.emisAt >= limiteDevis)
    .map((d) => d.emisAt)
    .sort((a, b) => a.getTime() - b.getTime());
  if (emisRecents.length > 0) {
    return { connue: true, origine: 'devis', depuis: emisRecents[0]! };
  }

  return { connue: false };
}
