/**
 * payloads.ts — la charge FERMÉE de chacun des types du contrat (REQ-INT-005, REQ-INT-006,
 * REQ-INT-032, REQ-QA-007).
 *
 * D'OÙ VIENNENT CES CHAMPS. Aucun n'est deviné : chacun est un champ que le producteur réel
 * d'axionia construit (`src/server/partners/payloads.ts` de ce dépôt-là) et que sa fixture générée
 * porte (`scripts/partners/fixtures.ts`, copiée à l'identique — même JSON, mise en forme par
 * Prettier — sous `tests/fixtures/axionia/fixtures-producteur.v1.json`). Le test de contrat confronte, clé pour clé
 * et dans les DEUX sens, chaque `$defs` à ces charges : un champ déclaré ici que le producteur ne
 * produit pas rougit, un champ produit que ce fichier ne déclare pas rougit aussi (RM-03). La
 * NULLABILITÉ, qu'une fixture ne peut pas montrer quand la valeur y est renseignée, est celle des
 * types du producteur (`string | null`) ; le type d'une valeur nulle dans la fixture aussi.
 *
 * CE QUI RESTE OUVERT, ET POURQUOI. Trois valeurs de la candidature sont des objets dont la forme
 * suit le questionnaire et le barème, versionnés côté axionia (`reponsesJson`, `scorePartsJson`,
 * `utm`) : les fermer ici ferait de chaque question ajoutée un déploiement coordonné des deux
 * dépôts. Elles restent des objets, déclarés comme tels ; le producteur les trie par une liste
 * fermée dans les deux sens, et la frontière (`champsInterdits`, `events.ts`) les inspecte jusqu'à
 * la dernière feuille. Les valeurs d'énumération (`origineClient`, `motif`, `forme`, `statut`…)
 * sont des chaînes : leur liste vit chez le producteur, et la recopier ici en ferait une seconde
 * source (RM-01).
 *
 * LA CASSE est celle du code de ce dépôt — camelCase, suffixes `…Cents` —, à deux exceptions que le
 * producteur a choisies et qui sont gardées telles quelles : `paidAt` et `provider` du paiement,
 * noms des colonnes de son modèle `Payment`.
 *
 * UN SEUL CHAMP DIFFÈRE DU PRODUCTEUR DE LA VERSION 1, ET C'EST LE GLOSSAIRE QUI LE NOMME. Le HT
 * encaissé d'un paiement reçu (REQ-DM-018) sortait sous le nom anglais que `docs/GLOSSAIRE.md` §3
 * range parmi les synonymes interdits, avec son terme canonique : `montantHtCents`. Le contrat v2
 * porte le terme canonique ; le producteur le renomme en publiant la version 2 (lockstep), et le
 * test de contrat nomme ce seul renommage, sans quoi la confrontation à la fixture v1 mentirait.
 */

import { MOTIF_INSTANT, type FragmentSchema } from './enveloppe';
import type { TypeEvenement } from './events';

// ── les briques ──────────────────────────────────────────────────────────────

/** Un identifiant : une chaîne non vide. Sa forme (uuid, cuid) appartient au producteur. */
const identifiant: FragmentSchema = { type: 'string', minLength: 1 };
const chaine: FragmentSchema = { type: 'string' };
const entier: FragmentSchema = { type: 'integer' };
/**
 * Un montant en centimes, jamais négatif (version 3, rattrapage 46). L'inventaire préalable des
 * types porteurs de montants, lu dans la fixture du producteur réel : seul `avoir.emis` porte des
 * montants négatifs PAR CONCEPTION (un avoir retranche) ; ses trois montants restent des `entier`.
 * `paiement.rembourse` porte des montants positifs (le remboursement est un sens, pas un signe),
 * `facture.annulee` n'en porte aucun.
 */
const centimes: FragmentSchema = { type: 'integer', minimum: 0 };
const nombre: FragmentSchema = { type: 'number' };
const booleen: FragmentSchema = { type: 'boolean' };
/** Un instant RFC 3339 avec fuseau — la même forme que les instants de l'enveloppe. */
const instant: FragmentSchema = { type: 'string', pattern: MOTIF_INSTANT };
const objetLibre: FragmentSchema = { type: 'object' };

/**
 * La même valeur, ou `null`. Écrit en `anyOf` et non en `type: [x, "null"]` : un valideur strict
 * (ajv en mode `strict`, celui des deux dépôts) refuse les unions de types sans option dédiée, et
 * le contrat publié doit se compiler tel quel des deux côtés.
 */
export function ouNul(schema: FragmentSchema): FragmentSchema {
  return { anyOf: [schema, { type: 'null' }] };
}

/** Un objet FERMÉ : chaque champ exigé (le producteur les écrit tous, nuls compris), aucun autre. */
function ferme(proprietes: Record<string, FragmentSchema>): FragmentSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(proprietes),
    properties: proprietes,
  };
}

const liste = (items: FragmentSchema): FragmentSchema => ({ type: 'array', items });

// ── les morceaux partagés ────────────────────────────────────────────────────

/** Un payeur et ce qu'on attend de lui — la ventilation d'une facture (REQ-INT-032). */
const payeur = ferme({ payeurType: chaine, montantAttenduCents: centimes });

/** La fiche d'un client, identique à la création et à la mise à jour. */
const client = ferme({
  clientId: identifiant,
  numero: chaine,
  type: chaine,
  raisonSociale: ouNul(chaine),
  siren: ouNul(chaine),
  nafCode: ouNul(chaine),
  secteur: ouNul(chaine),
  taille: ouNul(chaine),
  creeLe: instant,
  misAJourLe: instant,
});

/** Le verdict de commission d'une ligne de devis, tel que le producteur le résout. */
const commissionDeLigne = ferme({
  statut: chaine,
  commissionId: ouNul(chaine),
  montantCents: ouNul(centimes),
  motifBlocage: ouNul(chaine),
  libelleCommission: ouNul(chaine),
  grilleVersion: chaine,
});

const ligneDeDevis = ferme({
  designation: chaine,
  activite: ouNul(chaine),
  jours: ouNul(nombre),
  montantHtCents: centimes,
  offreCode: ouNul(chaine),
  commissionId: ouNul(chaine),
  commission: commissionDeLigne,
  // Version 3, amendée avant son adoption par axion-ia (décision de Williams du 2026-10-01) : le
  // prix PUBLIC en vigueur à la date du devis signé, en centimes, lu par le producteur dans sa grille
  // de prix. Le prix VENDU reste `montantHtCents`. Nul pour une ligne sans prix public (palier au
  // forfait sur devis) : une absence de prix de référence n'est jamais un prix nul.
  prixReferenceHtCents: ouNul(centimes),
});

// ── les douze charges ────────────────────────────────────────────────────────

/**
 * La charge de chaque type, indexée par son nom de fil. Les clés sont TYPÉES sur l'union des types
 * du contrat (import de type seulement, sans cycle à l'exécution) : une clé qui manque, ou une clé
 * de plus, est une erreur de compilation. Ces douze clés ne sont donc pas une seconde liste : ce sont
 * celles de `TYPES_EVENEMENT`, vérifiées par le compilateur.
 */
export const CHARGES: { readonly [T in TypeEvenement]: FragmentSchema } = {
  'client.cree': client,
  'client.mis_a_jour': client,
  'devis.signe': ferme({
    devisId: identifiant,
    numero: chaine,
    clientId: identifiant,
    activite: ouNul(chaine),
    montantTotalHtCents: centimes,
    signeLe: instant,
    lignes: liste(ligneDeDevis),
  }),
  'facture.emise': ferme({
    factureId: identifiant,
    numero: chaine,
    activite: ouNul(chaine),
    clientId: ouNul(identifiant),
    origineClient: chaine,
    siren: ouNul(chaine),
    destinataire: chaine,
    subrogation: booleen,
    montantHtCents: centimes,
    montantTvaCents: centimes,
    montantTtcCents: centimes,
    regimeTva: chaine,
    emiseLe: instant,
    echeanceLe: ouNul(instant),
    echeanceFinanceurAt: ouNul(instant),
    payers: liste(payeur),
    // Version 3 (JUR-T42, DM-10-P) : le devis dont la facture procède, nul quand elle n'en procède
    // d'aucun. C'est par lui que se lit « entièrement facturé ».
    devisId: ouNul(identifiant),
  }),
  'avoir.emis': ferme({
    avoirId: identifiant,
    numero: chaine,
    avoirDeFactureId: identifiant,
    clientId: ouNul(identifiant),
    siren: ouNul(chaine),
    montantHtCents: entier,
    montantTvaCents: entier,
    montantTtcCents: entier,
    regimeTva: chaine,
    emisLe: instant,
  }),
  'paiement.recu': ferme({
    paymentId: identifiant,
    factureId: identifiant,
    clientId: ouNul(identifiant),
    origineClient: chaine,
    siren: ouNul(chaine),
    montantEncaisseTtcCents: centimes,
    factureMontantHtCents: centimes,
    factureMontantTtcCents: centimes,
    regimeTva: chaine,
    totalEncaisseTtcCents: centimes,
    paidAt: instant,
    provider: chaine,
    montantHtCents: centimes,
    soldeLaFacture: booleen,
  }),
  'paiement.rembourse': ferme({
    paymentId: identifiant,
    factureId: identifiant,
    clientId: ouNul(identifiant),
    siren: ouNul(chaine),
    montantHtCents: centimes,
    montantEncaisseTtcCents: centimes,
    motif: chaine,
    forme: chaine,
    rembourseLe: instant,
    provider: chaine,
  }),
  'candidature.recue': ferme({
    candidatureId: identifiant,
    reponsesJson: objetLibre,
    scoreInitial: nombre,
    scorePartsJson: objetLibre,
    scoreBaremeVersion: chaine,
    sourceCanal: chaine,
    utm: ouNul(objetLibre),
    campagneId: ouNul(chaine),
    parrainCodeCapture: ouNul(chaine),
  }),
  'financement.mis_a_jour': ferme({
    factureId: identifiant,
    payers: liste(payeur),
    echeanceFinanceurAt: ouNul(instant),
  }),
  'facture.annulee': ferme({
    factureId: identifiant,
    motif: chaine,
    clientId: ouNul(identifiant),
  }),
  'client.fusionne': ferme({
    survivorId: identifiant,
    absorbedId: identifiant,
  }),
  // Version 3 (INT-T46-P) : le devis ENVOYÉ, d'où se lit l'antériorité « devis » (DM-10-P). Le
  // SIREN du destinataire et l'instant d'émission, rien d'autre : d'avant-signature, il ne porte
  // aucun montant (REQ-INT-029), et `champsInterdits` le refuserait. Ses champs sont ceux que le
  // producteur réel porte déjà sur le devis et le client ; le producteur de `devis.emis` est la
  // tâche INT-T46-A, qui suit ce contrat.
  'devis.emis': ferme({
    devisId: identifiant,
    numero: chaine,
    clientId: identifiant,
    siren: ouNul(chaine),
    emisLe: instant,
  }),
};
