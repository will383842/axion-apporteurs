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

/** Le critère qui annule cette attribution, ou `null` : seule une attribution NON CONFIRMÉE s'annule (DM-71). */
export function doitEtreAnnulee(
  attribution: { statut: string; deposeeAt: Date },
  faits: FaitsDatesDeLEntreprise
): CritereDAnteriorite | null {
  // DM-71 (art. 3.3 du v2) : seule une attribution NON CONFIRMÉE s'annule pour antériorité.
  return attribution.statut === 'provisoire' ? critereAuDepot(faits, attribution.deposeeAt) : null;
}

/** Où l'annulation est dite : l'apporteur dans son espace ; un conseiller, en console seulement (W19). */
export function canalDInformation(porteur: TypePorteur): 'espace' | 'console' {
  return porteur === 'conseiller' ? 'console' : 'espace';
}

/** Un fait daté qui porte son identifiant d'axionia (`factureId`, `devisId`), nul s'il n'en a pas. */
export type FaitsIdentifiesDeLEntreprise = FaitsDatesDeLEntreprise & {
  /** Les mêmes factures que `facturesAt`, avec leur identifiant. */
  factures: readonly { id: string | null; at: Date }[];
  /** Les mêmes devis que `devis`, avec leur identifiant. */
  devisIdentifies: readonly { id: string | null; devis: DevisConnu }[];
};

/** Le fait qui fonde l'annulation : sa nature, son identifiant d'axionia et sa date. */
export type FaitFondateurAuDepot = {
  nature: 'facture' | 'devis';
  id: string;
  le: Date;
};

const plusRecent = <T>(liste: readonly T[], date: (x: T) => number): T | null =>
  liste.reduce<T | null>((plus, x) => (plus === null || date(x) > date(plus) ? x : plus), null);

/**
 * DM-67, condition (c) de la sécurité : le critère rempli au dépôt AVEC le fait qui le fonde, ou
 * `null`. « cliente » : la DERNIÈRE facture antérieure au dépôt ; « devis_signe » : le devis signé
 * avant le dépôt, non entièrement facturé, le plus récemment signé, daté de sa signature ; « devis » :
 * le devis émis le plus récemment avant le dépôt, daté de son émission. Un fait fondateur SANS
 * identifiant ne fonde rien : on n'annule jamais ce qu'on ne saurait citer.
 */
export function fondementAuDepot(
  faits: FaitsIdentifiesDeLEntreprise,
  deposeeAt: Date
): { critere: CritereDAnteriorite; fait: FaitFondateurAuDepot } | null {
  const critere = critereAuDepot(faits, deposeeAt);
  if (critere === null) return null;
  const t = deposeeAt.getTime();
  let fait: FaitFondateurAuDepot | null = null;
  if (critere === 'cliente') {
    const f = plusRecent(
      faits.factures.filter((x) => x.at.getTime() < t),
      (x) => x.at.getTime()
    );
    if (f !== null && f.id !== null) fait = { nature: 'facture', id: f.id, le: f.at };
  } else if (critere === 'devis_signe') {
    const d = plusRecent(
      faits.devisIdentifies.filter(
        (x) =>
          x.devis.signeAt !== null &&
          x.devis.signeAt.getTime() < t &&
          !estEntierementFacture(x.devis)
      ),
      (x) => x.devis.signeAt!.getTime()
    );
    if (d !== null && d.id !== null) fait = { nature: 'devis', id: d.id, le: d.devis.signeAt! };
  } else {
    const d = plusRecent(
      faits.devisIdentifies.filter((x) => x.devis.emisAt.getTime() < t),
      (x) => x.devis.emisAt.getTime()
    );
    if (d !== null && d.id !== null) fait = { nature: 'devis', id: d.id, le: d.devis.emisAt };
  }
  return fait === null ? null : { critere, fait };
}
