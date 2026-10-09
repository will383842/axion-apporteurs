/**
 * DM-08 — la machine à états d'attribution (REQ-DM-006, REQ-QA-004, REQ-DM-007), sous la forme que
 * fixe `docs/CONVENTIONS.md` §2 : `from × événement → to`. Matrice validée par l'architecte le
 * 2026-10-02 (rattrapage 58), noms au participe comme `confirmee_tacitement` (REQ-DM-042).
 *
 * UN COUPLE ABSENT EST REFUSÉ, JAMAIS AUTORISÉ PAR OMISSION. Pour chaque état, la matrice énumère les
 * SEULES transitions qu'il accepte et l'état d'arrivée de chacune ; tout autre couple lève une erreur
 * typée qui le NOMME, et rien n'est écrit. La transition est la CAUSE : c'est elle que le journal
 * écrit (`attribution_etat_modifie`, un type par GENRE de transition, partners/ADR-0022 §4).
 *
 * CE QUE LA MATRICE NE PORTE PAS, VOLONTAIREMENT :
 *   — aucune promotion depuis la file (REQ-DM-004) : `en_attente` ne mène qu'à `annulee` ou `expiree` ;
 *     la redéclaration au rang 1 fait NAÎTRE une autre attribution (`deposee`), dans la même
 *     transaction que le passage `redeclaree` ;
 *   — aucun devis signé pendant `provisoire` : DM-73 (art. 3.2 du v2, juriste et A02, #824), la
 *     commande ne se garde plus, elle CONFIRME. L'écrivain enchaîne `confirmee_par_la_commande`
 *     (datée de la signature) puis `devis_signe`, dans la même transaction ;
 *   — aucune sortie `perdue` depuis `signee`, `convertie` ou `figee_resiliation` ;
 *   — SEC-19 (A02, #703 ; juriste, art. 12) : la fin du contrat de l'apporteur porteur a DEUX
 *     sorties exclusives — `figee` (vers `figee_resiliation`) depuis un état AVEC commande
 *     (`signee`, `convertie`) seulement, `fin_de_contrat` depuis tout état sans commande ;
 *   — la caducité d'une commande (condition suspensive défaillie) a UN code par destination ; c'est
 *     `codeDeCaducite` qui le choisit selon la fenêtre, jamais l'appelant.
 *
 * W19 : le refus propre au porteur est jugé sur le triplet (état, transition, type de porteur) ; un
 * conseiller ne déclenche ni la confirmation tacite, ni `non_confirme`, ni le gel, ni la file.
 */
import { ETATS_OCCUPANTS, type EtatOccupant } from './etats';
import { SEUILS } from '../seuils/ssot';
import { MS_PAR_JOUR, joursDeLaDate } from '../temps/calendrier-civil';
import { depuisParis, versParis } from '../temps/paris';
import type { Instant } from '../temps/horloge';

/** Les treize états (REQ-DM-006, `docs/GLOSSAIRE.md` §1), dans l'ordre du cycle de vie. */
export const ETATS_ATTRIBUTION = [
  'en_attente',
  'provisoire',
  'active',
  'rdv_pris',
  'proposition',
  'signee',
  'convertie',
  'figee_resiliation',
  'invalidee',
  'perdue',
  'perimee',
  'expiree',
  'annulee',
] as const;
export type EtatAttribution = (typeof ETATS_ATTRIBUTION)[number];

/**
 * EXT-T06 (conditions de la sécurité) — les états TERMINÉS : la liste FERMÉE, à côté de l'enum. Une
 * attribution terminée n'occupe plus le SIREN et n'attend plus rien. Chaque état est d'une seule classe :
 * occupant (`ETATS_OCCUPANTS`), en file (`en_attente`) ou terminé ; un témoin rougit sur un état neuf
 * non classé.
 */
export const ETATS_TERMINES = [
  'invalidee',
  'perdue',
  'perimee',
  'expiree',
  'annulee',
] as const satisfies readonly EtatAttribution[];
export type EtatTermine = (typeof ETATS_TERMINES)[number];

/** Toutes les transitions : les naissances, puis les flèches. Égale à l'union des deux (test). */
export const EVENEMENTS_ATTRIBUTION = [
  'deposee',
  'deposee_en_file',
  'prise_en_charge',
  'retiree',
  'file_expiree',
  'redeclaree',
  'confirmee',
  'confirmee_par_courriel',
  'confirmee_tacitement',
  'non_confirmee',
  'non_confirmee_par_courriel',
  'anomalie_confirmee',
  'annulee_par_apporteur',
  'annulee_par_la_console',
  'liberee_sans_confirmation',
  'figee',
  'rdv_pris',
  'devis_envoye',
  'devis_signe',
  'perdue',
  'perimee',
  'expiree',
  'paiement_recu',
  'commande_caduque',
  'commande_caduque_hors_fenetre',
  // DM-67 (REQ-DM-006, art. 3.3) : l'antériorité de la Société établie après l'enregistrement, par
  // des faits datés avant le dépôt. Depuis tout état OCCUPANT ; les commissions acquises restent.
  'anteriorite_etablie',
  // SEC-19 (REQ-DM-011, art. 12) : la résiliation du contrat de l'apporteur porteur, dans sa
  // transaction. Une transition, pas un état : ses arrivées sont `annulee` et `expiree`.
  'fin_de_contrat',
  // DM-71 (art. 3.3 du v2) : après la confirmation, seul un geste HUMAIN annule, pour erreur
  // d'identification de l'entreprise ou pour fraude de l'apporteur (forme d'A02, #806 6039768837).
  'annulee_erreur_identification',
  'fraude_etablie',
  // DM-73 (art. 3.2 du v2) : une commande signée est un échange avec la Société ; elle confirme.
  'confirmee_par_la_commande',
] as const;
export type TransitionAttribution = (typeof EVENEMENTS_ATTRIBUTION)[number];

/** Les naissances (`de` nul) et leur état d'entrée. */
export const NAISSANCES_ATTRIBUTION = {
  deposee: 'provisoire',
  deposee_en_file: 'en_attente',
  prise_en_charge: 'provisoire',
} as const satisfies Partial<Record<TransitionAttribution, EtatAttribution>>;

const SUITES_SANS_PERTE = {
  devis_envoye: 'proposition',
  devis_signe: 'signee',
  perdue: 'perdue',
  expiree: 'expiree',
  anomalie_confirmee: 'invalidee',
  fin_de_contrat: 'expiree',
  // DM-71 : l'antériorité n'annule plus après la confirmation ; seules les deux exceptions humaines.
  annulee_erreur_identification: 'annulee',
  fraude_etablie: 'annulee',
} as const;

/** La matrice : pour chaque état, les seules transitions acceptées et leur état d'arrivée. */
export const TRANSITIONS_ATTRIBUTION: {
  readonly [E in EtatAttribution]: Readonly<
    Partial<Record<TransitionAttribution, EtatAttribution>>
  >;
} = {
  en_attente: {
    retiree: 'annulee',
    file_expiree: 'expiree',
    redeclaree: 'expiree',
    fin_de_contrat: 'annulee',
  },
  provisoire: {
    confirmee: 'active',
    confirmee_par_courriel: 'active',
    confirmee_tacitement: 'active',
    confirmee_par_la_commande: 'active',
    non_confirmee: 'invalidee',
    non_confirmee_par_courriel: 'invalidee',
    anomalie_confirmee: 'invalidee',
    annulee_par_apporteur: 'annulee',
    annulee_par_la_console: 'annulee',
    liberee_sans_confirmation: 'perimee',
    fin_de_contrat: 'annulee',
    anteriorite_etablie: 'annulee',
  },
  active: { rdv_pris: 'rdv_pris', perimee: 'perimee', ...SUITES_SANS_PERTE },
  rdv_pris: SUITES_SANS_PERTE,
  proposition: {
    devis_signe: 'signee',
    perdue: 'perdue',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    fin_de_contrat: 'expiree',
    annulee_erreur_identification: 'annulee',
    fraude_etablie: 'annulee',
  },
  signee: {
    paiement_recu: 'convertie',
    expiree: 'expiree',
    figee: 'figee_resiliation',
    commande_caduque: 'active',
    commande_caduque_hors_fenetre: 'expiree',
    annulee_erreur_identification: 'annulee',
    fraude_etablie: 'annulee',
  },
  convertie: {
    expiree: 'expiree',
    figee: 'figee_resiliation',
    annulee_erreur_identification: 'annulee',
    fraude_etablie: 'annulee',
  },
  figee_resiliation: {
    expiree: 'expiree',
    annulee_erreur_identification: 'annulee',
    fraude_etablie: 'annulee',
  },
  invalidee: {},
  perdue: {},
  perimee: {},
  expiree: {},
  annulee: {},
};

/**
 * DM-71 (art. 3.3 du v2) : les états CONFIRMÉS. Depuis eux, l'antériorité n'annule plus ; seules les
 * deux exceptions humaines le font. La base tient la même règle par `confirmee_at`
 * (garde `attributions_annulation_apres_confirmation`).
 */
export type EtatConfirme = Exclude<EtatOccupant, 'provisoire'>;
export const ETATS_CONFIRMES: readonly EtatConfirme[] = ETATS_OCCUPANTS.filter(
  (e): e is EtatConfirme => e !== 'provisoire'
);

/**
 * DM-71 : la liste FERMÉE des exceptions d'annulation, celle de l'enum `exception_annulation` en base.
 * `retablissement_apporteur` est posée au rétablissement d'un apporteur (UX-P1-61), par sa propre
 * transition.
 */
export const EXCEPTIONS_ANNULATION = [
  'erreur_identification',
  'fraude',
  'retablissement_apporteur',
] as const;
export type ExceptionAnnulation = (typeof EXCEPTIONS_ANNULATION)[number];

/**
 * Les transitions FONDÉES SUR UNE ANOMALIE CONFIRMÉE : elles exigent son identifiant, qui va à la
 * notification (jamais à la charge, DM-12 (d)), et leur motif rend les faits de cette anomalie, purge
 * comprise. DM-71 : la fraude de l'apporteur après la confirmation en est une.
 */
export const TRANSITIONS_FONDEES_SUR_UNE_ANOMALIE = [
  'anomalie_confirmee',
  'fraude_etablie',
] as const satisfies readonly TransitionAttribution[];

export const fondeeSurUneAnomalie = (t: unknown): boolean =>
  (TRANSITIONS_FONDEES_SUR_UNE_ANOMALIE as readonly unknown[]).includes(t);

/** L'exception que porte chaque transition humaine de l'art. 3.3, dans la charge et en base. */
export const EXCEPTION_DE_LA_TRANSITION = {
  annulee_erreur_identification: 'erreur_identification',
  fraude_etablie: 'fraude',
} as const satisfies Partial<Record<TransitionAttribution, ExceptionAnnulation>>;

/** Le type de porteur, DÉRIVÉ de la population de l'attribution (W19 (1)). */
export type TypePorteur = 'apporteur' | 'conseiller';
const PORTEURS: readonly string[] = ['apporteur', 'conseiller'];

/** W19 (3) : ce qu'un conseiller ne déclenche jamais ; la file lui est fermée (REQ-DM-004). */
export const REFUSEES_AU_CONSEILLER = [
  'deposee',
  'deposee_en_file',
  'retiree',
  'file_expiree',
  'redeclaree',
  'confirmee_tacitement',
  'non_confirmee',
  'non_confirmee_par_courriel',
  'anomalie_confirmee',
  'figee',
  // SEC-19 : la résiliation est celle d'un contrat d'apporteur ; un conseiller n'en a pas.
  'fin_de_contrat',
  // DM-71 : les deux exceptions de l'art. 3.3 visent l'attribution d'un APPORTEUR.
  'annulee_erreur_identification',
  'fraude_etablie',
  // DM-73 (A02) : refusée au conseiller, comme les autres confirmations.
  'confirmee_par_la_commande',
] as const satisfies readonly TransitionAttribution[];

/** La prise en charge est la naissance du conseiller, et de lui seul. */
const REFUSEES_A_L_APPORTEUR: readonly TransitionAttribution[] = ['prise_en_charge'];

/**
 * DM-67 (REQ-DM-006) : le critère de l'antériorité établie après coup, en enum INTERNE de l'événement
 * `anteriorite_etablie` ; il n'apparaît jamais dans une notification.
 */
export const CRITERES_D_ANTERIORITE = ['cliente', 'devis', 'devis_signe'] as const;

/**
 * DM-55 (forme d'A02, valeurs de la juriste, rattrapage 98) : le motif FERMÉ d'une annulation par la
 * console, sans « autre ». Il ne vaut que depuis `provisoire` (seule flèche de la matrice) ;
 * `erreur_de_saisie_de_la_societe` est réservé à la prise en charge d'un conseiller, et ne notifie rien.
 * Pas de colonne : l'événement est la trace, le motif est dans sa charge.
 */
export const MOTIFS_ANNULATION_CONSOLE = [
  'demande_de_l_apporteur',
  'declaration_en_double',
  'entreprise_relevant_de_l_article_3_3_bis',
  'erreur_de_saisie_de_la_societe',
] as const;
export type MotifAnnulationConsole = (typeof MOTIFS_ANNULATION_CONSOLE)[number];

/**
 * DM-55 (forme d'A02) : la catégorie d'une entreprise relevant de l'article 3.3 bis — le MÊME
 * vocabulaire que l'enum `MotifListeNoire` de la base, confronté à elle par un témoin. Elle accompagne
 * le motif `entreprise_relevant_de_l_article_3_3_bis`, et lui seul.
 */
export const MOTIFS_LISTE_NOIRE = [
  'administration',
  'financeur_public',
  'financeur_paritaire',
  'organisme_de_formation_partenaire',
] as const;
export type MotifListeNoire = (typeof MOTIFS_LISTE_NOIRE)[number];
export type CritereDAnteriorite = (typeof CRITERES_D_ANTERIORITE)[number];

export type CodeTransitionAttribution =
  | 'etat_inconnu'
  | 'transition_inconnue'
  | 'porteur_inconnu'
  | 'naissance_refusee'
  | 'transition_refusee'
  | 'refusee_au_porteur'
  | 'autre_commande_valable'
  | 'critere_incoherent'
  | 'acteur_refuse'
  | 'motif_incoherent'
  | 'porteur_refuse'
  | 'anomalie_refusee'
  | 'fait_posterieur_au_depot'
  | 'reference_du_fait_invalide'
  // DM-73 (art. 4.4) : une commande signée avant le dépôt ne profite pas à cette attribution.
  | 'commande_anterieure_a_l_occupation';

export class ErreurTransitionAttribution extends Error {
  readonly code: CodeTransitionAttribution;

  constructor(code: CodeTransitionAttribution, detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurTransitionAttribution';
    this.code = code;
  }
}

/** Une valeur refusée est nommée, mais bornée : elle vient de l'appelant. */
const LONGUEUR_NOMMEE_MAX = 64;
const borne = (valeur: unknown): string => String(valeur).slice(0, LONGUEUR_NOMMEE_MAX);

const estEtat = (v: unknown): v is EtatAttribution =>
  (ETATS_ATTRIBUTION as readonly unknown[]).includes(v);
const estTransition = (v: unknown): v is TransitionAttribution =>
  (EVENEMENTS_ATTRIBUTION as readonly unknown[]).includes(v);

export interface DemandeTransitionAttribution {
  /** `null` pour une naissance. */
  readonly de: EtatAttribution | null;
  readonly transition: TransitionAttribution;
  readonly porteur: TypePorteur;
}

/**
 * Juge un triplet (état ou naissance, transition, porteur) et rend l'état d'arrivée. Lève
 * `ErreurTransitionAttribution` — jamais un booléen qu'un appelant pourrait oublier de lire.
 */
export function transitionnerAttribution(demande: DemandeTransitionAttribution): EtatAttribution {
  const { de, transition, porteur } = demande;
  if (de !== null && !estEtat(de)) throw new ErreurTransitionAttribution('etat_inconnu', borne(de));
  if (!estTransition(transition)) {
    throw new ErreurTransitionAttribution('transition_inconnue', borne(transition));
  }
  if (!PORTEURS.includes(porteur)) {
    throw new ErreurTransitionAttribution('porteur_inconnu', borne(porteur));
  }
  const couple = `${de ?? 'naissance'} × ${transition}`;
  const vers =
    de === null
      ? (NAISSANCES_ATTRIBUTION as Partial<Record<TransitionAttribution, EtatAttribution>>)[
          transition
        ]
      : TRANSITIONS_ATTRIBUTION[de][transition];
  if (vers === undefined) {
    throw new ErreurTransitionAttribution(
      de === null ? 'naissance_refusee' : 'transition_refusee',
      couple
    );
  }
  const refusees: readonly TransitionAttribution[] =
    porteur === 'conseiller' ? REFUSEES_AU_CONSEILLER : REFUSEES_A_L_APPORTEUR;
  if (refusees.includes(transition)) {
    throw new ErreurTransitionAttribution('refusee_au_porteur', `${couple} × ${porteur}`);
  }
  return vers;
}

/**
 * La caducité d'une commande (condition suspensive défaillie, D-OPCO-8) : le code dépend de la
 * fenêtre, jamais de l'appelant. Fenêtre close à `fenetreFinAt` incluse.
 */
export function codeDeCaducite(
  fenetreFinAt: Instant,
  maintenant: Instant
): 'commande_caduque' | 'commande_caduque_hors_fenetre' {
  return maintenant < fenetreFinAt ? 'commande_caduque' : 'commande_caduque_hors_fenetre';
}

/** Les transitions qui CONFIRMENT : elles ouvrent la fenêtre (REQ-DM-007, HYP-E1-9). */
const CONFIRMATIONS: readonly TransitionAttribution[] = [
  'confirmee',
  'confirmee_par_courriel',
  'confirmee_tacitement',
  'confirmee_par_la_commande',
];

/** Le calendrier, pas un délai : les mois d'une année civile. */
const MOIS_PAR_AN = 12;

/** Ajoute des mois CIVILS en heure de Paris ; un jour absent du mois d'arrivée devient son dernier. */
export function ajouterMoisParis(instant: Instant, mois: number): Instant {
  const p = versParis(instant);
  const total = p.annee * MOIS_PAR_AN + (p.mois - 1) + mois;
  const annee = Math.floor(total / MOIS_PAR_AN);
  const moisArrivee = (total % MOIS_PAR_AN) + 1;
  const premierSuivant = joursDeLaDate({
    annee: moisArrivee === MOIS_PAR_AN ? annee + 1 : annee,
    mois: moisArrivee === MOIS_PAR_AN ? 1 : moisArrivee + 1,
    jour: 1,
  });
  const dernier = premierSuivant - joursDeLaDate({ annee, mois: moisArrivee, jour: 1 });
  return depuisParis({ ...p, annee, mois: moisArrivee, jour: Math.min(p.jour, dernier) });
}

export interface TempsDeLAttribution {
  readonly premierContactAt: Instant | null;
  readonly peremptionSuspendueAt: Instant | null;
  readonly confirmeeAt: Instant | null;
  readonly fenetreFinAt: Instant | null;
  readonly peremptionAt: Instant | null;
}

export interface TempsRecalcules {
  readonly confirmeeAt: Instant | null;
  readonly fenetreFinAt: Instant | null;
  readonly peremptionAt: Instant | null;
}

/**
 * Les colonnes de temps RECALCULÉES à chaque transition (REQ-DM-007), en instants (le domaine ne lit
 * pas l'heure : l'appelant la lui passe) :
 *   — une confirmation pose `confirmeeAt` et `fenetreFinAt` (+ `FENETRE_MOIS` mois) ; rien d'autre
 *     ne les touche, la caducité d'une commande comprise. Elles courent de `confirmeeLe`, qui vaut
 *     `maintenant` sauf pour la confirmation par la commande, datée de sa signature (DM-73) ;
 *   — `peremptionAt` n'existe qu'en `active`, à `premierContactAt` + `PEREMPTION_JOURS` ; nulle tant
 *     que ce contact n'a pas eu lieu, nulle sous le marqueur, nulle dès qu'une suite existe — et
 *     nulle après une caducité, puisqu'un devis a existé.
 */
export function effetsDeTransition(
  avant: TempsDeLAttribution,
  transition: TransitionAttribution,
  vers: EtatAttribution,
  maintenant: Instant,
  confirmeeLe: Instant = maintenant
): TempsRecalcules {
  const confirme = CONFIRMATIONS.includes(transition);
  const confirmeeAt = confirme ? confirmeeLe : avant.confirmeeAt;
  const fenetreFinAt = confirme
    ? ajouterMoisParis(confirmeeLe, SEUILS.FENETRE_MOIS.valeur)
    : avant.fenetreFinAt;
  const chrono =
    vers === 'active' &&
    transition !== 'commande_caduque' &&
    avant.premierContactAt !== null &&
    avant.peremptionSuspendueAt === null;
  const peremptionAt = chrono
    ? avant.premierContactAt! + SEUILS.PEREMPTION_JOURS.valeur * MS_PAR_JOUR
    : null;
  return { confirmeeAt, fenetreFinAt, peremptionAt };
}
