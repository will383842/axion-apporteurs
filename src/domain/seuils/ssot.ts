/**
 * `ssot.ts` — la source unique des seuils et des délais (JUR-T02 : REQ-JUR-015, REQ-JUR-029 ; RM-10).
 *
 * UN SEUIL, UNE SOURCE, UNE DATE. Chaque constante est nommée d'après ce qu'elle mesure, porte sa
 * source (l'article du contrat, la loi ou l'exigence qui la fixe) et la date à laquelle cette source
 * a été confrontée. Aucun de ces littéraux ne s'écrit ailleurs dans `src/` : la garde
 * `scripts/gates/seuils-ssot.ts` le vérifie, et elle vérifie aussi que chaque valeur écrite dans le
 * gabarit de contrat, à l'article que `renvois` nomme, est celle d'ici.
 *
 * CE QUI N'Y FIGURE PAS, ET NE DOIT JAMAIS Y FIGURER. Aucune constante de gradation, aucun seuil de
 * manquements, aucun délai de « contradictoire » : retirés du produit le 2026-09-03 (`HYP-D11`).
 *
 * LA DURÉE DE L'ATTRIBUTION (`FENETRE_MOIS`, art. 3.4 al. 1) Y EST DEPUIS LE 2026-09-30 : 6 mois,
 * décision de Williams, portée au registre par `HYP-E1-9` (tranchée ce jour) et écrite ici par
 * GOV-129 ; la question `JUR-T01-Q02` qui la tenait est retirée. La fenêtre du parrainage vit en
 * configuration (`HYP-E1-19`, `src/domain/contrat/variables.ts`).
 *
 * Les montants sont en CENTIMES hors taxes (`docs/CONVENTIONS.md`, argent en centimes).
 */

export type UniteDeSeuil = 'minutes' | 'jours' | 'jours_ouvres' | 'mois' | 'ans' | 'centimes';

/** Un endroit du contrat où la valeur est écrite : le corps du contrat, ou son annexe 2. */
export type Renvoi = { readonly document: 'contrat' | 'annexe-2'; readonly unite: string };

export type Seuil = {
  readonly valeur: number;
  readonly unite: UniteDeSeuil;
  /** Ce qui fixe la valeur : article du contrat, texte de loi, exigence ou décision du registre. */
  readonly source: string;
  /** Les unités du gabarit où la valeur est écrite ; vide si le contrat ne l'écrit pas. */
  readonly renvois: readonly Renvoi[];
  /** Date ISO de la dernière confrontation de la valeur à sa source. */
  readonly verifieLe: string;
};

const LE = '2026-09-27';
const art = (...unites: string[]): Renvoi[] =>
  unites.map((unite) => ({ document: 'contrat', unite }));

export const SEUILS = {
  PRISE_DE_CONTACT_JOURS_OUVRES: {
    valeur: 2,
    unite: 'jours_ouvres',
    source: 'contrat art. 3.2',
    renvois: art('3.2'),
    verifieLe: LE,
  },
  CONFIRMATION_TACITE_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 3.2',
    renvois: art('3.2'),
    verifieLe: LE,
  },
  // INT-T49 — combien de temps une candidature qui attend ses coordonnées est reprise par le
  // lanceur ; au-delà, elle ne l'est plus, et une alerte `attente_depassee` part. Un paramètre
  // d'exploitation, pas une durée de conservation : il reste SOUS les 30 jours de minimisation
  // d'INT-T56, qui demeurent le plafond (7 < 30).
  ATTENTE_DES_COORDONNEES_JOURS: {
    valeur: 7,
    unite: 'jours',
    source: 'coordination, 2026-10-01 (UTC), proposition de A05 (couvre un week-end prolongé)',
    renvois: [],
    verifieLe: '2026-10-01',
  },
  // INT-T54 — combien de temps un événement qui attend un TRAITANT (`traitant:<type>`) ou un PARENT
  // (la facture d'un paiement, par exemple) attend avant qu'une alerte `attente_depassee` parte.
  // Un paramètre d'exploitation : un type sans traitant ou un parent absent se voit vite.
  ATTENTE_D_UNE_DEPENDANCE_JOURS: {
    valeur: 2,
    unite: 'jours',
    source:
      'arbitrage A01, 2026-10-01 (UTC), proposition de A05 (un type sans traitant ou un parent absent se voit vite)',
    renvois: [],
    verifieLe: '2026-10-01',
  },
  ANTERIORITE_CLIENT_MOIS: {
    valeur: 24,
    unite: 'mois',
    source: 'contrat art. 3.3',
    renvois: art('3.3'),
    verifieLe: LE,
  },
  ANTERIORITE_DEVIS_MOIS: {
    valeur: 6,
    unite: 'mois',
    source: 'contrat art. 3.3',
    renvois: art('3.3'),
    verifieLe: LE,
  },
  FENETRE_MOIS: {
    valeur: 6,
    unite: 'mois',
    source: 'contrat art. 3.4 al. 1 (HYP-E1-9, décision de Williams du 2026-09-30)',
    renvois: art('3.4'),
    verifieLe: '2026-09-30',
  },
  PEREMPTION_JOURS: {
    valeur: 90,
    unite: 'jours',
    source: 'contrat art. 3.4 al. 2',
    renvois: art('3.4'),
    verifieLe: LE,
  },
  PROLONGATION_DEVIS_MOIS: {
    valeur: 3,
    unite: 'mois',
    source: 'contrat art. 3.4 al. 3 (W9)',
    renvois: art('3.4'),
    verifieLe: LE,
  },
  FILE_FENETRE_REDECLARATION_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.5',
    renvois: art('3.5'),
    verifieLe: LE,
  },
  FILE_EXPIRATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 3.5',
    renvois: art('3.5'),
    verifieLe: LE,
  },
  SUSPENSION_MAX_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.7',
    renvois: art('3.7'),
    verifieLe: LE,
  },
  REPRISE_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 4.5',
    renvois: art('4.5'),
    verifieLe: LE,
  },
  SEUIL_VERSEMENT: {
    valeur: 5_000,
    unite: 'centimes',
    source: 'contrat art. 5.1 ; REQ-ARG-015',
    renvois: art('5.1'),
    verifieLe: LE,
  },
  CONTESTATION_FACTURE_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 5.2',
    renvois: art('5.2'),
    verifieLe: LE,
  },
  VERSEMENT_JOURS_OUVRES: {
    valeur: 10,
    unite: 'jours_ouvres',
    source: 'contrat art. 5.3',
    renvois: art('5.3'),
    verifieLe: LE,
  },
  VERSEMENT_PLAFOND_JOURS: {
    valeur: 60,
    unite: 'jours',
    source:
      'contrat art. 5.3 (valeur confrontée, renvoi vérifié) — À RELIRE, non encore confronté : C. com. L.441-10, I',
    renvois: art('5.3'),
    verifieLe: LE,
  },
  FORCLUSION_CONTESTATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 5.5',
    renvois: art('5.5'),
    verifieLe: LE,
  },
  REPONSE_CONTESTATION_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.3 et 5.6',
    renvois: art('3.3', '5.6'),
    verifieLe: LE,
  },
  VIGILANCE_PERIODICITE_MOIS: {
    valeur: 6,
    unite: 'mois',
    source:
      'contrat art. 6.2 (valeur confrontée, renvoi vérifié) — À RELIRE, non encore confronté : C. trav. D.8222-5',
    renvois: art('6.2'),
    verifieLe: LE,
  },
  // `verifieLe` est la date de la dernière confrontation de la valeur À SA SOURCE (voir le type).
  //
  // 🔴 LA RÈGLE, ET LE DÉFAUT QU'ELLE FERME. Une source qui nomme un texte de loi sans dire s'il a
  // été lu, sous une date de vérification, AFFIRME une confrontation qui n'a pas eu lieu. Cinq
  // seuils étaient dans ce cas — `SEUIL_VIGILANCE`, `SEUIL_DAS2`, `VERSEMENT_PLAFOND_JOURS`,
  // `VIGILANCE_PERIODICITE_MOIS`, `CONSERVATION_PIECES_ANS` —, et trois d'entre eux l'étaient
  // encore après une première correction qui n'en avait vu que deux : elle avait cherché une
  // FORMULATION (« non relu », « à confirmer ») au lieu de chercher les CITATIONS DE LOI. C'est une
  // revue `exactitude` qui l'a relevé, chiffres à l'appui (PR 180).
  //
  // DONC, DÉSORMAIS : toute source citant un texte de loi dit ce qui a RÉELLEMENT été confronté —
  // l'article du contrat ou l'exigence —, et nomme séparément, en majuscules, ce qui reste à lire.
  // `verifieLe` redevient vrai sans qu'aucune valeur ne bouge. Le témoin
  // `RM-01 — une source qui cite un texte de loi dit si elle l'a lu` tient cette règle.
  SEUIL_VIGILANCE: {
    valeur: 500_000,
    unite: 'centimes',
    source:
      'REQ-ARG-025 (valeur confrontée) — À RELIRE, non encore confronté : C. trav. L.8222-1 et D.8222-5, contrat art. 5.4',
    renvois: [],
    verifieLe: LE,
  },
  SEUIL_DAS2: {
    valeur: 240_000,
    unite: 'centimes',
    source:
      'REQ-JUR-015 (valeur confrontée) — À CONFIRMER avec l’expert-comptable, non encore confronté : HYP-D9',
    renvois: [],
    verifieLe: LE,
  },
  CONFIDENTIALITE_ANS: {
    valeur: 2,
    unite: 'ans',
    source: 'contrat art. 9',
    renvois: art('9'),
    verifieLe: LE,
  },
  PREAVIS_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 11.1 — unique, jamais indexé sur l’ancienneté (M-16)',
    renvois: art('11.1'),
    verifieLe: LE,
  },
  MISE_EN_DEMEURE_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 11.2',
    renvois: art('11.2'),
    verifieLe: LE,
  },
  IMPUTATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 12.4',
    renvois: art('12.4'),
    verifieLe: LE,
  },
  FORCE_MAJEURE_MOIS: {
    valeur: 3,
    unite: 'mois',
    source: 'contrat art. 15',
    renvois: art('15'),
    verifieLe: LE,
  },
  PALIER_HORS_GRILLE_JOURS: {
    valeur: 60,
    unite: 'jours',
    source: 'contrat annexe 1, A1.7',
    renvois: art('A1.7'),
    verifieLe: LE,
  },
  MANDAT_DENONCIATION_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat annexe 2, 2.5',
    renvois: [{ document: 'annexe-2', unite: '2.5' }],
    verifieLe: LE,
  },
  CONSERVATION_PIECES_ANS: {
    valeur: 10,
    unite: 'ans',
    source:
      'REQ-JUR-029 (contrats, autofactures, relevés, preuves de paiement — valeur confrontée) — À RELIRE, non encore confronté : C. com. L.123-22',
    renvois: [],
    verifieLe: LE,
  },
  // QA-T12 : au-delà, le travail de nuit rougit — une sauvegarde qu'on ne restaure pas n'en est pas une.
  EXERCICE_DE_RESTAURATION_MAX_JOURS: {
    valeur: 35,
    unite: 'jours',
    source:
      'acceptation QA-T12 (REQ-QA-023) ; arbitrage -d7 sur délégation de Williams du 2026-09-29',
    renvois: [],
    verifieLe: '2026-09-29',
  },
  // QA-T12 : un vidage déposé en clair et plus vieux que ce seuil est nommé, et le geste rougit. Le
  // rechiffrement tourne chaque heure ; la demi-heure de plus absorbe le retard d'un run planifié.
  CLAIR_EN_DEPOT_MAX_MINUTES: {
    valeur: 90,
    unite: 'minutes',
    source:
      'acceptation QA-T12 (REQ-QA-023), lentille exactitude PR 280 ; option A de -d7 sur délégation de Williams du 2026-09-30',
    renvois: [],
    verifieLe: '2026-09-30',
  },
} as const satisfies Record<string, Seuil>;

export type NomDeSeuil = keyof typeof SEUILS;

/**
 * Les PARAMÈTRES du calcul qui ne sont ni un délai ni un montant — sourcés et datés comme les seuils
 * (RM-10), mais hors de `SEUILS` : la garde des seuils ne connaît que les durées et les montants, et
 * un ratio n'est ni l'un ni l'autre. L'étendre aux ratios est une suite, pas un détour.
 */
export type Parametre = {
  readonly valeur: number;
  readonly unite: 'points_de_base';
  readonly source: string;
  readonly verifieLe: string;
};

export const PARAMETRES = {
  // Le plafond d'une commission, en points de base du HT de la ligne : 10 000 = 100 %. Au-delà, la
  // ligne est bloquée `commission_sup_ht`, et seule une décision journalisée la relève.
  PLAFOND_COMMISSION_BPS: {
    valeur: 10_000,
    unite: 'points_de_base',
    source: 'REQ-ARG-007 (paramètre, défaut 100 %) ; avenant A01 du 2026-09-29 sur DM-04',
    verifieLe: '2026-09-29',
  },
} as const satisfies Record<string, Parametre>;

/**
 * Les BUDGETS D'EXPÉRIENCE de REQ-UX-047 (QA-T58, sorti du point 4 de GOV-113) — une seule source,
 * lue par la fixture de mesure (QA-T33) et par la garde des écrans (GOV-113). Hors de `SEUILS` pour la
 * même raison que les paramètres : ni un délai du contrat, ni un montant. Une exigence plus stricte
 * prime sur ces budgets génériques (REQ-UX-001 pour le dépôt, REQ-UX-021 pour la qualification) et
 * reste écrite dans son exigence. Aucun budget propre au conseiller : il n'a aucun écran dans
 * Partners (question 22 de W19), ses budgets sont ceux du CRM.
 */
export type BudgetUx = {
  readonly valeur: number;
  readonly unite:
    'interactions' | 'tabulations' | 'secondes' | 'kbit_par_seconde' | 'millisecondes';
  readonly source: string;
  readonly verifieLe: string;
};

const LIGHTHOUSE_4G_RALENTIE =
  'Lighthouse, docs/throttling.md, « The mobile network throttling preset » (« Slow 4G » : latence 150 ms, 1,6 Mbps descendant, 750 Kbps montant), https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md';

export const BUDGETS_UX = {
  CONSULTATION_INTERACTIONS_MAX: {
    valeur: 3,
    unite: 'interactions',
    source: 'REQ-UX-047 point 1 (consultation)',
    verifieLe: '2026-10-01',
  },
  SAISIE_INTERACTIONS_MAX: {
    valeur: 8,
    unite: 'interactions',
    source: 'REQ-UX-047 point 1 (saisie)',
    verifieLe: '2026-10-01',
  },
  PREMIERE_ACTION_TABULATIONS_MAX: {
    valeur: 3,
    unite: 'tabulations',
    source: 'REQ-UX-047 point 2',
    verifieLe: '2026-10-01',
  },
  PREMIERE_ACTION_CLIQUABLE_SECONDES_MAX: {
    valeur: 2,
    unite: 'secondes',
    source: 'REQ-UX-047 point 2, sur le profil « 4G ralentie » ci-dessous',
    verifieLe: '2026-10-01',
  },
  PREMIER_USAGE_PREMIERE_ACTION_SECONDES_MAX: {
    valeur: 10,
    unite: 'secondes',
    source: 'REQ-UX-047 point 7 (test de premier usage)',
    verifieLe: '2026-10-01',
  },
  RESEAU_4G_RALENTIE_DEBIT_DESCENDANT_KBPS: {
    valeur: 1_600,
    unite: 'kbit_par_seconde',
    source: LIGHTHOUSE_4G_RALENTIE,
    verifieLe: '2026-10-01',
  },
  RESEAU_4G_RALENTIE_DEBIT_MONTANT_KBPS: {
    valeur: 750,
    unite: 'kbit_par_seconde',
    source: LIGHTHOUSE_4G_RALENTIE,
    verifieLe: '2026-10-01',
  },
  RESEAU_4G_RALENTIE_LATENCE_MS: {
    valeur: 150,
    unite: 'millisecondes',
    source: LIGHTHOUSE_4G_RALENTIE,
    verifieLe: '2026-10-01',
  },
} as const satisfies Record<string, BudgetUx>;

export type NomDeBudgetUx = keyof typeof BUDGETS_UX;

/**
 * Un budget par son nom. Un nom absent de la SSOT est REFUSÉ et nommé : jamais un défaut silencieux
 * qui ferait passer une mesure contre un budget que personne n'a fixé. L'appartenance se lit par
 * `Object.hasOwn`, pour qu'un nom hérité d'`Object.prototype` ne passe pas pour un budget.
 */
export function budgetUx(nom: string): BudgetUx {
  if (!Object.hasOwn(BUDGETS_UX, nom))
    throw new Error(
      `Budget d'expérience inconnu de la SSOT : ${nom} (src/domain/seuils/ssot.ts, BUDGETS_UX)`
    );
  return BUDGETS_UX[nom as NomDeBudgetUx];
}
