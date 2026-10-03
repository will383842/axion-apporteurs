/**
 * L'antériorité d'une entreprise (DM-10-P, REQ-DM-029, contrat art. 3.3) — la règle PURE, évaluée
 * localement, sans appel réseau, sur les faits projetés depuis les événements d'axionia.
 *
 * Une entreprise est connue de la Société, à une date donnée, si elle est :
 *   — inscrite sur la liste tenue par la Société (origine `financeur`, REQ-DM-028) ;
 *   — cliente au titre d'une prestation facturée au cours des `ANTERIORITE_CLIENT_MOIS` derniers mois ;
 *   — signataire d'un devis qui n'est pas entièrement facturé, quelle que soit sa date (art. 3.3) ;
 *   — destinataire d'un devis émis il y a moins de `ANTERIORITE_DEVIS_MOIS` mois.
 * Les fenêtres sont lues dans la SSOT, en mois CIVILS à l'heure de Paris (`ajouterMoisParis`, comme
 * tout délai du domaine), bornes comprises. L'heure n'est jamais lue ici : `maintenant` est reçu.
 */
import { SEUILS } from '../seuils/ssot';
import { ajouterMoisParis } from '../attribution/machine';

/** L'origine d'une entreprise connue : les valeurs du glossaire (`OrigineEntrepriseConnue`). */
export type OrigineEntrepriseConnue = 'client' | 'devis' | 'financeur';

/** La catégorie d'un SIREN de la liste de la Société (art. 3.3 bis (b)) : les valeurs du glossaire. */
export type CategorieListe =
  | 'administration'
  | 'financeur_public'
  | 'financeur_paritaire'
  | 'organisme_de_formation_partenaire';

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
  /** La catégorie sous laquelle elle est inscrite sur la liste de la Société, ou `null`. */
  financeur: CategorieListe | null;
};

export type Anteriorite =
  | { connue: false }
  | { connue: true; origine: 'financeur'; depuis: null; categorie: CategorieListe }
  | { connue: true; origine: 'client' | 'devis'; depuis: Date };

/** L'instant `mois` mois civils avant `maintenant`, à l'heure de Paris. */
function moisAvant(maintenant: Date, mois: number): number {
  return ajouterMoisParis(maintenant.getTime(), -mois);
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

/**
 * Une PRESTATION FACTURÉE, au sens de la fenêtre cliente (art. 3.3) : une facture que rien n'éteint.
 * Une facture annulée, ou entièrement éteinte par ses avoirs (déduits quel que soit leur signe), ne
 * compte pas (remarque de la juriste sur DM-10-P).
 */
export function estPrestationFacturee(
  laFacture: { montantHtCents: number; annulee: boolean },
  avoirs: readonly { montantHtCents: number }[]
): boolean {
  if (laFacture.annulee) return false;
  const credite = avoirs.reduce((s, a) => s + Math.abs(a.montantHtCents), 0);
  return credite < laFacture.montantHtCents;
}

/** L'antériorité d'une entreprise à la date `maintenant`. */
export function evaluerAnteriorite(faits: FaitsDUneEntreprise, maintenant: Date): Anteriorite {
  // Un refus fondé sur la liste se notifie par sa CATÉGORIE, jamais par un organisme (REQ-DM-028).
  if (faits.financeur !== null) {
    return { connue: true, origine: 'financeur', depuis: null, categorie: faits.financeur };
  }

  const limiteClient = moisAvant(maintenant, SEUILS.ANTERIORITE_CLIENT_MOIS.valeur);
  if (faits.derniereFactureAt !== null && faits.derniereFactureAt.getTime() >= limiteClient) {
    return { connue: true, origine: 'client', depuis: faits.derniereFactureAt };
  }

  // Un devis signé et pas entièrement facturé, quelle que soit sa date : le plus ancien fait foi.
  const signesOuverts = faits.devis
    .filter((d) => !estEntierementFacture(d))
    .flatMap((d) => (d.signeAt === null ? [] : [d.signeAt]))
    .sort((a, b) => a.getTime() - b.getTime());
  if (signesOuverts.length > 0) {
    return { connue: true, origine: 'devis', depuis: signesOuverts[0]! };
  }

  const limiteDevis = moisAvant(maintenant, SEUILS.ANTERIORITE_DEVIS_MOIS.valeur);
  const emisRecents = faits.devis
    .filter((d) => d.emisAt.getTime() >= limiteDevis)
    .map((d) => d.emisAt)
    .sort((a, b) => a.getTime() - b.getTime());
  if (emisRecents.length > 0) {
    return { connue: true, origine: 'devis', depuis: emisRecents[0]! };
  }

  return { connue: false };
}
