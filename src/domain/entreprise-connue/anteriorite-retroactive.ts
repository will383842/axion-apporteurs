/**
 * L'antériorité établie APRÈS l'enregistrement (DM-25, REQ-JUR-007) — la règle PURE, rectifiée par
 * la juriste.
 *
 * L'art. 3.3 juge l'antériorité AU DÉPÔT. Une attribution qui occupe un SIREN est annulée si, à
 * `deposeeAt`, l'un des trois critères était rempli par des faits datés AVANT le dépôt : une
 * prestation facturée dans la fenêtre cliente (`cliente`), un devis émis dans la fenêtre des devis
 * (`devis`), un devis signé et pas entièrement facturé au jour du dépôt (`devis_signe`). La règle est
 * celle de l'antériorité (`evaluerAnteriorite`), évaluée À `deposeeAt` sur les seuls faits antérieurs :
 * aucune fenêtre n'est recopiée ici.
 *
 * RÈGLE IMPÉRATIVE : un fait daté au dépôt ou après n'annule JAMAIS — une facture, une émission, une
 * signature postérieures sont ignorées. La liste de la Société n'est pas un de ces critères.
 */
import { occupe } from '../attribution/etats';
import {
  CRITERES_D_ANTERIORITE,
  type CritereDAnteriorite,
  type TypePorteur,
} from '../attribution/machine';
import { estEntierementFacture, evaluerAnteriorite, type DevisConnu } from './anteriorite';

/** Le critère, en enum INTERNE de l'événement : celui de la machine (DM-67), jamais recopié. */
export { CRITERES_D_ANTERIORITE, type CritereDAnteriorite };

/**
 * Les faits datés d'une entreprise. Pour chaque devis, `factureHtCents` est le facturé HT, avoirs
 * déduits, par des factures datées AVANT le dépôt : c'est à l'appelant de le compter ainsi.
 */
export type FaitsDatesDeLEntreprise = {
  /** Les dates des prestations facturées (factures non annulées ni éteintes par leurs avoirs). */
  facturesAt: readonly Date[];
  devis: readonly DevisConnu[];
};

/** Le critère rempli au dépôt par des faits antérieurs, ou `null`. */
export function critereAuDepot(
  faits: FaitsDatesDeLEntreprise,
  deposeeAt: Date
): CritereDAnteriorite | null {
  const t = deposeeAt.getTime();
  const factures = faits.facturesAt.filter((d) => d.getTime() < t);
  // Un devis émis après le dépôt n'existe pas encore ; signé après, il n'est pas encore signé.
  const devis = faits.devis
    .filter((d) => d.emisAt.getTime() < t)
    .map((d) => (d.signeAt !== null && d.signeAt.getTime() < t ? d : { ...d, signeAt: null }));
  const derniereFactureAt = factures.reduce<Date | null>(
    (plus, d) => (plus === null || d.getTime() > plus.getTime() ? d : plus),
    null
  );
  const a = evaluerAnteriorite({ derniereFactureAt, devis, financeur: null }, deposeeAt);
  if (!a.connue) return null;
  if (a.origine === 'client') return 'cliente';
  return devis.some((d) => d.signeAt !== null && !estEntierementFacture(d))
    ? 'devis_signe'
    : 'devis';
}

/** Le critère qui annule cette attribution, ou `null` : seule une attribution qui OCCUPE s'annule. */
export function doitEtreAnnulee(
  attribution: { statut: string; deposeeAt: Date },
  faits: FaitsDatesDeLEntreprise
): CritereDAnteriorite | null {
  return occupe(attribution.statut) ? critereAuDepot(faits, attribution.deposeeAt) : null;
}

/** Où l'annulation est dite : l'apporteur dans son espace ; un conseiller, en console seulement (W19). */
export function canalDInformation(porteur: TypePorteur): 'espace' | 'console' {
  return porteur === 'conseiller' ? 'console' : 'espace';
}
